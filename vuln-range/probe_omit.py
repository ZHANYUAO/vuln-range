"""模拟 ARTEX 的真实请求形态：不传 max_tokens（omitempty），看能否出工具调用。
这是决定性测试 —— ARTEX 主循环不设 MaxTokens。"""
import json
import ssl
import time
import urllib.request

NV = "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"
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
    "Use python with urllib for HTTP; 'curl' there is an alias to "
    "Invoke-WebRequest so its bash flags fail. "
    "Plan and execute the FIRST concrete test command. Keep it under 60 seconds."
)

MODELS = ["nvidia/nemotron-3.5-lightning-30b-a3b",
          "nvidia/nemotron-3-super-120b-a12b",
          "openai/gpt-oss-20b",
          "z-ai/glm-5.3-flash"]


def t(model, omit):
    b = {"model": model, "messages": [{"role": "user", "content": SCEN}],
         "temperature": 0, "tools": TOOLS, "tool_choice": "auto"}
    if not omit:
        b["max_tokens"] = 8192   # 对照：显式传大值
    r = urllib.request.Request(
        URL, data=json.dumps(b).encode(),
        headers={"Authorization": "Bearer " + NV, "Content-Type": "application/json"})
    s = time.time()
    try:
        d = json.loads(urllib.request.urlopen(r, timeout=180, context=CTX).read().decode())
        m = d["choices"][0]["message"]
        tc = m.get("tool_calls")
        u = d.get("usage", {})
        tag = "不传max_tokens" if omit else "max_tokens=8192"
        print("  %-46s %-16s %6.1fs tool=%-3s comp_tok=%s" % (
            model, tag, time.time() - s, "YES" if tc else "NO", u.get("completion_tokens")))
        if tc:
            print("        ", tc[0]["function"]["arguments"][:130])
        else:
            print("         content=", str(m.get("content"))[:90])
    except Exception as e:
        print("  %-46s %-16s %6.1fs FAIL %s" % (model, tag, time.time() - s, type(e).__name__))


for omit in (True, False):
    print("=== %s ===" % ("模拟 ARTEX 真实请求（省略 max_tokens）" if omit else "对照组"))
    for m in MODELS:
        t(m, omit)
