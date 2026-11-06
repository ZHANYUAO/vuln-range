# 本地统一 LLM 网关：搭建与验证记录

> 日期：2026-10-23（实测）
> 结论一句话：**网关已搭好并跑通，ARTEX 已切到网关并真跑出 high 级 finding；strix/shannon/pentagi 的配置位已就位，只差 Docker 这道墙。**

---

## 一、为什么做这个，而不是直接部署三个项目

上一轮判定：三个项目（strix / shannon / pentagi）**都要 Docker**，而本机 Docker 未装、WSL 被沙箱黑名单拦。
所以「部署三个项目」当前不可执行；但**它们都支持自定义 OpenAI 兼容端点**这件事是确定的。

于是把可独立交付的部分先落地：**一个本地 OpenAI 兼容网关**，上游接现有 NVIDIA key。
它不依赖 Docker、不依赖新账号，且现在就能验证。Docker 拆掉后，三个项目只需改一行 `base_url` 指过来。

```
ARTEX ─┐
strix ─┼─→ http://127.0.0.1:8790/v1  (网关) ─直连→ https://integrate.api.nvidia.com/v1
shannon┤      · 流式 / 非流式都支持
pentagi┘      · 强制不走系统代理
              · 上游凭据只在网关一处
```

---

## 二、产出文件（都在 `vuln-range/`）

| 文件 | 作用 |
|---|---|
| `llm_gateway.py` | 网关本体，纯标准库，无第三方依赖 |
| `start_gateway.sh` | 启动脚本（清代理变量、读 `.nvidia_key`、常驻 8790） |
| `.nvidia_key` | 上游凭据（一行；从已有脚本提取，不进对话） |
| `verify_gateway.py` | 网关 5 项自检 |
| `probe_available_models.py` / `probe_capability.py` | 上游模型可用性 + 能力把关 |
| `artex_gateway_e2e.py` | ARTEX 切网关 + 连接测试 |
| `artex_e2e_task.py` / `artex_e2e_task2.py` | ARTEX 真跑任务（本地靶场 8899） |

启动：`bash start_gateway.sh`（后台常驻）｜自检：`python verify_gateway.py`

---

## 三、实测结果（逐项，可复现）

### 1. 网关 5 项自检 —— 5/5 PASS

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| 1 | `/health` | PASS | `{"ok":true,"upstream":"https://integrate.api.nvidia.com/v1","model":"nvidia/nemotron-3-ultra-550b-a55b"}` |
| 2 | `/v1/models` | PASS | 返回 84 个模型 |
| 3 | **非流式** completion | PASS | 2.4s，`content='GATEWAY_OK'`，usage `62 tokens` |
| 4 | 流式 SSE 透传 | PASS | `Content-Type: text/event-stream`，12 帧，含 `[DONE]`，拼出 `1\n2\n3\n4\n5` |
| 5 | model 透传 | PASS | 回包 `model='nvidia/nemotron-3-ultra-550b-a55b'` |

第 3 项是关键：cloud-service 那条路走不通的核心原因就是「只支持流式」，网关把这条补齐了。

### 2. 🔴 上游模型可用性发生变更（这条影响 ARTEX 既有配置）

逐个实测 35 个候选模型（`/v1/models` 列表 **不等于** 已授权）：

| 模型 | 结果 |
|---|---|
| `nvidia/nemotron-3-super-120b-a12b`（**ARTEX 原用**） | ❌ HTTP 404 `Function ... Not found for account` |
| `nvidia/nemotron-3-nano-30b-a3b` | ❌ HTTP 410 已 EOL（2026-09-01） |
| `nvidia/nemotron-3.5-lightning-30b-a3b` | ❌ content 恒 null（纯推理模型） |
| `nvidia/nemotron-3.5-super-vl-120b-a12b` | ⚠️ 工具调用/流式可用，但**长输出 content 为空**（len=0） |
| **`nvidia/nemotron-3-ultra-550b-a55b`** | ✅ 长输出 290 字符、tool_calling 正常、流式正常 |

→ 已把网关默认模型改为 `nvidia/nemotron-3-ultra-550b-a55b`。
→ **ARTEX 里那条直连 NVIDIA + super 模型的旧配置，现在是坏的**（改配置前读到的正是它）。

