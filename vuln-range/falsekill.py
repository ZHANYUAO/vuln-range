#!/usr/bin/env python3
"""falsekill.py —— 误杀率实验（P1 复测版）

背景
----
Sifting the Noise (ISSTA 2026)： "aggressive FP reduction can come at the cost of
suppressing true vulnerabilities."

2026-10-28 第一版实测：真漏洞配「扫描器级」近似 payload → 8 条里 3 条被判 rejected，
**误杀率 37.5%**。根因是判据手写死、与 payload 脱节。

本版做两件事
------------
1. **只改 payload，不改断言**：断言全部由 `asserts.py` 从 payload 重新派生。
   这是被测对象 —— 如果派生层是对的，误杀应显著下降。
2. **保留 manual 模式做对照**：复现第一版的做法（手写断言 + 手工跟着 payload 改），
   用来证明「数字的变化不是我把判据放松了」。

判定语义（比第一版更细）
------------------------
    confirmed   → 已证实
    blocked     → 请求被鉴权层挡下（401），**证据不足**，不算误杀也不算检出
    rejected    → 在「本次 payload + 本次前置状态」下没有观察到证据
                  其中 truth=payload_broken 的 rejected 是**正确拒绝**
                  其中 truth=still_vulnerable 的 rejected 才是**误杀**
    unknown     → 装置问题（OAST 不可达、跨轮不稳定等）

误杀率分母只算「漏洞客观上仍存在且本次条件可判定」的条目：
    false_kill_rate = rejected(still_vulnerable) / (still_vulnerable - blocked)
分母里剔除 blocked 是必须的：被 401 挡住的条目**根本没被测试过**，
把它算进分母等于要求闸门在没拿到证据时凭空下结论。

2026-10-29 自检修正（分母污染）
-------------------------------
第一版把 HIDDEN-01 / EXPOSE-USERS-01（**不弱化**的对照组）混在 WEAKEN 里一起算，
真实弱化样本只有 4 条却按 6 条报比例。对照组现在拆到 CONTROLS，单独做装置自检。
并且 n<10 时只输出比例、不声称统计意义（这正是 arXiv 2608.09567 被评审砍掉的毛病）。
"""
import argparse
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asserts as A
import verify as V

HERE = os.path.dirname(os.path.abspath(__file__))
GT = os.path.join(HERE, "lab", "ground_truth.json")

# 只改 payload / 前置状态。**断言一律不动** —— 由 asserts.py 重新派生。
# truth:
#   still_vulnerable = 漏洞客观存在，只是 payload 不够精确 → rejected 即误杀
#   payload_broken   = 这个 payload 在目标环境里本来就不成立 → rejected 正确
WEAKEN = {
    "SQLI-01": (
        lambda c: c["request"].update({"params": {"q": "alice'"}}),
        "只探到语法错误，没写取数语句（扫描器通常只报『该参数可注入』）",
        "still_vulnerable"),
    "XSS-01": (
        lambda c: c["request"].update({"params": {"q": "<script>alert(1)</script>"}}),
        "换成最简 payload（标签都变了）",
        "still_vulnerable"),
    "IDOR-01": (
        lambda c: (c.pop("pre", None), c["request"].pop("session", None)),
        "不知道要先登录 —— 无会话直接打（扫描器默认状态）",
        "still_vulnerable"),
    "CMDI-01": (
        lambda c: c["request"].update({"params": {"host": "127.0.0.1; echo CMDI-MARKER"}}),
        "用了 Linux 的 ; 分隔符，Windows cmd 不认（跨平台猜错）",
        "payload_broken"),
    "LFI-01": (
        lambda c: c["request"].update({"params": {"file": "../../etc/passwd"}}),
        "用了 Linux 经典目标路径，靶场在 Windows 上",
        "payload_broken"),
    "SSRF-01": (
        lambda c: c["request"].update({"params": {"url": "http://127.0.0.1:8898"}}),
        "少了末尾斜杠（同一台机器，理应仍能打通）",
        "still_vulnerable"),
    "PRIV-01": (
        lambda c: (c.pop("pre", None), c["request"].pop("session", None)),
        "无会话打提权接口",
        "still_vulnerable"),
    "DEFAULTCRED-01": (
        lambda c: c["request"].update({"json": {"username": "admin", "password": "password"}}),
        "默认口令猜错一个（admin/password vs admin/admin123）",
        "payload_broken"),
    "DBWRITE-01": (
        lambda c: c["request"]["json"].update({"total": -1}),
        "换了个篡改值（-1 而非 0.01）",
        "still_vulnerable"),
}

