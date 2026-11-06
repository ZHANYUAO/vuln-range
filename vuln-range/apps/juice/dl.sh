#!/usr/bin/env bash
# 分片下载 Juice Shop 预编译包
# 为什么分片：GitHub release 直链经 objects.githubusercontent.com 时单连接 25-36KB/s 且分片被截断，
# 1MB 分片 + 逐片长度校验是本机唯一稳定的姿势（见 MEMORY.md）。
set -u
export no_proxy="*" NO_PROXY="*"

URL="https://ghfast.top/https://github.com/juice-shop/juice-shop/releases/download/v20.3.0/juice-shop-20.3.0_node22_win32_x64.zip"
TOTAL=133451346
CHUNK=1048576
OUT="juice.zip"
PARTS="parts"
N=$(( (TOTAL + CHUNK - 1) / CHUNK ))

mkdir -p "$PARTS"
echo "total=$TOTAL chunk=$CHUNK parts=$N"

fetch_one() {
  local i=$1
  local start=$(( i * CHUNK ))
  local end=$(( start + CHUNK - 1 ))
  [ $end -ge $TOTAL ] && end=$(( TOTAL - 1 ))
  local want=$(( end - start + 1 ))
  local f="$PARTS/p$(printf '%04d' $i)"
  for try in 1 2 3 4; do
    if [ -f "$f" ]; then
      local got=$(stat -c %s "$f" 2>/dev/null || echo 0)
      [ "$got" -eq "$want" ] && return 0
    fi
    curl -sL --max-time 90 -r "${start}-${end}" -o "$f" "$URL" 2>/dev/null
    local got=$(stat -c %s "$f" 2>/dev/null || echo 0)
    if [ "$got" -eq "$want" ]; then return 0; fi
    echo "  retry p$i (got $got want $want, try $try)" >&2
  done
  echo "  FAIL p$i" >&2
  return 1
}
export -f fetch_one
export URL TOTAL CHUNK PARTS

seq 0 $(( N - 1 )) | xargs -P 4 -I{} bash -c 'fetch_one {}'

# 逐片校验后才拼接
bad=0
for i in $(seq 0 $(( N - 1 ))); do
  f="$PARTS/p$(printf '%04d' $i)"
  start=$(( i * CHUNK )); end=$(( start + CHUNK - 1 ))
  [ $end -ge $TOTAL ] && end=$(( TOTAL - 1 ))
  want=$(( end - start + 1 ))
  got=$(stat -c %s "$f" 2>/dev/null || echo 0)
  if [ "$got" -ne "$want" ]; then echo "MISSING/SHORT p$i got=$got want=$want"; bad=$((bad+1)); fi
done
echo "bad_parts=$bad"
[ $bad -gt 0 ] && { echo "ABORT: 有坏片，不拼接"; exit 1; }

: > "$OUT"
for i in $(seq 0 $(( N - 1 ))); do cat "$PARTS/p$(printf '%04d' $i)" >> "$OUT"; done
ls -l "$OUT"
echo "--- md5 ---"
md5sum "$OUT" 2>/dev/null || certutil -hashfile "$OUT" MD5
