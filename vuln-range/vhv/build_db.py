#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_db.py —— 把 OSV 原始响应归一化成结构化历史 CVE 库

设计目标不是"保存 advisory"，而是**让修复的演化链显式可见**：
  - 同一个包按 fixed 版本排序 → 看到「修一次、漏一次」的节奏
  - 每条记录提取「触发形态」（字符串 path / 数组 path / merge 对象 / 编码变体）
    → 这是后续做排列组合的原子
  - 每条记录标注「不变量类型」（禁止键 / 禁止位置 / 深拷贝 / 类型校验）
    → 这是修复的"承诺"，组合的乘数之一

输出：
  cve-db/index.json   全量结构化数据
  cve-db/summary.md   人读摘要（含演化链）
"""
import json, os, glob, re
from collections import defaultdict

RAW = 'cve-db/raw'
OUT_DIR = 'cve-db'

# ---------------------------------------------------------------------------
# 触发形态：这条 CVE 是靠什么形态打进去的。这是组合的"位置"维度。
# 关键词来自 advisory 原文，不是我的猜测 —— 每条都会打印命中的词。
# ---------------------------------------------------------------------------
FORM_PATTERNS = [
    ('array_path',      r'array path|array of (?:keys|strings)|path array|\[\s*[\'"]__proto__'),
    ('string_path',     r'dot notation|string path|path string|a\.b\.c|dot-delimited'),
    ('object_merge',    r'\bmerge\b|deep merge|recursive(?:ly)? merge|extend'),
    ('object_assign',   r'\bassign\b|mass assignment|copy(?:ing)? propert'),
    ('template_inject', r'\btemplate\b|variable option|imports option|compile'),
    ('json_pointer',    r'json pointer|RFC ?6901|/__proto__'),
    ('getter_call',     r'\binvoke\b|call(?:ing)? (?:a )?function|method(?:Of)?\b'),
]

# 不变量类型：修复承诺了什么。这是组合的"承诺"维度。
INVARIANT_PATTERNS = [
    ('deny_key_proto',    r'__proto__'),
    ('deny_key_ctor',     r'constructor'),
    ('deny_key_prototype', r'\bprototype\b'),
    ('own_property_only', r'hasOwnProperty|own property|Object\.hasOwn'),
    ('immutable_copy',    r'immutable|does not modify|returns a new'),
    ('type_check',        r'typeof|isObject|type check'),
]

def hit(text, pats):
    out = []
    for name, rx in pats:
        if re.search(rx, text, re.I):
            out.append(name)
    return out


def norm_ranges(affected):
    """把 affected[].ranges 压成 ['<introduced> .. <fixed>'] 便于人读。"""
    out = []
    for a in affected or []:
        for r in a.get('ranges') or []:
            intro, fixed = [], []
            for ev in r.get('events') or []:
                if 'introduced' in ev: intro.append(ev['introduced'])
                if 'fixed' in ev: fixed.append(ev['fixed'])
                if 'last_affected' in ev: fixed.append('<= ' + ev['last_affected'])
            out.append({'type': r.get('type'), 'introduced': intro, 'fixed': fixed})
    return out


def fixed_versions(affected):
    vs = []
    for r in norm_ranges(affected):
        for f in r['fixed']:
            if not f.startswith('<='):
                vs.append(f)
    return sorted(set(vs))


records = {}
by_pkg = defaultdict(list)

for path in sorted(glob.glob(os.path.join(RAW, '*.json'))):
    pkg = os.path.basename(path)[:-5]
    try:
        data = json.load(open(path, encoding='utf-8'))
    except Exception as e:
        print('解析失败 %s: %s' % (pkg, e))
        continue
    for v in data.get('vulns', []):
        vid = v.get('id')
        if not vid:
            continue
        desc = ' '.join(
            (d.get('value') or '') for d in (v.get('details') and [{'value': v['details']}] or [])
        )
        summary = v.get('summary') or ''
        text = summary + ' ' + (v.get('details') or '')
        cwes = []
        ds = v.get('database_specific') or {}
        for c in (ds.get('cwe_ids') or []):
            cwes.append(c)
        # severity
        sev = None
        for s in (v.get('severity') or []):
            sev = s.get('score') or sev

        rec = records.get(vid)
        if rec is None:
            rec = {
                'id': vid,
                'aliases': [],
                'summary': summary,
                # 保留详情全文：函数名、路径形态往往只写在 details 里，
                # 只存 summary 会让下一层提取大量漏判。
                'details_text': (v.get('details') or '')[:4000],
                'cwe': [],
                'severity': sev,
                'published': v.get('published'),
                'modified': v.get('modified'),
                'packages': [],
                'ranges': {},
                'fixed': {},
                'forms': hit(text, FORM_PATTERNS),
                'invariants': hit(text, INVARIANT_PATTERNS),
                'refs': [r.get('url') for r in (v.get('references') or [])][:12],
            }
            records[vid] = rec
        for a in (v.get('aliases') or []):
            if a not in rec['aliases']:
                rec['aliases'].append(a)
        for c in cwes:
            if c not in rec['cwe']:
                rec['cwe'].append(c)

        name = ((v.get('affected') or [{}])[0].get('package') or {}).get('name') or pkg
        if name not in rec['packages']:
            rec['packages'].append(name)
        rec['ranges'][name] = norm_ranges(v.get('affected'))
        rec['fixed'][name] = fixed_versions(v.get('affected'))
        # 合并 forms / invariants（同一 advisory 可能覆盖多个包）
        for f in hit(text, FORM_PATTERNS):
            if f not in rec['forms']:
                rec['forms'].append(f)
        for i in hit(text, INVARIANT_PATTERNS):
            if i not in rec['invariants']:
                rec['invariants'].append(i)

        by_pkg[name].append(vid)

# 去重
for k, v in by_pkg.items():
    by_pkg[k] = sorted(set(v))

db = {
    'generated_at': None,
    'source': 'OSV.dev /v1/query (npm)',
    'record_count': len(records),
    'package_count': len(by_pkg),
    'packages': {k: v for k, v in sorted(by_pkg.items())},
    'records': dict(sorted(records.items())),
}

os.makedirs(OUT_DIR, exist_ok=True)
json.dump(db, open(os.path.join(OUT_DIR, 'index.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=2)

# ---------------------------------------------------------------------------
# 摘要
# ---------------------------------------------------------------------------
lines = []
lines.append('# 历史 CVE 库（npm / path 家族）')
lines.append('')
lines.append('来源：OSV.dev `/v1/query`（npm 生态），共 **%d** 条 advisory / **%d** 个包。' %
             (len(records), len(by_pkg)))
lines.append('')
lines.append('## 一、按包的 CVE 序列（看修复节奏）')
lines.append('')
lines.append('| 包 | 条数 | advisory |')
lines.append('|---|---|---|')
for pkg, vids in sorted(by_pkg.items(), key=lambda x: -len(x[1])):
    aliases = []
    for vid in vids:
        r = records[vid]
        cves = [a for a in r['aliases'] if a.startswith('CVE-')]
        aliases.append(cves[0] if cves else vid)
    lines.append('| `%s` | %d | %s |' % (pkg, len(vids), '、'.join(aliases)))
lines.append('')

lines.append('## 二、触发形态分布（组合的「位置」维度）')
lines.append('')
form_count = defaultdict(int)
for r in records.values():
    for f in r['forms'] or ['unknown']:
        form_count[f] += 1
lines.append('| 形态 | 条数 |')
lines.append('|---|---|')
for f, c in sorted(form_count.items(), key=lambda x: -x[1]):
    lines.append('| %s | %d |' % (f, c))
lines.append('')

lines.append('## 三、修复不变量分布（组合的「承诺」维度）')
lines.append('')
inv_count = defaultdict(int)
for r in records.values():
    for i in r['invariants'] or ['unknown']:
        inv_count[i] += 1
lines.append('| 不变量 | 条数 |')
lines.append('|---|---|')
for i, c in sorted(inv_count.items(), key=lambda x: -x[1]):
    lines.append('| %s | %d |' % (i, c))
lines.append('')

lines.append('## 四、CWE 分布')
lines.append('')
cwe_count = defaultdict(int)
for r in records.values():
    for c in r['cwe'] or ['(未标注)']:
        cwe_count[c] += 1
lines.append('| CWE | 条数 |')
lines.append('|---|---|')
for c, n in sorted(cwe_count.items(), key=lambda x: -x[1]):
    lines.append('| %s | %d |' % (c, n))
lines.append('')

open(os.path.join(OUT_DIR, 'summary.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print('记录 %d 条 / 包 %d 个' % (len(records), len(by_pkg)))
print('形态分布:', dict(sorted(form_count.items(), key=lambda x: -x[1])))
print('不变量分布:', dict(sorted(inv_count.items(), key=lambda x: -x[1])))
print('CWE:', dict(sorted(cwe_count.items(), key=lambda x: -x[1])))