# 对照组：**不弱化**，应仍 confirmed —— 用来证明实验装置本身没坏。
# 2026-10-29 自检：这两条原来混在 WEAKEN 里，导致误杀率的分母 = 6（含 2 条对照），
# 而真实弱化样本只有 4 条 → manual 被算成 1/4=25%，实际应报 n=4 且无统计意义。
# 对照组的作用是「装置自检」，不是「误杀率样本」，必须分开统计。
CONTROLS = {
    "HIDDEN-01": (lambda c: None, "对照组：不弱化"),
    "EXPOSE-USERS-01": (lambda c: None, "对照组：不弱化"),
}

# manual 模式专用：第一版实验里「判据手工跟着 payload 改」的那两条。
# 保留它是为了复现 37.5% 这个历史数字，证明本轮的改善来自派生层，而不是放宽判据。
MANUAL_PATCH = {
    "XSS-01": {"assert": {"type": "body_contains", "value": "<script>alert(1)</script>"},
               "control_assert": {"type": "body_not_contains",
                                  "value": "<script>alert(1)</script>"}},
    "DBWRITE-01": {"assert": {"type": "body_contains", "value": "-1"},
                   "control_assert": {"type": "json_path_not_equals",
                                      "path": "total", "value": -1}},
}


def run_case(base_case, mutator, mode, run_label):
    c = json.loads(json.dumps(base_case))
    mutator(c)
    # mode 必须带出来：否则弱化 payload 的实验产物会和正式结论混在 evidence/ 里，
    # 消费方（tally / 报告）无法区分（2026-10-29 自检 P0-1）。
    tag = "falsekill:" + mode
    if mode == "manual":
        # 第一版做法：手写断言，必要时人工跟着 payload 改
        patch = MANUAL_PATCH.get(base_case["id"])
        if patch:
            c.update(json.loads(json.dumps(patch)))
        b = V.verify_case(c, repeats=1, derive=False, mode=tag, run_label=run_label)
    else:
        # 本轮做法：断言一律重新派生
        b = V.verify_case(c, repeats=1, derive=True, mode=tag, run_label=run_label)
    V.save_bundle(b, V.EVIDENCE_DIR)
    return b


