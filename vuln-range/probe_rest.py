"""把 nv_models.txt 里第一轮没测过的模型全部补测一遍（短超时快筛）。"""
import json
import ssl
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

NV = "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"
URL = "https://integrate.api.nvidia.com/v1/chat/completions"
TIMEOUT = 25.0

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

DONE = {
    "openai/gpt-oss-20b", "nvidia/nemotron-3-super-120b-a12b",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", "z-ai/glm-5.3-flash",
    "mistralai/mistral-7b-instruct-v0.3", "mistralai/mistral-large-2-instruct",
    "mistralai/mistral-large", "mistralai/mixtral-8x22b-v0.1",
    "ibm/granite-3.0-8b-instruct", "moonshotai/kimi-k2.6", "meta/llama2-70b",
    "google/gemma-3-4b-it", "ibm/granite-8b-code-instruct", "01-ai/yi-large",
    "mistralai/codestral-22b-instruct-v0.1", "nvidia/nemotron-nano-3-30b-a3b",
    "google/gemma-3-12b-it", "nvidia/llama-3.1-nemotron-51b-instruct",
    "microsoft/phi-3.5-moe-instruct", "deepseek-ai/deepseek-coder-6.7b-instruct",
    "google/gemma-4-31b-it", "moonshotai/kimi-k3",
    "deepseek-ai/deepseek-v4.1-flash", "z-ai/glm-5.3",
}

TOOLS = [{
    "type": "function",
    "function": {
        "name": "bash",
        "description": "execute a shell command and return stdout",
        "parameters": {"type": "object",
                       "properties": {"cmd": {"type": "string"}},
                       "required": ["cmd"]},
    },
}]

BAD = ["embed", "rerank", "retriev", "safet", "guard", "speech", "tts", "vision",
       "image", "video", "asr", "translate", "parse", "deplot", "diffusion",
       "clip", "vila", "neva", "kosmos", "fuyu", "ising", "calibration",
       "cosmos-reason", "reward", "starcoder", "codegemma", "codellama",
       "nemotron-4-340b", "dbrx", "fuyu"]


def call(model, with_tools):
    body = {
        "model": model,
        "messages": [{"role": "user",
                      "content": "Use the bash tool to list files in the current directory."}],
        "max_tokens": 200, "temperature": 0,
    }
    if with_tools:
        body["tools"] = TOOLS
        body["tool_choice"] = "auto"
    req = urllib.request.Request(
        URL, data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + NV, "Content-Type": "application/json"})
    t = time.time()
    try:
        msg = json.loads(urllib.request.urlopen(
            req, timeout=TIMEOUT, context=CTX).read().decode())["choices"][0]["message"]
        tc = msg.get("tool_calls")
        return {"model": model, "ok": True, "sec": round(time.time() - t, 1),
                "tool_calls": bool(tc),
                "arg": (tc[0]["function"]["arguments"][:50] if tc else None)}
    except urllib.error.HTTPError as e:
        return {"model": model, "ok": False, "sec": round(time.time() - t, 1),
                "err": f"HTTP {e.code}"}
    except Exception as e:
        return {"model": model, "ok": False, "sec": round(time.time() - t, 1),
                "err": type(e).__name__}


def main():
    ids = [l.strip() for l in open("nv_models.txt") if l.strip()]
    rest = [i for i in ids
            if i not in DONE and not any(k in i.lower() for k in BAD)]
    print(f"剩余待测: {len(rest)}\n")
    with ThreadPoolExecutor(max_workers=5) as ex:
        res = list(ex.map(lambda m: call(m, True), rest))
    res.sort(key=lambda r: (not r["ok"], not r.get("tool_calls"), r["sec"]))
    for r in res:
        if r["ok"]:
            flag = "TOOLS-YES" if r["tool_calls"] else "tools-no "
            print(f"  {flag} {r['model']:<52} {r['sec']:>6.1f}s  {r['arg'] or ''}")
        else:
            print(f"  {'ERROR   '} {r['model']:<52} {r['sec']:>6.1f}s  {r['err']}")
    json.dump(res, open("probe_rest.json", "w"), ensure_ascii=False, indent=1)
    good = [r for r in res if r["ok"] and r.get("tool_calls")]
    print(f"\n新增可用（支持工具调用）: {len(good)}")
    for r in good:
        print(f"  {r['model']:<52} {r['sec']:>6.1f}s")


if __name__ == "__main__":
    main()
