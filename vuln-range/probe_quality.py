"""对可用模型做质量验证：稳定性(3次) + 真实渗透场景(多轮工具调用链)。"""
import json
import ssl
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

NV = "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"
URL = "https://integrate.api.nvidia.com/v1/chat/completions"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

TOOLS = [{
    "type": "function",
    "function": {
        "name": "bash",
        "description": "Execute a shell command in PowerShell 5.1 on Windows and return stdout+stderr.",
        "parameters": {"type": "object",
                       "properties": {"cmd": {"type": "string"}},
                       "required": ["cmd"]},
    },
}]

MODELS = [
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "nvidia/nemotron-3-super-120b-a12b",
    "z-ai/glm-5.3-flash",
    "meta/muse-glimmer-30b",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    "openai/gpt-oss-20b",
]

# 真实渗透场景：看它能否规划出正确的工具调用链
SCENARIO = (
    "You are testing http://testasp.vulnweb.com/showforum.asp?id=1 for SQL injection. "
    "The shell is PowerShell 5.1 on Windows: '&&' is INVALID, use ';' to chain. "
    "Use python (available on PATH) with urllib for HTTP requests; 'curl' is an alias "
    "to Invoke-WebRequest and its bash flags will fail. "
    "Plan and execute the FIRST concrete test command. Keep each command under 60 seconds."
)


def chat(model, messages, tools=True, max_tokens=400, timeout=60):
    body = {"model": model, "messages": messages,
            "max_tokens": max_tokens, "temperature": 0}
    if tools:
        body["tools"] = TOOLS
        body["tool_choice"] = "auto"
    req = urllib.request.Request(
        URL, data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + NV, "Content-Type": "application/json"})
    t = time.time()
    try:
        msg = json.loads(urllib.request.urlopen(
            req, timeout=timeout, context=CTX).read().decode())["choices"][0]["message"]
        return {"ok": True, "sec": round(time.time() - t, 1), "msg": msg}
    except Exception as e:
        return {"ok": False, "sec": round(time.time() - t, 1), "err": f"{type(e).__name__}"}


def stability(m):
    """3 次简单调用，看延迟是否稳定"""
    secs = []
    for _ in range(3):
        r = chat(m, [{"role": "user", "content": "Reply with exactly: OK"}],
                 tools=False, max_tokens=20, timeout=45)
        secs.append(r["sec"] if r["ok"] else None)
    ok = [s for s in secs if s is not None]
    return {"model": m, "secs": secs,
            "avg": round(sum(ok) / len(ok), 1) if ok else None,
            "fail": len(secs) - len(ok)}


def scenario(m):
    """真实渗透场景：首轮应产出一条可执行命令"""
    r = chat(m, [{"role": "user", "content": SCENARIO}], timeout=90)
    if not r["ok"]:
        return {"model": m, "ok": False, "err": r["err"], "sec": r["sec"]}
    msg = r["msg"]
    tc = msg.get("tool_calls")
    if not tc:
        return {"model": m, "ok": True, "sec": r["sec"], "tool": False,
                "text": str(msg.get("content"))[:150]}
    cmd = tc[0]["function"]["arguments"]
    return {"model": m, "ok": True, "sec": r["sec"], "tool": True, "cmd": cmd[:220]}


def main():
    print("=== 稳定性（3 次调用）===")
    with ThreadPoolExecutor(max_workers=3) as ex:
        st = list(ex.map(stability, MODELS))
    for r in st:
        print(f"  {r['model']:<50} {str(r['secs']):<28} avg={r['avg']}  fail={r['fail']}")

    print("\n=== 真实渗透场景（应产出可执行 python 命令，不用 && 不用 curl）===")
    with ThreadPoolExecutor(max_workers=3) as ex:
        sc = list(ex.map(scenario, MODELS))
    for r in sc:
        if not r["ok"]:
            print(f"  {r['model']:<50} FAIL {r.get('err')} {r['sec']}s")
        elif not r.get("tool"):
            print(f"  {r['model']:<50} 无工具调用 {r['sec']}s: {r.get('text')}")
        else:
            print(f"  {r['model']:<50} {r['sec']}s")
            print(f"       {r['cmd']}")

    json.dump({"stability": st, "scenario": sc},
              open("probe_quality.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