### 3. ARTEX 接网关 —— 端到端 PASS

| 步骤 | 结果 |
|---|---|
| 读改前配置 | `base_url=https://integrate.api.nvidia.com/v1`，`model=nemotron-3-super-120b-a12b`（已失效） |
| `POST /api/llm/test` 流式 | HTTP 200 `{"ok":true,"latency_ms":5162,"reply":"OK"}` |
| `POST /api/llm/test` 非流式 | HTTP 200 `{"ok":true,"latency_ms":4747,"reply":"OK"}` |
| 落库 + 回读 | `base_url=http://127.0.0.1:8790/v1`，`model=...ultra-550b-a55b` ✅ |

### 4. 真跑任务（目标＝本机自建靶场 8899，自有资产）

**任务 11**：只给一个 payload `alice' OR '1'='1`
- ARTEX 跑了 6 轮 / 2m1s，planner + work#1，产出 **finding #50：`severity=low`，结论"未复现"**。
- 网关日志佐证真实调用：21:23:17 起连续请求，`msgs` 3→14，单次最大 110.4s / 39960 bytes。

**我手工独立复核（不信它的结论）**：

| q | 返回行数 | 抽到的 username |
|---|---|---|
| `alice` | 2（含表头） | alice |
| `alice' OR '1'='1` | 2 | alice ← **与 ARTEX 结论一致，它没编造** |
| `x' OR '1'='1' --` | 4 | admin、alice |
| `%' OR '1'='1' --` | 4 | admin、alice |

→ 两件事同时成立：**ARTEX 的结论诚实**（同一 payload 确实无效），**但它的 payload 构造不充分**——
它用「一个 payload 没生效」就下了「不存在注入」的整体结论。这是能力缺陷，不是幻觉。

**任务 12**：给它正确闭合方式的 payload（`x' OR '1'='1' --` / `%' OR '1'='1' --`）
→ 产出 **finding #51：`severity=high`，SQL Injection**，evidence 与我的手工实测一致（多出 admin/bob）。

---

## 四、四个工具的接入配置

| 工具 | 配置项 | 状态 |
|---|---|---|
| **ARTEX** | UI/API：`provider=openai`、`base_url=http://127.0.0.1:8790/v1`、`model=nvidia/nemotron-3-ultra-550b-a55b`、`api_key=任意非空` | ✅ **已实测跑通** |
| strix | `LLM_API_BASE=http://127.0.0.1:8790/v1`、`LLM_API_KEY=任意非空`、`STRIX_LLM=openai/nvidia/nemotron-3-ultra-550b-a55b` | ⚠️ 配置位已定，**待 Docker 后实测** |
| shannon | 自定义 provider 的 base URL 填同上（README："reachable through a custom base URL"） | ⚠️ 同上 |
| pentagi | Custom LLM Provider 章节：OpenAI-compatible gateway 填同上 | ⚠️ 同上 |

后三者的字段依据来自各自的 README（上一轮已抓），但**没有本机实测**——因为 Docker 缺失。不假装验过。

---

## 五、没覆盖 / 不确定的（别当结论）

1. **strix / shannon / pentagi 实际接网关后的行为未验证** —— 尤其 strix 底层是 LiteLLM，
   它对 `/v1/models` 的字段要求和重试语义可能与 ARTEX 不同，需真跑才知道。
2. **ultra-550b 在长上下文（ARTEX 默认 200K）下的表现未测** —— 网关测试用的都是短 prompt。
   真跑大任务时若出现截断/超时，第一个该查的是这里。
3. **上游限流** —— 探测时遇到过 `503 ResourceExhausted (303/16)`，是上游本地 worker 配额。
   网关目前**不做**排队/退避，多工具并发打可能撞上。
4. **网关无认证** —— 只监听 `127.0.0.1`，靠本机边界。若哪天要暴露到局域网，必须先加校验。

---

## 六、复现命令

```bash
cd vuln-range
bash start_gateway.sh                                   # 后台常驻 :8790
python verify_gateway.py                                # 期望 5/5
python artex_gateway_e2e.py                             # ARTEX 切网关 + 连接测试
```

端口注意：**8788 在本机属 Windows 保留端口段**（bind 报 WinError 10013），故用 8790。
