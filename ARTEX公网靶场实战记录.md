# ARTEX 对公网靶场实战记录

时间：2026-10-12
目标：`http://testasp.vulnweb.com`（Acunetix 官方 demo 站）
引擎：本机 ARTEX（Go 单二进制 + PG 16 + kimi-k3 via NVIDIA）

---

## 一、靶场可达性实测（本机网络，2026-10-12）

### 境外

| 目标 | 状态 | 说明 |
|---|---|---|
| `portswigger.net/web-security` | 200 | 官方学院，声明 safe and legal，但 lab 需登录分配临时子域，无法自动化 |
| `overthewire.org/wargames` | 200 | SSH 关卡制，非 HTTP 扫描目标 |
| `www.itsecgames.com` | 200 | bWAPP 官网（需自行部署） |
| **`testasp.vulnweb.com`** | **200** | **Acunetix 官方，首页明文声明故意脆弱 → 采用** |
| **`testaspnet.vulnweb.com`** | **200** | 同系列 ASP.NET 版 |
| `www.webscantest.com` | 403 | 可达但拦截 |
| `testphp.vulnweb.com` | 502 | 故障 |
| `demo.owasp-juice.shop` | 503 | 故障 |
| `scanme.nmap.org` / `zero.webappsecurity.com` / `demo.testfire.net` / `google-gruyere` | 000 | 不可达 |

### 境内

| 目标 | 状态 | 说明 |
|---|---|---|
| `mozhe.cn` / `ichunqiu.com` / `buuoj.cn` / `adworld.xctf.org.cn` | 200 | CTF/靶场平台，但**需登录启实例**，非固定 URL |
| `xss.haozi.me` | 200 | XSS 专项 playground，可用但漏洞面单一 |
| `hetianlab.com` / `hacking8.com` / `ctfhub.com` | 000 | 不可达 |

**结论**：本机网络下，能直接喂给 ARTEX 做完整自动化评估的、有明确授权的固定公网 URL，**只有 Acunetix 的 vulnweb 系列**。

### 授权依据（已核验原文）

`http://testasp.vulnweb.com/` 首页底部：

> Warning : This forum is deliberately vulnerable to SQL Injections, directory traversal, and other web-based attacks.

PortSwigger Web Security Academy 同样有官方表述：

> The Web Security Academy exists to help anyone who wants to learn about web security in a safe and legal manner.

---

## 二、打通自动化：自签 JWT

ARTEX 建任务原本必须点 UI（无免鉴权开关）。突破口在 `server/auth.go`：

- 单用户模式：`RegisteredClaims{Subject: "ARTEX"}`（无 users 表）
- HS256，密钥落在 `<exe 同目录>/jwt.key`（32 字节）
- `verifyJWT` 只校验签名与有效期，不查会话表

因此可离线自签 token → 直接调 `/api/tasks`。脚本：`vuln-range/mktoken.py`

```
/api/tasks    401 → 200
/api/settings 401 → 200
```

配套：
- `vuln-range/create_task.py` — 建任务（含 Windows 环境约束）
- `vuln-range/watch.py` — 监控探索图 / 活动 / LLM 消耗
- `vuln-range/setup_ext_range.sql` — 建企业与 scope

---

## 三、踩到的坑（三条都有实测证据）

### 1. seed 会把描述里的示例 URL 当成目标

日志：`[seed] task 2: 目标站点 http://target`
原因：任务描述里 python 示例写了 `urlopen('http://target/')`，被目标解析器吃掉。
修正：示例 URL 直接用真实域名。

### 2. 任务建完不会自动跑

`status=created`、`llm_usage=0`。引擎要 `Engine.Run` 才启动循环（`server.go:1108 setActive`，或服务重启时恢复所有非终态任务）。
解法：重启服务即恢复。

### 3. Windows 上 agent 的 shell 是 PowerShell

这条上次已预判，本次**被 agent 自己的报错证实**：

