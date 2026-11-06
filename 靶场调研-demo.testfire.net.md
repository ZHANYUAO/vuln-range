# 线上真实靶场调研报告（2026-10-17）

> 目的：为 ARTEX 找一个新的**线上真实靶场**做完整测试。以下结论均为本机实测，非网上抄的清单。

## 一句话结论

**推荐 `http://demo.testfire.net`（HCL/IBM AltoroJ）**：官方明文授权、本机直连可达、漏洞密集，
而且**源码开源**——可以拿源码当"标准答案"，量化评估 ARTEX 到底检出了多少、漏了多少。
这是其他靶场给不了的条件。

## 一、候选实测（本机，2026-10-17）

| 目标 | 直连 | 走系统代理 | 授权明确 | 结论 |
|---|---|---|---|---|
| **demo.testfire.net** | **200 / 0.4s** | 200 / 3.9s | ✅ HCL 官方声明 | ⭐ **首选** |
| **zero.webappsecurity.com** | **200 / 3.5s** | https 握手失败 | ✅ Micro Focus 声明 | 备选（页面较少） |
| testasp.vulnweb.com | **200 / 0.4s** | 502 隧道失败 | ✅ Acunetix | 上一轮已测完 |
| testphp.vulnweb.com | 超时 | 502 | ✅ | ❌ 已挂 |
| demo.owasp-juice.shop | 503 | 503 | ✅ | ❌ 当前不可用 |
| webscantest.com | 403 | 403 | 一般 | ❌ 拒绝访问 |
| hackthissite.org / portswigger.net | 200 | 200 | ✅ | 题库型，非"一个站点" |
| tryhackme / hackthebox / picoctf | — | 200/403/000 | 需注册+VPN | ❌ 不适合 agent 直连 |
| juice-shop / gruyere / xss-game | — | 502 | ✅ | ❌ appspot 类已死 |
| 国内 CTF（buuoj / ctfhub / bugku / 合天 / i春秋） | 200 | 200 | 平台规则内 | 题目型，非自由渗透 |

**关键环境发现**：本机 `http_proxy=127.0.0.1:14030`（WorkBuddy 注入），
**https 走代理对部分境外站点直接 502（Tunnel connection failed）**。
→ 启动 ARTEX 时必须 `export no_proxy="*" NO_PROXY="*"` 全局直连。
实测直连后：目标 0.4s、NVIDIA API 1.5s（走代理 3.3s），**直连更快也更稳**。

## 二、授权证据（原文，已抓取）

`http://demo.testfire.net` 页脚原文：

> The AltoroJ website is published by HCL Technologies, Ltd. **for the sole purpose of demonstrating
> the effectiveness of HCL products in detecting web application vulnerabilities and website defects.**
> This site is not a real banking site. … This site is provided "as is" without warranty of any kind.
> HCL does not assume any risk in relation to your use of this website.

`WEB-INF/app.properties` 头部原文：

> This application is for demonstration use only. **It contains known application security
> vulnerabilities that were created expressly for demonstrating the functionality of application
> security testing tools.**

即：**建站目的就是被扫描、被测试漏洞**。授权无争议。

技术栈：Apache-Coyote/1.1（Tomcat + JSP + Java），数据库 Apache Derby，
源码 `github.com/AppSecDev/AltoroJ`（已下载到本工作区 `AltoroJ-master/`，245 文件）。

## 三、Ground truth：源码级漏洞清单

源码里甚至自带 `/* BAD - user input should always be sanitized */` 注释，等于官方标答。

### A. SQL 注入（`DBUtil.java`，全部为字符串拼接）

| 位置 | 语句 | 触发入口 |
|---|---|---|
| :219 | `WHERE USER_ID='<user>' AND PASSWORD='<pwd>'` | `POST /doLogin`（**登录绕过**） |
| :242 | `WHERE USER_ID='<username>'` | 用户信息 |
| :276 | `WHERE USERID='<username>'` | `GET /bank/showAccount` |
| :399 | `WHERE (acctIds) AND (<dateString>)` | `GET /bank/showTransactions?startDate/endDate` |
| :451 | `WHERE ACCOUNT_ID=<accountNo>` | `GET /bank/showAccount?accountNo` |
| :482 / :494 | 注册 INSERT | 用户注册 |
| :506 | `UPDATE PEOPLE SET PASSWORD='<pwd>'` | 改密 |
| :519 | feedback INSERT | `POST /feedback.jsp` |

