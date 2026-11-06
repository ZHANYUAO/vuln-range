#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
filter.py —— 从候选池里筛出「依赖 lodash 家族」的包

为什么这步比直接下全部 tarball 重要：
  900 个包全下要几 GB、几十分钟；而绝大多数现代包已经不再依赖 lodash。
  先按 package.json 的 dependencies 筛，能把下载量降一到两个数量级。
"""
import json, glob, os, sys

FAM_EXACT = {'lodash', 'lodash-es'}
FAM_PREFIX = 'lodash.'

def main():
    rows = []
    bad = 0
    for f in glob.glob('raw/meta/*.json'):
        try:
            d = json.load(open(f, encoding='utf-8'))
        except Exception:
            bad += 1
            continue
        name = d.get('name')
        if not name:
            continue
        deps = d.get('dependencies') or {}
        dev = d.get('devDependencies') or {}
        peer = d.get('peerDependencies') or {}

        def fam(dd):
            return sorted(k for k in dd if k in FAM_EXACT or k.startswith(FAM_PREFIX))

        fd, fdev, fpeer = fam(deps), fam(dev), fam(peer)
        if not (fd or fdev or fpeer):
            continue
        rows.append({
            'name': name,
            'version': d.get('version'),
            'runtime': fd,
            'dev': fdev,
            'peer': fpeer,
            'tarball': (d.get('dist') or {}).get('tarball'),
            'unpacked_kb': round(((d.get('dist') or {}).get('unpackedSize') or 0) / 1024),
        })

    rows.sort(key=lambda r: -r['unpacked_kb'])
    runtime_only = [r for r in rows if r['runtime']]

    print(f'已抓元数据: {len(glob.glob("raw/meta/*.json"))} 个（解析失败 {bad}）')
    print(f'依赖 lodash 家族（含 dev/peer）: {len(rows)}')
    print(f'  其中 runtime 依赖: {len(runtime_only)}')
    print(f'  总解包体积: {sum(r["unpacked_kb"] for r in runtime_only)/1024:.1f} MB')

    print('\n--- runtime 依赖 top 30（按体积） ---')
    for r in runtime_only[:30]:
        print(f'  {r["name"]:32s} {str(r["version"]):10s} {r["unpacked_kb"]:>7} KB  {r["runtime"]}')

    print('\n--- 按依赖的包名统计 ---')
    from collections import Counter
    c = Counter()
    for r in runtime_only:
        for k in r['runtime']:
            c[k] += 1
    for k, v in c.most_common(20):
        print(f'  {k:24s} {v}')

    json.dump({'runtime': runtime_only, 'dev_only': [r for r in rows if not r['runtime']]},
              open('targets.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\n写出 targets.json')

if __name__ == '__main__':
    main()
