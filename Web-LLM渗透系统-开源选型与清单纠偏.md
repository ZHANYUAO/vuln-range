# Web 应用 LLM 渗透系统 —— 开源选型表与清单纠偏

> 2026-10-28　|　所有 star / 最近提交经 `api.github.com` 实测（非印象）
> 结论：用户给的清单属于「网络流量 + 样本分析 + 逆向」谱系，与本系统的核心诉求（HTTP 语义层漏洞推理）**大部分不重叠**。

---

## 一、清单逐项判定（实测数据）

| 项目 | star | 最近提交 | 对本系统的真实角色 | 判定 |
|---|---:|---|---|---|
| **mitmproxy** | 46,441 | 2026-10-27 | **抓/改/重放 HTTP(S) 流量**；`mitmdump` 可脚本化 → 天然适合做**验证层**（把每条 finding 转成可重放的请求序列） | ✅ **核心** |
| bettercap | 20,209 | 2026-10-26 | MITM 框架，强项在 ARP/DNS 欺骗、WiFi、客户端侧；纯服务端 Web 测试用不上 | ⚠️ 可选（仅客户端/证书信任场景） |
| Zeek | 8,146 | 2026-10-28 | 网络流量分析（NSM），**防守方**视角 | 🔸 仅用于"我这波扫描会不会被抓"的隐蔽性评估 |
| Suricata | 6,786 | 2026-10-28 | IDS/IPS，同上 | 🔸 同上 |
| sslsplit | — | — | **`roeck/sslsplit` 返回 404（原仓库已消失）**；功能被 mitmproxy 完全覆盖 | ❌ 弃用 |
| REMnux | — | — | 恶意样本分析专用发行版（逆向/沙箱/文档分析） | ❌ 与 Web 应用渗透零交集 |
| 看雪 bbs.pediy.com | — | — | 逆向/破解社区 | ❌ 与本系统无关（WAF 绕过经验帖偶有参考价值） |

**清单里 5 个"主力项目"，4 个对本系统无用。** 唯一值得立刻引入的是 mitmproxy。

### 顺带一个真实教训
`sslsplit` 原仓库已经 404 —— 这正好印证清单里提到的 **Software Heritage** 的价值：
**本项目自己的 ARTEX 也已经 404 了**（2026-10-8 闭源）。要长期保留这类工具，
唯一可靠的归档是 Software Heritage / 本地 git bundle，而不是指望 GitHub 一直在。

---

## 二、清单里真正值得采纳的三件事

| 采纳点 | 为什么 |
|---|---|
| **mitmproxy** | 补上当前系统最缺的**验证层**：把 LLM 的"我发现了 SQLi"变成"这条请求重放 3 次都返回 admin 数据" |
| **Software Heritage 归档意识** | ARTEX / sslsplit 都已从 GitHub 消失。对本项目的工具链（尤其 ARTEX）应做 `git bundle` + 哈希存档，否则哪天重装就没了 |
| **顶会 Artifact Evaluation / benchmark 思路** | 正确用法不是"找工具"，而是**找 ground truth**。LLM 渗透系统没有 benchmark 就无法证明有效（详见第五节） |

`Zenodo / P&C / arXiv / HAL / Codeberg / SourceForge / OpenHub / Gitee / GitCode / AtomGit`
—— 这些是**托管站与检索源**，不是能力组件。它们回答"去哪找"，不回答"用什么"。
逐个评估对建系统没有意义，选 1-2 个当检索入口即可。

---

## 三、真正该建的四层选型表（按本系统的实际缺口）

| 层 | 职责 | 选定工具（实测 star） | 现状 |
|---|---|---|---|
| **侦察层** | 子域/端口/URL/JS 端点枚举 | `subfinder` 14,671 / `httpx` 10,550 / `katana` 17,756 | ❌ 未接入 |
| **扫描层**（广度） | 已知 CVE、注入、XSS 的机械穷举 | `nuclei` 32,391 / `sqlmap` 38,815 / `ffuf` 16,955 / `dalfox` 5,336 | ❌ 未接入 |
| **推理层**（深度） | 漏洞假设、payload 变体、链式利用、告警收敛 | 我（LLM agent） | ✅ 可用 |
| **验证层**（把关） | 每条 finding 独立重放、去误报 | `mitmproxy` 46,441 + 自写 `requests` 重放脚本 | ❌ **完全空白，这是最大缺口** |
| （白盒分支） | 源码读 sink、污点追踪 | `semgrep` 17,317 / `joern` 3,603 | ❌ 未接入 |

对比已克隆的三个 LLM agent：`strix` 72,441 / `shannon` 49,895 / `pentagi` 32,617 —— 它们是**整机方案**，
但都需要 Docker（当前卡在 hypervisor 未加载），且都缺"独立验证层"（strix 靠 agent 自证）。

---

## 四、不引入的，及原因

| 不引入 | 原因 |
|---|---|
| Zeek / Suricata | 是**防守方** IDS。放进攻击系统里唯一合理的用途是"评估自身流量是否会被检测"，那是第二阶段的事，不是现在 |
| bettercap | 服务端 Web 渗透用不到；引入它会把项目带向"内网/客户端"方向，偏离目标 |
| REMnux | 恶意样本分析发行版，与 Web 应用渗透无交集 |
| sslsplit | 仓库 404，且能力被 mitmproxy 覆盖 |
| 看雪 | 社区不是工具；需要时去搜"WAF 绕过"经验即可，不构成系统组件 |

---

## 五、缺的不是工具，是 ground truth

当前项目最大的问题不是"工具不够多"，而是**无法证明系统有效**：
ARTEX 在靶场只有 2 个样本（1 真阳性 + 1 假阴性），testfire 有 #42 假阳性、#43 真执行转账。

**正确做法**（清单里"顶会 AE / benchmark"思路的真正用法）：

1. **自建 ground truth**：靶场埋 5 个已知漏洞（SQLi / XSS / IDOR / 命令注入 / 路径穿越），不给任何提示
2. **或引入公开 benchmark**：LLM 渗透领域已有若干 benchmark（如 XBOW 公开的 Web 挑战集、
   Cybench / AutoPenBench 等学术基准）—— ⚠️ 具体仓库与数据需联网核实后再采用，不要凭名称假定内容
3. 三组对照：ARTEX 自主跑 / 我直接驱动 / nuclei+sqlmap 基线
4. 指标：precision、recall(vs ground truth)、可复现性、稳定性、耗时、token

**没有 benchmark 的"AI 渗透有效"都是演示，不是结论。**

---

## 六、下一步（按性价比排序）

1. **接 mitmproxy 做验证层**（最高价值，纯 Python，无需 Docker）
   —— 让每条 finding 生成可重放的 `.har` / 脚本，复现失败的一律不进报告
2. **接 nuclei + sqlmap 做广度基线**（有对照才能谈"LLM 增益"）
3. **埋 5 个漏洞做 ground truth**，跑 A/B/C 三组对照
4. 工具链 `git bundle` 归档（ARTEX 已 404，别再丢一次）
5. Docker/hypervisor 只影响 strix/shannon/pentagi，**不阻塞上面任何一步**
