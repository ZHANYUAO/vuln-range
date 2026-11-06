import os
"""验证根因假设：max_tokens 太小 -> reasoning 吃光 token -> tool_calls 为空。"""
import json
import ssl
import time
import urllib.request

NV = os.environ.get("NVIDIA_API_KEY", "")
URL = "https://integrate.api.nvidia.com/v1/chat/completions"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

TOOLS = [{
    "type": "function",
    "function": {
        "name": "bash",
        "description": "Execute a shell command on Windows and return stdout+stderr.",
        "parameters": {"type": "object",
                       "properties": {"cmd": {"type": "string"}},
                       "required": ["cmd"]},
    },
}]

SCEN = (
    "You are testing http://testasp.vulnweb.com/showforum.asp?id=1 for SQL injection. "
    "The shell is Windows PS 5.1: '&&' is invalid, use ';' to chain. "
    "Use python with urllib for HTTP requests; 'curl' there is an alias to "
    "Invoke-WebRequest so its bash flags fail. "
    "Plan and execute the FIRST concrete test command. Keep it under 60 seconds."
)


def t(model, mt):
    b = {"model": model, "messages": [{"role": "user", "content": SCEN}],
         "max_tokens": mt, "temperature": 0, "tools": TOOLS, "tool_choice": "auto"}
    r = urllib.request.Request(
        URL, data=json.dumps(b).encode(),
        headers={"Authorization": "Bearer " + NV, "Content-Type": "application/json"})
    s = time.time()
    try:
        d = json.loads(urllib.request.urlopen(r, timeout=150, context=CTX).read().decode())
        m = d["choices"][0]["message"]
        tc = m.get("tool_calls")
        u = d.get("usage", {})
        print("  %-48s mt=%-5d %6.1fs tool=%-3s comp_tok=%s" % (
            model, mt, time.time() - s, "YES" if tc else "NO", u.get("completion_tokens")))
        print("        ", (tc[0]["function"]["arguments"][:150]
                           if tc else str(m.get("content"))[:110]))
    except Exception as e:
        print("  %-48s mt=%-5d %6.1fs FAIL %s" % (model, mt, time.time() - s, type(e).__name__))


MODELS = ["nvidia/nemotron-3.5-lightning-30b-a3b",
          "nvidia/nemotron-3-super-120b-a12b",
          "z-ai/glm-5.3-flash",
          "openai/gpt-oss-20b"]

for mt in (400, 2000, 4000):
    print("--- max_tokens=%d ---" % mt)
    for m in MODELS:
        t(m, mt)
