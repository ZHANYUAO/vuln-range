#!/usr/bin/env python3
"""第三轮（收官补漏）：专打前轮因提前收官而漏掉的项。
核心：把清单压到极短（只 5 条），并把"不许提前收官"写成最后一步的强制动作。"""
import json, subprocess, sys, os, urllib.request, urllib.error

BASE = "http://127.0.0.1:8787"
HERE = os.path.dirname(os.path.abspath(__file__))

def token():
    return subprocess.check_output(
        [sys.executable, os.path.join(HERE, "mktoken.py")], text=True).strip()

ENV_NOTE = """【执行环境 — 必读，违反会直接失败】
本机 Windows，shell 工具实际执行 PowerShell 5.1，不是 bash：
- 禁止 curl / wget / nc / nmap / sqlmap；禁止管道、重定向、&& 等 bash 语法。
- 发 HTTP 一律用 python。需要 POST / Cookie / 响应头时，**写成临时 .py 文件再执行**。
- 登录标准写法：
    import urllib.request, urllib.parse, http.cookiejar
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    r = op.open(urllib.request.Request('http://demo.testfire.net/doLogin',
        data=urllib.parse.urlencode({'uid':'jsmith','passw':'demo1234'}).encode()))
    print(r.status, len(r.read()))
    之后用同一个 op 发后续请求即可保持会话。
- **只用 http://**；报 "Tunnel connection failed" 或 502 时用 urllib.request.ProxyHandler({}) 绕过代理。
- 单条命令 60 秒内返回。"""

BOUNDARY = """【边界】只访问 demo.testfire.net。
允许提交 **1 次** feedback 表单（这是官方靶场，专门为演练设计）。
禁止：注册新用户、改密码、真实转账、删改他人数据、暴力破解、DoS、上传文件。"""

LIST = """【本轮清单 —— 只有 5 条，逐条做完，一条都不许跳】

X1) 反射 XSS · lang 参数
    登录后 GET /bank/customize.jsp?lang=%3Cscript%3Ealert(1)%3C%2Fscript%3E
    判定：响应 HTML 中是否原样出现 <script>alert(1)</script>

X2) 反射 XSS · query 参数
    登录后 GET /bank/queryxpath.jsp?query=%3Cscript%3Ealert(1)%3C%2Fscript%3E
    判定：同上（注意它落在 <input value="..."> 里）

X3) 反射 XSS · startDate 参数
    登录后 GET /bank/transaction.jsp?startDate=%3Cscript%3Ealert(1)%3C%2Fscript%3E
    判定：input value 中原样回显

X4) 反射 XSS · endDate 参数（与 X3 是**不同参数**，必须单独发请求）
    登录后 GET /bank/transaction.jsp?endDate=%3Cscript%3Ealert(1)%3C%2Fscript%3E
    判定：同上

X5) **存储型 XSS（本轮最重要的一条）**
    源码：feedback 内容经 DBUtil.java:519 的 INSERT 拼接入库，
    展示页 feedbacksuccess.jsp:74-82 用 <%= %> 直接输出，**无任何 HTML 转义**。
    操作：POST /sendFeedback
      body: cfile=comments.txt&name=%3Cscript%3Ealert('STORED')%3C%2Fscript%3E&email_addr=x@y.z&subject=s&comments=c
    判定：提交后返回的页面里是否原样渲染 <script>alert('STORED')</script>。
    若渲染了 → 这是**存储型**（不只是反射），severity 至少 high，report_finding 时 vulnclass 写 Stored XSS。"""

RULES = """【交付要求】
- 每条先 baseline 再 payload，把真实响应片段（状态码 + 关键 HTML 原文）写进 evidence。
- 复现成功立即 report_finding（vulnclass / name / severity / summary / evidence）。
- X1–X5 **五条全部**处理完，再调用 list_findings 复核。
- 【收官前置条件】必须确认 X1–X5 每一条都已给出结论（已登记 或 写明未复现及原因），
  然后才能判定目标达成。**哪怕 X1 就成功了你也要继续做 X2、X3、X4、X5**——
  这是本轮唯一被考核的点，中途收官视为任务失败。"""

DESC = f"{ENV_NOTE}\n\n{BOUNDARY}\n\n{LIST}\n\n{RULES}"

GOAL = ("对 demo.testfire.net 补测 5 处跨站脚本入口：lang / query / startDate / endDate 四个反射型参数，"
        "以及 feedback 提交的存储型 XSS；每条附 baseline 对照与真实响应证据，"
        "确认后逐条 report_finding 登记，五条全部处理完才允许收官。")

def main():
    body = {
        "name": "AltoroJ 收官补漏：XSS 五条（含存储型）",
        "description": DESC,
        "goal": GOAL,
        "company_ids": [3],
        "seed_first_intent": True,
        "coverage_enabled": True,
        "timeout_seconds": 7200,
    }
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    tok = token()
    req = urllib.request.Request(BASE + "/api/tasks", data=data, method="POST",
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json; charset=utf-8"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=30) as r:
            print("[HTTP %d]" % r.status, r.read().decode("utf-8", "ignore")[:250])
    except urllib.error.HTTPError as e:
        print("[HTTP %d]" % e.code, e.read()[:300].decode("utf-8", "ignore"))
    except Exception as e:
        print("ERR", type(e).__name__, str(e)[:200])

if __name__ == "__main__":
    main()
