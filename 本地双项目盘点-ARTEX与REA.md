# 本地双项目盘点：ARTEX × REA

> 生成时间：2026-10-28 19:20
> 方法：全部来自本机实测（路径、版本、命令、配置），不引用印象
> 修订：本文修正 `0day挖掘规划-ARTEX与REA.md` 中"REA 是什么，我没查到"的空白

---

## 一、两个项目的真实身份

| 项 | ARTEX | REA |
|---|---|---|
| 本地路径 | `C:\Users\yuao\WorkBuddy\2026-10-10-17-02-37\ARTEX\` | `C:\Users\yuao\WorkBuddy AI\2026-10-17-14-56-36\rea-src\` |
| 包名 | `github.com/Autumn-27/artex` | `rea-agents`（`io.github.morluto/rea`） |
| 上游 | 已 404（2026-10-08 闭源） | `github.com/morluto/rea`，MIT |
| 版本 | 末次提交 `f3e3f54`，2026-10-08 19:05 | **6.5.0**（CLI 实测 `--version` 返回 6.5.0） |
| 技术栈 | Go 1.26.3，`artex.exe` 51.8 MB | Node 22 + TypeScript，`src/` 21 MB |
| 形态 | HTTP 服务（8787）+ 内置 agent 循环 | **CLI 155 命令 + MCP 207 工具 + skill** 三位一体 |
| 定位 | 黑盒 Web 渗透 agent（读响应→决策→执行） | 逆向 / 取证 agent（二进制、JS/Electron、APK、Web 观测） |
| 当前状态 | 服务在跑（8787，任务库有历史 finding） | CLI 可执行；**MCP 未在本会话所在实例注册** |

---

## 二、结构性发现：两套 WorkBuddy 安装，REA 的 MCP 我看不到

| 目录 | 用户 ID | 用途 |
|---|---|---|
| `C:\Users\yuao\.workbuddy\` | `2094a245-…`（当前会话所在） | `mcp.json` **为空/不存在**，没有任何 MCP 服务器 |
| `C:\Users\yuao\.workbuddy-ai\` | `11f71f08-…` | 含 `BOOTSTRAP.md / IDENTITY.md / SOUL.md / USER.md / MEMORY.md`，是**独立产品人格的另一个实例** |

REA 的 MCP 注册在 `C:\Users\yuao\.workbuddy-ai\mcp.json`（实测已读），指向：

```
node:  C:\Users\yuao\.workbuddy-ai\binaries\node\versions\22.22.2-6\node.exe
args:  C:\Users\yuao\WorkBuddy AI\2026-10-17-14-56-36\node_modules\rea-agents\scripts\rea.mjs mcp
env:   GHIDRA_INSTALL_DIR / JAVA_HOME / REA_OBJDUMP_COMMAND / REA_JADX_MCP_JAR / … 共 9 项
```

**后果**：那 207 个 MCP 工具在当前会话里**一个都调不到**。要用只有两条路——注册到 `~/.workbuddy/mcp.json`（然后重启并信任该服务器），或走 CLI（`rea <command> --json`，现在就能用，实测通过）。

### 依赖工具链实测（9 项中 8 项在位）

```
OK   D:/tools/ghidra_12.1.4_PUBLIC
OK   D:/tools/jadx/jadx-headless-mcp-0.7.1-all.jar
OK   D:/tools/binutils/mingw64/bin/objdump.exe
OK   D:/tools/rizin
OK   D:/tools/adb/platform-tools/adb.exe
OK   D:/Program Files/Java/jdk-21
MISS D:/tools/idat64            ← IDA 未装（MCP 配置里引用了 D:/tools/ida/ida-mcp.json）
```

---

## 三、REA 有没有 Web 能力？有，但性质要说清

155 个命令里有 **18 个与 web / browser / script / capture 相关**（实测 `--help` 过滤）：

| 命令 | 作用 | 对 Web 渗透系统的价值 |
|---|---|---|
| `inspect-web-page` | 经 CDP 被动采集 DOM、无障碍树、scripts、resources、网络/console 元数据、storage 键名 | **L1 攻击面建模**：结构化输入替代肉眼看页面 |
| `analyze-web-bundle` | 无执行静态解析脚本产物，导出 chunk 边、**route 与 endpoint 候选**、vendor 指纹、source-map | **正好是"扫描器看不到的路由"** |
| `export-web-scripts` | 把 Debugger 捕获的脚本导出到指定目录，供后续静态分析 | 把 bundle 变成可审计源码 |
| `observe-web-session` | 定时观察窗口，记录 reload / SPA 导航 / 重定向 / 生命周期 | **业务状态机建模**（IDOR 前提） |
| `discover-webmcp-tools` | 被动发现页面声明的 WebMCP 工具及其 `input_schema` | 新型攻击面枚举 |
| `capture-browser-scenario` | Playwright 有界场景执行，产出 Evidence | 可复现的交互录制 |
| `compare-web-captures` / `compare-web-screenshots` | 两次采集/两张 PNG 的差异判定 | 变更检测、回归 |
| `inspect-web-network-capture` | 离线读 HAR / mitmproxy 原生格式 / Fiddler SAZ / qlog，**不回放 URL** | 流量侧取证（无需自己写解析） |

### 但必须钉死边界（文档原话）

> "REA can attach to a user-owned Chrome-family browser through the Chrome DevTools Protocol (CDP) … This is a **passive reverse-engineering capability, not a general browser automation or remote-control surface**."

三条硬约束：
1. **被动**：`list-browser-targets` 只对 **loopback** CDP 浏览器生效，且需显式 origin scope。不能直接怼一个远端 URL。
2. **不主动**：没有 payload 注入、没有 fuzz、没有重放攻击请求。
3. **不验证漏洞**：`compare_web_captures` 判的是"两次观测是否不同"，不是"这个注入是否成立"。

→ **结论：REA 补 L1（侦察/攻击面建模）与取证，不补 L3（主动扫描），更不补 L4（重放验证闸门）。**

---

## 四、放进五层目标树看，两个项目各占哪一格

```
L0 授权边界        ← 都无（人工）
L1 侦察+攻击面建模  ← REA：inspect-web-page / analyze-web-bundle / observe-web-session  ★实际可用
L2 假设生成(LLM)   ← ARTEX 内置；也可由我直接承担
L3 工具编排/执行    ← ARTEX：真发 HTTP、真跑命令（已验证出 #51 SQLi）
L4 独立验证闸门    ← 两者都缺。ARTEX 是"LLM 说发现了就入库"；REA 只有被动观测对比
L5 报告+回归       ← ARTEX 有 findings 表；REA 有 Evidence 契约
横切 上下文管理     ← ARTEX 弱（会"提前收官"、任务 11 误判未复现）
```

### 最值得抄的一件事：REA 的 Evidence 契约

REA 每条结果都带 `evidence_id`，并把结论分成 `observations / inferences / unknowns` —— 这正是 ARTEX 缺的 L4 语言。ARTEX 的 #43（真执行转账）、#42（改密注入误报）本质是**把 inference 当 observation 入库**。

> 可直接落地的动作：把 `verify.py` 的输出结构对齐 REA 的三分法，而不是自创 "confirmed/未复现"。

---

## 五、两个项目都填不上的洞（别自我安慰）

| 缺的层 | 为什么现有两个项目补不了 | 现成方案（实测 star） |
|---|---|---|
| 主动广度扫描 | ARTEX 是 LLM 串行决策，吞吐 0.1–0.5 req/s，做不了广度 | nuclei 32.4k / sqlmap 38.8k / ffuf 17k |
| 请求级重放验证 | 两者都没有"同一请求重放 N 次仍成立"的机制 | mitmproxy 46.4k（`mitmdump` 脚本化） |
| 白盒源码审计 | ARTEX 不是 codeql/semgrep；REA 只解析 JS bundle | semgrep 17.3k / joern 3.6k |
| ground truth | 靶场 8899 目前只有 SQLi 一类 | 按 CVE-Bench 8 类判据自建 |

---

## 六、可立即执行的三件事（按性价比）

| # | 动作 | 依赖 | 产出 |
|---|---|---|---|
| **A** | 把 REA 注册到当前实例 `~/.workbuddy/mcp.json`（合并写入，不覆盖） | 需重启 + 你点"信任" | 207 个 MCP 工具在本会话可用 |
| **B** | 用 `rea analyze-web-bundle` 对靶场 8899 跑一遍（走 CLI，现在就成） | 需本机 Chrome 开 CDP + 页面 | 验证"route/endpoint 候选"能否真挖出扫描器看不到的入口 |
| **C** | 继续 P0+P1：靶场埋 8 类 ground truth + 写 `verify.py` 重放闸门 | 无 | 第一个能自证有效性的最小系统 |

A 是"让工具可见"，B 是"验证 REA 到底值不值"，C 是"补系统真正的洞"。C 的收益最确定，B 的结论最不确定（需要实测才知道 REA 的 bundle 解析质量）。
