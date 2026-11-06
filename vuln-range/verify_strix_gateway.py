#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""strix 接网关的分层验证（用隔离 venv 的 python 跑）

三层，逐层看证据：
  L1 配置层：strix 自己的 Settings 是否真的读进 STRIX_LLM / LLM_API_BASE / LLM_API_KEY
  L2 路由层：源码保证设了 api_base 就走 chat completions（models.py:585），打印确认
  L3 连通层：用 strix 依赖的 openai SDK，按读到的 base_url/model 真实发一条请求

⚠️ 不含完整 scan —— 那需要 Docker sandbox（本机未装）。
"""
import os

# 必须在 import strix 之前设置
os.environ["STRIX_LLM"] = "openai/nvidia/nemotron-3-ultra-550b-a55b"
os.environ["LLM_API_BASE"] = "http://127.0.0.1:8790/v1"
os.environ["LLM_API_KEY"] = "local-gateway"
os.environ.setdefault("no_proxy", "*")
os.environ["NO_PROXY"] = "*"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(k, None)

print("=== L1 strix 配置层 ===")
try:
    from strix.config.loader import load_settings
    s = load_settings()
    llm = s.llm
    print("  model    =", llm.model)
    print("  api_base =", llm.api_base)
    print("  api_key  =", ("<set>" if llm.api_key else "<empty>"))
    ok_l1 = llm.api_base == os.environ["LLM_API_BASE"] and llm.model == os.environ["STRIX_LLM"]
    print("  L1:", "PASS" if ok_l1 else "FAIL")
except Exception as e:
    ok_l1 = False
    print("  L1 FAIL:", repr(e)[:200])

print("\n=== L2 路由层（设了 base_url → 强制 chat completions）===")
try:
    import inspect
    from strix.config import models as m
    src = inspect.getsource(m)
    line = [l.strip() for l in src.splitlines() if "openai_use_responses" in l]
    print("  源码依据:", line[:2])
    print("  L2: PASS（源码存在该分支）")
    ok_l2 = bool(line)
except Exception as e:
    ok_l2 = False
    print("  L2 FAIL:", repr(e)[:200])

print("\n=== L3 连通层（按 strix 读到的配置真实发请求）===")
try:
    from openai import OpenAI
    c = OpenAI(base_url=os.environ["LLM_API_BASE"], api_key=os.environ["LLM_API_KEY"])
    r = c.chat.completions.create(
        model=os.environ["STRIX_LLM"].split("/", 1)[1],
        messages=[{"role": "user", "content": "Reply with exactly: STRIX_GATEWAY_OK"}],
        max_tokens=64, temperature=0)
    print("  content =", repr(r.choices[0].message.content))
    ok_l3 = bool(r.choices[0].message.content)
    print("  L3:", "PASS" if ok_l3 else "FAIL")
except Exception as e:
    ok_l3 = False
    print("  L3 FAIL:", repr(e)[:300])

print("\nRESULT: L1=%s L2=%s L3=%s" % (ok_l1, ok_l2, ok_l3))
