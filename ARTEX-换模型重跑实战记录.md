# ARTEX 换模型重跑实战记录

**日期**：2026-10-12
**目标**：`testasp.vulnweb.com` / `testaspnet.vulnweb.com`（Acunetix 官方靶场，首页明文声明 deliberately vulnerable）
**结论**：✅ **完整跑通并打完收工** —— `status=done`、`goal met`、224 次 LLM 调用、19 个实测确认事实

---

## 一、NVIDIA 端点可用模型清单（实测，非官网转述）

官网 `build.nvidia.com/models` 是动态渲染页，抓不到内容。改用 **API 侧实测**：80 个模型里筛出 60 个生成式候选，逐个测「能否调用 + 是否支持工具调用 + 延迟」。

### 可用（支持工具调用，按延迟排序）

| 模型 | 延迟 | 说明 |
|---|---|---|
| **`nvidia/nemotron-3.5-lightning-30b-a3b`** | **5.6s** | ✅ **本轮选用**。官方定位"Fastest 30B A3B MoE，专为 agentic / 长程 agent" |
| `nvidia/nemotron-3-super-120b-a12b` | 18.6s | 1M context，agentic reasoning + tool calling，52M 次月调用最热 |
| `openai/gpt-oss-20b` | 27.2s | OpenAI 开源权重 |
| `z-ai/glm-5.3-flash` | 88.8s | glm-5.3 的快版，仍偏慢 |
| `meta/muse-glimmer-30b` | 3.1s | 简单调用快，但复杂场景实测无工具调用 |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | 47.5s | reasoning 模型，慢 |

### 不可用（不是你的 key 问题）

- **HTTP 404 "Function Not Found"**：约 40 个模型。NVIDIA serverless 函数未部署/已下架（`mistral-large`、`kimi-k2.6`、`gemma-3-4b`、`llama-3.1-nemotron-70b` 等）
- **持续超时**：`moonshotai/kimi-k3`、`deepseek-ai/deepseek-v4.1-flash`、`z-ai/glm-5.3`（这三个正是 CrowdStrike 报告里攻击者用的，本机跑不动）
- **HTTP 500/503**：`nemotron-3-ultra-550b-a55b`、`poolside/laguna-xs-2.1`

---

## 二、两轮对比：同一套代码，只换模型

| 指标 | kimi-k3（上轮） | nemotron-3.5-lightning（本轮） |
|---|---|---|
| 单次 LLM 延迟 | **176 秒** | **平均 6.7 秒**（最长 41.8s） |
| LLM 总调用 | 8 次 | **224 次** |
| 确认事实 | 2 个 fact，0 个 confirmed | **19 个 confirmed** |
| 探索图边 | 少量 | yields 19 / derived_from 6 / proves 1 / spawns 1 |
| 结束方式 | `exhausted`（超时打断） | **`goal met` + `status=done`** |
| 确认漏洞 | 1 个 LFI（人工升级） | **7+ 个 agent 自认** |

**差距不是 20 倍，是质变**——上轮第一轮侦察做完就被 20 分钟时限掐断；这轮 25 轮跑完并自主判定目标达成。

---

## 三、Agent 实测确认的漏洞（全部 `observed` 级）

| # | 漏洞 | 位置 | 载荷 |
|---|---|---|---|
| 1 | SQL 注入 | `showthread.asp?id` | `id=0+OR+1%3D1` → 200，返回额外帖子 |
| 2 | SQL 注入 | `showforum.asp?id` | 同上 |
| 3 | SQL 注入 | `login.asp?username` | `admin' OR 1=1` → 登录绕过 |
| 4 | **反射 XSS** | `search.asp?q` | `<script>alert(1)</script>` 原样回显 |
| 5 | SQL 注入 | `testaspnet ReadNews.aspx?id` | `id=0+OR+1%3D1` |
| 6 | SQL 注入 | `register.asp?username` | `admin' OR 1=1` |
| 7 | 指纹泄露 | 全站 | `Server: Microsoft-IIS/8.5`、`X-Powered-By: ASP.NET` |
| 8 | 目录遍历（疑似） | `testaspnet ReadNews.aspx?id` | `..%2f` / `..%5c` / `..%2fboot.ini` 均 200 |

每条都有 agent 自己写的 `detail` + `evidence` + `confidence` 三段式，可复现。

