#!/usr/bin/env bash
# fetch_deps.sh —— 拉每个候选包的 latest package.json（串行）
#
# 为什么串行：本机系统代理 127.0.0.1:6516 在并发 ≥4 时直接返回 000（实测 249/249 全失败），
# 而串行 100% 成功。这是本机环境的硬约束，不是网络问题。
set -u
export no_proxy="*" NO_PROXY="*"
mkdir -p raw/meta

python - <<'PY' > raw/names.txt
import json, sys
sys.stdout.reconfigure(newline='\n')   # 关键：Windows 下默认 CRLF，包名尾部会带 \r，URL 直接 000
d = json.load(open('pool.json', encoding='utf-8'))
for p in d['packages']:
    print(p['name'])
PY

# 防御：清掉可能的 \r
tr -d '\r' < raw/names.txt > raw/names.clean && mv raw/names.clean raw/names.txt

N=$(wc -l < raw/names.txt)
echo "待抓取: $N"

ok=0; fail=0; skip=0
: > raw/fetch_errors.log
while IFS= read -r name; do
  [ -z "$name" ] && continue
  safe=$(echo "$name" | sed 's|/|__|g')
  out="raw/meta/${safe}.json"
  if [ -s "$out" ]; then skip=$((skip+1)); continue; fi
  code=$(curl -s --max-time 15 -w '%{http_code}' -o "$out" "https://registry.npmjs.org/${name}/latest")
  if [ "$code" = "200" ]; then
    ok=$((ok+1))
  else
    fail=$((fail+1)); echo "FAIL $name $code" >> raw/fetch_errors.log; rm -f "$out"
  fi
  if [ $(( (ok+fail) % 100 )) -eq 0 ]; then echo "  进度 ok=$ok fail=$fail"; fi
done < raw/names.txt

echo "完成 ok=$ok fail=$fail skip=$skip"
