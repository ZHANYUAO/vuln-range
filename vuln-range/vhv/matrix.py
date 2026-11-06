#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""VHV 矩阵内核：把「手工 PoC」升级成「载荷 × 版本」的二维实验装置。

为什么需要它（2026-11-02）
-------------------------
之前是 6 个 PoC 写死在 poc.js 里，换个版本要改代码，加个载荷要复制粘贴。
这带来两个问题：
  1) 无法回答「这个缺口是本版本的回归，还是长期存在」—— 只能靠回忆。
  2) 无法回答「自动化定位（locate.js）到底带来了多少增量」—— 只能靠感觉。

矩阵把这两件事变成可计算量：
  - 同一载荷列在 4.17.20 / 4.18.0 / 4.18.1 三列上打出来后，
    「全列命中」= 从未被任何 advisory 覆盖；「低命中高不命中」= 已被修复。
  - payloads.json 里每条载荷带 origin 字段（locate 自动提示 / 手工），
    因此可以统计"自动定位贡献了几条新攻击面"。

铁律（沿用 reify 层，不是可选项）
-------------------------------
**一个载荷一个进程**。原型链污染是全局副作用：同进程里前一个载荷往
Object.prototype 上挂的东西，会让后一个载荷的判据凭空成立，把 miss 变成 match。
这条约束是用一次 22/22 的假阴性换来的，不再讨论。

判据统一成"返回值里有没有 marker 串"，而不是每个载荷各写一套：
  expect=marker     → 表达式中出现 'VHV'+M 即命中
  expect=no_marker  → 不出现才算通过（阴性对照 / "被拦住"断言）
这样新增载荷不需要碰引擎代码，只改 JSON。

用法：
    python vhv/matrix.py                     # 默认三版全跑
    python vhv/matrix.py --versions 4.18.1
    python vhv/matrix.py --md out.md --json out.json
