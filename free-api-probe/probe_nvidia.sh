#!/bin/bash
# NVIDIA NIM 模型可用性串行探测
# 判据：200 + choices 非空 = 可用；404 = 未授权/不存在；超时 = 挂死
export no_proxy="*" NO_PROXY="*"
P="--proxy ${PROXY:-http://127.0.0.1:7897}"
D="C:/Users/yuao/WorkBuddy/2026-10-10-17-02-37/free-api-probe"
K=$(tr -d '\r\n' < "C:/Users/yuao/WorkBuddy/2026-10-10-17-02-37/vuln-range/.nvidia_key")
OUT="$D/nvidia-probe.tsv"
printf "model\thttp\tms\tverdict\tsnippet\n" > "$OUT"

probe() {
  m="$1"
  body="{\"model\":\"$m\",\"max_tokens\":16,\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly: OK\"}]}"
  S=$(date +%s%3N)
  resp=$(curl -s -m 25 $P -w "\n__CODE__%{http_code}" -X POST "https://integrate.api.nvidia.com/v1/chat/completions" \
    -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d "$body" 2>/dev/null)
  E=$(date +%s%3N); ms=$((E-S))
  code=$(printf '%s' "$resp" | sed -n 's/.*__CODE__//p')
  payload=$(printf '%s' "$resp" | sed 's/__CODE__[0-9]*$//')
  case "$code" in
    200) if printf '%s' "$payload" | grep -q '"choices"'; then v="OK"; else v="200_NO_CHOICES"; fi ;;
    401|403) v="AUTH_FAIL" ;;
    404) v="NOT_FOUND" ;;
    429) v="RATE_LIMIT" ;;
    000) if [ "$ms" -ge 20000 ]; then v="TIMEOUT_HANG"; else v="UNREACHABLE"; fi ;;
    5*) v="SERVER_ERR" ;;
    *) v="HTTP_$code" ;;
  esac
  snip=$(printf '%s' "$payload" | tr -d '\n\t' | tr -s ' ' | cut -c1-130)
  printf "%s\t%s\t%s\t%s\t%s\n" "$m" "$code" "$ms" "$v" "$snip" >> "$OUT"
  printf "%-46s %-4s %6sms  %-12s %s\n" "$m" "$code" "$ms" "$v" "$(printf '%s' "$snip" | cut -c1-60)"
  sleep 1
}

# 对照组先跑：已知可用的 ultra-550b
probe "nvidia/nemotron-3-ultra-550b-a55b"
probe "deepseek-ai/deepseek-v4.1-flash"
probe "moonshotai/kimi-k2.6"
probe "z-ai/glm-5.3-flash"
probe "minimaxai/minimax-m3.1-flash"
probe "openai/gpt-oss-20b"
probe "nvidia/nemotron-3-super-120b-a12b"
probe "nvidia/llama-3.1-nemotron-70b-instruct"
probe "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
probe "mistralai/mistral-large-4-1t-a52b"
probe "stepfun-ai/step-5-preview"
probe "meta/muse-glimmer-30b"
probe "google/gemma-4-31b-it"
probe "nvidia/nemotron-3.5-lightning-30b-a3b"
probe "nvidia/nemotron-3.5-super-vl-120b-a12b"
echo "--- done, see $OUT ---"
