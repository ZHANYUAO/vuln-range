#!/usr/bin/env bash
# Bring the whole local stack back up after a reboot, then prove Docker works.
# Usage: bash vuln-range/boot_stack.sh
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
PY="C:/Users/yuao/.workbuddy/binaries/python/versions/3.13.12/python.exe"

say() { printf '\n=== %s ===\n' "$1"; }

say "0) ports before"
netstat -ano | grep LISTENING | grep -E ":(5433|8790|8899|8787)\s" || echo "none"

say "1) PostgreSQL 5433 (service artexpg)"
net start artexpg 2>/dev/null || echo "(already running or needs admin)"

say "2) LLM gateway 8790"
if ! curl -s --noproxy '*' -m 3 http://127.0.0.1:8790/health >/dev/null; then
  nohup bash "$ROOT/vuln-range/start_gateway.sh" >/tmp/gw.log 2>&1 &
  sleep 3
fi
curl -s --noproxy '*' -m 5 http://127.0.0.1:8790/health; echo

say "3) target app 8899"
if ! curl -s --noproxy '*' -m 3 http://127.0.0.1:8899/ >/dev/null; then
  nohup "$PY" "$ROOT/vuln-range/vuln_app.py" >/tmp/vulnapp.log 2>&1 &
  sleep 3
fi
curl -s --noproxy '*' -m 5 "http://127.0.0.1:8899/search?q=test" | head -c 120; echo

say "4) ARTEX 8787"
if ! curl -s --noproxy '*' -m 3 http://127.0.0.1:8787/api/health >/dev/null; then
  ( cd "$ROOT/ARTEX" && export no_proxy="*" NO_PROXY="*" \
      ARTEX_PG_DSN="postgres://artex@127.0.0.1:5433/artex?sslmode=disable" \
      PATH="C:/Users/yuao/.workbuddy/binaries/python/versions/3.13.12:$PATH" && \
    nohup ./artex.exe -addr 127.0.0.1:8787 -proxy "" >/tmp/artex.log 2>&1 & )
  sleep 6
fi
curl -s --noproxy '*' -m 5 http://127.0.0.1:8787/api/health; echo

say "5) WSL2 sanity (this is what was broken)"
wsl.exe -l -v 2>&1 | tr -d '\000' | head -5
wsl.exe -d Ubuntu -- /bin/echo WSL2_OK 2>&1 | iconv -f UTF-16LE -t UTF-8 2>/dev/null | tr -d '\000' | head -3

say "6) Docker Desktop"
if ! docker version >/dev/null 2>&1; then
  "/c/Program Files/Docker/Docker/Docker Desktop.exe" >/tmp/dd.log 2>&1 &
  for i in $(seq 1 30); do
    sleep 10
    if docker version >/dev/null 2>&1; then echo "docker ready after ~$((i*10))s"; break; fi
  done
fi
docker version 2>&1 | grep -E "^ (Version|Server)" | head -4

say "7) docker run hello-world"
docker run --rm hello-world 2>&1 | tail -8

say "8) strix -> gateway -> target 8899 (final closed loop)"
echo "STRIX_LLM=<model> LLM_API_BASE=http://127.0.0.1:8790/v1 strix --target http://127.0.0.1:8899"
echo "(run manually: strix needs the venv at C:/Users/yuao/.workbuddy/binaries/python/envs/default)"
