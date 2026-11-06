#!/usr/bin/env python3
"""tally.py —— 汇总打分明细，并用**应用自身的挑战记账**做第二 oracle 交叉核对

为什么单独一个脚本
------------------
用「应用自己记的 solved」当 oracle 有两个坑：
  1. 记账是**按用户**的，必须用攻击者账号的 token 查；
  2. 任何侦察请求都可能改变基线（实测：探一次 /.well-known/security.txt 就解掉了
     securityPolicyChallenge）。所以必须**逐步快照**，否则归因全错。

本脚本只读证据与记账，不发任何攻击请求。
"""
import glob
import json
import os
import urllib.request
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BASE = os.environ.get("JUICE_BASE", "http://127.0.0.1:3001")
PROFILE = os.path.join(ROOT, "profiles", "juiceshop.json")
OUT = os.path.join(HERE, "gt", "final_tally.json")

ROUNDS = (
    ("round1_gate", os.path.join(HERE, "gt", "ground_truth_juice.json")),
    ("round2_llm", os.path.join(HERE, "gt", "llm_layer_cases.json")),
)


def solved_now():
    prof = json.load(open(PROFILE, encoding="utf-8"))
    tok = prof["artifacts"]["auth_token"]
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    r = urllib.request.Request(BASE + "/api/Challenges",
                               headers={"Authorization": "Bearer " + tok})
    with op.open(r, timeout=15) as resp:
        return json.loads(resp.read().decode())["data"]


def _load(p):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _time_key(p):
    """按 (created_at, mtime) 排序。

    旧实现是 `sorted(glob)[-1]`，但文件名里的 evidence_id 是**内容哈希**，与时间无关。
    实测 55 个 case 里 13 个会取错（BCMDI-01 最新是 rejected 却读成 confirmed）。
    现在优先用 bundle 自带的 created_at；旧 bundle 没有该字段（""）→ 自动退化为 mtime。
    """
    b = _load(p)
    if not b:
        return ("", 0.0)
    return (b.get("created_at") or "", os.path.getmtime(p))


# 只有 mode=attack 的 bundle 能当结论。旧 bundle 没有 mode 字段 → 视为 attack
# （那时还没有反向自检 / 弱化实验，语义只有一种）。
ATTACK_MODES = {"attack", None}


def latest_verdict(cid, label=None, with_source=False):
    ev = glob.glob(os.path.join(ROOT, "evidence", "%s_ev_*.json" % cid))
    cand = []
    for p in ev:
        b = _load(p)
        if not b:
            continue
        if b.get("mode") not in ATTACK_MODES:
            continue
        if label and b.get("run_label") != label:
            continue
        cand.append(p)
    if not cand:
        return ("?", None) if with_source else "?"
    best = max(cand, key=_time_key)
    v = (_load(best) or {}).get("verdict", "?")
    return (v, best) if with_source else v


def main():
    chal = solved_now()
    solved = {x["key"]: x["solved"] for x in chal}

    summary = {
        "target": BASE,
        "challenges_total": len(chal),
        "challenges_solved": sorted(k for k, v in solved.items() if v),
        "challenges_solved_count": sum(1 for v in solved.values() if v),
        "rounds": {},
    }

    print("目标 %s  官方挑战 %d 条，当前已解 %d 条"
          % (BASE, len(chal), summary["challenges_solved_count"]))
    print("已解清单: %s\n" % (summary["challenges_solved"] or "(none)"))

    for name, gtfile in ROUNDS:
        gt = json.load(open(gtfile, encoding="utf-8"))
        rows = []
        print("== %s (%s) ==" % (name, os.path.basename(gtfile)))
        print("%-16s %-11s %-34s %-11s %-4s %s" % (
            "CASE", "GATE", "ORACLE", "RECORDED", "一致", "EVIDENCE(created_at)"))
        print("-" * 96)
        for v in gt["vulns"]:
            cid = v["id"]
            verdict, src = latest_verdict(cid, with_source=True)
            key = v.get("oracle")
            rec = None if not key else bool(solved.get(key))
            if rec is None:
                agree = "—"
            else:
                agree = "✅" if (verdict == "confirmed") == rec else "❌"
            ev_tag = "-" if not src else "%s %s" % (
                os.path.basename(src).split("_ev_")[-1].replace(".json", ""),
                (_load(src) or {}).get("created_at") or "no-ts")
            print("%-16s %-11s %-34s %-11s %-4s %s" % (
                cid, verdict, key or "-",
                "n/a" if rec is None else ("SOLVED" if rec else "not-solved"), agree, ev_tag))
            rows.append({"case": cid, "class": v.get("class"), "gate": verdict,
                         "oracle": key, "oracle_solved": rec, "agree": agree,
                         "evidence": os.path.basename(src) if src else None})
        tally = dict(Counter(x["gate"] for x in rows))
        ag = [x for x in rows if x["oracle"]]
        ok = sum(1 for x in ag if x["agree"] == "✅")
        print("\n  汇总 %s | 有 oracle %d 条，一致 %d 条\n" % (tally, len(ag), ok))
        summary["rounds"][name] = {"tally": tally, "oracle_cases": len(ag),
                                   "oracle_agree": ok, "rows": rows}

    json.dump(summary, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("[saved] %s" % OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
