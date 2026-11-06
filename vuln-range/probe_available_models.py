#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""探测上游账号当前真正可用的模型：/v1/models 列表 ≠ 已授权，必须逐个实测。"""
import json
import urllib.request
import urllib.error

KEY = open(".nvidia_key").read().strip()
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
BASE = "https://integrate.api.nvidia.com/v1"


def get(url):
    return json.loads(OP.open(urllib.request.Request(
        url, headers={"Authorization": "Bearer " + KEY}), timeout=60).read().decode())


def try_model(mid):
    body = json.dumps({
        "model": mid,
        "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
        "max_tokens": 32, "temperature": 0,
    }).encode()
    req = urllib.request.Request(BASE + "/chat/completions", data=body, headers={
        "Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        r = json.loads(OP.open(req, timeout=120).read().decode())
        c = r["choices"][0]["message"]["content"]
        return True, "%r" % (c[:60],)
    except urllib.error.HTTPError as e:
        d = e.read().decode("utf-8", "replace")
        try:
            d = json.loads(d).get("detail", d)
        except Exception:
            pass
        return False, "HTTP %s %s" % (e.code, str(d)[:90])
    except Exception as e:
        return False, repr(e)[:90]


models = [m["id"] for m in get(BASE + "/models").get("data", [])]
print("列表内模型总数：%d" % len(models))

# 优先测 nvidia/ 自建 + 主流开源系列里名字较新的；排除明显老的
pref = []
for m in models:
    low = m.lower()
    if any(k in low for k in ["nemotron", "llama-3.3", "llama-4", "qwen3", "qwen2.5",
                              "deepseek", "gpt-oss", "kimi", "glm", "mistral", "gemma-3"]):
        pref.append(m)

print("候选（按关键词筛）：%d 个" % len(pref))
ok, bad = [], []
for m in pref[:28]:
    good, info = try_model(m)
    print("  %-58s %s  %s" % (m, "OK  " if good else "FAIL", info))
    (ok if good else bad).append((m, info))

print("\n===== 可用模型 (%d) =====" % len(ok))
for m, i in ok:
    print("  %-58s %s" % (m, i))
