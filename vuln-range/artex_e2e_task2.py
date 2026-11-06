#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""第二轮：给 ARTEX 正确闭合的 payload，验证它在网关下能正向检出漏洞（而不只是"未复现"）。"""
import json
import subprocess
import sys
import os
import time
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
TOK = subprocess.check_output(
    [sys.executable, os.path.join(HERE, "mktoken.py")], text=True).strip()


def call(m, p, b=None, t=60):
    d = json.dumps(b, ensure_ascii=False).encode() if b is not None else None
    r = urllib.request.Request("http://127.0.0.1:8787" + p, data=d, method=m, headers={
        "Authorization": "Bearer " + TOK, "Content-Type": "application/json; charset=utf-8"})
    try:
        x = OP.open(r, timeout=t)
        return x.getcode(), x.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, repr(e)


SHELL_NOTE = ("【执行环境】本机 Windows，shell 不是 bash：禁止 curl/wget/管道/重定向/&& ；"
              "发 HTTP 一律用 python 写成临时 .py 再执行；用 urllib.request.ProxyHandler({}) 绕过代理。")

TASK = """【边界】只访问 http://127.0.0.1:8899（本机自建靶场，自有资产）。禁止写操作、改数据。

【本轮 1 条】
S1) /search 的 q 参数 SQL 注入 —— 必须先用单引号闭合再用注释截断尾部：
    baseline: GET /search?q=alice
    payload1: GET /search?q=x' OR '1'='1' --
    payload2: GET /search?q=%' OR '1'='1' --
    注意：直接拼 alice' OR '1'='1 是无效的（结尾的百分号会吞掉注入），不要再用它下结论。
    从返回 HTML 的表格里抽出所有 username 并逐个打印。
    判定：若任一 payload 抽到的 username 数量或内容与 baseline 不同（例如多出 admin），
    则 SQL 注入成立 → severity=high、vulnclass=SQL Injection，
    evidence 必须贴出 baseline 与各 payload 实际抽到的 username 列表原文。
    共 3 次 GET，做完立即 report_finding 并收官。禁止编造：evidence 只写实际打印出的内容。"""

DESC = SHELL_NOTE + "\n\n" + TASK

c, o = call("POST", "/api/tasks", {
    "name": "网关验证第2轮：/search SQLi 正确闭合",
    "description": DESC,
    "goal": "用正确闭合的 payload 验证 http://127.0.0.1:8899 的 /search 参数 q 是否存在 SQL 注入（3 次请求内完成）",
    "company_ids": [3], "seed_first_intent": True, "timeout_seconds": 1800})
tid = json.loads(o).get("id")
print("task_id =", tid, "HTTP", c)

deadline = time.time() + 600
st = ""
while time.time() < deadline:
    time.sleep(20)
    c2, o2 = call("GET", "/api/tasks/%s" % tid)
    d = json.loads(o2) if c2 == 200 else {}
    s = d.get("status")
    if s != st:
        print("[%s] status=%s findings=%s" % (time.strftime("%H:%M:%S"), s, d.get("findings")))
        st = s
    if s == "done":
        break

c3, o3 = call("GET", "/api/exploration/findings?task_id=%s" % tid)
try:
    f = json.loads(o3)
except Exception:
    f = []
for x in (f if isinstance(f, list) else []):
    print("FINDING id=%s sev=%s class=%s" % (x.get("id"), x.get("severity"), x.get("vulnclass")))
    print("  summary :", (x.get("summary") or "")[:220])
    print("  evidence:", (x.get("evidence") or "")[:420])
