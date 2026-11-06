#!/usr/bin/env python3
"""建「补 findings」任务：把上一轮已确认但未登记的漏洞，逐条复现并 report_finding 入库。"""
import json, subprocess, sys, os, urllib.request, urllib.error

BASE = "http://127.0.0.1:8787"
HERE = os.path.dirname(os.path.abspath(__file__))

def token():
    return subprocess.check_output(
        [sys.executable, os.path.join(HERE, "mktoken.py")], text=True).strip()

ENV_NOTE = """【执行环境 — 必读，违反会直接失败】
本机 Windows，你的 shell 工具实际执行 PowerShell 5.1，不是 bash：
- 禁止 curl / wget / nc / nmap / sqlmap：不存在，或 curl 是 Invoke-WebRequest 别名，bash 参数会报错。
- 禁止管道、重定向、&& 等 bash 语法。
- 发 HTTP 请用 python（已确认可用）单次 -c，或写成临时 .py 再执行，例如：
  python -c "import urllib.request;r=urllib.request.urlopen('http://testasp.vulnweb.com/showthread.asp?id=1',timeout=20);print(r.status);print(r.read()[:1200].decode('utf-8','ignore'))"
- 单条命令控制在 60 秒内返回。

【严格边界】
只允许访问 testasp.vulnweb.com 与 testaspnet.vulnweb.com。
禁止访问其他任何主机；禁止 DoS、暴力破解、上传文件、删除或修改数据。"""

HANDOFF = """【交接清单：上一轮已实测确认、但当时只记在探索图里、没有登记成漏洞的入口】
你必须【自己重新发请求独立复现一遍】，确认后逐条登记；复现不出来的不要登记，写明原因。

1) SQL 注入（报错型） http://testasp.vulnweb.com/showthread.asp?id=1'  → 上一轮返回 500
2) SQL 注入（报错型） http://testasp.vulnweb.com/showforum.asp?id=1'   → 上一轮返回 500
3) SQL 注入（登录绕过面） http://testasp.vulnweb.com/login.asp?username=admin' OR 1=1&password=123 → 200
4) SQL 注入（注册入口） http://testasp.vulnweb.com/register.asp?username=admin' OR 1=1&realname=test&email=test@test.com&password=test → 200
5) SQL 注入（ASP.NET） http://testaspnet.vulnweb.com/ReadNews.aspx?id=1' → 上一轮异常
6) 反射型 XSS http://testasp.vulnweb.com/search.asp?q=<script>alert(1)</script> → 200 且脚本原样回显
7) 信息泄露/指纹 Server: Microsoft-IIS/8.5 + X-Powered-By: ASP.NET"""

RULES = """【硬性交付要求 —— 本任务唯一的验收标准是 findings 表里有东西】
对上表每一条：
 a) 先发 baseline 请求（正常参数，如 id=1），再发注入请求，对比状态码与响应体差异；两段关键输出都要贴进 evidence。
 b) 一旦复现成功，【立即调用 report_finding】登记，入参：
    - vulnclass：漏洞类别（如 SQL Injection / Cross-Site Scripting / Information Disclosure）
    - name：简短名称 + 具体位置（如 "SQL Injection - /showthread.asp id 参数"）
    - severity：critical|high|medium|low
    - summary：一句话结论
    - evidence：完整请求 URL、实际 HTTP 状态码、响应中的关键片段（可照做复现）
 c) 全部登记后，调用 list_findings 复核条数，与你的清单对账，缺失的补登。
 d) 复现不出来的不要硬凑，明确说明"未复现 + 原因"。
 e) 【只有在上述漏洞全部完成 report_finding 登记、且 list_findings 复核无误之后】，才允许判定目标达成。
    一条都没登记就收官 = 任务失败。不要在没有登记任何 finding 的情况下结束。
 f) 余力之内再补充：目录遍历（testaspnet 的 ..%2fboot.ini 类向量）、开放重定向、Cookie 属性（HttpOnly/Secure/SameSite）。"""

DESC = f"""{ENV_NOTE}

{HANDOFF}

{RULES}"""

GOAL = ("对上一轮在 testasp.vulnweb.com / testaspnet.vulnweb.com 上已实测确认的漏洞（SQL 注入×5、反射 XSS、指纹信息泄露）"
        "逐条独立复现，并【逐条调用 report_finding 登记进 findings 表】，每条附 baseline 对照与实际响应证据，"
        "最后用 list_findings 复核条数并完成对账。")

def main():
    body = {
        "name": "补登 findings：已确认漏洞入库 (Acunetix 靶场)",
        "description": DESC,
        "goal": GOAL,
        "company_ids": [2],
        "seed_first_intent": True,
        "coverage_enabled": True,
        "timeout_seconds": 5400,
    }
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    tok = token()
    p = os.path.join(HERE, "_task_findings.json")
    open(p, "wb").write(data)
    req = urllib.request.Request(
        BASE + "/api/tasks", data=data, method="POST",
        headers={"Authorization": "Bearer " + tok,
                 "Content-Type": "application/json; charset=utf-8"})
    # 本机可能配了 HTTP_PROXY，直连必须显式绕过代理，否则 curl 会拿到 502
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=30) as r:
            print("[HTTP %d]" % r.status)
            print(r.read().decode("utf-8", "ignore")[:1500])
    except urllib.error.HTTPError as e:
        print("[HTTP %d]" % e.code, e.read()[:800].decode("utf-8", "ignore"))
    except Exception as e:
        print("ERR", type(e).__name__, str(e)[:300])

if __name__ == "__main__":
    main()
