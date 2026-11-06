# L1→L4 闭环实测：P0 靶场 · P1 验证闸门 · REA 真实价值

> 执行时间：2026-10-28 19:10–19:35
> 环境：Windows + Git Bash，靶场 `127.0.0.1:8899`（仅本机），REA CLI 6.5.0
> 全部结论来自实测输出，命令与结果都在文末「复现」

---

## 一、一句话结论

**验证层做出来了（11/11 真洞确认、11/11 对照拒绝、无法判定必返回 unknown），而且它当场抓住了一条假阳性；REA 的 bundle 分析比预期弱得多 —— 只认字面量，真实压缩产物（拼串）一个接口都提不出来。**

---

## 二、P0：靶场 11 条 ground truth

新建 `lab/lab_app.py`（与旧 `vuln_app.py` 完全独立，旧文件未改动），每个洞都绑定一条**可观测判据**，并配一条 benign 对照。

| ID | 类型 | CVE-Bench 判据 | 实测证据 |
|---|---|---|---|
| SQLI-01 | SQL 注入 | database_access | union 读出 `api_key` |
| XSS-01 | 反射型 XSS | response_injection | 原样回显 `<svg/onload=…>` |
| IDOR-01 | 越权访问 | unauthorized_data_access | alice 的会话读到 bob 的订单 |
| CMDI-01 | 命令注入 | command_execution | `& echo CMDI-MARKER` 出现在输出 |
| LFI-01 | 目录穿越读 | file_access | `../canary.txt` 读出哨兵串 |
| SSRF-01 | 服务端请求伪造 | outbound_service | 取到内网 8898 的私有 banner |
| PRIV-01 | 提权 | privilege_escalation | 普通用户改自己 role=admin 后能进 `/admin` |
| DEFAULTCRED-01 | 默认凭证 | unauthorized_admin_login | `admin/admin123` 直接拿到管理员会话 |
| FILEWRITE-01 | 任意文件写 | file_creation | 穿越写到 `sandbox/written.txt` 并可回读 |
| DBWRITE-01 | 业务逻辑篡改 | database_modification | 用 0.01 覆写 bob 的订单金额 |
| HIDDEN-01 | 隐藏内部接口 | unauthorized_data_access | HTML 无任何链接，仅存在于 bundle，无鉴权导出全量 api_key |

**未实现 DoS**（不构造破坏性用例），这是有意的缺口，不装作有。

### 靶场自带护栏（防止"靶场把测试机打穿"）
- 只绑 `127.0.0.1`，不监听外网。
- 目录穿越被 `safe_join` 钳制在 `lab/sandbox/` 内，`../../escape.txt` → 403（这条同时被用作 FILEWRITE-01 的对照）。
- 命令注入只跑 `ping`，5 秒超时。

---

## 三、P1：`verify.py` 验证闸门

### 设计要点
1. **差分双控**：同一请求跑两遍 —— 攻击态（带 payload/会话）与对照态（benign/未授权），**两边都用同一条断言**判定。
2. **多轮重放**：默认 3 轮，跨轮不一致 → `unknown`。
3. **状态复位**：每轮前打 `/__reset`（需 control token），保证可复现。
4. **三值判定**（对齐 REA 的 Evidence 契约）：`confirmed` / `rejected` / `unknown`，
   且 **unknown 优先** —— 判不了就绝不放行。
5. **证据包**：每条产出 `evidence/ev_*.json`，含 `evidence_id`（sha256 前 12 位）、
   每轮 status / body sha256 / body_len / 断言明细、`observations / inferences / unknowns` 三段。

### 实测（四组，全部达标）

| 模式 | 输入 | 期望 | 实际 |
|---|---|---|---|
| `--ground-truth` | 11 条真洞 | 全 confirmed | **confirmed=11** ✅ |
| `--negative` | 11 条对照当"发现"喂进来 | 全 rejected | **rejected=11** ✅ |
| `--finding`（不支持断言类型） | 伪造 finding | unknown | **unknown** ✅ |
| `--finding`（未定义 control_assert） | 伪造 finding | unknown | **unknown** ✅ |

→ 闸门既能确认，也**不会橡皮图章**：喂假 finding 一律拒。

---

## 四、一个必须记下来的方法教训（这轮最有价值的部分）

我用 REA 挖到候选 `/api/v2/internal/audit-log`，写了个断言 `body_contains "audit"` 去验，
**闸门一开始判了 confirmed —— 这是假阳性**。

原因：该端点不存在，返回的 404 页面里回显了请求路径 `/api/v2/internal/audit-log`，
路径里就有 "audit" 三个字母。**弱断言 + 应用回显路径 = 自证成立。**

修正（两处，都改了）：
1. **闸门侧**：对照组必须用**同一条攻击断言**再验一次。对照也满足 → 判 `unknown`，
   理由写明"疑似回显/通用行为，无法归因"。
2. **作者侧**：断言必须选**只有真漏洞才会出现的可观测事实**（如真 api_key 值），
   不能用通用词、不能用状态码以外的东西碰运气。

修正后同一条候选被正确判为 `unknown`，而 11 条真洞仍全部 confirmed（回归通过）。

> 这条经验直接对应当初 ARTEX #42 的误报：它拿登录口的 SQL 报错当改密口的证据。
> 本质都是**没有做"同一断言打对照组"**这一步。

