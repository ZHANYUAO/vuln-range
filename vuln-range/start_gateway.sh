#!/usr/bin/env bash
# 启动本地统一 LLM 网关（后台常驻）
# 上游凭据来自 .nvidia_key（一行 key）；也可先 export NVIDIA_API_KEY 覆盖。
set -e
cd "$(dirname "$0")"

PY="C:/Users/yuao/.workbuddy/binaries/python/versions/3.13.12/python.exe"

if [ -n "$NVIDIA_API_KEY" ]; then
  KEY="$NVIDIA_API_KEY"
elif [ -f .nvidia_key ]; then
  KEY="$(tr -d '\r\n' < .nvidia_key)"
else
  echo "FATAL: 既无 NVIDIA_API_KEY 环境变量，也没有 .nvidia_key 文件" >&2
  exit 2
fi

# 关键：清掉代理环境变量，保证上游直连；同时让本机探测也走直连
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
export no_proxy="*" NO_PROXY="*"

export UPSTREAM_KEY="$KEY"
export UPSTREAM_BASE="${UPSTREAM_BASE:-https://integrate.api.nvidia.com/v1}"
export DEFAULT_MODEL="${DEFAULT_MODEL:-nvidia/nemotron-3-ultra-550b-a55b}"
export GATEWAY_HOST="${GATEWAY_HOST:-127.0.0.1}"
# 容器里的工具（shannon/pentagi/strix 走 host.docker.internal）访问不到 127.0.0.1，
# 这时必须 GATEWAY_HOST=0.0.0.0；而 0.0.0.0 又必须配 GATEWAY_TOKEN（网关会拒绝裸奔启动）。
export GATEWAY_TOKEN="${GATEWAY_TOKEN:-}"
# 注：8788 在本机属 Windows 保留端口段（bind 报 WinError 10013），故默认 8790
export GATEWAY_PORT="${GATEWAY_PORT:-8790}"

exec "$PY" llm_gateway.py
