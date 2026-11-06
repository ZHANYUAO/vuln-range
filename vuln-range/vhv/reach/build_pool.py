#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_pool.py —— 合并多关键词搜索结果，产出候选包池

诚实说明：这**不是** npm 的 Top 500。
npm 没有公开的 top-N 接口，我们用的是官方搜索 API 的多关键词采样。
后续会用真实周下载量重排，并明确标注样本来源与偏差。
"""
import json, glob, os
from collections import OrderedDict

def main():
    pool = {}
    for f in glob.glob('raw/search_*.json'):
        try:
            d = json.load(open(f, encoding='utf-8'))
        except Exception:
            continue
        for o in d.get('objects', []):
            p = o.get('package', {})
            name = p.get('name')
            if not name:
                continue
            score = o.get('score', {})
            detail = score.get('detail', {})
            rec = pool.get(name)
            if rec is None:
                pool[name] = {
                    'name': name,
                    'version': p.get('version'),
                    'final': score.get('final', 0),
                    'popularity': detail.get('popularity', 0),
                    'quality': detail.get('quality', 0),
                    'maintenance': detail.get('maintenance', 0),
                    'date': p.get('date'),
                    'desc': (p.get('description') or '')[:120],
                    'hits': 1,
                }
            else:
                rec['hits'] += 1
                if score.get('final', 0) > rec['final']:
                    rec['final'] = score.get('final', 0)

    items = sorted(pool.values(), key=lambda x: -x['final'])
    print('去重后候选:', len(items))

    TOPN = 900
    top = items[:TOPN]
    json.dump({'generated_at': __import__('datetime').datetime.now().isoformat(),
               'method': 'npm registry search API, 17 keywords x 250, dedup, sorted by final score',
               'total_candidates': len(items),
               'pool_size': len(top),
               'packages': top},
              open('pool.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('取前', len(top), '写入 pool.json')

    # 顺手看看 lodash 家族成员在不在池里
    fam = [x for x in items if x['name'].startswith('lodash')]
    print('池中 lodash 家族:', [x['name'] for x in fam][:20])

if __name__ == '__main__':
    main()
