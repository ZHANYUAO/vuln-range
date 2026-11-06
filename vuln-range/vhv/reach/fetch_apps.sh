#!/usr/bin/env bash
# fetch_apps.sh —— 下载真实应用 tarball 并解包
#
# 为什么用 npm tarball 而不是 GitHub：
#   GitHub 主站本机超时，codeload 虽通但 monorepo zip 动辄数百 MB 且含大量非运行时代码。
#   npm tarball 是「实际发布、实际被安装」的那份代码，作为可达性证据更贴切，体积也小一个量级。
set -u
export no_proxy="*" NO_PROXY="*"
cd "$(dirname "$0")"
mkdir -p pkgs/apps

APPS=(
  "parse-server"
  "@directus/api"
  "@strapi/utils"
  "@strapi/core"
  "@nocobase/server"
  "apostrophe"
  "n8n"
  "ghost"
)

for a in "${APPS[@]}"; do
  key=$(echo "$a" | tr '/@' '__')
  meta="raw/apps/$key.json"
  [ -s "$meta" ] || { echo "NO-META $a"; continue; }
  if [ -d "pkgs/apps/$key" ] && [ -n "$(ls -A "pkgs/apps/$key" 2>/dev/null)" ]; then
    echo "SKIP $a (已解包)"; continue
  fi
  tb=$(python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
print((d.get('dist') or {}).get('tarball',''))" "$meta")
  kb=$(python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
print(round(((d.get('dist') or {}).get('unpackedSize') or 0)/1024))" "$meta")
  echo "GET  $a  ~${kb}KB"
  tgz="pkgs/apps/$key.tgz"
  code=$(curl -sL --max-time 180 -o "$tgz" -w '%{http_code}' "$tb")
  if [ "$code" != "200" ]; then echo "  ERR http $code"; rm -f "$tgz"; continue; fi
  mkdir -p "pkgs/apps/$key"
  tar xzf "$tgz" -C "pkgs/apps/$key" --strip-components=1 2>/dev/null \
    && echo "  ok  $(find "pkgs/apps/$key" -name '*.js' -o -name '*.mjs' -o -name '*.cjs' | wc -l) js files" \
    || echo "  ERR untar"
  rm -f "$tgz"
done
echo "--- done ---"
