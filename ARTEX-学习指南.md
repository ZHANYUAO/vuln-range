# ARTEX 源码学习指南

> 代码来源：`Hinln/ARTEX`（上游 `Autumn-27/ARTEX` v0.3.15 的完整历史备份，AGPL-3.0）
> 本地路径：`C:/Users/yuao/WorkBuddy/2026-10-10-17-02-37/ARTEX`
> HEAD：`f3e3f54` · 458 次提交 · 328 个 Go 文件 · 63,242 行非测试代码

---

## 0. 先说清楚背景

ARTEX 是 2026 年 7 月开源、**由 LLM 驱动的自主渗透测试系统**：给它一个授权范围内的目标，它自己侦察、找漏洞、规划攻击路径、验证结果。它本身不是模型，而是把 DeepSeek / Claude / GLM 等外部大模型当"大脑"接进来的编排层。

2026 年 9 月底—10 月初，韩国多家金融机构（新韩、KB国民、韩亚、BNK釜山等）被攻破，约 6.8 万人信息泄露。CrowdStrike 报告称攻击者使用了 ARTEX + Claude Code。**10 月 8 日作者宣布闭源，官方仓库已删除（实测 404）。**

这份代码的学习价值在于**架构**，不在于"能不能打"：它把一个长程自主 agent 最难的几件事——上下文膨胀、任务分解、证据可追溯、人工可控——都做了工程化回答。

> ### 使用边界（务必）
> 只在**你自己拥有或拿到书面授权**的资产上运行。代码里 `permission.ModeBypass`、`kill_work`、`intercept` 审批等机制都是为授权场景设计的。
> 对未授权目标使用，在中国适用《刑法》285/286 条（非法侵入计算机信息系统罪、破坏计算机信息系统罪）。
> 建议在本地靶场（如 OWASP Juice Shop、DVWA、HackTheBox）上练。

---

## 1. 代码地图

按 Go 文件数排的目录职责，括号内是文件数：

| 目录 | 职责 | 建议先看 |
|---|---|---|
| `server/` (55) | HTTP API、任务调度、WebSocket 推送 | 服务入口与任务生命周期 |
| `db/` (49) | PostgreSQL 持久层，**双图就落在这里** | `db/constants.go` 看节点/边类型枚举 |
| `agent/` (28) | **核心**：planner / worker / 工具集 / 冷摘要 | `planner.go` → `mainagent.go` → `coldgraph.go` |
| `notify/` (15) | 通知渠道（webhook 等） | 略 |
| `sidequestion/` (4) | 侧向提问：agent 主动向人提问 | 有意思，见 §5 |
| `selfupdate/` (4) | 一键更新：校验 SHA256 → 冒烟测试 → 换装，失败回滚 | 工程范本 |
| `intercept/` (4) | 工具调用审批拦截（human-in-the-loop） | §4 |
| `traffic/` (3) | 流量记录代理（MITM，留痕 + 重签证书） | §4 |
| `report/` (2) | 报告生成 | 略 |
| `llmrec/` `llmpool/` (2+2) | LLM 调用留痕 / 多模型池与 failover | 略 |
| `guard/` `evidence/` `enrich/` `mcphttp/` | 护栏 / 证据固化 / 富化 / MCP over HTTP | 按需 |

技术栈：Go 后端 + Next.js 前端（`web/`）+ PostgreSQL。单二进制发布（Linux amd64/arm64、macOS、Windows），前端可 embed 进 Go 二进制（`-tags embedui`）。

---

## 2. 核心：双图架构

这是 ARTEX 最值得学的部分。**两张图各管一件事，通过 `exploration_anchors` 关联。**

### 资产图（Asset Graph）— 全局共享，回答"目标长什么样"
落库表：`assets`、`asset_intercept_rules`、`task_asset_links`
内容：域名 → 子域 → 端口 → 服务 → 应用 → 端点 的层级关系。
跨任务持久，所有 agent 共享，用于算"覆盖度"（哪些资产还没测过）。

### 探索图（Exploration Graph）— 单任务内，回答"这个结论怎么来的"
落库表：`explorations`、`exploration_nodes`、`exploration_edges`、`exploration_anchors`

- **节点 kind**：`goal`（目标）/ `intent`（意图）/ `fact`（事实）/ `finding`（漏洞发现）
- **边 rel**：`yields`（intent→fact）、`derived_from` / `spawns`（parent→child）
- **边方向统一约定**（代码注释明确写了）：`From` = 父/上游，`To` = 子/下游。**所有**关系都是这个方向——所以"下游"永远沿着 From→To 走。这个一致性让可达性计算不用特判。

为什么值得学：每个 finding 都能沿边回溯到是哪条 intent、哪个 fact 推出来的。**证据链可审计**，这是"AI 说有漏洞"和"可交付的漏洞报告"之间的分水岭。

`exploration_anchors` 把意图/事实/漏洞**锚定到具体资产**，是两图的接缝。

---

## 3. planner-worker 循环

```
Planner ──► Frontier（意图队列）──► Worker ×N ──► 真实工具执行
   ▲                                                    │
   └──────────── 写回两图，图变更事件唤醒 planner ◄────────┘
```

- **Planner**（`agent/planner.go`，473 行）：读探索图态势，**只在存在未覆盖的新方向时**才把 intent 推进 frontier。持有一份跨唤醒共享的 todolist，按依赖多轮推进多步利用链。
- **Worker**：领一条 intent，用真实工具执行，把新资产/事实/漏洞写回两图后即停。
- **事件驱动**：图一变就唤醒 planner，不是轮询。
- Worker 之间可跨 work 检索执行过程（`search_all_worker_traces` / `get_worker_trace`）。

