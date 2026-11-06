#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""VHV 回路第 2 阶：把「假设」强制转成「可执行判据」，并做反事实裁决。

这一步是整个回路的关键，也是与现有工作真正的差别所在
----------------------------------------------------
- DNA（EuroSec'26）：CVE+patch → CodeQL 查询 → 候选位置 → **需人工分诊**
- Big Sleep：模型自己写测试、自己下结论 → **判定权在模型**
- strix：`counterevidence.md` 的三态 closure 很好，但**只在提示词层**，没有代码强制

这里做的是第三种：**判定权交给一个与模型无关的执行器**。
候选必须写成能跑的载荷，跑出来的结果由固定规则判，模型无权改判。

四值判定（刻意与闸门的 confirmed/rejected/blocked/unknown 同构）
---------------------------------------------------------------
    live_variant : 未修复版有、修复版也有   → 真实未修复变体（这才是要找的东西）
    fixed        : 未修复版有、修复版没有   → 载荷有效，漏洞已被修（canary，证明装置没坏）
    ineffective  : 两版都没有               → 载荷没打到点（不是「安全」，是「没测到」）
    anomaly      : 未修复版没有、修复版有   → 装置或语义异常，必须人工看

`ineffective` 与 `fixed` 的区别是这套东西的全部价值所在：扫描器把「没测到」
报成「没有漏洞」，就是漏报的根源。这里不允许混淆。

用法：
    python vhv/reify.py --seed GHSA-F23M-R3PF-42RH \\
        --vuln  vhv/src/lodash-4.17.20/lodash.js \\
        --secure vhv/src/lodash-4.18.0/lodash.js
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROBE = os.path.join(HERE, "probe.js")

# probe.js 里支持的载荷名。这里再列一遍是为了「未知载荷名」能在 Python 侧
# 就报错，而不是等到 node 里 exit 2 —— 早失败比晚失败省时间。
KNOWN_CASES = [
    # 写入型
    "set_str_proto", "set_str_ctor", "set_str_prototype_only",
    "set_arr_proto", "set_arr_ctor", "set_arr_proto_num", "set_arr_proto_obj",
    "setWith_proto", "setWith_arr_ctor",
    "merge_proto", "merge_ctor",
    "defaultsDeep_proto", "defaultsDeep_ctor",
    "update_proto",
    "zipObjectDeep_proto", "zipObjectDeep_ctor",
    # 删除型（判据是「预置属性是否消失」，不是「是否能看见」）
    "unset_del_proto_str", "unset_del_proto_arr", "unset_del_ctor_proto",
    "unset_del_prototype_only", "omit_del_proto_arr", "omit_del_proto_str",
    # 阴性对照
    "ctrl_normal_set", "ctrl_normal_merge", "ctrl_normal_unset",
]

VERDICT_ORDER = ["live_variant", "anomaly", "fixed", "ineffective"]