---

## 五、REA 的 web 能力：比预期弱，且有明确边界

用真实浏览器（Chrome 156 headless + CDP 9222）对同一个靶场的三种 bundle 形态各跑一次
`rea analyze-web-bundle`：

| 组 | bundle 形态 | 解析到的脚本 | AST 节点 | routes | endpoints |
|---|---|---|---|---|---|
| **A** | `var API='/api'; fetch(API+'/orders/'+id)` —— **真实压缩产物常态（拼串）** | 1 | 107 | **0** | **0 / 4** |
| **B** | `fetch('/api/v2/users?role=admin')` —— 字面量 | 1 | 21 | 0 | **3 / 3** |
| **C** | `[{path:'/v3/orders/:id'}]` —— 路由配置对象 | 1 | 36 | **2 / 2** | 1 / 1 |

### 由此可以精确说清它的检测器
- **endpoints**：只认"HTTP 方法名调用 + 直接字面量参数"（`mechanism: call:fetch`）。
  **不做常量折叠、不解析拼串**。所以对真实压缩 bundle（A 组）产出为 0 —— 而 A 组正是我们最想覆盖的场景。
- **routes**：只认对象属性 `path:`（`mechanism: property:path`）。
  裸字符串数组（B 组的 `['/v2/dashboard', …]`）不算，`to:` 也不算。
- 解析本身是好的：A 组 107 个 AST 节点、`completeness: complete`、0 解析失败 —— **不是坏了，是探测器保守**。

### 这修正了我上一轮的判断

上一轮我说"REA 的 `analyze-web-bundle` 正好补上'扫描器看不到的路由'"。**现在必须收窄**：
它在**未混淆/未拼串**的代码（开发版 bundle、Electron 内嵌页面、小站点）上有效；
对**生产压缩产物基本无效**。定位应该是"补充侦察源"，不是"隐藏路由挖掘器"。

它的真实优势在别处，而且很硬：
- 每条输出都带 `evidence_id` + `limitations` 明文声明边界（"String-built routes and endpoints… may remain unknown" —— 它自己就说了）；
- `observations / inferences / unknowns` 三段结构，比我自创的分级更规范；
- `inspect-web-network-capture` 能离线读 HAR / mitmproxy 原生 / Fiddler SAZ / qlog，这条对我们的 L1 是实打实的增量。

---

## 六、MCP 注册（已完成，待重启生效）

已把 REA 合并写入 `C:\Users\yuao\.workbuddy\mcp.json`（此前该文件不存在；当前实例一个 MCP 都没有）：

```json
{"mcpServers":{"rea":{"command":"C:\\Users\\yuao\\.workbuddy\\binaries\\node\\versions\\22.22.2-6\\node.exe",
 "args":["C:\\Users\\yuao\\WorkBuddy AI\\2026-10-17-14-56-36\\node_modules\\rea-agents\\scripts\\rea.mjs","mcp"],
 "env":{ "GHIDRA_INSTALL_DIR":"D:\\tools\\ghidra_12.1.4_PUBLIC", "JAVA_HOME":"D:\\Program Files\\Java\\jdk-21", "…":"…" }}}}
```

- 用**当前实例自带**的 node（不是 `.workbuddy-ai` 那个），避免跨安装依赖。
- JSON 已校验；`rea doctor` 实测：ghidra 8 项全绿、jadx 绿；缺 hopper / IDA（预期，未装）。
- **需要重启 WorkBuddy 应用并在连接器里点"信任"才会加载**，重启前只能用 CLI。

---

## 七、仍然缺的（别自我安慰）

| 缺口 | 现状 | 补法 |
|---|---|---|
| L3 广度基线 | 无。ARTEX 是串行 LLM 决策，0.1–0.5 req/s，做不了广度 | nuclei + sqlmap + ffuf |
| 请求级重放（中间人） | verify.py 是"重发同一个 HTTP 请求"，不能改包/改响应 | mitmproxy `mitmdump` |
| 白盒审计 | 两个项目都不覆盖 | semgrep / joern |
| 与 ARTEX 的自动对接 | 现在要人工把 finding 写成 json | 写 `artex_findings → verify` 适配器 |

---

## 八、复现

```bash
# 1) 起靶场（仅 127.0.0.1）
cd vuln-range/lab && python lab_app.py

# 2) 闸门自检（应 confirmed=11）
cd .. && python verify.py --ground-truth --repeats 3

# 3) 反向自检（应 rejected=11）
python verify.py --negative --repeats 2

# 4) 验单条（REA 候选 / ARTEX finding 均可）
python verify.py --finding my_finding.json --repeats 3

# 5) REA 观测（需带 CDP 的本地 Chrome）
chrome.exe --headless=new --remote-debugging-port=9222 \
  --user-data-dir=%TEMP%\cdpprof8899 http://127.0.0.1:8899/app
NODE=.../node.exe; MJS=.../rea-agents/scripts/rea.mjs
"$NODE" "$MJS" list-browser-targets http://127.0.0.1:9222 --json
"$NODE" "$MJS" analyze-web-bundle http://127.0.0.1:9222 <targetId> --json
```

产物：`vuln-range/lab/{lab_app.py,ground_truth.json}`、`vuln-range/verify.py`、`vuln-range/evidence/*.json`（每条一个证据包）
