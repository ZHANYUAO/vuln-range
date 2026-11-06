#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""补测剩余候选 + 对可用模型做能力把关：长输出、流式、工具调用(tool calling)。"""
import json
import time
import urllib.request
import urllib.error

KEY = open(".nvidia_key").read().strip()
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
BASE = "https://integrate.api.nvidia.com/v1"


def post(path, payload, timeout=180):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=body, headers={
        "Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        return 200, json.loads(OP.open(req, timeout=timeout).read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:200]
    except Exception as e:
        return -1, repr(e)[:200]


def content_of(r):
    try:
        return r["choices"][0]["message"]["content"]
    except Exception:
        return None


models = [m["id"] for m in json.loads(OP.open(urllib.request.Request(
    BASE + "/models", headers={"Authorization": "Bearer " + KEY}), timeout=60)
    .read().decode()).get("data", [])]

kw = ["nemotron", "llama-3.3", "llama-4", "qwen3", "qwen2.5", "deepseek",
      "gpt-oss", "kimi", "glm", "mistral", "gemma-3"]
pref = [m for m in models if any(k in m.lower() for k in kw)]
rest = pref[28:]
print("剩余候选 %d 个：" % len(rest))
for m in rest:
    code, r = post("/chat/completions", {"model": m,
                                         "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
                                         "max_tokens": 32, "temperature": 0})
    c = content_of(r) if code == 200 else None
    print("  %-56s %s %s" % (m, "OK  " if c else "FAIL", (repr(c[:40]) if c else str(r)[:80])))

print("\n===== 能力把关（当前可用通用模型）=====")
cands = ["nvidia/nemotron-3-ultra-550b-a55b", "nvidia/nemotron-3.5-super-vl-120b-a12b"]
for m in cands:
    # a) 长输出：让模型生成一段结构化内容，看是否完整
    t0 = time.time()
    code, r = post("/chat/completions", {"model": m, "messages": [
        {"role": "user", "content": "List 5 common web vulnerability classes as a JSON array of {\"id\",\"name\"} objects. Output JSON only."}],
        "max_tokens": 400, "temperature": 0})
    c = content_of(r) if code == 200 else None
    print("[%s] 长输出 %.1fs code=%s len=%s 前120字符=%s" % (
        m, time.time() - t0, code, len(c) if c else 0, (c or "")[:120].replace("\n", " ")))

    # b) tool calling（ARTEX 类 agent 依赖）
    t0 = time.time()
    code, r = post("/chat/completions", {"model": m, "messages": [
        {"role": "user", "content": "Run a whoami on the target."}],
        "tools": [{"type": "function", "function": {
            "name": "execute_command", "description": "Run a shell command",
            "parameters": {"type": "object", "properties": {"command": {"type": "string"}},
                           "required": ["command"]}}}],
        "tool_choice": "auto", "max_tokens": 200, "temperature": 0})
    tc = None
    if code == 200:
        try:
            tc = r["choices"][0]["message"].get("tool_calls")
        except Exception:
            pass
    print("[%s] tool_calling %.1fs code=%s -> %s" % (
        m, time.time() - t0, code, json.dumps(tc, ensure_ascii=False)[:200] if tc else "NONE"))

    # c) 流式
    t0 = time.time()
    body = json.dumps({"model": m, "messages": [
        {"role": "user", "content": "Count 1 to 5, one per line."}],
        "max_tokens": 128, "temperature": 0, "stream": True}).encode()
    req = urllib.request.Request(BASE + "/chat/completions", data=body, headers={
        "Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        resp = OP.open(req, timeout=180)
        n, txt = 0, ""
        for raw in resp:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            n += 1
            if line == "data: [DONE]":
                break
            try:
                txt += json.loads(line[5:])["choices"][0]["delta"].get("content") or ""
            except Exception:
                pass
        print("[%s] 流式 %.1fs 帧=%d 内容=%r" % (m, time.time() - t0, n, txt[:80]))
    except Exception as e:
        print("[%s] 流式 FAIL %r" % (m, e))
