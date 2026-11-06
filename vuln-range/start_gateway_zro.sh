#!/usr/bin/env bash
# 把 8790 本地网关的上游切到 Zro 免费层（deepseek-v4.1-flash / glm-5.3-flash）。
# 前提：注册完成后把 sk- 开头的 key 存进 .zro_key（一行），或 export ZRO_API_KEY。
# 用法：./start_gateway_zro.sh   （会自动停掉占着 8790 的旧网关）
set -e
cd "$(dirname "$0")"

PY="C:/Users/yuao/.workbuddy/binaries/python/versions/3.13.12/python.exe"

if [ -n "$ZRO_API_KEY" ]; then
  KEY="$ZRO_API_KEY"
elif [ -f .zro_key ]; then
  KEY="$(tr -d '\r\n' < .zro_key)"
else
  echo "FATAL: 既无 ZRO_API_KEY 环境变量，也没有 .zro_key 文件（把 sk-... 写进去）" >&2
  exit 2
fi

# 停掉旧网关（只杀监听 GATEWAY_PORT 的进程）
PORT="${GATEWAY_PORT:-8790}"
OLD_PID="$(netstat -ano 2>/dev/null | grep ":${PORT}" | grep -i LISTENING | awk '{print $NF}' | head -1)"
if [ -n "$OLD_PID" ]; then
  echo "停旧网关 PID=$OLD_PID (:$PORT)"
  taskkill //PID "$OLD_PID" //F >/dev/null 2>&1 || true
  sleep 1
fi

unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
export no_proxy="*" NO_PROXY="*"

export UPSTREAM_KEY="$KEY"
# Zro 文档原文：Completions/Responses base URL https://zro.moonmath.ai/v1，Bearer sk-...
export UPSTREAM_BASE="${UPSTREAM_BASE:-https://zro.moonmath.ai/v1}"
export DEFAULT_MODEL="${DEFAULT_MODEL:-deepseek-v4.1-flash}"
export GATEWAY_HOST="${GATEWAY_HOST:-127.0.0.1}"
export GATEWAY_TOKEN="${GATEWAY_TOKEN:-}"
export GATEWAY_PORT="$PORT"

echo "UPSTREAM=$UPSTREAM_BASE  MODEL=$DEFAULT_MODEL  PORT=$GATEWAY_PORT"
exec "$PY" llm_gateway.py
