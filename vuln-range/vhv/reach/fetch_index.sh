#!/usr/bin/env bash
# fetch_index.sh —— 采集「热门 npm 包」候选池
#
# 为什么不用「Top 500」这个词：npm 没有公开的 top-N 接口。
# 我们用的是 npm 官方搜索 API 的多关键词采样，再按真实周下载量重排。
# 论文里必须如实描述采样方法，不能声称是 top 500（这是学术诚信问题）。
#
# 输出：raw/search_<kw>.json  → 由 build_pool.py 合并
set -u
export no_proxy="*" NO_PROXY="*"
OUT="raw"
mkdir -p "$OUT"

KWS="lib util js react node client api cli data app ui http server tool plugin framework component"

for kw in $KWS; do
  f="$OUT/search_${kw}.json"
  if [ -s "$f" ]; then echo "skip $kw (cached)"; continue; fi
  curl -s --max-time 30 \
    "https://registry.npmjs.org/-/v1/search?text=${kw}&size=250" \
    -o "$f"
  n=$(python -c "import json,sys;print(len(json.load(open('$f',encoding='utf-8')).get('objects',[])))" 2>/dev/null || echo 0)
  echo "$kw -> $n objects"
  sleep 0.3
done
echo "done"
