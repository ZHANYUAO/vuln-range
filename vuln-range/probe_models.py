import os
"""批量实测 NVIDIA 端点上的模型：延迟 + 工具调用能力 + 是否 reasoning。

用法: python probe_models.py [超时秒数]
输出: 按延迟排序的结果表，并写入 probe_result.json
"""
import json
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

NV = os.environ.get("NVIDIA_API_KEY", "")
URL = "https://integrate.api.nvidia.com/v1/chat/completions"
TIMEOUT = float(sys.argv[1]) if len(sys.argv) > 1 else 30.0

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": "execute a shell command and return stdout",
            "parameters": {
                "type": "object",
                "properties": {"cmd": {"type": "string", "description": "the command"}},
                "required": ["cmd"],
            },
        },
    }
]

# 优先测：中小尺寸 / flash 版 / 明确为 agent 优化的模型
CANDIDATES = [
    "z-ai/glm-5.3-flash",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "nvidia/nemotron-nano-3-30b-a3b",
    "google/gemma-3-4b-it",
    "google/gemma-3-12b-it",
    "google/gemma-4-31b-it",
    "mistralai/mistral-7b-instruct-v0.3",
    "mistralai/mistral-large-2-instruct",
    "mistralai/mistral-large",
    "mistralai/mixtral-8x22b-v0.1",
    "ibm/granite-3.0-8b-instruct",
    "ibm/granite-8b-code-instruct",
    "openai/gpt-oss-20b",
    "moonshotai/kimi-k2.6",
    "moonshotai/kimi-k3",
    "nvidia/llama-3.1-nemotron-51b-instruct",
    "microsoft/phi-3.5-moe-instruct",
    "meta/llama2-70b",
    "deepseek-ai/deepseek-v4.1-flash",
    "z-ai/glm-5.3",
    "01-ai/yi-large",
    "mistralai/codestral-22b-instruct-v0.1",
    "deepseek-ai/deepseek-coder-6.7b-instruct",
    "nvidia/nemotron-3-super-120b-a12b",
]


def call(model, with_tools):
    body = {
        "model": model,
        "messages": [
            {"role": "user", "content": "Use the bash tool to print the current directory listing."}
            if with_tools
            else {"role": "user", "content": "Reply with exactly: OK"}
        ],
        "max_tokens": 300,
        "temperature": 0,
    }
    if with_tools:
        body["tools"] = TOOLS
        body["tool_choice"] = "auto"
    req = urllib.request.Request(
        URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + NV, "Content-Type": "application/json"},
    )
    t = time.time()
    try:
        raw = urllib.request.urlopen(req, timeout=TIMEOUT, context=CTX).read().decode()
        dt = time.time() - t
        msg = json.loads(raw)["choices"][0]["message"]
        tc = msg.get("tool_calls")
        content = msg.get("content")
        return {
            "model": model,
            "ok": True,
            "sec": round(dt, 1),
            "tool_calls": bool(tc),
            "tool_arg": (tc[0]["function"]["arguments"][:60] if tc else None),
            "content": (str(content)[:40] if content else None),
        }
    except urllib.error.HTTPError as e:
        return {
            "model": model,
            "ok": False,
            "sec": round(time.time() - t, 1),
            "err": f"HTTP {e.code} {e.read().decode()[:80]}",
        }
    except Exception as e:
        return {
            "model": model,
            "ok": False,
            "sec": round(time.time() - t, 1),
            "err": type(e).__name__,
        }


def main():
    print(f"超时={TIMEOUT}s  候选={len(CANDIDATES)}  并发=4\n")
    print("--- 第一轮：纯 chat 延迟筛选 ---")
    with ThreadPoolExecutor(max_workers=4) as ex:
        res = list(ex.map(lambda m: call(m, False), CANDIDATES))

    res.sort(key=lambda r: (not r["ok"], r["sec"]))
    for r in res:
        if r["ok"]:
            print(f"  {r['model']:<52} {r['sec']:>6.1f}s  {str(r['content'])[:24]}")
        else:
            print(f"  {r['model']:<52} {r['sec']:>6.1f}s  {r['err']}")

    alive = [r["model"] for r in res if r["ok"]]
    json.dump(res, open("probe_chat.json", "w"), ensure_ascii=False, indent=1)

    print(f"\n--- 第二轮：工具调用测试（{len(alive)} 个存活）---")
    with ThreadPoolExecutor(max_workers=4) as ex:
        res2 = list(ex.map(lambda m: call(m, True), alive))
    res2.sort(key=lambda r: (not r["ok"], not r.get("tool_calls"), r["sec"]))
    for r in res2:
        if r["ok"]:
            flag = "TOOLS-YES" if r["tool_calls"] else "tools-no "
            print(f"  {flag} {r['model']:<52} {r['sec']:>6.1f}s  {r['tool_arg'] or r['content']}")
        else:
            print(f"  ERROR    {r['model']:<52} {r['sec']:>6.1f}s  {r['err']}")

    json.dump(res2, open("probe_tools.json", "w"), ensure_ascii=False, indent=1)

    best = [r for r in res2 if r["ok"] and r.get("tool_calls")]
    print("\n=== 可用作 ARTEX 引擎的模型（支持工具调用，按延迟排序）===")
    for r in best:
        print(f"  {r['model']:<52} {r['sec']:>6.1f}s")
    if not best:
        print("  （无）")
    return best


if __name__ == "__main__":
    main()
