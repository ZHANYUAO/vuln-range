#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
combo_matrix.py —— 从历史 CVE 库自动生成「函数 × 不变量」覆盖矩阵，并标出空格子

核心思想（这是「排列组合挖新洞」的可执行版本）：

  历史 CVE 不是孤立的点，它们是**已经被占用的格子**。
  一个格子 = (某个函数) × (某个防护不变量)。
  修复的承诺是「这个函数现在会挡住 X」；别处做同样事情的函数是否被覆盖，
  从来没人检查过 —— 那些空格子就是候选。

  这个脚本做三件事：
    1. 从 advisory 文本提取「这条 CVE 涉及哪个函数」（正则，可复核）
    2. 把 (函数, 不变量) 打成矩阵，已占用的格子标 ●
    3. 列出目标库的**全部相关函数**，把没有任何 CVE 覆盖的格子标出来

  校准用例：lodash 的 `invoke` / `invokeMap` / `method` / `methodOf`
  在矩阵里应当全部是空格子 —— 如果工具能自己把它们标出来，说明方法有效。

用法：
  python combo_matrix.py lodash
  python combo_matrix.py lodash --apis-file cases/apis-lodash.json
"""
import json, re, sys, argparse
from collections import defaultdict

DB = 'cve-db/index.json'

# 「函数」提取：advisory 里各种写法
#   `_.unset` / `_.omit` / lodash.merge / defaultsDeep / zipObjectDeep
FUNC_PATTERNS = [
    r'`?_\.([a-zA-Z][a-zA-Z0-9]*)`?',          # _.unset
    r'\blodash\.([a-zA-Z][a-zA-Z0-9]*)',        # lodash.merge
    r'\b([a-z][a-zA-Z0-9]*)\s*\(\s*\)',         # merge()
]

# 与 path / 对象图有关、且历史上出过事的函数名（用于从纯文本里认领）
KNOWN_FUNCS = {
    'get', 'set', 'unset', 'update', 'updateWith', 'setWith', 'has', 'hasIn', 'at',
    'invoke', 'invokeMap', 'method', 'methodOf', 'result', 'property', 'propertyOf',
    'pick', 'omit', 'pickBy', 'omitBy', 'merge', 'mergeWith', 'defaultsDeep',
    'assign', 'assignIn', 'assignWith', 'zipObject', 'zipObjectDeep', 'fromPairs',
    'template', 'cloneDeep', 'cloneDeepWith', 'toEqual', 'isMatch', 'matchesProperty',
    'mapValues', 'mapKeys', 'transform', 'defaults', 'extend', 'flatten',
}

# 不变量：修复承诺要挡住什么
INVARIANTS = ['deny_proto', 'deny_ctor', 'deny_prototype', 'own_only', 'immutable']


def extract_funcs(text):
    """
    只认**显式限定**的函数名，不做裸词匹配。

    踩过的坑：一开始对 KNOWN_FUNCS 做自由匹配，结果
      "at"        命中英文介词 at
      "has"       命中 "has been"
      "property"  命中 "own property"
      "create"    命中 "create a patch"
    矩阵里凭空多出十几个「已被 CVE 覆盖」的格子，整张表全是误报。
    短词和英文常用词绝对不能用裸词匹配 —— 这是文本提取的第一条铁律。
    """
    t = text or ''
    out = set()
    # 1) _.xxx / lodash.xxx —— 最可靠
    for rx in (r'`?_\.([a-zA-Z][a-zA-Z0-9]*)`?', r'\blodash\.[a-zA-Z]+\.([a-zA-Z][a-zA-Z0-9]*)',
               r'\blodash\.([a-zA-Z][a-zA-Z0-9]*)'):
        for m in re.finditer(rx, t):
            out.add(m.group(1))
    # 2) xxx( 形式，但必须是已知函数名且前面不是标识符字符
    for m in re.finditer(r'(?<![a-zA-Z0-9_$])([a-zA-Z][a-zA-Z0-9]*)\s*\(', t):
        fn = m.group(1)
        if fn in KNOWN_FUNCS:
            out.add(fn)
    # 3) 反引号包裹的裸函数名（advisory 常用 `unset` `omit` 这种写法）
    for m in re.finditer(r'`([a-zA-Z][a-zA-Z0-9]*)`', t):
        fn = m.group(1)
        if fn in KNOWN_FUNCS:
            out.add(fn)
    return out


def extract_invariants(text):
    t = text or ''
    out = []
    # 注意顺序：「constructor.prototype」同时含两个，都要算
    if '__proto__' in t:
        out.append('deny_proto')
    if re.search(r'\bconstructor\b', t):
        out.append('deny_ctor')
    if re.search(r'\bprototype\b', t):
        out.append('deny_prototype')
    if re.search(r'own property|hasOwnProperty', t, re.I):
        out.append('own_only')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('package')
    ap.add_argument('--apis-file', default=None, help='JSON: {"apis": ["get","set",...]} 明确给出目标库的函数全集')
    args = ap.parse_args()

    db = json.load(open(DB, encoding='utf-8'))
    recs = db['records']

    # 只取与该包相关的记录
    pkg_recs = [r for r in recs.values() if args.package in r['packages']]

    occupied = defaultdict(set)      # func -> set(invariant)
    cve_of = defaultdict(list)       # (func, invariant) -> [cve]
    for r in pkg_recs:
        text = (r['summary'] or '') + ' ' + r.get('details_text', '')
        # details 在 index.json 里没存全文，用 summary + 引用标题兜底
        text += ' ' + ' '.join(r.get('refs') or [])
        funcs = extract_funcs(text)
        invs = extract_invariants(text)
        cve_name = next((a for a in r['aliases'] if a.startswith('CVE-')), r['id'])
        for f in funcs:
            for i in invs:
                occupied[f].add(i)
                cve_of[(f, i)].append(cve_name)

    # 目标库的函数全集
    if args.apis_file:
        apis = json.load(open(args.apis_file, encoding='utf-8'))['apis']
    else:
        # 兜底：已知集合里，advisory 提到过 + 常见 path 函数
        apis = sorted(set(occupied.keys()) | {
            'get', 'set', 'unset', 'has', 'at', 'invoke', 'invokeMap',
            'method', 'methodOf', 'result', 'pick', 'omit', 'update', 'merge',
        })

    print('包: %s   历史 advisory: %d 条' % (args.package, len(pkg_recs)))
    print('不变量维度: %s' % ', '.join(INVARIANTS))
    print()

    # 矩阵
    w = max(len(a) for a in apis) + 2
    header = '函数'.ljust(w) + ''.join(i.ljust(18) for i in INVARIANTS)
    print(header)
    print('-' * len(header))

    empty_cells = []
    for f in apis:
        row = f.ljust(w)
        for inv in INVARIANTS:
            if inv in occupied.get(f, set()):
                cves = sorted(set(cve_of[(f, inv)]))
                cell = '● ' + (cves[0] if cves else '')[:14]
            else:
                # 只对「这个库确实有这个函数」的格子算空格子
                cell = '·'
                empty_cells.append((f, inv))
            row += cell.ljust(18)
        print(row)

    print('-' * len(header))
    print()
    print('已占用格子: %d  空格子: %d' % (
        sum(len(v) for v in occupied.values()), len(empty_cells)))

    # 重点：完全没有被任何 CVE 覆盖的函数
    no_cve = [f for f in apis if not occupied.get(f)]
    if no_cve:
        print()
        print('★ 从未被任何 CVE 覆盖的函数（最高优先级候选）：')
        for f in no_cve:
            print('    %s' % f)


if __name__ == '__main__':
    main()
