#!/usr/bin/env bash
# probe_apps.sh —— 探测真实 Node 应用的 lodash 家族依赖
#
# 为什么先探测再下载：
#   872 个头部库里只有 2.2% runtime 依赖 lodash，说明"包越新越不用 lodash"。
#   真实应用则相反 —— 它们成型于 lodash 时代，且长期不重构依赖。
#   先查 dependencies 能把下载量从几 GB 压到几百 MB。
#
# 本机约束：代理并发 >=4 全部 000，必须串行 + 小间隔。
set -u
export no_proxy="*" NO_PROXY="*"
cd "$(dirname "$0")"
mkdir -p raw/apps

APPS=(
  "node-red"
  "parse-server"
  "@directus/api"
  "@strapi/core"
  "@strapi/utils"
  "@medusajs/medusa"
  "n8n"
  "@nocobase/server"
  "payload"
  "@keystone-6/core"
  "apostrophe"
  "@feathersjs/commons"
  "ghost"
  "total.js"
  "@vendure/core"
  "@saleor/app-sdk"
  "@builder.io/core"
  "@shopify/app-bridge-server"
)

for a in "${APPS[@]}"; do
  enc=$(python -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$a")
  out="raw/apps/$(echo "$a" | tr '/@' '__').json"
  [ -s "$out" ] && { echo "SKIP $a"; continue; }
  code=$(curl -s --max-time 20 -o "$out" -w '%{http_code}' "https://registry.npmjs.org/$enc/latest")
  if [ "$code" != "200" ]; then
    echo "ERR  $a -> $code"
    rm -f "$out"
  else
    python - "$out" "$a" <<'PY'
import json,sys
p,name=sys.argv[1],sys.argv[2]
d=json.load(open(p,encoding='utf-8'))
deps=d.get('dependencies') or {}
fam=sorted(k for k in deps if k=='lodash' or k=='lodash-es' or k.startswith('lodash.'))
print(f"OK   {name:34s} v{d.get('version','?'):10s} lodash_family={fam if fam else '-'}")
PY
  fi
  sleep 0.3
done
echo "--- done ---"
