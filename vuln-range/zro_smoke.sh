#!/usr/bin/env bash
# Zro smoke: connectivity / tool_calls / streaming, for both free models.
# Requires .zro_key (one line). Paste output back to the session.
set -u
cd "$(dirname "$0")"
KEY="$(tr -d '\r\n' < .zro_key)"
BASE="https://zro.moonmath.ai/v1"
export no_proxy="*" NO_PROXY="*"
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy

for MODEL in deepseek-v4.1-flash glm-5.3-flash; do
  echo "===== MODEL=$MODEL ====="

  echo "--- 1) connectivity ---"
  D1='{"model":"'"$MODEL"'","messages":[{"role":"user","content":"reply with the single word OK"}],"max_tokens":16}'
  curl -sS --max-time 30 "$BASE/chat/completions" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "$D1"
  echo; echo

  echo "--- 2) tool_calls ---"
  D2='{"model":"'"$MODEL"'","messages":[{"role":"user","content":"What is the weather in Beijing? Use the tool."}],"tools":[{"type":"function","function":{"name":"get_weather","description":"Get weather for a city","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}],"tool_choice":"auto","max_tokens":200}'
  curl -sS --max-time 40 "$BASE/chat/completions" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "$D2"
  echo; echo

  echo "--- 3) streaming ---"
  D3='{"model":"'"$MODEL"'","messages":[{"role":"user","content":"count 1 to 3, one per line"}],"stream":true,"max_tokens":40}'
  curl -sS --max-time 40 -N "$BASE/chat/completions" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "$D3"
  echo; echo
done
