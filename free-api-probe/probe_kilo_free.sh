#!/bin/bash
# Kilo 公共网关免 key 免费池探测（含 tool_calls）
export no_proxy="*" NO_PROXY="*"
P="--proxy ${PROXY:-http://127.0.0.1:7897}"
D="C:/Users/yuao/WorkBuddy/2026-10-10-17-02-37/free-api-probe"
BASE="https://api.kilo.ai/api/gateway/v1"
OUT="$D/kilo-free.tsv"
printf "model\thttp\tms\tcontent_len\ttools\tsnippet\n" > "$OUT"

one() {
  m="$1"; with_tools="$2"
  if [ "$with_tools" = "1" ]; then
    body="{\"model\":\"$m\",\"max_tokens\":800,\"messages\":[{\"role\":\"user\",\"content\":\"What is the weather in Beijing? Use the get_weather tool.\"}],\"tools\":[{\"type\":\"function\",\"function\":{\"name\":\"get_weather\",\"description\":\"get weather for a city\",\"parameters\":{\"type\":\"object\",\"properties\":{\"city\":{\"type\":\"string\"}},\"required\":[\"city\"]}}}]}"
  else
    body="{\"model\":\"$m\",\"max_tokens\":600,\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly: OK\"}]}"
  fi
  S=$(date +%s%3N)
  curl -s -m 50 $P -o "$D/_k.json" -w "%{http_code}" -X POST "$BASE/chat/completions" \
    -H "Content-Type: application/json" -d "$body" > "$D/_code.txt" 2>/dev/null
  E=$(date +%s%3N); ms=$((E-S))
  code=$(cat "$D/_code.txt")
  python - "$D/_k.json" "$m" "$code" "$ms" "$with_tools" "$OUT" << 'PY'
import json,sys
path,model,code,ms,wt,out = sys.argv[1:7]
try:
    d=json.load(open(path,encoding='utf-8'))
except Exception:
    raw=open(path,encoding='utf-8',errors='replace').read()[:160]
    print('%-42s %-4s %6sms  PARSE_FAIL %s' % (model,code,ms,raw))
    raise SystemExit
if 'choices' in d:
    c=d['choices'][0]; m=c['message']
    content=(m.get('content') or '')
    tc=m.get('tool_calls')
    tools='YES' if tc else ('NO' if wt=='1' else '-')
    print('%-42s %-4s %6sms  len=%-4d tools=%-4s %s' % (model,code,ms,len(content),tools,repr(content)[:50]))
    with open(out,'a',encoding='utf-8') as f:
        f.write('%s\t%s\t%s\t%d\t%s\t%s\n'%(model,code,ms,len(content),tools,repr(content)[:90]))
else:
    err=json.dumps(d,ensure_ascii=False)[:150]
    print('%-42s %-4s %6sms  ERR %s' % (model,code,ms,err))
    with open(out,'a',encoding='utf-8') as f:
        f.write('%s\t%s\t%s\t0\t-\t%s\n'%(model,code,ms,err))
PY
  sleep 3
}

echo "### 第一轮：基础可用性"
one "nvidia/nemotron-3-ultra-550b-a55b:free" 0
one "nvidia/nemotron-3.5-lightning:free" 0
one "nvidia/nemotron-3.5-super-vl:free" 0
one "reflection/beam-free" 0
one "recursive/flint-v1.0:free" 0
one "kilo-auto/free" 0
echo
echo "### 第二轮：tool_calls"
one "nvidia/nemotron-3-ultra-550b-a55b:free" 1
one "kilo-auto/free" 1
echo "--- done ---"
