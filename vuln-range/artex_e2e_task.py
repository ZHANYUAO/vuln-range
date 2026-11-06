#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""端到端最终验证：ARTEX 通过本地网关真跑一个任务（目标=本机自建靶场 8899）。

为什么用本地靶场：完全自有资产，零授权风险；且不依赖外网。
验证点：任务被 Worker 真实执行 → 产生 LLM 调用（走网关）→ 产生工具动作 → 产出 finding。
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8787"
TARGET = "http://127.0.0.1:8899"
HERE = os.path.dirname(os.path.abspath(__file__))

OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def token():
    return subprocess.check_output(
        [sys.executable, os.path.join(HERE, "mktoken.py")], text=True).strip()


TOK = token()


def call(method, path, payload=None, timeout=60):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={
        "Authorization": "Bearer " + TOK,
        "Content-Type": "application/json; charset=utf-8"})
    try:
        r = OP.open(req, timeout=timeout)
        return r.getcode(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, repr(e)


ENV_NOTE = """【执行环境 — 必读】
本机 Windows，shell 实际执行 PowerShell 5.1，不是 bash：
- 禁止 curl/wget/nc/nmap/sqlmap；禁止管道、重定向、&& 等 bash 语法。
- 发 HTTP 一律用 python，写成临时 .py 文件再执行。
- 只用 http://；报 Tunnel/502 时用 urllib.request.ProxyHandler({}) 绕过代理。"""

TASK = """【本轮只有 1 条，做完立即收官】

S1) SQL 注入（/search 的 q 参数）
    baseline: GET {T}/search?q=alice
    payload:  GET {T}/search?q=alice' OR '1'='1
    对比两次响应的行数/内容差异。若 payload 返回了 baseline 之外的额外用户行，说明注入成立。
    判定成立则 severity=high、vulnclass=SQL Injection，evidence 里必须贴出两次响应里实际出现的 username 列表原文。

【硬性约束】
- 只允许对上述 2 个 URL 各发 1 次 GET，共 2 次请求。禁止其他请求、禁止写操作、禁止改数据。
- 做完立刻 report_finding（未复现也要给出明确结论），然后收官。
- 禁止编造响应内容：evidence 只能写你实际打印出来的东西。""".replace("{T}", TARGET)

DESC = ENV_NOTE + "\n\n【边界】只访问 " + TARGET + "（本机自建靶场，自有资产）。\n\n" + TASK

body = {
    "name": "网关端到端验证：本地靶场 /search SQL 注入",
    "description": DESC,
    "goal": "验证 %s 的 /search 参数 q 是否存在 SQL 注入（baseline 与 payload 对比，2 次请求内完成）" % TARGET,
    "company_ids": [3],
    "seed_first_intent": True,
    "timeout_seconds": 1800,
}

print("== 1. 建任务 ==")
code, out = call("POST", "/api/tasks", body)
print("HTTP %s %s" % (code, out[:300]))
try:
    tid = json.loads(out).get("id") or json.loads(out).get("task", {}).get("id")
except Exception:
    tid = None
print("task_id =", tid)

if not tid:
    sys.exit("未拿到 task_id，无法继续")

print("\n== 2. 用 goals 接口唤醒 Worker（免重启触发执行）==")
code, out = call("POST", "/api/tasks/%s/goals" % tid, {"description": body["goal"]})
print("HTTP %s %s" % (code, out[:300]))

print("\n== 3. 轮询任务执行状态（最多 12 分钟）==")
deadline = time.time() + 720
last = ""
while time.time() < deadline:
    time.sleep(20)
    code, out = call("GET", "/api/tasks/%s" % tid)
    if out != last:
        print("[%s] HTTP %s %s" % (time.strftime("%H:%M:%S"), code, out[:400]))
        last = out
    # 任务完成信号
    low = out.lower()
    if any(k in low for k in ["\"state\":\"done\"", "\"status\":\"done\"", "completed", "finished"]):
        break

print("\n== 4. 读取本任务产出的 findings ==")
code, out = call("GET", "/api/tasks/%s/findings" % tid)
print("HTTP %s %s" % (code, out[:1500]))
