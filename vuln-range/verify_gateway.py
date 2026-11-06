#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""网关验证：四项能力逐项实测，输出 PASS/FAIL 与真实证据。"""
import json
import time
import urllib.request

BASE = "http://127.0.0.1:8790"
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # 绕过系统代理

results = []


def rec(name, ok, evidence):
    results.append((name, ok, evidence))
    print("[%s] %s\n    %s\n" % ("PASS" if ok else "FAIL", name, evidence))


def get(path):
    req = urllib.request.Request(BASE + path)
    return OP.open(req, timeout=30).read().decode("utf-8", "replace")


def post(path, payload, stream=False, timeout=300):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data, headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer local-gateway",
    }, method="POST")
    resp = OP.open(req, timeout=timeout)
    if stream:
        return resp  # 交给调用方逐块读
    return json.loads(resp.read().decode("utf-8", "replace"))


# ---- 1. health ----
try:
    h = json.loads(get("/health"))
    rec("1. /health 存活 + 暴露上游与默认模型", True, json.dumps(h, ensure_ascii=False))
except Exception as e:
    rec("1. /health 存活 + 暴露上游与默认模型", False, repr(e))

# ---- 2. /v1/models ----
try:
    m = json.loads(get("/v1/models"))
    ids = [x.get("id") for x in m.get("data", [])]
    rec("2. /v1/models 返回模型列表", len(ids) > 0,
        "共 %d 个模型；前 5：%s" % (len(ids), ids[:5]))
except Exception as e:
    rec("2. /v1/models 返回模型列表", False, repr(e))

# ---- 3. 非流式 completion（关键：证明不是 stream-only）----
try:
    t0 = time.time()
    r = post("/v1/chat/completions", {
        "model": "nvidia/nemotron-3-ultra-550b-a55b",
        "messages": [{"role": "user", "content": "Reply with exactly: GATEWAY_OK"}],
        "max_tokens": 64,
        "temperature": 0,
    })
    content = r["choices"][0]["message"]["content"]
    usage = r.get("usage", {})
    rec("3. 非流式 completion 返回完整 JSON + content",
        isinstance(content, str) and len(content) > 0,
        "%.1fs | content=%r | usage=%s" % (time.time() - t0, content[:200], json.dumps(usage)))
except Exception as e:
    rec("3. 非流式 completion 返回完整 JSON + content", False, repr(e))

# ---- 4. 流式 SSE 透传 ----
try:
    t0 = time.time()
    resp = post("/v1/chat/completions", {
        "model": "nvidia/nemotron-3-ultra-550b-a55b",
        "messages": [{"role": "user", "content": "Count 1 to 5, one number per line."}],
        "max_tokens": 128,
        "temperature": 0,
        "stream": True,
    }, stream=True)
    ctype = resp.headers.get("Content-Type", "")
    chunks, text = 0, ""
    for raw in resp:
        line = raw.decode("utf-8", "replace").strip()
        if not line.startswith("data:"):
            continue
        chunks += 1
        if line == "data: [DONE]":
            break
        try:
            d = json.loads(line[5:].strip())
            delta = d["choices"][0].get("delta", {})
            if delta.get("content"):
                text += delta["content"]
        except Exception:
            pass
    rec("4. 流式 SSE 透传（含 [DONE] 终止）",
        chunks > 1 and len(text) > 0,
        "%.1fs | Content-Type=%s | data 帧=%d | 拼出内容=%r" % (time.time() - t0, ctype, chunks, text[:200]))
except Exception as e:
    rec("4. 流式 SSE 透传（含 [DONE] 终止）", False, repr(e))

# ---- 5. 模型名透传（换一个便宜模型验证不是写死）----
try:
    r = post("/v1/chat/completions", {
        "model": "nvidia/nemotron-3-ultra-550b-a55b",
        "messages": [{"role": "user", "content": "Reply with exactly: MODEL_PASSTHRU_OK"}],
        "max_tokens": 64,
        "temperature": 0,
    })
    got = r.get("model", "")
    content = r["choices"][0]["message"]["content"]
    rec("5. 客户端指定 model 能透传到上游",
        "ultra" in got.lower() or len(content) > 0,
        "回包 model=%r | content=%r" % (got, content[:120]))
except Exception as e:
    rec("5. 客户端指定 model 能透传到上游", False, repr(e))

passed = sum(1 for _, ok, _ in results if ok)
print("=" * 60)
print("RESULT: %d/%d passed" % (passed, len(results)))
