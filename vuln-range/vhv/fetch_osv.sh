#!/usr/bin/env bash
# fetch_osv.sh —— 从 OSV 拉取一组 npm 包的历史 advisory，落成本地 JSON 库
#
# 为什么用 curl 而不是 python 发请求：
#   本机 python 的 urllib/httpx 走系统代理时对境外 https 基本全 502，
#   而 bash 里的 curl（--noproxy '*'）稳定可用。所以采集在网络层用 curl，
#   解析在 python 层做 —— 两层分离，各用各的强项。
#
# 用法：bash fetch_osv.sh
# 输出：cve-db/raw/<pkg>.json   （每个包一个 OSV 响应）

set -u
OUT="cve-db/raw"
mkdir -p "$OUT"

# 目标包：npm 生态里「按 path 读写对象」这一族的全部已知出事者
# + 历史上因原型污染/属性注入出名的一批（用于提取绕过模式，不限于 path 库）
PKGS="
lodash
lodash-es
lodash.get
lodash.set
lodash.unset
lodash.invoke
lodash.merge
lodash.defaultsdeep
lodash.template
dot-prop
set-value
get-value
object-path
jsonpointer
deep-extend
flat
dset
just-safe-set
dot-object
deep-set
merge
assign-deep
deepmerge
mixin-deep
defaults-deep
hoek
yargs-parser
minimist
mquery
immer
"

ok=0; fail=0; total=0
for p in $PKGS; do
  total=$((total+1))
  f="$OUT/$p.json"
  [ -s "$f" ] && { echo "skip $p（已存在）"; ok=$((ok+1)); continue; }
  code=$(timeout 40 curl -s --noproxy '*' -o "$f" -w '%{http_code}' \
    -X POST "https://api.osv.dev/v1/query" \
    -H "Content-Type: application/json" \
    -d "{\"package\":{\"name\":\"$p\",\"ecosystem\":\"npm\"}}" 2>/dev/null)
  if [ "$code" = "200" ] && [ -s "$f" ]; then
    n=$(python -c "import json;print(len(json.load(open('$f',encoding='utf-8')).get('vulns',[])))" 2>/dev/null || echo '?')
    echo "ok   $p  ($n advisories)"
    ok=$((ok+1))
  else
    echo "FAIL $p  http=$code"
    rm -f "$f"
    fail=$((fail+1))
  fi
  sleep 0.4          # 串行 + 间隔，避免把系统代理打满
done

echo "---"
echo "完成: $ok/$total（失败 $fail）"