agent 能力由 `norma` SDK 提供（agentcore / tool / permission / harness / memory / transcript）。

---

## 4. 工程亮点（这几处最值得抄）

### 4.1 冷摘要 coldgraph —— 长程 agent 的上下文治理
`agent/coldgraph.go`（330 行）。跑久了探索图会膨胀到塞不进上下文，ARTEX 的解法：

- **参数**：`R=6`（节点须连续 6 个 planner 轮不活跃才判"冷"，防抖）、`K=2`（最小折叠块，跳过退化单点）
- **纯图算法，零 DB / LLM 依赖** → 可独立单测（作者明确写了这个设计意图）
- **派生视图隔离**：构造时过滤掉 `kind=digest` 节点和 `rel=covers` 边，防止摘要自身污染因果可达性和分组
- union-find 做连通性分组；`blockSignature` 用 sha256 去重，避免重复折叠
- "同父单例拯救"（§3.1）：处理同父下的孤立节点
- **异步**：同步部分只有几次查询，LLM 压缩跑在 detached goroutine，**不增加本轮规划延迟**

这一套解决的是所有长程 agent 都会撞上的墙，参考价值超出安全领域。

### 4.2 Prompt 布局的显式权衡
`planner.go` 注释里写得很直白：静态规划正文放 `system`（每轮稳定，**利于 KV cache 命中**），动态态势（刚完成的意图 + 完整图概览）放本轮 user 输入。代价也写明了：单轮变长时态势可能被压缩，但 planner 单轮通常短，风险低。

这种"把 trade-off 写进注释"的习惯本身就值得学。

### 4.3 终局收尾
任务 deadline 到了，不是硬杀，而是把 `MaxDuration` 夹逼到剩余时间，并在最后一轮注入【任务终局收尾】特殊指令——**让 planner 只做目标判定、不再产新意图**，体面收尾。

### 4.4 可控性三件套
- `intercept`：工具调用审批拦截，全局审批记录 + 聊天内审批卡片可展开完整调用详情
- `traffic`：MITM 流量代理留痕，agent 的 WebFetch 走代理并载入代理 CA 验证重签证书
- `permission.ModeBypass` 只在 planner 侧开，工具侧收口

### 4.5 工具集按需裁剪
覆盖度功能关闭时，`add_task_scope` / `list_untested_assets` **直接从工具列表剔除、不入 prompt**——减少无效工具对模型的干扰。

---

## 5. 还有个有意思的：`sidequestion`
agent 卡住时可以**主动向人提问**（`side_question_requests` / `side_question_sessions` 表）。把"求助人类"做成系统能力而非异常分支，这是 agent 产品化经常被忽略的一环。

---

## 6. 建议阅读路线

1. `README.md` → `CHANGELOG.md`（76KB，能看到架构演进的取舍过程）
2. `db/constants.go` —— 先把节点/边/资产的类型枚举搞清楚，后面全靠它
3. `agent/planner.go` —— `Plan()` 从 355 行起，读它怎么组装 system/user、怎么处理 deadline
4. `agent/coldgraph.go` —— 只读算法，最干净，也最有普适价值
5. `agent/mainagent.go`（202 行）—— worker 侧
6. `agent/tools.go` + `agent/tools_digest.go` —— 工具集与摘要工具
7. `db/` 下 exploration 相关 —— 看双图怎么落库
8. `intercept/` `traffic/` —— human-in-the-loop 与留痕

配套测试很多（`blackboard_inheritance_test.go`、`coldgraph_test.go` 等），读测试是理解设计意图的捷径。

---

## 7. 跑起来（本地靶场）

五种部署方式，最省事的是 Docker Compose：

```bash
cd ARTEX
cp .env.example .env      # 填 POSTGRES_PASSWORD，可选 ANTHROPIC_API_KEY
docker compose up -d      # 页面 http://localhost:8787
```

官方镜像 `autumn27/artex` 已含 nmap / ripgrep / curl / npm。也可 `./install.sh` 一键（会检测安装 Docker），或用 Releases 的预编译二进制 + `start.sh`（Windows 用 `start.bat`）。

**注意**：`install.sh` 会在未检测到 Docker 时执行 `curl -fsSL https://get.docker.com | sh`（Docker 官方安装脚本，已核验，非夹带）。

---

## 8. 其他镜像（供对照）

| 仓库 | 星 | 说明 |
|---|---|---|
| `Hinln/ARTEX` | 476 | **本指南用的**：保留原始提交历史，v0.3.15，改动最小 |
| `mhtsec/ARTEX` | 2629 | 活跃维护，改了 Docker 多阶段构建、换了自己的镜像源和在线 Demo |
| `sharenjun/ARTEX-main` | 101 | 声明会持续维护 |
| `jiwoochris/artex-ko` | 895 | 韩语本地化 |
| `cskwork/scopeweaver` | 319 | 英/韩本地化 |
| `enwjx/artex-ymh` | 176 | 二开，主打外网突破→内网纵深 |

学原始架构用 `Hinln/ARTEX`（本份）；想省事跑起来可以试 `mhtsec/ARTEX`，但它引入了第三方域名（镜像源、在线 Demo），注意甄别。

**本次已做的安全核验**：全库扫描 `curl|sh` / `wget|sh` / `eval $()` / `base64 -d` / `/dev/tcp` / `nc -e` 与硬编码外部 IP。命中仅两处且均为良性——`install.sh:22` 安装 Docker 的官方脚本，`web/src/lib/mock/data.ts` 里一条 mock 教学样例命令；硬编码 IP 全在 `agent/insert_assets_test.go` 测试 fixture 中。**该备份无夹带。**
