#!/usr/bin/env python3
"""建 ARTEX 任务：对 HCL/IBM AltoroJ 官方授权靶场 demo.testfire.net 做完整安全评估。"""
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
- 发 HTTP 一律用 python（已确认可用）。简单请求：
  python -c "import urllib.request;r=urllib.request.urlopen('http://demo.testfire.net/',timeout=20);print(r.status);print(r.read()[:1500].decode('utf-8','ignore'))"
- 需要 POST、带 Cookie、看响应头时，**写成临时 .py 文件再执行**（引号嵌套在 PowerShell 里极易出错）。
  会话维持用 http.cookiejar：
    import urllib.request, urllib.parse, http.cookiejar
    cj=http.cookiejar.CookieJar()
    op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.open(urllib.request.Request('http://demo.testfire.net/doLogin',
        data=urllib.parse.urlencode({'uid':'jsmith','passw':'demo1234'}).encode()))
- **协议只用 http://，不要用 https://**（本机代理对 https 隧道不稳，会 502）。
- 若某次请求报 "Tunnel connection failed" 或 502，改用显式绕过代理的 opener：
    op=urllib.request.build_opener(urllib.request.ProxyHandler({}))
- 单条命令控制在 60 秒内返回。"""

BOUNDARY = """【严格边界】
- 只允许访问 demo.testfire.net 这一个域名。
- 只读与验证性探测为主。**禁止**：注册新用户、改密码、提交转账/交易、提交 feedback 表单（可只在参数层面验证注入特征，不要真的写入大量数据）、
  删除或修改任何数据、暴力破解、DoS、上传文件。
- 这是 HCL/IBM 的公共 demo 站（全球都在打），数据脏是正常的，不要据此做破坏性操作。"""

CONTEXT = """【目标情报（已确认，可直接用，但仍需你自己发请求复现）】
- 站点：http://demo.testfire.net —— HCL/IBM "AltoroJ"，Tomcat + JSP + Derby，
  页脚明文声明建站目的就是"demonstrating the effectiveness of ... detecting web application vulnerabilities"，授权测试无争议。
- **登录**：POST /doLogin，表单字段 uid / passw。公开 demo 凭证：**jsmith / demo1234**（也有一组 admin/admin）。
  登录后拿到 JSESSIONID 才能访问 /bank/* 下的页面，否则会被重定向回登录页（返回 8360 字节的登录页即为未登录）。
- 主要路由：/doLogin、/bank/main.jsp、/bank/showAccount、/bank/showTransactions、/bank/doTransfer、
  /bank/customize.jsp、/bank/queryxpath.jsp、/bank/transaction.jsp、/bank/ccApply、
  /index.jsp?content=、/feedback.jsp、/subscribe.jsp、/admin/*、/swagger/、/status_check.jsp、
  /util/serverStatusCheckService.jsp、/default.aspx
- 未登录也能测的：/index.jsp?content=、/doLogin、/swagger/、/status_check.jsp、
  /util/serverStatusCheckService.jsp、/admin/login.jsp"""

TASKS = """【测试范围（逐项实测，不要只做信息收集）】
1. **SQL 注入**（多处，字符串拼接进 SQL）
   - 登录绕过：POST /doLogin，uid 用 jsmith' OR '1'='1（URL 编码后发送），密码任意 → 看是否绕进系统
   - GET /bank/showAccount?accountNo=1' 与 ?listAccounts= 类参数
   - GET /bank/showTransactions?startDate=1'&endDate=... → 注意是否返回 500 + SQL 错误
   - /feedback.jsp 的 name/email/subject/comments
   - 每个都要给 baseline（正常值）与注入值的状态码 + 响应关键片段对比
2. **反射型 XSS**：/bank/customize.jsp?lang=、/bank/queryxpath.jsp?query=、
   /bank/transaction.jsp?startDate= 与 endDate=、/util/serverStatusCheckService.jsp?HostName=
   判断 payload 是否原样回显、是否被转义、处在什么上下文
3. **本地文件包含 / 路径遍历**：/index.jsp?content= 会直接进 jsp:include，
   试 ../../WEB-INF/web.xml、..%2f..%2fWEB-INF%2fweb.xml、绝对/相对路径等，记录状态码与是否读到内容
4. **认证与会话**：后台 /admin/* 是否可未授权访问；Cookie 是否 HttpOnly/Secure/SameSite；
   登出是否失效；能否直接访问 /bank/* 未登录被正确拦截
5. **信息泄露**：/status_check.jsp、/swagger/（API 文档）、响应头 Server/X-Powered-By、
   错误页是否泄露堆栈或 SQL 语句、目录与备份文件枚举
6. **其他**：/default.aspx 等重定向类端点的开放重定向；CSRF token 是否存在；
   /swagger 暴露的 REST API 是否有未授权访问

【硬性交付要求 —— 验收标准是 findings 表里有东西】
- 每条【先 baseline 后注入】，把两段真实输出贴进 evidence（完整 URL、状态码、响应关键片段）。
- 复现成功【立即调用 report_finding】：vulnclass / name / severity(critical|high|medium|low) / summary / evidence。
- 全部完成后用 list_findings 复核条数并对账；缺失的补登。
- 复现不出来的【不要】硬凑，写明"未复现 + 原因"。
- 【只有所有已确认漏洞都完成 report_finding 登记、且 list_findings 复核无误后】才可判定目标达成。
  一条没登记就收官 = 任务失败。"""

DESC = f"""{ENV_NOTE}

{BOUNDARY}

{CONTEXT}

{TASKS}"""

GOAL = ("对 http://demo.testfire.net（HCL/IBM AltoroJ 官方授权靶场）做一次完整 Web 安全评估："
        "用公开 demo 凭证 jsmith/demo1234 登录后，实测 SQL 注入（含登录绕过）、反射型 XSS、"
        "本地文件包含/路径遍历、后台未授权访问、信息泄露、开放重定向等，"
        "每条附 baseline 对照与真实响应证据，并【逐条调用 report_finding 登记进 findings 表】，最后用 list_findings 对账。")

def main():
    body = {
        "name": "AltoroJ 官方靶场完整评估 (demo.testfire.net)",
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
            print("[HTTP %d]" % r.status, r.read().decode("utf-8", "ignore")[:600])
    except urllib.error.HTTPError as e:
        print("[HTTP %d]" % e.code, e.read()[:600].decode("utf-8", "ignore"))
    except Exception as e:
        print("ERR", type(e).__name__, str(e)[:200])

if __name__ == "__main__":
    main()
