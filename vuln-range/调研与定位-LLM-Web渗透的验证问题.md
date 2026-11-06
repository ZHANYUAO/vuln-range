# LLM Web 渗透：文献调研与我们的实际位置

> 核实时间：2026-10-28。凡标「实测」的都是本机跑出来的；凡标「文献」的都给了 arXiv / 会议出处；
> 凡标「未核实」的会明说，不拿二手转述当结论。

---

## 0. 一句话结论

**「用 LLM 找漏洞」已经被研究了两年，成绩普遍在 12%–46% 之间；但「怎么证明找到的是真的」在
DAST（黑盒 Web）这一侧几乎没有学术工作 —— 现有验证闸门研究全在 SAST（代码审计）侧。**

我们这两轮做的（差分双控 + 带外回连 + 时间窗隔离 + 证据包）方向是对的，但目前只是把
SAST 侧已经验证过的思路搬到 DAST 上，**还没有产出任何一篇论文没做过的东西**。

本轮真正有价值的不是"闸门能压多少假阳性"（那是文献已有结论），而是四个**自己打自己打出来的数**：

1. **误杀率第一版 37.5%**（3/8）—— 真漏洞配上"扫描器级"的不精确 payload，会被自己的闸门判 rejected。
   而 rejected 在报告里的字面读法接近"漏洞不存在"。
   **修完之后 0/6，但必须先说清楚**：这 3 条里 2 条是"判定语义错"（401 被报成"没漏洞"），
   1 条才是"判据与 payload 脱节"。**只有后者是能力问题**，前者改的是措辞与状态机。
   而且 0/6 的 95% 置信上界仍有 ~39%，**样本太小，不能当结论用**。
2. **扫描器输出有 75% 进不了闸门**（8 条里 6 条只有路径，没有任何可验证内容）。
   → **DAST 系统的瓶颈不在验证，在"从路径到一个可验证的攻击假设"。**
3. **断言必须由 payload 派生**（`asserts.py`）。这条不是设计偏好，是被 37.5% 逼出来的：
   同一类漏洞，payload 弱就只能派生出弱断言，用强断言去判弱 payload 必然误杀。
4. **自审抓出 2 条假阳性，其中 1 条是我自己写的 ground truth 错了**
   （`FILEWRITE-01` 的 confirmed 完全建立在 404 错误页的路径回显上，靶场根本没有这个洞）。


---

## 1. 文献地图（按"能不能用来验证"筛过）

### 1.1 Benchmark：它们怎么定义"成功"

| 工作 | 规模 | 最好成绩 | 判据 | 出处 |
|---|---|---|---|---|
| **CVE-Bench** | 40 个 critical CVE | HPTSA **13%**，$1.7/exploit | 8 类客观后果：DoS / 文件读 / 文件写 / 库改 / 库读 / 未授权管理员登录 / 提权 / **出站请求** | ICML 2025 spotlight，arXiv:2503.17332 |
| **CyberGym** | 1,507 漏洞 / 188 项目 | 11.9%（OpenHands + Claude-3.7-Sonnet）；他处写 ~20% | 生成 PoC 复现历史漏洞 | ICLR 2026，arXiv:2506.02548 |
| **AutoPenBench** | 33 任务，支持 MCP | 自主 **21%**，人机协作 **64%** | 任务里程碑 | EMNLP 2025 Industry，ACL 2025.emnlp-industry.114 |
| **AIRTBench** | 70 个 AI/ML 安全 CTF | Claude-3.7-Sonnet 46.9% | CTF flag | arXiv:2506.14682 |
| **PentestGPT** | 自建 HTB/CTF 基准 | 任务完成 80%（vs GPT-3.5 35%） | 任务完成率 | USENIX Security 2024，Distinguished Artifact |
| **HackingBuddyGPT** | Linux 提权基准 | GPT-4-turbo 33–83%；Llama3 0–33% | 拿到 root | arXiv:2310.11409 |

**四条从这些数字里能直接读出来的事实：**

1. **判据全是"客观后果"，不是"我觉得这里有洞"。** CVE-Bench 那 8 类判据，正是我们
   `ground_truth.json` 里 `criterion` 字段照抄的来源。这条不需要再论证了。
