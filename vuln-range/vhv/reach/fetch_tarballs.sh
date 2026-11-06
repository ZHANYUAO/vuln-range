#!/usr/bin/env bash
# fetch_tarballs.sh —— 下载并按需解包 targets.json 里的包（串行）
# 用法: bash fetch_tarballs.sh [maxMB]
set -u
export no_proxy="*" NO_PROXY="*"
MAXMB="${1:-40}"
mkdir -p pkgs

python - "$MAXMB" <<'PY' > raw/tt.txt
import json, sys
mb = float(sys.argv[1])
d = json.load(open('targets.json', encoding='utf-8'))
for r in d['runtime']:
    if not r.get('tarball'):
        continue
    if r.get('unpacked_kb', 0) > mb * 1024:
        continue
    print(r['name'] + '\t' + r['tarball'])
PY

N=$(wc -l < raw/tt.txt)
echo "待下载: $N 个（跳过解包 > ${MAXMB}MB）"

ok=0; fail=0; skip=0
while IFS=$'\t' read -r name url; do
  [ -z "$name" ] && continue
  safe=$(echo "$name" | sed 's|/|__|g')
  dest="pkgs/$safe"
  if [ -d "$dest" ]; then skip=$((skip+1)); continue; fi
  code=$(curl -sL --max-time 90 -w '%{http_code}' -o "pkgs/$safe.tgz" "$url")
  if [ "$code" != "200" ]; then
    fail=$((fail+1)); echo "FAIL $name $code" >> raw/tarball_errors.log; rm -f "pkgs/$safe.tgz"; continue
  fi
  mkdir -p "$dest"
  tar xzf "pkgs/$safe.tgz" -C "$dest" --strip-components=1 2>/dev/null
  if [ -f "$dest/package.json" ]; then ok=$((ok+1)); else fail=$((fail+1)); fi
  rm -f "pkgs/$safe.tgz"
  [ $((ok % 20)) -eq 0 ] && echo "  进度 ok=$ok fail=$fail skip=$skip"
done < raw/tt.txt

echo "完成 ok=$ok fail=$fail skip=$skip"