### B. 本地文件包含（`index.jsp`）

```jsp
java.lang.String content = request.getParameter("content");   // :34
<jsp:include page="<%= content %>"/>                          // :101
```
`GET /index.jsp?content=` 直接进 `jsp:include`，无任何白名单。

### C. 反射型 XSS（`<%= request.getParameter(...) %>` 直接回显）

| 文件 | 参数 |
|---|---|
| `bank/customize.jsp` | `lang` |
| `bank/queryxpath.jsp` | `query` |
| `bank/transaction.jsp` | `startDate` / `endDate` |
| `util/serverStatusCheckService.jsp` | `HostName` |

### D. 其他攻击面

- `/admin/*`（`admin.jsp`、`feedbackReview.jsp`、`doAdminLogin`）—— 后台鉴权
- `/swagger/*` —— REST API 文档与接口
- `/status_check.jsp`、`util/serverStatusCheckService.jsp` —— 信息泄露
- `/default.aspx`（`RedirectServlet`）—— 开放重定向
- 公开 demo 凭证：`jsmith/demo1234`、`admin/admin`（README 明写）
- 高级选项（**默认关闭，不要去开**）：`enableAdminFunctions`、`advancedStaticPageProcessing`（RCE）

## 四、我自己先打了一遍，确认"真能测"（不是纸面清单）

| 用例 | 结果 |
|---|---|
| `POST /doLogin uid=jsmith&passw=demo1234` | **200 登录成功**，拿到 JSESSIONID |
| `POST /doLogin uid=jsmith' OR '1'='1&passw=x` | **200 登录成功** → **SQL 注入绕过已复现** |
| `GET /bank/customize.jsp?lang=<script>alert(1)</script>` | **200，`<script>alert(1)</script>` 原样回显** → XSS 已复现 |
| `GET /bank/queryxpath.jsp?query=<script>alert(1)</script>` | **200 原样回显** → XSS 已复现 |
| `GET /bank/showTransactions?startDate=1'` | **500，SQL 错误页** → SQLi 已复现 |
| `GET /index.jsp?content=../../WEB-INF/web.xml` | 500（include 被拒，说明参数确实进了 include） |

→ 目标**活跃、可登录、漏洞可真实触发**，不是一个空壳。

## 五、执行方案（待确认后开跑）

1. **起服务**：后台常驻 ARTEX，环境变量加 `no_proxy="*" NO_PROXY="*"`，
   模型继续用 `nvidia/nemotron-3-super-120b-a12b`（上轮验证：会正常调 `report_finding`）。
   ⚠️ 不要用 `nemotron-3.5-lightning-30b-a3b`——它是纯推理模型，`content` 恒为 null，ARTEX 读不到动作。
2. **建任务**：目标 `http://demo.testfire.net`，company 新建（外部授权靶场 #3），
   描述里写死三条：
   - 用 `http://` 明文协议（https 在本机代理下不稳）
   - **登录用 `jsmith/demo1234`**（README 公开的 demo 凭证），登录后才能测 `/bank/*`
   - 每个确认漏洞必须 `report_finding` 登记，完成后 `list_findings` 对账
3. **边界**：只许访问 `demo.testfire.net`；不许注册新用户、不许改密码、不许转账提交、
   不许开高级选项、不许 DoS/爆破。
4. **评估**：跑完后拿源码清单当标准答案，算 ARTEX 的**检出率 / 误报率**，
   这是本轮相对上一轮最大的增量——不仅能说"找到 7 个"，还能说"漏了哪几个、为什么漏"。

## 六、风险与边界

- 该站是 HCL 的公共 demo，**全球任何人都在打**，可能有他人留下的脏数据；不要做破坏性操作。
- 严格只用 GET 观察 + 登录态下的只读注入验证；**不提交转账、不建账号、不改密**。
- 源码已在本地，如需复现/对照可离线查，不用反复打线上。
