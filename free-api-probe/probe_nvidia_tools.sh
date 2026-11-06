#!/bin/bash
# 对 NVIDIA 上已确认 200 的模型测 tool_calls + 流式
export no_proxy="*" NO_PROXY="*"
P="--proxy ${PROXY:-http://127.0.0.1:7897}"
D="C:/Users/yuao/WorkBuddy/2026-10-10-17-02-37/free-api-probe"
K=$(tr -d '\r\n' < "C:/Users/yuao/WorkBuddy/2026-10-10-17-02-37/vuln-range/.nvidia_key")
OUT="$D/nvidia-tools.tsv"
printf "model\thttp\tms\ttool_calls\tsnippet\n" > "$OUT"

TOOLS='[{"type":"function","function":{"name":"get_weather","description":"get weather for a city","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}]'

test_tools() {
  m="$1"
  body="{\"model\":\"$m\",\"max_tokens\":200,\"messages\":[{\"role\":\"user\",\"content\":\"What is the weather in Beijing? Use the tool.\"}],\"tools\":$TOOLS}"
  S=$(date +%s%3N)
  resp=$(curl -s -m 40 $P -w "\n__CODE__%{http_code}" -X POST "https://integrate.api.nvidia.com/v1/chat/completions" \
    -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d "$body" 2>/dev/null)
  E=$(date +%s%3N); ms=$((E-S))
  code=$(printf '%s' "$resp" | sed -n 's/.*__CODE__//p')
  payload=$(printf '%s' "$resp" | sed 's/__CODE__[0-9]*$//')
  if printf '%s' "$payload" | grep -q '"tool_calls"'; then tc="YES"
  elif printf '%s' "$payload" | grep -q '"choices"'; then tc="NO"
  else tc="-"; fi
  snip=$(printf '%s' "$payload" | tr -d '\n\t' | tr -s ' ' | cut -c1-150)
  printf "%s\t%s\t%s\t%s\t%s\n" "$m" "$code" "$ms" "$tc" "$snip" >> "$OUT"
  printf "%-46s %-4s %6sms  tools=%-4s %s\n" "$m" "$code" "$ms" "$tc" "$(printf '%s' "$snip" | cut -c1-55)"
  sleep 1
}

test_tools "nvidia/nemotron-3-ultra-550b-a55b"
test_tools "mistralai/mistral-large-4-1t-a52b"
test_tools "stepfun-ai/step-5-preview"
test_tools "nvidia/nemotron-3.5-lightning-30b-a3b"
test_tools "nvidia/nemotron-3.5-super-vl-120b-a12b"
test_tools "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
echo "--- done ---"
