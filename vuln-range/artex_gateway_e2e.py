#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""ARTEX 端到端接网关验证（真实链路，不是模拟）

验证链：ARTEX server → 它自己的 OpenAI provider 代码 → 本地网关 :8790 → NVIDIA
步骤：
  1) 自签 JWT
  2) GET  /api/llm            读当前配置（留作对照）
  3) POST /api/llm/test       用网关配置测连接（流式 / 非流式各一次）
  4) POST /api/llm            把网关配置落为 ARTEX 全局 LLM 配置
  5) GET  /api/llm            回读确认生效
"""
import json
import subprocess
import sys
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8787"
GATEWAY = "http://127.0.0.1:8790/v1"
MODEL = "nvidia/nemotron-3-ultra-550b-a55b"
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def token():
    out = subprocess.run([sys.executable, "mktoken.py"], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit("mktoken 失败: " + out.stderr[:200])
    return out.stdout.strip()


TOK = token()


def call(method, path, payload=None, timeout=180):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={
        "Authorization": "Bearer " + TOK, "Content-Type": "application/json"})
    try:
        r = OP.open(req, timeout=timeout)
        return r.getcode(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, repr(e)


print("== 1. 当前 ARTEX LLM 配置（改之前）==")
code, body = call("GET", "/api/llm")
print("HTTP %s %s\n" % (code, body[:400]))

print("== 2. 用网关配置做连接测试 ==")
cfg = {
    "provider": "openai",
    "model": MODEL,
    "base_url": GATEWAY,
    "api_key": "local-gateway",   # 网关不校验，但 ARTEX 要求非空
    "proxy": "",
}
for label, streaming in [("流式", True), ("非流式", False)]:
    payload = dict(cfg, streaming=streaming)
    code, body = call("POST", "/api/llm/test", payload)
    print("[%s] HTTP %s -> %s\n" % (label, code, body[:400]))

print("== 3. 把网关配置落为 ARTEX 全局配置 ==")
code, body = call("POST", "/api/llm", cfg)
print("HTTP %s -> %s\n" % (code, body[:400]))

print("== 4. 回读确认 ==")
code, body = call("GET", "/api/llm")
print("HTTP %s -> %s" % (code, body[:500]))