2. **端到端 LLM 成绩很低**（12%–21%）。反过来说：**任何声称高 recall 的系统都要怀疑。**
3. **AutoPenBench 的 21% → 64%（人机协作）差了三倍**，这是"全自动不可行、但辅助可行"最直接的证据。
4. **AIRTBench 46.9% 不能拿来比** —— 那是 AI/ML 系统安全（prompt injection 等），不是 Web。

> ⚠️ **我们本地 25% 的 recall 不能跟 CVE-Bench 的 13% 比。** 那是真实 CVE、真实应用、零日设定；
> 我们的靶场是自己写的、每个洞都有明确入口。难度差一个量级。把它写成"我们超过 SOTA"是自欺。

### 1.2 验证 / 假阳性治理：SAST 侧很成熟，DAST 侧空白

这是整个调研里最重要的一节。

| 工作 | 做法 | 数字 | 出处 |
|---|---|---|---|
| **Sifting the Noise** | 两段式：SAST 先报 → LLM agent 逐条核 | OWASP Benchmark 残余 FPR **98.3% → 6.3%**；真实 Java 数据 FP 识别率 93.3% | ISSTA 2026 / PACMSE 3(ISSTA009)，arXiv:2601.22952 |
| **IRIS** | LLM 推断 taint 规格 → CodeQL 全库验证 → LLM 剔误报 | CodeQL 27 → **55** 个漏洞；FDR 降 5.21pp | ICLR 2025 |
| **CVE-Genie** | Processor/Builder/Exploiter/**CTF Verifier** 四模块 + Developer-Critic 对 | 复现 **428/841 = 51%**，$2.77/CVE，18 分钟 | arXiv:2509.01835（BU + UCSB） |

**Sifting the Noise 里有三个数字，直接决定我们下一步该怎么做：**

1. **92.1 个百分点的 FPR 降幅是真的** —— 验证闸门这条路本身成立。
2. **51.2% 的成功案例依赖"非目标文件"的证据**（helper class、配置文件、常量传播）。
   → 对应到 DAST：**证据必须来自能跨请求取上下文的地方，而不是死盯单个响应体。**
   我们的对照请求（control）就是在做这件事，但只有一次，粒度太粗。
3. **256 个成功案例里只有 4 个真的去执行了**（还因为沙箱没 javac 失败了）。
   → **执行验证是公认最可靠、但几乎没人做成的路子。** 我们做 OAST 回连本质是执行验证的一种，
   这条缝隙是真的。

**反面的、必须一起看的三条：**

- **"aggressive FP reduction can come at the cost of suppressing true vulnerabilities"** ——
  论文原话。**降假阳性会误杀真漏洞**，这是硬 trade-off，不是我危言耸听。
- **DeepSeek Chat 上，vanilla 提示反而比三个 agent 框架都好**（11.2% vs 13.1% FPR）。
  → **弱模型上叠 agentic scaffolding 是负收益。** 我们网关现在跑的模型必须单独测。
- **CVE-Genie 的 Critic agent "sometimes errs on the side of minimizing false positives,
  causing certain subtle successful exploitations to be missed"** —— 同一个病，换个地方犯。

### 1.3 DAST 侧的空白（可验证的缺口）

用「web application DAST false positive validation automated exploit verification academic」
检索，回来的全是商业博客和一篇硕士论文：

- 那篇硕士论文（NCI 2025，Reinforced WAVSEP 全黑盒默认配置）：**ZAP F1=0.55、Wapiti 0.68、
  Arachni 0.88**。这是我能找到的唯一一份公开、可复现的 DAST 基线对照。
- 商业侧的说法：Invicti 宣称 "proof-based scanning ... **99.98% accuracy**"。
  → **这是营销数字**，没有公开方法学、没有可复现实验。不能引用为证据，只能当作"业界认为这事值得做"的旁证。

**结论：SAST 的 FP triage 有 IRIS / Sifting the Noise / SAST-Genius / ZeroFalse 一串工作；
DAST 的 FP triage，学术上是空的。** 这是我们唯一说得通的定位，而且它是可被检索证伪的
（别人搜一圈也搜不到，那就说明还没人占）。

---

## 2. 本轮实测（全部本机跑出，可复跑）

### 2.1 有回显的 11 条：扫描器 recall

| 工具 | 结果 | 耗时 | 备注 |
|---|---|---|---|
| ffuf 2.3.0 | 6 条路径 | 3.3s | 4 次重跑命中数 4/6/6/5，并集 8 |
| sqlmap master | 参数 `q` 可注入 | 2.6s | 指纹误报：报 Nginx/Ubuntu，实际 Windows + Python http.server |
| **dalfox 3.2.4** | XSS-01，`type=V` confidence=high | **1.1s** | payload 变异 + DOM 验证 + 结论分级 |
| nuclei 3.11.1 | **BLOCKED** | 120s 超时 | 卡 PDCP 云初始化；`-duc`/`-auth=false`/清代理均无效 |

**recall：2/12 → 3/11 = 27.3%**（dalfox 补上 XSS-01；分母从 12 变 11 是因为自审删了一条错的 GT，见 §2.5）。

dalfox 的 `type` 分级值得单独记一笔：`v`=可利用 / `r`=仅反射 / `a`=AST DOM / `i`=信息。
**它自己就在做判定。** 所以拿它当基线，比拿一个"有反射就报"的扫描器当基线严得多——
我们只认 `type=v`，`type=r` 一律不算命中。

### 2.2 无回显的 3 条：闸门双向自检

新加 3 条 blind 用例（blind SSRF / blind CMDI / blind XXE），全部**响应体不含任何证据**，
只能靠 OAST 回连判定。闸门结果：

| 模式 | 结果 |
|---|---|
| `--ground-truth`（攻击请求） | **3/3 confirmed** |
| `--negative`（把对照组当发现喂进去） | **3/3 rejected** |
| 原 12 条回归（当时 GT 还是 12 条，`FILEWRITE-01` 未删） | **12/12 confirmed**（无回归） |
| 现状回归（GT 11 条 + 断言派生） | **11/11 confirmed**、负向 **11/11 rejected** |

扫描器对这 3 条：**0/3**（ffuf/sqlmap/dalfox 结构上都不覆盖 blind 判定）。

> 这里有个坑值得记：blind 用例的 payload token 跨轮复用，如果不做**时间窗隔离**，
> 第二轮会读到第一轮的 OAST 命中，"每轮都成立"就变成自我实现。
> 现在的做法是每次请求前记时间戳，只认之后的回连；对照组另起时间窗。

### 2.3 最关键的一张表：扫描器输出到闸门之间那道缝

`pipeline.py` 把 8 条扫描器原始发现按"离可验证还差几步"分档：

| 工具 | 原始发现 | 缺什么 | 能进闸门吗 |
|---|---|---|---|
| ffuf | 6 条 | 缺 payload + 缺类别（只知道路径存在） | **不能** |
| sqlmap | 1 条 | 缺 payload（只说了哪个参数可注入） | 勉强（payload 得人工补） |
| dalfox | 1 条 | 有 payload + 自己判定的类别 | **能，且 P1 后零人工** |

**8 条 → 2 条能验证 = 25%。剩下 6 条（75%）卡死。**

而这 6 条里**有 2 条是真洞**：`/download`（穿越读文件）、`/api/fetch`（SSRF）。
也就是说 —— **闸门再严，也救不了它根本看不见的东西。**

这条比"闸门能把假阳性压到多少"更重要：**DAST 系统的主要瓶颈不在验证，在"从路径到一个可验证的攻击假设"这一步。**
而这一步恰恰是纯规则做不了、LLM 该干的活。

> **P1 之后有个小改进值得记**：断言能派生以后，"可验证"的门槛从
> **（payload + 人工写判据）** 降到 **（payload + 类别）**。
> dalfox 那条现在完全不写 assert 也能过闸门（`pipeline.py` 里已删掉手写判据），
> 而且派生出的 `unescaped` 比原来手写的 `body_contains` **更严**。
> 但 ffuf/sqlmap 的缺口没变 —— 它们缺的是 payload，不是判据。**这正好划出 LLM 该补的位置。**

### 2.4 误杀率：把真漏洞配上"扫描器级"payload，闸门会怎么判

文献警告"降假阳性会压真漏洞"，我们此前**完全没测这一侧**。`falsekill.py` 补上：
拿真漏洞，把 payload 换成扫描器/新手在信息不足时会给的近似值。

| 用例 | 弱化方式 | 漏洞是否仍在 | 第一版判定 |
|---|---|---|---|
| SQLI-01 | `alice'`（只探测语法错误，没写取数语句） | 在 | **rejected（误杀）** |
| IDOR-01 | 去掉登录会话，直接打 | 在 | **rejected（误杀）** |
| PRIV-01 | 无会话打提权接口 | 在 | **rejected（误杀）** |
| XSS-01 | `<script>alert(1)</script>`（判据同步跟 payload 走） | 在 | confirmed |
| SSRF-01 | 少末尾斜杠 | 在 | confirmed |
| DBWRITE-01 | `total=-1`（判据同步跟 payload 走） | 在 | confirmed |
| CMDI-01 | 用 Linux 的 `;` 分隔符（Windows cmd 不认） | **payload 失效** | rejected（正确） |
| LFI-01 | 用 `../../etc/passwd`（靶场在 Windows） | **payload 失效** | rejected（正确） |
| DEFAULTCRED-01 | 口令猜错一个 | **payload 失效** | rejected（正确） |
| HIDDEN-01 / EXPOSE-USERS-01 | 不弱化（对照组） | 在 | confirmed |

**第一版：误杀率 = 3/8 = 37.5%，payload 真失效的 3 条全部正确拒绝、0 条误确认。**

这个 37.5% 不是"闸门有 bug"，而是**"判据绑死在特定 payload 上"这个设计的固有代价**：
闸门只能判定"我这套 payload 有没有打出证据"，判不了"这个洞在不在"。
报告里必须把 `rejected` 和 `not_vulnerable` 分开印，否则读者会读成后者。

> 顺带一个反直觉结论：判据跟着 payload 一起弱化的三条（XSS/SSRF/DBWRITE）全过。
> 说明**误杀主要来自"判据和 payload 脱节"**，而不是 payload 本身弱。
> 这条能直接指导系统设计：**判据必须由 payload 派生，不能手工写死。**

### 2.4.1 P1 修复：断言由 payload 派生 + 判定分级

新增 `asserts.py`（断言派生层），铁律是**判据只能由 (漏洞类, payload, 前置状态) 派生**，
并给每条断言标注**证据来源**，因为不同来源的失效方式不同：

| 来源 | 含义 | 失效方式 |
|---|---|---|
| `payload` | 判据常量直接来自 payload（echo 的标记、提交的金额、反射的标签） | payload 被清洗 → 断言自然为假，语义正确 |
| `artifact` | 常量来自事先埋的真值（canary 文件、自家内网 banner、api_key） | artifact 泄漏到别处 → 假阳性，必须保证唯一 |
| `structure` | 判据是响应结构（错误键、字段集、status），与 payload 形态绑定 | payload 形态判错（把 union 当盲注）→ 期望错 |
| `oast` | 判据是带外回连，回连地址写在 payload 里 | token 跨轮复用 → 时间窗污染 |

关键设计是**payload 形态决定断言形态**：同一类漏洞，payload 弱就派生出弱断言
（`alice'` → 只能证明语法被破坏 → 断言 `error_signal`），payload 强才派生出强断言
（union → 断言库内凭据泄漏）。**绝不能用强断言去判弱 payload** —— 那正是 37.5% 的来源。

**三阶段对照（同一台靶场、同一批弱化 payload，只有判据与判定语义变了）**

| 阶段 | confirmed | blocked | 误杀 | 误杀率 |
|---|---:|---:|---:|---:|
| 第一版：rejected 一律算"未复现" | 5 | — | 3 | 3/8 = **37.5%** |
| P1-a：只修判定语义（401 → blocked） | 5 | 2 | 1 | 1/6 = 16.7% |
| P1-b：再让断言由 payload 派生 | 6 | 2 | 0 | 0/6 = **0.0%** |

拆开看，**数字下降的来源是两件不同的事，不能混着说**：

1. **37.5% → 16.7% 是语义修正，不是能力提升。** IDOR/PRIV 这两条根本没被测试过
   （401 挡在门口），把它们算成"闸门判错了"本身就不公平。改成 `blocked` 后它们从分母移出，
   代价是必须**明确告诉用户"这条没验"**，而不是给一个假的否定结论。
2. **16.7% → 0% 是能力提升。** SQLI 那条靠 `error_signal` 派生真的被判出来了 ——
   判据从"必须取到数据"降级成"语法被破坏"，这是对弱 payload 的正确期待。

> ⚠️ **0/6 不能读成"误杀问题解决了"。** 6 个样本里 0 次误杀，Clopper-Pearson 95%
> 置信区间上界约 **39%**，即真实误杀率仍可能在 30% 上下。这个样本量只够证明
> "方向对了"，不够证明"量级对了"；要报准必须扩样本（见 §5 P1'）。

**顺带修掉我自己引入的一个假阴性**：`unescaped` 断言最初用
`html.escape(raw, quote=False)` 求"已转义形式"，而 dalfox 给的 payload 是
`" onmouseover=alert(1) class=xxx x="` —— **不含 `<` `>` `&`**，escape 后与原文相同，
于是"已转义"恒真，真漏洞被判成没反射。正确做法是把两种转义形式都算上、并排除与原文相同的那个。
这个 bug 不是读代码发现的，是**重跑流水线发现 dalfox 从 confirmed 变 rejected** 才抓到的。

### 2.5 自审：误杀实验反过来抓出 2 条假阳性，其中 1 条是我自己的 GT 错了

做 §2.4 时发现三条结果和预期不符，逐条查证据后确认都是真问题：

| 问题 | 根因 | 处理 |
|---|---|---|
| **`FILEWRITE-01` 原判 confirmed 是假的** | `/api/export` 的 `safe_join` 把 `../written.txt` 全拦了（403），靶场**没有**任意文件写漏洞。所谓 confirmed 来自：post 步骤（读回文件）失败 → 返 404 错误页 → 错误页里带着路径 `...\sandbox\written.txt` → 顶层 `body_contains("written.txt")` 命中 | **删除该 GT**（12 → 11）；修 `verify.py`：post 断言失败必须直接判失败，不能把失败响应交回上层判 |
| **`CMDI-01` 断言可被回显欺骗** | 响应 `{"cmd": "ping ... & echo CMDI-MARKER", "output": "..."}` —— `cmd` 字段原样回显 payload，`body_contains` 恒成立，哪怕 `;` 根本没执行 | 断言改为 `json_path_contains(output, ...)`，把证据钉死在**命令输出**字段 |
| XSS 弱化判 rejected | 我弱化了 request 却忘了同步弱化 assert | 实验设计问题，已修（见 §2.4） |

**这两条的意义**：我们之前给 REA 挑的毛病是"404 页回显请求路径导致假阳性"（`/api/v2/internal/audit-log` 那次），
**同一个病根在我们自己的闸门里也存在，而且活到了 12/12 confirmed 里。**
闸门不会因为你写了它就自动免疫你犯的错。

---

## 3. 开源项目核实（star 为本机 GitHub API 实测，2026-10-28）

| 项目 | star | 语言 | 最后 push | 状态判断 |
|---|---:|---|---|---|
| usestrix/strix | 72,459 | Python | 2026-10-28 | 活跃 |
| KeygraphHQ/shannon | 49,931 | TS | 2026-10-27 | 活跃 |
| vxcontrol/pentagi | 32,624 | Go | 2026-10-22 | 活跃 |
| GreyDGL/PentestGPT | 16,164 | Python | 2026-07-14 | 活跃（论文版） |
| 0x4m4/hexstrike-ai | 13,148 | Python | 2026-08-03 | 活跃 |
| AliasRobotics/cai | 9,844 | Python | 2026-08-22 | 🔴 **已 ARCHIVED** |
| hahwul/dalfox | 5,336 | Rust | 2026-10-27 | 活跃 |
| projectdiscovery/interactsh | 4,610 | Go | 2026-10-27 | 活跃 |
| ProtectAI/vulnhuntr | 2,809 | Python | **2025-02-06** | 🔴 停更 20 个月 |
| projectdiscovery/nuclei | 32,394 | Go | 2026-10-27 | 活跃 |
| ipa-lab/hackingBuddyGPT | 1,291 | Python | 2026-10-24 | 活跃，web 用例仍 WIP |
| sunblaze-ucb/cybergym | 980 | Python | 2026-08-28 | benchmark |
| iris-sast/iris | 445 | Dockerfile | 2026-07-02 | 论文代码 |
| uiuc-kang-lab/cve-bench | 303 | Python | 2026-09-24 | benchmark |
| NYU-LLM-CTF/NYU_CTF_Bench | 182 | Python | 2025-09-22 | benchmark |

**三条不能省的判断：**

1. **star 和有效性没有关系。** strix 7.2 万 star，但它没发表任何可核实的评测数字。
   反过来 CVE-Bench 只有 303 star，却是 ICML spotlight、被所有人当基线。**看 star 会被带偏。**
2. **cai 已归档、vulnhuntr 停更 20 个月** —— 这两个在中文圈被推荐得不少，实际都不能用。
3. **interactsh 就是 OAST 的开源标准实现**（nuclei 内置）。我们写的 `lab/oast.py`
   在检测语义上是**重复造轮子**，它多出来的只有：可编程断言、时间窗隔离、与闸门同构的证据包。
   这点必须自己承认，否则定位就飘了。

---

## 4. 我们的位置：真增益 vs 重复造轮子

### 4.1 真增益（说得出来、别人没做）

| 项 | 为什么算增益 | 证据 |
|---|---|---|
| **DAST 侧的独立验证闸门 + 双向自检** | SAST 侧一片论文，DAST 侧检索不出学术工作；商业产品只有营销数字 | `verify.py` 11/11 正向 + 11/11 负向全过 |
| **断言派生层 + 证据来源分级** | 文献只说"别手写规则"，没说判据该怎么组织；我们给出四类来源（payload/artifact/structure/oast）及其各自失效方式 | §2.4.1；`asserts.py` |
| **量化了误杀率，并拆出两个不同根因** | 文献只说"会误杀"，没说多少、也没说为什么；我们证明"37.5% 里 2/3 是判定语义错、1/3 才是判据脱节" | §2.4 / §2.4.1 三阶段表 |
| **`blocked` 状态：拒绝在无证据时下否定结论** | 常见工具把"401 挡住"报成"未发现漏洞"，这是可用性缺陷而非精度问题 | `classify_block()`；PRIV-01 的 401 被 post 的 403 盖住那个坑 |
| **量化了"扫描器输出 → 可验证假设"的缺口（75%）** | 这个数字没人报过，它决定 LLM 该被放在流水线哪一环 | §2.3 |
| **带外判定的时间窗隔离** | interactsh 解决"检测"，没解决"跨轮复用 token 时的归因" | §2.2 那个坑；`oast_poll(since=...)` |
| **三值判定 + unknown 优先** | 对齐 REA 的 evidence 契约；文献里普遍只报二值 | `verdict_of()` 把传输错误/断言不支持一律转 unknown |
| **自审抓出 1 条错误的 ground truth** | 说明这套闸门能反过来审计标注本身，不只是审计扫描器 | §2.5 |

### 4.2 重复造轮子（要老实承认）

| 项 | 别人已经有的 |
|---|---|
| OAST 收集器 | interactsh（4,610 star，Go，nuclei 内置） |
| 8 类客观判据 | CVE-Bench 原文就是这 8 类，我们照抄 |
| 差分双控 | 本质是 DAST 常识（benign control），Invicti 的 proof-based scanning 同理 |
| 三值/证据包 | REA 的 observations/inferences/unknowns 是现成契约 |
| 用 LLM 做渗透 agent | PentestGPT / strix / shannon / pentagi 已做得比我们深 |

### 4.3 我们缺、而文献明确指出的

1. **误杀的样本太小。** 0/6 的 95% 置信上界约 39%，只能说方向对，不能说量级对。
   要报准必须把弱化用例扩到 30+ 条（每类至少 3 种弱化形态）。
2. **证据粒度太粗。** 文献说 51.2% 的成功靠跨文件/跨请求上下文，我们只有一次对照请求。
3. **模型层没测。** DeepSeek Chat 上 agentic 反而更差那条，直接关系我们网关的模型选型。
4. **`rejected` 内部还没拆。** `blocked` 解决了"被鉴权挡住"这一种，
   但 `rejected` 仍然同时承载"payload 真失效"和"payload 不够强但洞还在"——
   后者就是 §2.4 里 SQLI 第一版的状态。这两者对外都印 `rejected`，仍会误导。

---

## 5. 下一步（按证据强度排，不是按好玩排）

| 优先 | 做什么 | 为什么是它 | 验收标准 |
|---|---|---|---|
| ~~P0~~ | ~~补误杀率实验~~ | **已完成**：3/8 = 37.5% | §2.4 |
| ~~P1~~ | ~~判据改成由 payload 派生~~ | **已完成**：`asserts.py`，误杀 3/8 → 0/6，正向 11/11 未回退 | §2.4.1 |
| **P1'** | 把误杀用例扩到 **30+ 条**（每类 3 种弱化形态：语法级 / 结构级 / 上下文级） | 0/6 的置信上界还有 39%，现在的数字不够拿去对外说 | 给出误杀率的 95% 置信区间，且区间上界 < 20% |
| **P2** | `rejected` 内部再拆：`payload_broken` / `insufficient_payload` | 现在这两者对外都是 `rejected`，读者仍会读成"洞不存在" | 报告里三个状态互斥且各自有明确定义 |
| **P3** | 那 6 条"卡在缺口"的路径，用 LLM 补攻击假设再接闸门 | 唯一还没人量化的环节，也是 LLM 该待的位置（派生层已经把"判据"这一半解决了，只剩 payload） | 6 条里自动补出假设的比例 + 补出来后确认率 |
| **P4** | 换端口重起网关（8790 被 DeepTutor 占），两模型对照 | 验证「弱模型上 agentic 是负收益」 | 两模型同任务的 confirmed 数与成本 |
| **P5** | 对外 benchmark（CVE-Bench / AutoPenBench） | 卡 Docker/hypervisor，短期做不了 | — |

**不建议现在做**：再堆工具（nuclei 已 BLOCKED、shannon/pentagi/strix 都要 Docker）。
在误杀样本扩到 30+ 之前，加工具只会让"不知道数字可不可信"这件事更严重。

---

## 附：可复跑清单

```bash
cd vuln-range
python lab/lab_app.py            # 靶场 8899
python lab/oast.py               # OAST 8897
python asserts.py                # 看每类漏洞的断言是怎么从 payload 派生的
python verify.py --ground-truth --gt lab/ground_truth_blind.json   # 3/3 confirmed
python verify.py --negative     --gt lab/ground_truth_blind.json   # 3/3 rejected
python verify.py --ground-truth                                    # 11/11 confirmed
python verify.py --negative                                        # 11/11 rejected
python baseline.py --run dalfox                                    # recall 3/11 = 27.3%
python pipeline.py                                                 # 8 条 → 2 条可验证
python falsekill.py                                                # 手写 16.7% vs 派生 0.0%（两种模式同跑）
```

---

## 附：本文件的自我限定

- 文献数字全部来自检索到的**摘要与正文片段**，不是逐篇读完 PDF 全文。
  CVE-Bench、CyberGym、AutoPenBench、Sifting the Noise、CVE-Genie 的**核心数字我核对了两个以上
  独立来源**（含官方 proceedings / ACL Anthology / ACM DL）；其余只核了一处，可信度标「单源」。
- CyberGym 的零日发现数在不同版本摘要里写的是 34 / 35，补丁数 18 / 17 —— **版本间有差异**，
  引用时必须带版本。
- §1.3 的"DAST 侧空白"是**检索结论**，不是"证明了不存在"。检索式已在正文写出，可被复核或推翻。
- §2.4.1 的 0/6 是**样本量不足**的结果，不是"误杀已解决"。任何对外引用都必须带
  「6 条样本 / 95% 上界 ~39%」这个限定，否则就是把小样本当结论。
- 派生层里的 `artifact` 常量（api_key / canary / 内网 banner / order→owner 映射）目前是靶场预置的。
  真实目标上它们要靠侦察阶段产出，**IDOR 的身份解析仍是未解决项**（代码里标了 `TODO(identity)`）。
  这一点决定了：现在这套「0 误杀」只在"真值已知"的条件下成立，离通用 DAST 还有距离。
- `blocked` 的出现会让分母变小、误杀率变好看。这是**真实的风险点**：一个把所有东西都判
  `blocked` 的闸门，误杀率也是 0。所以每次报误杀率必须同时报 `blocked` 条数与各自原因，
  单独看误杀率没有意义。
