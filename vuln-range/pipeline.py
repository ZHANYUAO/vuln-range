#!/usr/bin/env python3
"""pipeline.py —— 扫描器输出 → 验证闸门 的流水线，并量化「可自动化边界」在哪。

为什么写这个
------------
前面 L3 基线只报「扫描器能不能找到」，不报「找的东西能不能被验证」。
但真做系统时，卡点不在发现，在**从扫描器输出到可验证证据之间的那道缝**：

    ffuf   : /download 存在(200)            → 它是洞吗？判不了
    sqlmap : 参数 q 可注入                   → 注入什么？串没给
    dalfox : 给了完整 payload                → 判据还没给

所以本文件不假装能全自动。它把每个扫描器输出按「离可验证还差几步」分档，
再对**能验证的**逐条过 verify.py 的闸门，最后给出三个数：
    确认 / 剔除 / 卡在缺口

用法
----
  python pipeline.py                 # 跑一遍并打印分档
  python pipeline.py --json out.json
"""
import argparse
import datetime
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify as V

HERE = os.path.dirname(os.path.abspath(__file__))
RUNS = os.path.join(HERE, "baseline", "out", "baseline_report.json")
GT = os.path.join(HERE, "lab", "ground_truth.json")

# 每个工具的输出"离可验证还差什么"。这是本文件的核心分类，不是临时判断。
GAP = {
    # 2026-10-28 P1 之后：assert 由 asserts.py 从 payload 派生，
    # 所以「有 payload + 知道类别」就已经可验证，不再需要人写判据。
    "dalfox": ("payload_given", "有 payload + 类别 → 断言由派生层补齐，可全自动"),
    "sqlmap": ("param_given", "缺 payload：只说了哪个参数可注入。可自动补一个 schema 无关的"
                              "最小探针，但证据只能到 error_signal 级（拿数据要先知道表结构）"),
    "ffuf":   ("path_only",   "缺 payload + 缺类别：只知道路径存在"),
    "nuclei": ("path_only",   "缺 payload + 缺类别：模板未命中"),
}


def load_runs():
    with open(RUNS, encoding="utf-8") as f:
        d = json.load(f)
    return d["runs"] if isinstance(d, dict) else d


def load_gt():
    with open(GT, encoding="utf-8") as f:
        return {v["id"]: v for v in json.load(f)["vulns"]}


def classify(run):
    """把一条扫描器发现归到「可验证性」档位。"""
    tool = run.get("tool")
    gap, why = GAP.get(tool, ("unknown", "未知工具"))
    return gap, why


def build_case_from_dalfox(f, gt_by_path):
    """dalfox 给了 payload + 它自己判定的类别 → **不写 assert**，交给派生层。

    第一版这里手写 `body_contains(payload)`，那是个弱判据（反射 ≠ 可利用，
    而且已转义的页面也会命中）。现在 asserts.py 会派生出 `unescaped(payload)`
    —— 同时要求「原文出现」和「转义形式不出现」，比手写的更严。
    """
    payload = f.get("payload") or ""
    if not payload:
        return None
    return {
        "id": "PIPE-DALFOX-%s" % f.get("param", "p"),
        "class": "reflected_xss",
        "criterion": "response_injection",
        "source_tool": "dalfox",
        "request": {"method": "GET", "path": f.get("path") or "/search",
                    "params": {f.get("param") or "q": payload}},
        # assert 故意留空：由 asserts.derive() 填
        "control": [{"method": "GET", "path": f.get("path") or "/search",
                     "params": {f.get("param") or "q": "alice"}}],
    }


# sqlmap 的输出只有「哪个参数可注入 + 什么技术」，**既没有注入串也没有表结构**。
# 旧版本从 ground truth 借 SQLI-01 的 payload —— 等于拿答案出题，测出来的
# 「可验证 2 条」里那条不算数（2026-10-29 自检 P1）。
# 现在只用**与 schema 无关的最小探针**：破坏引号配对，让 SQL 解析失败。
# 判据不手写、也不借 GT —— 由 asserts.py 从 payload 派生成 error_signal。
SQLMAP_PROBE = "alice'"        # 最小语法破坏探针：不需要知道表名/列数
SQLMAP_DEFAULT_PATH = None