```
tool_use:  cd "...\i5" && python -c "..."
tool_result: 位置 1 字符 72  + ... && python ...  ~~
             标记"&&"不是此版本中的有效语句分隔符
             [exit code 1]
```

随后 agent 自我纠正：

> PowerShell 5.1, no &&. Use semicolon or just python with full path.

任务描述里预先写死环境约束是必要的，否则会连烧几轮。

---

## 四、实战结果

### 探索图

```
fact   origin    x1    （任务起点）
fact   confirmed x2    （指纹清单 / 目录遍历疑似）
intent running   x1    （种子意图 #5）
```

### 资产入库（insert_assets，8 条）

service `http://testasp.vulnweb.com/`（IIS 8.5 / ASP.NET / Classic ASP / acuforum）
endpoint：`showforum.asp?id=1`、`showthread.asp?id=1`、`Search.asp`、`Login.asp`、`Register.asp`、`Templatize.asp?item=`、`robots.txt`

### 已确认发现

**① 会话 Cookie 缺失安全属性**（observed）
```
Set-Cookie: ASPSESSIONIDACCSQDSA=...; path=/
```
无 `HttpOnly` / `Secure` / `SameSite`，且站点为纯 HTTP。

**② 技术栈与版本泄露**（observed）
```
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
```

**③ 目录遍历 / 本地文件包含 — 已确证**（agent 标 inferred，已由人工核验升级）

请求：
```
GET /Templatize.asp?item=../../windows/win.ini   → 200, 2727 bytes
GET /Templatize.asp?item=../web.config           → 500
```

响应体（去掉 HTML 模板后）含标准 win.ini 内容：
```
; for 16-bit app support
[fonts]
[extensions]
[mci extensions]
[files]
[Mail]
MAPI=1
```
对照组 `/Templatize.asp?item=html/about.html` 中同样特征 **0 处匹配** → 排除误报。

### 最有价值的一幕：agent 抗幻觉

`activity id=25` 的思考过程（原文）：

> report_finding for traversal? Content unverified — 200 with 2727 bytes on win.ini traversal strongly suggests it worked, but I can't claim confirmed without content... Actually rules: only confirmed. I'll record as inferred fact instead.

它在没读到响应正文时，**主动拒绝把疑似升级为 confirmed finding**，而是落成 `confidence: "inferred"`，并留下下一步指引：

> 建议规划者后续读取 out__Templatizeasp_item___windows_winini.txt 核验内容，若含 [fonts]/[extensions] 等 win.ini 特征即可升级为确认 LFI。

（后来人工核验，特征确实存在，该条可升级为 confirmed。）

这就是"AI 说有漏洞"和"可交付报告"的分水岭：**每条结论要么挂 evidence，要么明确标注置信度，不允许靠顺滑的叙述蒙过去。**

---

## 五、当前瓶颈

LLM 单次调用 **176 秒**（kimi-k3 经 NVIDIA，实测）。原因：

- 小模型返回 410（已下架）或 404（key 无权限）
- 可用大模型（kimi-k3 / glm-5.3 / deepseek-v4.1-flash）均需长时间排队
- kimi-k3 为 reasoning 模型，小 max_tokens 下 `content=None`（token 耗在推理上）

后果：一轮工具调用约 3 分钟，完整评估需 30 分钟以上；中途出现过 `tool execution interrupted`。

**未完成项**：SQL 注入（`showforum.asp?id=`、`Search.asp`、`Login.asp`）、XSS 尚未实测——agent 自己也在 thinking 里标注了 "SQLi not tested yet"。

---

## 六、复现方式

```bash
# 1. 建企业与 scope
psql -f vuln-range/setup_ext_range.sql

# 2. 建任务
python vuln-range/create_task.py

# 3. 重启服务触发 engine.Run（否则任务不跑）

# 4. 监控
python vuln-range/watch.py
```

查看 agent 工作产物：
`ARTEX/data/tasks/<task_id>/i<intent_id>/`
