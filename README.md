# vuln-range — LLM 自动化渗透的「验证层」

> 一组可复现的靶场、验证闸门与实测数据，用来回答一个问题：
> **当 AI 说「这里有个漏洞」，怎么证明它说的是真的？**

本仓库是安全研究项目的工作区快照，包含自建靶场、漏洞验证闸门（L4）、变体发现回路、
以及三轮真实应用（OWASP Juice Shop / Gitea）的渗透实测记录与调研报告。

---

## 为什么做这个

2026 年 LLM 自动化渗透的瓶颈已经从「能不能找到」转向「找到的能不能信」。

公开数据：CVE-Bench 端到端成功率 13%（ICML 2025 spotlight）、CyberGym 11.9%（ICLR 2026）、
AutoPenBench 自主 21% 但人机协作 64%（EMNLP 2025）。扫描器输出里 75% 的条目
连一个可验证的攻击假设都凑不齐——只有路径，没有 payload，没有预期结果。

所以本项目把力气放在**判定**上，而不是再做一个扫描器：

- 断言必须由 payload 派生，不能凭空写一个 `body_contains("success")`
- 弱断言 + 应用回显 = 自证成立，这是本项目踩过三次的同一个坑
- 判定结果分三值，`unknown` 优先——不确定就说不确定，不硬报成「没漏洞」
- 401 且非认证端点判 `blocked`（证据不足），不是 `rejected`

## 核心成果

| 项目 | 结果 |
|---|---|
| 靶场 ground truth | **11 条**（SQLI/XSS/IDOR/CMDI/LFI/SSRF/PRIV/DEFAULTCRED/DBWRITE/HIDDEN），每条绑 CVE-Bench 可观测判据 + benign 对照 |
| 验证闸门 | 差分双控 + 3 轮重放 + 三值判定；GT `confirmed=11`，negative `rejected=11`，伪造断言/缺 control → `unknown` |
| 误杀率 | 37.5%(3/8) → **0/6**（Clopper-Pearson 95% 上界 ≈39%，引用须带此限定） |
| patched 反事实差分 | 11/11（vuln 必须 confirmed，secure 必须非 confirmed 且非 unknown） |
| Juice Shop 20.3.0 | 15 条 confirmed，官方挑战净解 11，oracle 一致 10-10 |
| Gitea 28.3.0 | 三轮 20 项定向检查，0 越权 0 提权；XSS/路径穿越全部「正确不报」 |
| 路径穿越判据 | 跨 **7 个实现**定型：守卫形式 > 守卫位置，黑名单在哪里都不成立，`hasOwnProperty` 一次没被破 |

## 目录结构

```
vuln-range/
├── lab/                    # 自建靶场（11 条 ground truth，只绑 127.0.0.1）
│   └── lab_app.py
├── verify.py               # 验证闸门：差分双控 + 3 轮重放 + 三值判定
├── asserts.py              # 断言库：证据源分四级 payload/artifact/structure/oast
├── diffcheck.py            # patched 反事实差分（LAB_MODE=vuln|secure）
├── profiles/               # 各目标的判定档位
├── evidence/               # 证据包（evidence_id + observations/inferences/unknowns）
├── vhv/                    # 变体发现回路：从已修复 patch 找同类未修变体
│   ├── seed.py / reify.py
│   ├── cases/              # 变体用例
│   ├── cve-db/             # CVE/GHSA 索引
│   └── reach/              # 可达性分析用的包集合
├── apps/                   # 被测应用（Juice Shop / Gitea，源码与配置）
├── _src/                   # 调研用第三方源码快照（pentagi / shannon）
└── baseline/               # 基线扫描输出与过滤器
```

根目录另有三份调研报告与若干审计文档：
`LLM自动化渗透-技术路线调研-2026-11-05.md`、`LLM漏洞挖掘-项目与论文调研-2026-11-05.md`、
`仓库完整性审计-2026-11-06.md`。

## 快速开始

```bash
# 1. 起靶场（只监听 127.0.0.1）
python vuln-range/lab/lab_app.py

# 2. 跑真值集（应当 confirmed=11）
python vuln-range/verify.py --ground-truth

# 3. 跑阴性对照（应当 rejected=11）
python vuln-range/verify.py --negative

# 4. 反事实差分：同一套漏洞在修复版上必须不成立
LAB_MODE=secure python vuln-range/diffcheck.py --repeats 3
```

无第三方依赖，Python 3.10+ 标准库即可跑核心闸门。

## 设计原则（三条硬规则）

1. **断言由 payload 派生**。payload 形态决定断言形态——弱 payload 只能派生弱断言，
   用强断言判弱 payload 必然误杀。
2. **断言不能落在会回显 payload 的字段上**。404 页会回显请求路径，
   `body_contains("written.txt")` 在 404 页上也成立，于是你会「发现」一个不存在的文件写入漏洞。
3. **`unknown` 优先于 `rejected`**。证据不足就是证据不足，不等于清白。
   报误杀率时必须同时报 `blocked` 条数，否则「全判 blocked」的闸门误杀率也是 0。

## 本仓库不含什么

为遵守 GitHub 硬限制与负责任披露，以下内容**不在仓库内**：

| 排除项 | 原因 |
|---|---|
| 所有密钥与凭证（`.env`、`.key`、`.zro_key`、`.nvidia_key`、`lab/.control_token`） | 安全 |
| 两条**尚未协调披露**的漏洞研究 | 负责任披露：待联系厂商后再公开 |
| `node_modules/`（约 1.16 GB） | 可由 `package.json` / lock 文件还原 |
| 单个超 100 MB 的二进制（`nuclei.exe` 138 MB、`gitea.exe` 117 MB、`juice.zip` 127 MB 等） | GitHub 拒绝 >100 MB 单文件 |
| 浏览器 profile 缓存（`.edgeprof/`，357 MB） | 与本项目无关 |
| ARTEX 源码 | 已有独立仓库：[Hinln/ARTEX](https://github.com/Hinln/ARTEX) |

## 法律与使用限制

- `lab/` 是**自建靶场**，只绑定 `127.0.0.1`，命令注入只执行 `ping`，未包含 DoS 用例。
- `apps/` 里的被测应用均为**开源项目**，请遵守其各自许可证。
- 本仓库的代码与判据**仅供在自有资产、自建靶场或已获书面授权的目标上使用**。
  对未授权系统进行渗透测试在绝大多数司法辖区违法。
- 仓库内的漏洞结论均为**特定版本、特定配置**下的实测结果，不构成对任何软件的安全背书。

## 致谢与引用

本项目的方法论建立在以下公开研究之上：CVE-Bench、CyberGym、AutoPenBench、
IRIS（ICLR 2025）、Sifting the Noise（ISSTA 2026）、Big Sleep 与 AIxCC 的公开复盘。
详细对照见 `LLM自动化渗透-技术路线调研-2026-11-05.md`。

## License

代码部分 MIT。文档与报告 CC BY 4.0。
`_src/`、`apps/` 下的第三方项目遵循其原始许可证（详见各目录 `LICENSE`）。