def summarize(rows):
    sv = [r for r in rows if r["truth"] == "still_vulnerable"]
    pb = [r for r in rows if r["truth"] == "payload_broken"]
    blocked = [r for r in sv if r["verdict"] == "blocked"]
    testable = [r for r in sv if r["verdict"] != "blocked"]
    kill = [r for r in testable if r["verdict"] == "rejected"]
    return {
        "still_vulnerable": len(sv),
        "confirmed": len([r for r in sv if r["verdict"] == "confirmed"]),
        "blocked": len(blocked),
        "n_testable": len(testable),
        "false_kill": len(kill),
        "false_kill_ids": [r["id"] for r in kill],
        "false_kill_rate": (len(kill) / len(testable)) if testable else None,
        # 2026-10-29 自检：n=4 时 0% 与 25% 都没有统计意义。
        # 这个字段就是为了防止把 n=4 的比例当成结论往外讲。
        "statistically_meaningful": len(testable) >= 10,
        "payload_broken": len(pb),
        "correctly_rejected": len([r for r in pb if r["verdict"] == "rejected"]),
        "false_confirm": len([r for r in pb if r["verdict"] == "confirmed"]),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="both", choices=["manual", "derived", "both"])
    ap.add_argument("--label", default=None,
                    help="批次标签（写进 bundle 的 run_label），默认 falsekill-<日期>")
    ap.add_argument("--out", default=os.path.join(HERE, "baseline", "out", "falsekill_report.json"))
    args = ap.parse_args()
    run_label = args.label or ("falsekill-%s" % datetime.date.today().isoformat())

    ok, msg = V.reset_lab()
    if not ok:
        print("[!] %s\n[!] 先启动靶场：python lab/lab_app.py" % msg)
        return 2

    with open(GT, encoding="utf-8") as f:
        gt = {v["id"]: v for v in json.load(f)["vulns"]}

    modes = ["manual", "derived"] if args.mode == "both" else [args.mode]
    all_rows, all_sum, all_ctl = {}, {}, {}

    for mode in modes:
        print("=" * 108)
        print("模式 = %s%s   label=%s" % (mode, "（手写断言，复现第一版）" if mode == "manual"
                                          else "（断言由 payload 派生）", run_label))
        print("=" * 108)
        print("%-16s %-9s %-11s %-18s %s" % ("CASE", "SOURCE", "VERDICT", "漏洞是否仍在", "弱化方式"))
        print("-" * 108)
        rows = []
        for vid, (fn, why, truth) in WEAKEN.items():
            if vid not in gt:
                print("%-16s SKIP：%s 不在 GT 里" % (vid, vid))
                continue
            b = run_case(gt[vid], fn, mode, run_label)
            src = "manual"
            if mode == "derived":
                src = (b.get("derivation") or {}).get("source", "?")
            rows.append({"id": vid, "verdict": b["verdict"], "truth": truth, "source": src,
                         "weakness": why, "reason": b["verdict_reason"]})
            print("%-16s %-9s %-11s %-18s %s" % (vid, src, b["verdict"], truth, why[:38]))

        # 对照组单独跑、单独统计：它们不是误杀率的分母。
        ctl = []
        for vid, (fn, why) in CONTROLS.items():
            if vid not in gt:
                print("%-16s SKIP：%s 不在 GT 里" % (vid, vid))
                continue
            b = run_case(gt[vid], fn, mode, run_label)
            ctl.append({"id": vid, "verdict": b["verdict"], "expected": "confirmed"})
            print("%-16s %-9s %-11s %-18s %s" % (vid, "control", b["verdict"],
                                                 "对照组", why[:38]))

        s = summarize(rows)
        print("-" * 108)
        print("仍存在 %d：confirmed %d / blocked %d / **误杀 %d** / 其它 %d" %
              (s["still_vulnerable"], s["confirmed"], s["blocked"], s["false_kill"],
               s["still_vulnerable"] - s["confirmed"] - s["blocked"] - s["false_kill"]))
        print("payload 失效 %d：正确拒绝 %d / 误确认 %d" %
              (s["payload_broken"], s["correctly_rejected"], s["false_confirm"]))
        if s["false_kill_rate"] is not None:
            print("误杀率 = %d/%d = %.1f%%（分母 = 可判定的弱化样本，已剔除 blocked 与对照组）" %
                  (s["false_kill"], s["n_testable"], 100 * s["false_kill_rate"]))
            if not s["statistically_meaningful"]:
                print("⚠️  n=%d < 10：这个比例**没有统计意义**，只能当作定性观察（哪条误杀消失了）。"
                      % s["n_testable"])
        ok_ctl = sum(1 for c in ctl if c["verdict"] == "confirmed")
        print("装置自检：对照组 %d 条，应 confirmed，实际 confirmed %d 条%s" %
              (len(ctl), ok_ctl, "" if ok_ctl == len(ctl) else "  ← 装置有问题，本模式结果作废"))
        print()
        all_rows[mode] = rows
        all_sum[mode] = s
        all_ctl[mode] = ctl

    print("=" * 108)
    print("对照")
    print("=" * 108)
    print("%-24s %-10s %-10s %-10s %-8s %s" % ("", "confirmed", "blocked", "误杀", "n", "误杀率"))
    for mode in modes:
        s = all_sum[mode]
        print("%-24s %-10d %-10d %-10d %-8d %s" % (
            "手写断言" if mode == "manual" else "payload 派生",
            s["confirmed"], s["blocked"], s["false_kill"], s["n_testable"],
            "%.1f%%" % (100 * s["false_kill_rate"]) if s["false_kill_rate"] is not None else "-"))
    print()
    print("注意：confirmed 的增量里有一部分是**判定语义修正**（rejected → blocked），")
    print("      不是新增检出能力。逐条区分见 `source` 列与 verdict_reason。")
    print("      误杀率分母已与对照组（HIDDEN-01 / EXPOSE-USERS-01）分离；n<10 时不报显著性。")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"run_label": run_label, "rows": all_rows, "summary": all_sum,
                   "controls": all_ctl}, f, ensure_ascii=False, indent=2)
    print("report ->", args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