def build_case_from_sqlmap(f, gt=None):
    """只吃 sqlmap 自己的输出：path + param + technique。

    gt 参数保留只为兼容旧调用点，**不再使用**。若 sqlmap 没给路径，直接返回 None
    —— 不允许靠猜或靠 GT 补出来。
    """
    path = f.get("path")
    param = f.get("param") or "q"
    if not path:
        return None
    return {
        "id": "PIPE-SQLMAP-%s" % param,
        "class": "sql_injection",
        "criterion": "database_error",
        "request": {"method": (f.get("place") or "GET").upper(), "path": path,
                    "params": {param: SQLMAP_PROBE}},
        # 对照必须显式给：同一端点 + 非恶意输入。
        # 不给的话 verify.py 会返回 "no control defined" → 整条 unknown（装置缺陷），
        # 而不是「漏洞不存在」—— 这正是 2026-10-29 自检发现的第一版行为。
        "control": [{"method": (f.get("place") or "GET").upper(), "path": path,
                     "params": {param: "alice"}}],
        "source_tool": "sqlmap",
        "note": ("payload = 与 schema 无关的最小探针（破坏引号配对），判据由派生层给出；"
                 "sqlmap 报的 technique=%s 只作为元信息记录，不参与构造"
                 % (f.get("technique") or "?")),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeats", type=int, default=2)
    ap.add_argument("--label", default=None)
    ap.add_argument("--json")
    args = ap.parse_args()
    run_label = args.label or ("pipeline-%s" % datetime.date.today().isoformat())

    ok, msg = V.reset_lab()
    if not ok:
        print("[!] %s\n[!] 先启动靶场：python lab/lab_app.py" % msg)
        return 2

    runs = load_runs()
    gt = load_gt()

    # ---------- 第一步：分档统计
    print("=" * 84)
    print("扫描器输出可验证性分档")
    print("=" * 84)
    print("%-10s %-14s %-9s %s" % ("TOOL", "RAW", "GAP", "差什么"))
    print("-" * 84)
    buckets = {}
    total_raw = 0
    for r in runs:
        tool = r.get("tool")
        n = len(r.get("findings") or [])
        total_raw += n
        gap, why = classify(r)
        buckets[tool] = {"tool": tool, "raw": n, "gap": gap, "why": why}
        print("%-10s %-14s %-9s %s" % (tool, "%d 条" % n, gap, why))
    print("-" * 84)
    print("原始发现合计 %d 条；其中「路径存在」级 %d 条、" % (
        total_raw,
        sum(b["raw"] for b in buckets.values() if b["gap"] == "path_only")))

    # ---------- 第二步：对能构造 case 的过闸门
    print()
    print("=" * 84)
    print("过闸门（只跑能构造出 case 的）")
    print("=" * 84)
    print("%-26s %-8s %-11s %s" % ("CASE", "SOURCE", "VERDICT", "理由"))
    print("-" * 84)

    results = []
    attempted = 0
    for r in runs:
        tool = r.get("tool")
        for f in r.get("findings") or []:
            case = None
            if tool == "dalfox":
                case = build_case_from_dalfox(f, gt)
            elif tool == "sqlmap":
                case = build_case_from_sqlmap(f)
            if not case:
                continue
            attempted += 1
            b = V.verify_case(case, repeats=args.repeats, expect_control=False,
                              mode="pipeline:" + str(tool), run_label=run_label)
            V.save_bundle(b, V.EVIDENCE_DIR)
            results.append({"case": case["id"], "tool": tool,
                            "verdict": b["verdict"], "reason": b["verdict_reason"],
                            "evidence_id": b["evidence_id"]})
            print("%-26s %-8s %-11s %s" % (case["id"], tool, b["verdict"],
                                           b["verdict_reason"][:44]))
            time.sleep(0.1)

    unverifiable = total_raw - attempted
    print("-" * 84)

    confirmed = sum(1 for x in results if x["verdict"] == "confirmed")
    rejected = sum(1 for x in results if x["verdict"] == "rejected")
    unknown = sum(1 for x in results if x["verdict"] == "unknown")
    print("可验证 %d 条 → confirmed %d / rejected %d / unknown %d" %
          (attempted, confirmed, rejected, unknown))
    print("卡在缺口 %d 条（扫描器只给了路径，没有任何可验证内容）" % unverifiable)

    out = {
        "raw_total": total_raw,
        "verifiable": attempted,
        "unverifiable": unverifiable,
        "results": results,
        "buckets": list(buckets.values()),
        "note": "unverifiable 里的每一条都需要先补攻击假设（payload + 判据）才能验证，"
                "这一步是纯规则做不了的，也是 LLM 类系统的真实价值位置。",
    }
    path = args.json or os.path.join(HERE, "baseline", "out", "pipeline_report.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print("report ->", path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