**值得注意的诚实标注**：`testasp.vulnweb.com` 上目录遍历未复现，它标成 `confidence: inferred` 并写下"站点声称有遍历漏洞，但可能走未测试的向量"——没有为了凑数把疑似说成确认。

---

## 四、路上排掉的两个新坑

### 坑 1：`TRUNCATE ... CASCADE` 会连带清空 `agents`

我写重置脚本时用动态 DO 块清空除白名单外的表，结果 `agents` 变 0 行。

**根因**：`agents.current_prompt_id` 外键指向 `agent_prompts`，而 `agent_prompts` 不在白名单被清 → TRUNCATE CASCADE 顺着外键把 `agents` 也清空了。**CASCADE 清的是"引用被清表的表"，方向和外键直觉相反。**

**修复**：不用手工恢复，直接启动 ARTEX —— 服务启动时跑 migrations 会 `ensure` builtin agents/prompts，自动恢复到 8 个。但 `run_seconds` 会回到默认 1200，需重新调大。

### 坑 2：`max_tokens` 不是根因（推翻了上一个假设）

我上一轮怀疑"ARTEX 传的 max_tokens 太小导致 reasoning 模型打满输出"。查证后**这个假设是错的**：

- ARTEX 主循环**根本不设** `MaxTokens`（`llm.CompletionRequest.MaxTokens` 默认 0）
- normа 的 openai.go 里是 `json:"max_tokens,omitempty"` → 值为 0 时**整个字段被省略**
- 即 ARTEX 发请求时不带 max_tokens，由服务端决定

实测对照证实：省略 max_tokens 时 nemotron-lightning 照样 5.6s 出工具调用。

**所以 kimi-k3 慢纯粹是那个模型在 NVIDIA 上排队/自身生成量大**，不是 ARTEX 配置问题。之前我测试脚本传 `max_tokens=400` 导致的 `content=None` 是我自己的测试 artifact，不是 ARTEX 的行为。

---

## 五、当前配置状态

```
模型      nvidia/nemotron-3.5-lightning-30b-a3b
端点      https://integrate.api.nvidia.com/v1
LLM 统计  224 calls / avg 6.7s / max 41.8s / in 8.73M / out 80.9K tokens
任务      id=1  status=done  goal met
run_seconds worker/mainagent/planner/goals = 7200
企业      1=本地靶场 MiniShop(127.0.0.1)  2=Acunetix 官方授权靶场
服务      8787 在线    PG 5433 在线    靶场 8899 在线
```

重启命令见 `start-artex.sh`（模型名已改为 nemotron-lightning）。

---

## 六、一个仍未解决的缺口

**`findings` 表 = 0。**

agent 确认了 19 个 fact，但正式 finding 表是空的。activity 里能看到它自己意识到这件事：

> "No findings recorded yet. Let me check the facts to see what's already been recorded."

然后它去调 `list_findings` 返回 `[]`，接着就被 planner 判定"目标已达成"中断了（`intent stopped`，终态 `aborted_streaming`）。

**含义**：ARTEX 的"确认漏洞"落在探索图 fact 上，而要进交付物 `findings` 需要显式 `report_finding` 工具调用。这个模型在 224 轮里一次都没调。要么是它不熟悉这个工具，要么是 prompt 没强调。

**影响**：从数据库读探索图能拿到全部 7 个漏洞和证据，但 UI 的漏洞报告页会是空的。想补的话，重建任务时在描述里加一句"每个确认漏洞必须调用 report_finding 写入 findings 表"。

---

## 七、证据与文件

| 文件 | 内容 |
|---|---|
| `vuln-range/probe_models.py` | 首轮 25 个模型批量探测 |
| `vuln-range/probe_rest.py` | 剩余 18 个补测 |
| `vuln-range/probe_quality.py` | 稳定性 + 真实渗透场景 |
| `vuln-range/probe_maxtokens.py` | max_tokens 根因验证（已排除） |
| `vuln-range/probe_omit.py` | 模拟 ARTEX 真实请求形态（决定性） |
| `vuln-range/extract_evidence.py` | 证据提取脚本 |
| `vuln-range/evidence.json` | 19 个 fact 完整 payload + 全部 tool_result |
| `vuln-range/reset_all.sql` | 重置脚本（含 agents 级联坑注释） |

> 提醒：靶场是 Acunetix 官方声明 deliberately vulnerable 的站点，故可测。其他目标请确认授权。
