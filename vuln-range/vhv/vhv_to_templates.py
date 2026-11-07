#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
vhv_to_templates.py — 把 VHV 语料抽成「变体族谱」，供主线只读引用
====================================================================
做什么
------
从 vhv/payloads.json（17 条带契约的载荷）与 cases/matrix-invoke.json（17 个变体
× 3 个版本）抽出结构化的**变体族**，产出 vhv/variant_families.json。

刻意不做什么（这是本模块存在的主要理由）
------------------------------------------
1. **不把库层载荷 expr 变成 HTTP 断言**。expr 是 JS 求值表达式，判定契约是
   「返回值里有没有随机 marker」；asserts.py 判的是 HTTP 响应。两者语义层不同，
   强行映射等于把 npm 包的结论搬到 Web 端点上，属于伪造证据。
2. **不把 verdict 当判定结论输出**。matrix 里的 MATCH / fixed / ineffective 是
   当时那台机器上对那几个 lodash 版本的观测，只作 observed_only 记录。
3. **不引入 RAG / 向量检索**。族谱是 17 条，直接按键查表即可，检索层纯属负担。

可复用的只有两样：**变体枚举**（同一个洞有多少种打法）与**正负对照纪律**
（control / guard-control 与攻击载荷成对）。前者是 P2 held-out 变体验证的语料，
后者与 asserts.py 的正负双控同构。

用法：python vhv/vhv_to_templates.py
"""
from __future__ import annotations

import hashlib
import io
import json
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
PAYLOADS = os.path.join(HERE, "payloads.json")
MATRIX = os.path.join(HERE, "cases", "matrix-invoke.json")
REIFY = os.path.join(HERE, "cases", "GHSA-F23M-R3PF-42RH_reify.json")
OUT = os.path.join(HERE, "variant_families.json")


def load(path):
    with io.open(path, encoding="utf-8") as f:
        return json.load(f)


def sha(s):
    return hashlib.sha256(s.encode("utf-8", "replace")).hexdigest()[:16]


def build():
    p = load(PAYLOADS)
    matrix = load(MATRIX) if os.path.isfile(MATRIX) else {"rows": []}
    reify = load(REIFY) if os.path.isfile(REIFY) else {"rows": []}

    matrix_by_id = {r.get("id"): r for r in matrix.get("rows", [])}
    families = defaultdict(lambda: {"variants": [], "controls": [], "guard_controls": []})

    for item in p.get("payloads", []):
        cls = item.get("class") or "unclassified"
        rec = {
            "id": item.get("id"),
            "api": item.get("api"),
            "origin": item.get("origin"),          # locate=自动提示 / manual=手写
            "expect": item.get("expect"),          # 判定契约，不是判定结论
            "expr_sha256": sha(item.get("expr", "")),
            "expr_len": len(item.get("expr", "")),
            "expr_layer": "javascript-eval",
            # 不写 expr 明文：族谱只需要「有多少种打法」，不需要载荷内容。
            # 真要跑库层验证时直接读 payloads.json，避免多一份可扩散副本。
        }
        cells = matrix_by_id.get(item.get("id"), {}).get("cells")
        if cells:
            # 只记「有跨版本观测」这一事实，**不输出具体 verdict**。
            # cases/matrix-invoke.json 属于未协调披露研究，已被仓库 .gitignore 排除；
            # 把它的 MATCH / fixed / ineffective 判定结构化输出，等于绕过那道排除。
            rec["cross_version"] = {
                "observed_only": True,
                "versions": list(matrix.get("versions", [])),
                "verdicts_withheld": True,
                "withheld_reason": "源文件属未协调披露研究，判定结论不随族谱公开",
            }
        if cls == "control":
            families[cls]["controls"].append(rec)
        elif cls == "guard-control":
            families[cls]["guard_controls"].append(rec)
        else:
            families[cls]["variants"].append(rec)

    out_families = {}
    for name, g in sorted(families.items()):
        is_attack = name not in ("control", "guard-control")
        out_families[name] = {
            "layer": "library(js-expression)",
            "role": "attack" if is_attack else name,
            "variant_count": len(g["variants"]),
            "control_count": len(g["controls"]),
            "guard_control_count": len(g["guard_controls"]),
            "variants": g["variants"] + g["controls"] + g["guard_controls"],
            "web_layer_reuse": {
                "allowed": ["变体枚举（用于 held-out 覆盖度提示）",
                            "正负对照成对纪律"],
                "forbidden": ["把 expr 直接当 HTTP 请求 payload",
                              "把 expect=marker 当 HTTP 响应断言",
                              "把 cross_version.verdicts 当漏洞判定结论"],
                "reason": "npm 库层是 JS 表达式求值 + 进程内 marker；Web 层是 HTTP 请求/响应。"
                          "证据源不同，判定不可跨层搬运。",
            },
        }

    return {
        "schema": "vhv-variant-families/1",
        "generated_from": ["payloads.json", "cases/matrix-invoke.json",
                           "cases/GHSA-F23M-R3PF-42RH_reify.json"],
        "semantic_boundary": (
            "本文件是只读族谱，不是断言库、不是知识库、不是判定结论。"
            "VHV 的对象是 npm 库（lodash / dot-prop / json-ptr），主线 verify.py 的对象是 Web 应用"
            "（lab / Gitea / Juice Shop）。「同族未修变体」在库层成立，不自动在 Web 端点成立。"
            "要在 Web 侧复用，必须重新从该端点的 payload 派生断言（asserts.py derive()）。"
        ),
        "contracts": p.get("note", []),
        "disclosure_note": (
            "变体 id / api / origin / expect / expr 哈希来自已公开的 payloads.json。"
            "cases/matrix-invoke.json 的跨版本判定结论已刻意不写入本文件（verdicts_withheld），"
            "因为该源文件属未协调披露研究且被 .gitignore 排除。"
            "若该研究后续决定公开，再重跑本脚本并按需放开该字段。"
        ),
        "payload_count": len(p.get("payloads", [])),
        "matrix_rows": len(matrix.get("rows", [])),
        "reify_rows": len(reify.get("rows", [])),
        "families": out_families,
    }


def main():
    data = build()
    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("写出 %s" % OUT)
    print("载荷 %d 条 / matrix %d 行 / reify %d 行"
          % (data["payload_count"], data["matrix_rows"], data["reify_rows"]))
    for name, g in data["families"].items():
        print("  %-16s role=%-14s variants=%d controls=%d guard=%d"
              % (name, g["role"], g["variant_count"], g["control_count"],
                 g["guard_control_count"]))


if __name__ == "__main__":
    main()