"""
import argparse
import json
import os
import random
import string
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PAYLOADS = os.path.join(HERE, "payloads.json")
DEFAULT_VERSIONS = ["4.17.20", "4.18.0", "4.18.1"]
SRC_DIR = os.path.join(HERE, "src")

RUNNER_TMPL = """\
// 自动生成，勿手改 —— 每个载荷独立进程执行
const _ = require(process.argv[2]);
const M = process.argv[3];
let out = null, err = null;
try {
  out = (%s);
} catch (e) {
  err = (e && e.constructor ? e.constructor.name : 'Error') + ': ' + e.message;
}
console.log(JSON.stringify({
  ok: err === null,
  value: err === null ? String(out) : null,
  error: err,
  version: _.VERSION,
}));
"""


def marker():
    return "vhv" + "".join(random.choice(string.ascii_lowercase) for _ in range(6))


def find_lodash(version):
    p = os.path.join(SRC_DIR, "lodash-%s" % version, "lodash.js")
    return p if os.path.exists(p) else None


def run_one(expr, lodash_path, m, runner_path, timeout=30):
    """跑单个载荷。任何异常都收敛成 dict，不向上抛 —— 一条载荷坏掉不该中断整张矩阵。"""
    with open(runner_path, "w", encoding="utf-8") as f:
        f.write(RUNNER_TMPL % expr)
    try:
        p = subprocess.run(["node", runner_path, os.path.abspath(lodash_path), m],
                           capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "超时 %ds" % timeout, "value": None}
    except FileNotFoundError:
        return {"ok": False, "error": "找不到 node", "value": None}

    out = (p.stdout or b"").decode("utf-8", "replace").strip()
    if not out:
        err = (p.stderr or b"").decode("utf-8", "replace").strip()
        return {"ok": False, "error": "无输出 rc=%s %s" % (p.returncode, err[:200]), "value": None}
    try:
        return json.loads(out.splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        return {"ok": False, "error": "非 JSON: %s" % out[:200], "value": None}


def judge(payload, res, m):
    """把执行结果压成三态。刻意不把「没命中」和「执行出错」合并 ——
    前者是实验结论（该路径不成立），后者是装置故障（结论无效）。"""
    if not res.get("ok"):
        # 载荷本身预期会抛错的（比如调用 __defineGetter__ 时参数不对），
        # 只要错误信息里带 marker 也算它走到了那个函数
        if res.get("error") and ("VHV" + m) in res["error"]:
            return "MATCH"
        return "ERR"
    hit = ("VHV" + m) in (res.get("value") or "")
    if payload.get("expect") == "no_marker":
        return "MISS" if hit else "MATCH"
    return "MATCH" if hit else "MISS"


def main():
    ap = argparse.ArgumentParser(description="VHV 矩阵：载荷 × 版本")
    ap.add_argument("--payloads", default=DEFAULT_PAYLOADS)
    ap.add_argument("--versions", nargs="*", default=DEFAULT_VERSIONS)
    ap.add_argument("--json", default=None)
    ap.add_argument("--md", default=None)
    ap.add_argument("--filter", default=None, help="只跑 id 含该子串的载荷")
    args = ap.parse_args()

    with open(args.payloads, encoding="utf-8") as f:
        spec = json.load(f)
    payloads = spec["payloads"]
    if args.filter:
        payloads = [p for p in payloads if args.filter in p["id"]]
    if not payloads:
        print("[FAIL] 没有载荷")
        return 2

    versions = {}
    for v in args.versions:
        p = find_lodash(v)
        if not p:
            print("[SKIP] 缺版本 %s（%s 不存在）" % (v, os.path.join(SRC_DIR, "lodash-%s" % v)))
            continue
        versions[v] = p
    if not versions:
        print("[FAIL] 一个可用版本都没有")
        return 2

    print("VHV 矩阵  载荷 %d × 版本 %d" % (len(payloads), len(versions)))
    print("版本: " + ", ".join(versions))
    print()

    tmpdir = tempfile.mkdtemp(prefix="vhv-matrix-")
    runner = os.path.join(tmpdir, "runner.js")

    matrix = []
    for pl in payloads:
        row = {"id": pl["id"], "api": pl["api"], "class": pl["class"],
               "expect": pl.get("expect", "marker"),
               "origin": pl.get("origin", "manual"), "cells": {}}
        for v, lp in versions.items():
            m = marker()
            res = run_one(pl["expr"], lp, m, runner)
            row["cells"][v] = {
                "verdict": judge(pl, res, m),
                "value": (res.get("value") or "")[:120],
                "error": res.get("error"),
            }
        matrix.append(row)

    # ---- 输出表格 ----
    idw = max(len(r["id"]) for r in matrix) + 2
    head = "PAYLOAD".ljust(idw) + "".join(v.rjust(10) for v in versions) + "  CLASS"
    print(head)
    print("-" * len(head))
    for r in matrix:
        cells = ""
        for v in versions:
            x = r["cells"][v]["verdict"]
            # no_marker 类载荷的 MATCH 含义是"没命中才算通过"，显示成 OK，
            # 否则会和 rce/pollution 的 HIT 混在一起，看表的人会以为它也打穿了。
            hit_is_pass = (r["expect"] == "no_marker" or
                           r["class"] in ("control", "guard-control"))
            label = {"MATCH": "OK" if hit_is_pass else "HIT",
                     "MISS": ".", "ERR": "ERR"}[x]
            cells += label.rjust(10)
        print(r["id"].ljust(idw) + cells + "  " + r["class"])
    print("-" * len(head))

    # ---- 结论推导：这是矩阵存在的主要理由 ----
    print()
    always, fixed, never, broken, ctrls = [], [], [], [], []
    for r in matrix:
        vs = [r["cells"][v]["verdict"] for v in versions]
        # 对照组不参与"命中即发现"的统计：它们命中是预期行为（正常功能可用 /
        # 被 guard 拦住），混进 always_match 会让头条数字虚高。
        if r["class"] in ("control", "guard-control"):
            ctrls.append((r["id"], vs))
            continue
        if all(x == "ERR" for x in vs):
            broken.append(r["id"])
        elif all(x == "MATCH" for x in vs):
            always.append(r["id"])
        elif all(x in ("MISS", "MATCH") for x in vs) and vs[0] == "MATCH" and vs[-1] == "MISS":
            fixed.append(r["id"])
        elif all(x == "MISS" for x in vs):
            never.append(r["id"])
    print("全版本命中（从未被修复）: %d 条" % len(always))
    for x in always:
        print("    " + x)
    if fixed:
        print("低版本命中、最新版不命中（已被修复，可作 canary）: %d 条" % len(fixed))
        for x in fixed:
            print("    " + x)
    if never:
        print("全版本不命中（载荷无效或路径不成立）: %d 条" % len(never))
        for x in never:
            print("    " + x)
    if broken:
        print("装置故障（全部 ERR，结论无效）: %d 条" % len(broken))
        for x in broken:
            print("    " + x)

    last_ver = list(versions)[-1]
    if ctrls:
        ok = sum(1 for _, vs in ctrls if all(x == "MATCH" for x in vs))
        print("对照组（正常功能 / 被 guard 拦住）: %d/%d 全部通过" % (ok, len(ctrls)))
        for cid, vs in ctrls:
            mark = "".join({"MATCH": "O", "MISS": "x", "ERR": "E"}[x] for x in vs)
            print("    %-32s %s" % (cid, mark))

    auto = [r["id"] for r in matrix
            if r["origin"] == "locate" and r["cells"][last_ver]["verdict"] == "MATCH"]
    print()
    print("自动定位（locate.js）贡献的命中载荷: %d / %d" % (
        len(auto), sum(1 for r in matrix if r["origin"] == "locate")))

    out = {"schema": "vhv-matrix/1", "versions": list(versions),
           "payloads_file": os.path.abspath(args.payloads), "rows": matrix,
           "summary": {"always_match": always, "fixed": fixed,
                       "never": never, "broken": broken,
                       "auto_located_hits": auto}}
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        print("\n矩阵 -> %s" % args.json)

    if args.md:
        with open(args.md, "w", encoding="utf-8") as f:
            f.write("| 载荷 | " + " | ".join(versions) + " | 类别 | 来源 |\n")
            f.write("|---|" + "---|" * len(versions) + "---|---|\n")
            for r in matrix:
                cells = " | ".join(
                    {"MATCH": "命中", "MISS": "—", "ERR": "ERR"}[r["cells"][v]["verdict"]]
                    for v in versions)
                f.write("| `%s` | %s | %s | %s |\n" % (
                    r["id"], cells, r["class"], r["origin"]))
        print("Markdown -> %s" % args.md)

    return 0 if not broken else 1


if __name__ == "__main__":
    sys.exit(main())