def run_probe(case, lodash_path, timeout=30):
    """跑单个载荷。**每个载荷一个独立进程**是硬要求：
    原型链污染是全局副作用，同进程复用会让后一个 case 吃到前一个的残留。"""
    try:
        p = subprocess.run(["node", PROBE, case, lodash_path],
                           capture_output=True, timeout=timeout)
    except FileNotFoundError:
        return {"case": case, "ok": False, "error": "找不到 node（需 Node 18+）"}
    except subprocess.TimeoutExpired:
        return {"case": case, "ok": False, "error": "超时 %ds" % timeout}

    out = (p.stdout or b"").decode("utf-8", "replace").strip()
    if not out:
        err = (p.stderr or b"").decode("utf-8", "replace").strip()
        return {"case": case, "ok": False, "error": "无输出 rc=%s %s" % (p.returncode, err[:160])}
    try:
        d = json.loads(out.splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        return {"case": case, "ok": False, "error": "非 JSON 输出: %s" % out[:160]}
    d["ok"] = d.get("ok", True) and not d.get("error")
    return d


def judge(vuln_r, sec_r):
    """反事实裁决。返回 (verdict, 一句话理由)。"""
    if not vuln_r.get("ok") or not sec_r.get("ok"):
        return "anomaly", "探针执行失败：%s / %s" % (
            vuln_r.get("error") or "ok", sec_r.get("error") or "ok")
    v = bool(vuln_r.get("polluted"))
    s = bool(sec_r.get("polluted"))
    if v and not s:
        return "fixed", "未修复版污染，修复版不污染 → 载荷有效且已修复"
    if v and s:
        return "live_variant", "两版都污染 → **未修复变体**"
    if not v and s:
        return "anomaly", "未修复版不污染却修复版污染 → 装置或版本搞反了"
    # 两版都不污染：只有阴性对照才能说「符合预期」，其余是「没打到点」
    if vuln_r.get("case", "").startswith("ctrl_"):
        return "ineffective", "阴性对照通过（本就不该污染）"
    return "ineffective", "两版都不污染 → 载荷没打到点，不等于该路径安全"


def main():
    ap = argparse.ArgumentParser(description="VHV reify：假设 → 可执行判据 → 反事实裁决")
    ap.add_argument("--seed", default=None, help="种子 id，仅用于写进报告")
    ap.add_argument("--vuln", required=True, help="未修复版 lodash 路径")
    ap.add_argument("--secure", required=True, help="已修复版 lodash 路径")
    ap.add_argument("--cases", nargs="*", default=None, help="只跑指定载荷（默认全跑）")
    ap.add_argument("--out", default=os.path.join(HERE, "cases"))
    args = ap.parse_args()

    for p in (args.vuln, args.secure):
        if not os.path.exists(p):
            print("[FAIL] 找不到 %s" % p)
            return 2
    # node 的 require 只认绝对路径或模块名；传相对路径 'vhv/src/x.js' 会被
    # 当成模块名去 node_modules 找，报 "Cannot find module"。这里统一转绝对。
    args.vuln = os.path.abspath(args.vuln)
    args.secure = os.path.abspath(args.secure)

    cases = args.cases or KNOWN_CASES
    unknown = [c for c in cases if c not in KNOWN_CASES]
    if unknown:
        print("[FAIL] 未知载荷名：%s" % ", ".join(unknown))
        return 2

    print("VHV reify")
    print("  未修复版: %s" % args.vuln)
    print("  已修复版: %s" % args.secure)
    print("  载荷数  : %d" % len(cases))
    print()
    print("%-26s %-9s %-9s %-13s %s" % ("CASE", "vuln", "secure", "VERDICT", "理由"))
    print("-" * 108)

    rows = []
    for c in cases:
        vr = run_probe(c, args.vuln)
        sr = run_probe(c, args.secure)
        verdict, why = judge(vr, sr)
        rows.append({
            "case": c, "verdict": verdict, "why": why,
            "kind": vr.get("kind") or sr.get("kind"),
            "vuln": {"polluted": vr.get("polluted"), "error": vr.get("error"),
                     "detail": vr.get("detail"), "version": vr.get("lodash_version")},
            "secure": {"polluted": sr.get("polluted"), "error": sr.get("error"),
                       "detail": sr.get("detail"), "version": sr.get("lodash_version")},
        })
        # 阴性对照「不污染」才是对的，显示 POSITIVE 会让人以为是发现问题
        def shown(r):
            if r.get("error"):
                return "err"
            if r.get("polluted"):
                return "HIT" if not c.startswith("ctrl_") else "HIT(异常)"
            return "clean"
        print("%-26s %-11s %-11s %-13s %s" % (
            c, shown(vr), shown(sr), verdict, why))

    print("-" * 108)
    tally = {}
    for r in rows:
        tally[r["verdict"]] = tally.get(r["verdict"], 0) + 1
    print("汇总: " + "  ".join("%s=%d" % (k, tally[k]) for k in VERDICT_ORDER if k in tally))

    live = [r for r in rows if r["verdict"] == "live_variant"]
    if live:
        print()
        print("⚠ 发现 %d 条两版都污染的未修复变体，需要人工确认影响面：" % len(live))
        for r in live:
            print("    %s" % r["case"])
    else:
        print()
        print("本轮没有 live_variant。注意：这只说明**这批载荷**没打到未修复点，")
        print("不等于该库已无同类问题 —— 载荷覆盖率决定结论上限。")

    os.makedirs(args.out, exist_ok=True)
    label = args.seed or "adhoc"
    path = os.path.join(args.out, "%s_reify.json" % label)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"seed": args.seed, "vuln": args.vuln, "secure": args.secure,
                   "tally": tally, "rows": rows}, f, ensure_ascii=False, indent=2)
    print("\n证据 -> %s" % path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
