import json, os, urllib.request, time
K = open('.nvidia_key').read().strip()
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
MODELS = ["deepseek-ai/deepseek-v4.1-flash","z-ai/glm-5.3-flash","moonshotai/kimi-k2.6",
          "minimaxai/minimax-m3.1-flash","nvidia/nemotron-3-super-120b-a12b",
          "nvidia/llama-3.1-nemotron-ultra-253b-v1"]
TOOL = [{"type":"function","function":{"name":"http_get","description":"fetch url",
        "parameters":{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}}}]
def call(m, msgs, tools=None, mt=2000):
    body = {"model":m,"messages":msgs,"max_tokens":mt,"temperature":0}
    if tools: body["tools"]=tools
    req = urllib.request.Request("https://integrate.api.nvidia.com/v1/chat/completions",
        data=json.dumps(body).encode(), headers={"Authorization":"Bearer "+K,"Content-Type":"application/json"})
    t=time.time()
    try:
        r = json.loads(op.open(req, timeout=40).read())
        return True, r["choices"][0]["message"], round(time.time()-t,1)
    except Exception as e:
        body_txt = ""
        if hasattr(e,'read'):
            try: body_txt = e.read().decode()[:180]
            except: pass
        return False, (str(e)[:120]+" "+body_txt), round(time.time()-t,1)

for m in MODELS:
    ok, msg, dt = call(m, [{"role":"user","content":"reply with exactly: OK"}])
    if not ok:
        print(f"{m:44s} FAIL {dt}s {msg}"); continue
    c = (msg.get("content") or "").strip()[:40]
    print(f"{m:44s} plain OK {dt}s content={c!r}")
    ok2, msg2, dt2 = call(m, [{"role":"user","content":"Fetch http://example.com using the tool."}], TOOL)
    if ok2 and msg2.get("tool_calls"):
        print(f"{'':44s} tool_calls OK {dt2}s -> {msg2['tool_calls'][0]['function']['name']}")
    else:
        print(f"{'':44s} tool_calls MISS {dt2}s content={((msg2.get('content') or '') if ok2 else msg2)[:80]!r}")
