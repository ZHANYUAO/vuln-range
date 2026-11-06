#!/bin/bash
export no_proxy="*" NO_PROXY="*"
OUT=results.tsv
printf "name\turl\thttp\tms\tverdict\tsnippet\n" > $OUT

probe() {
  name="$1"; base="$2"
  body='{"model":"'$3'","max_tokens":8,"messages":[{"role":"user","content":"hi"}]}'
  S=$(date +%s%3N)
  resp=$(curl -s -m 8 -w "\n__CODE__%{http_code}" -X POST "$base/chat/completions" \
    -H "Content-Type: application/json" -d "$body" 2>/dev/null)
  E=$(date +%s%3N); ms=$((E-S))
  code=$(printf '%s' "$resp" | sed -n 's/.*__CODE__//p')
  payload=$(printf '%s' "$resp" | sed 's/__CODE__[0-9]*$//')
  # verdict
  case "$code" in
    200) if printf '%s' "$payload" | grep -q '"choices"'; then v="WORKS_NO_KEY"; else v="200_OTHER"; fi ;;
    401|403) v="ALIVE_AUTH" ;;
    400|422) v="ALIVE_PARAM" ;;
    404) v="ALIVE_404" ;;
    429) v="ALIVE_RATELIMIT" ;;
    5*) v="SERVER_ERR" ;;
    000) v="UNREACHABLE" ;;
    *) v="HTTP_$code" ;;
  esac
  snip=$(printf '%s' "$payload" | tr -d '\n\t' | cut -c1-110)
  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$name" "$base" "$code" "$ms" "$v" "$snip" >> $OUT
  printf "%-14s %-4s %6sms  %s\n" "$name" "$code" "$ms" "$v"
}

probe groq        "https://api.groq.com/openai/v1"                        llama-3.1-8b-instant
probe cerebras    "https://api.cerebras.ai/v1"                            llama3.1-8b
probe mistral     "https://api.mistral.ai/v1"                             mistral-small-latest
probe cohere      "https://api.cohere.ai/compatibility/v1"                command-r
probe siliconflow "https://api.siliconflow.cn/v1"                         Qwen/Qwen2.5-7B-Instruct
probe modelscope  "https://api-inference.modelscope.cn/v1"                Qwen/Qwen2.5-7B-Instruct
probe gemini      "https://generativelanguage.googleapis.com/v1beta/openai" gemini-2.0-flash
probe nvidia      "https://integrate.api.nvidia.com/v1"                   meta/llama-3.1-8b-instruct
probe sambanova   "https://api.sambanova.ai/v1"                           Meta-Llama-3.1-8B-Instruct
probe nebius      "https://api.studio.nebius.com/v1"                      meta-llama/Meta-Llama-3.1-8B-Instruct
probe chutes      "https://api.chutes.ai/v1"                              deepseek-ai/DeepSeek-V3
probe xai         "https://api.x.ai/v1"                                   grok-4
probe deepseek    "https://api.deepseek.com/v1"                           deepseek-chat
probe zhipu       "https://api.z.ai/api/paas/v4"                          glm-4-flash
probe vercel_gw   "https://ai-gateway.vercel.sh/v1"                       openai/gpt-4o-mini
probe atomgit     "https://ai.atomgit.com/serverless-api"                 qwen2.5-7b
probe kilo        "https://api.kilo.ai/api/gateway"                       gpt-4o-mini
probe aionlabs    "https://api.aionlabs.ai/v1"                            gpt-4o-mini
probe agnes       "https://apihub.agnes-ai.com/v1"                        agnes-1.5-flash
probe llm7        "https://api.llm7.io/v1"                                gpt-4o-mini
probe b_ai        "https://api.b.ai/v1"                                   gpt-4o-mini
probe ai21        "https://api.ai21.com/studio/v1"                        jamba-mini
