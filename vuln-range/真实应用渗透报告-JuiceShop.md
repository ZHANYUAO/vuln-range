# 真实 Web 应用渗透测试报告 —— OWASP Juice Shop 20.3.0

> 执行时间：2026-10-29 16:47–17:20（GMT+8）
> 目标：`http://127.0.0.1:3001`（官方预编译包 `juice-shop-20.3.0_node22_win32_x64.zip`）
> 完整性：官方 `.md5` 校验一致 `263fa5e1eb431109385ea8aa21524283`，128 个分片逐片长度校验通过
> 定位：**不是我自己写的靶场**。代码、数据库、116 条挑战判定全部来自上游项目。
> 本文所有数字都由 `vuln-range/` 下的脚本产出，正文给出复现命令。

---

## 1. 一句话结论

在真实应用上，**扫描器贡献的攻击面几乎全是噪声（9368 条命中里 15 条是真的），而"从噪声里挑出可验证假设"这一步才是决定成败的地方**：三轮扫描器一共拿到 2 条可执行结论（1 条注入、0 条 XSS、13 个真端点），
而在这 13 个端点上做的两轮验证共确认 **15 条真实问题，解锁 11 条官方挑战**，闸门结论与官方记账 **10/10 完全一致**。

---

## 2. 黑盒基线（只给扫描器，不给我的判断）

| 工具 | 结论 | 耗时 | 原始输出量 |
|---|---|---|---|
| ffuf 2.3.0（20 并发，无过滤） | 找到端点，但输出 99.8% 是噪声 | 94.7s（把目标跑挂） | **9,368** 条 |
| ffuf 2.3.0（10 并发，实测过滤器） | 35 条候选，其中真端点 13 条 | 247.4s（再次跑挂） | 35 条 |
| dalfox 3.2.4 | **0 命中** | 1.2s / 66 请求 | 0 |
| sqlmap（master, level2/risk1） | **参数 `q` 可注入**，DBMS=SQLite，2 种技术 | 7.0s | 8 行结论 |
| nuclei 3.11.1 | 未跑（此前已确认卡 PDCP 云初始化，本机不可用） | — | — |

### 2.1 ffuf 的 9,368 条是怎么来的（这是本轮最有用的一个数）

| 类别 | 条数 | 占比 | 判定依据 |
|---|---:|---:|---|
| Angular SPA 外壳（未知路由一律 200 + 10017 字节） | 6,614 | 70.6% | 长度恒定 10017 |
| `Error: Unexpected path: <路径>` 500 错误页（带堆栈） | 2,739 | 29.2% | 页面回显路径，长度随路径变化，能骗过长度过滤 |
| 其余（可能真实存在） | **15** | 0.16% | — |

**结论**：在真实应用上，`-mc all -fc 404` 这种"业内默认配置"的产出里 99.84% 是靶场里永远看不到的东西。
靶场（我上一个 Python `http.server`）对未知路径老老实实返 404，所以问题被完全掩盖了。

过滤器不是猜的，是量出来的：`-fs 10017`（外壳长度）+ `-fr "Unexpected path|Cannot GET|ENOENT"`（错误页文本）。

### 2.2 扫描器把目标打挂了两次

- 第一次：ffuf 20 并发 × 3 前缀 ≈ 2 万请求，**94.7 秒**后 Juice Shop `FATAL ERROR: ... JavaScript heap out of memory`（默认堆，崩溃点 `build/routes/verify.js:235`）。
- 第二次：显式 `--max-old-space-size=8192` + 降到 10 并发，**4 分 25 秒**后同样 OOM。

**这不是扫描器 bug，是真实应用的抗压特性**：高速生成 500 错误页（每条都带完整调用栈）会让 Node 进程内存持续增长。
记录它有两个直接后果：
1. 任何自动化渗透系统在真实资产上必须**限速**，否则第一轮就把目标打死，后面所有证据都无从谈起；
2. 这与 ARTEX `#43 真执行转账` 是同一类风险——**工具的能力就是它的破坏力**。

### 2.3 扫描器"确认漏洞"和"拿到资产"是两个层级

sqlmap 7 秒就证明了 `q` 可注入（boolean-blind + error-based，还正确识别出 SQLite）。
但跑完之后官方挑战计数 **+0**。

原因：`unionSqlInjectionChallenge`（官方名 **User Credentials**）要求的是"取出全部用户凭据"，不是"证明注入存在"。
把 sqlmap 的结论升级成闸门用例（10 列 UNION 取 `Users` 表）之后，**8 秒内挑战解锁**，取到 `admin@juice-sh.op` + 32 位 MD5。

> 这条差别的实践意义：**扫描器的 `vulnerable` 不等于有可利用价值**。中间缺的一步是"把断言提升到资产层面"，
> 而这一步规则做不了——它需要知道"这张表里什么字段才算凭据"。

### 2.4 dalfox 为什么 0 命中

1.2 秒、66 个请求就结束，`target_summary.status = "clean"`。
原因不是它弱：搜索接口 `/rest/products/search` 返回 **JSON**，没有 HTML 反射上下文，反射型 XSS 在语义上就不存在。
Juice Shop 确实有搜索框 XSS，但那是**客户端 DOM XSS**，必须用浏览器渲染才能看见——纯 HTTP 扫描器结构上看不到。

---

## 3. 两轮验证（闸门 + 官方记账双向核对）

### 3.1 第一轮：15 条用例（9 正 / 6 负）

| 用例 | 类别 | 闸门判定 | 官方挑战 | 记账 |
|---|---|---|---|---|
| J-LOGIN-SQLI | 登录绕过注入（`admin@juice-sh.op' --`） | confirmed | loginAdmin | SOLVED ✅ |
| J-UNION-CRED | UNION 取用户凭据（10 列） | confirmed | unionSqlInjection | SOLVED ✅ |
| J-FTP-DOC | 机密文档 `/ftp/acquisitions.md` | confirmed | directoryListing | SOLVED ✅ |
| J-IDOR-BASKET | 用 A 会话读 B 的购物车 | confirmed | basketAccess | SOLVED ✅ |
| J-NULLBYTE | `%2500` 绕后缀白名单 | confirmed | nullByte（+forgottenDevBackup 多标签） | SOLVED ✅ |
| J-METRICS | `/metrics` 无认证 | confirmed | exposedMetrics | SOLVED ✅ |
| J-FTP-DIRLIST | `/ftp/` 目录索引 | confirmed | 无此挑战 | n/a |
| J-BAC-USER1 | 普通用户读 `/api/Users/1` | confirmed | 无 | n/a |
| J-USERLIST | 普通用户拿全量用户列表 | confirmed | 无 | n/a |
| 6 条负样本 | 错口令/错列数/不存在的购物车/穿越/无凭证/首页 | 5 rejected + 1 **blocked** | — | 正确拒绝 |

汇总：**confirmed 9 / rejected 5 / blocked 1 / unknown 0**；有 oracle 的 6 条 **6/6 一致**。

`blocked` 那一条值得单说：`GET /api/Users` 无凭证返回 401，闸门输出 `blocked`（"需要认证，未持有会话"）而不是 `rejected`（"漏洞不存在"）。
这是上一轮误杀实验的成果——**没验证 ≠ 不存在**，报告里必须分开印。

### 3.2 第二轮：LLM 层（本会话）把扫描器线索变成假设，8 条

扫描器只给了三个入口：`/ftp`、`/support/logs`、`/encryptionkeys`（后两个不在词表里，是我补的）。
从三个目录索引里读到 26 个文件名，我挑 8 个做成用例：

| 用例 | 路径 | 证据形态（派生规则） | 闸门 | 官方挑战 |
|---|---|---|---|---|
| L-ACCESSLOG | `/support/logs/access.log.2026-10-29`（3.28 MB） | `.log` → 日志行正则 | confirmed | accessLog ✅ |
| L-KDBX | `/ftp/incident-support.kdbx`（3.2 KB） | `.kdbx` → magic `03D9A29A` | confirmed | 无 |
| L-PREMIUMKEY | `/encryptionkeys/premium.key` | `.key` → `数字.32位HEX` | confirmed | 无（见 §5 注） |
| L-COUPONBAK | `/ftp/coupons_2013.md.bak%2500.md` | 未知后缀 → 200 且非错误页 | confirmed | forgottenBackup ✅ |
| L-SIGMA | `/ftp/suspicious_errors.yml%2500.md` | 同上 | confirmed | misplacedSignatureFile ✅ |
| L-EASTER | `/ftp/eastere.gg%2500.md` | 同上 | confirmed | easterEggLevelOne ✅ |
| N-LOG-FAKE | `/support/logs/access.log.1999-01-01` | — | rejected | — |
| N-KDBX-FAKE | `/ftp/notexist.kdbx` | — | rejected | — |

汇总：**confirmed 6 / rejected 2**；有 oracle 的 4 条 **4/4 一致**。

其中三条 `.bak/.yml/.gg` 是 403 → 200，用的是第一轮已确认的 null-byte 原语**迁移**：
一个原语确认后，批量套到同目录其余被拦文件上，3/3 成功。这是"确认一条 → 扩面"的标准动作，也是闸门相比扫描器的真正优势。

---

## 4. 官方记账总账与归因

目标自带 116 条挑战，本轮共解锁 **13 条**：

| 归因 | 条数 | 挑战 |
|---|---:|---|
| 第一轮 confirmed 发现 | 7 | loginAdmin, unionSqlInjection, directoryListing(机密文档), basketAccess, nullByte, forgottenDevBackup, exposedMetrics |
| 第二轮 LLM 层 confirmed 发现 | 4 | accessLog, forgottenBackup, misplacedSignatureFile, easterEggLevelOne |
| **被负样本自己解掉** | 1 | errorHandling（负样本 UNION 列数错 → 500 → 该挑战判据是"任何 >401 的错误响应"） |
| **被我的侦察 curl 解掉** | 1 | securityPolicy（我探 `/.well-known/security.txt` 时就解了） |

后两条是**污染项，不能计入战果**。这也说明"用应用自身记账当 oracle"必须做**逐步快照**：
任何一次侦察请求都可能改变基线，否则归因会全错。

→ 净战果：**11 条**，对应 15 条 confirmed 发现中的 11 条（另 4 条该应用没有对应挑战）。

---

## 5. 真实应用打出来的 3 个闸门缺陷（都已修）

前两轮在自建靶场上 11/11 全绿的东西，换到真实应用立刻漏了三处：

1. **`body_not_matches` 压根没实现**，而 GT 里手写了这个类型 → `J-UNION-CRED` 整条静默降级成 `unknown`。
   `unknown` 优先级救了它（没变成假 confirmed），但也说明"未实现断言"应该更显眼，不该悄悄降级。
2. **归因降级条件写错**：只要对照响应满足攻击断言就把结论降成 `unknown`，**哪怕攻击侧压根没复现**。
   实测两条负样本（不存在的日期/不存在的凭据库）攻击断言都是 False，却被抬成 `unknown`。
   修法：归因降级只在"攻击侧确实有证据"时才生效——**没证据就是没证据，对照无关**。
3. **二进制证据用文本断言判不了**：`.kdbx` 是 KeePass 库，头 4 字节 `03 D9 A2 9A`，
   解码成文本会变 `U+FFFD`。新增 `body_magic`（按原始字节比对），并要求 `do_request` 保留 `raw`。

另外补了复合断言 `all_of/any_of`：文件泄露的正确判据是"**200 且不是错误页**"，
单个断言表达不了——200 也可能返回一页 403 的错误 HTML。

> 一句话：**闸门的缺陷不是想出来的，是被真实应用逼出来的。**

### 5.1 记账层缺陷修复后的复核（2026-10-29 晚）

项目自检（`../项目自检-异常点清单-2026-10-29.md`）又查出 4 个 P0，全部在"证据记账"上，
与本报告的判定逻辑无关。修完**重跑了两轮**，数字逐条对齐、无一条翻转：

| 轮次 | 修复前 | 修复后（`--label js-recheck-r1/r2`） |
|---|---|---|
| 第一轮 15 条 | 9 confirmed / 5 rejected / 1 blocked | **完全相同** |
| 第二轮 8 条 | 6 confirmed / 2 rejected | **完全相同** |
| oracle 一致 | 10/10 | **10/10**（现在 stdout 直接印出所用证据文件与 `created_at`） |
| 官方挑战 | 13/116 | **13/116**（重跑未新增挑战，说明没有意外污染） |

顺带修掉一条与本报告直接相关的误导：`classify_block` 原来只认 401/407，
传统表单栈的 **302 → /login** 会被判成 `rejected`（= 漏洞不存在）。Juice Shop 是 JSON API
才没暴露这条。已新建夹具 `lab/legacy_app.py` 做 A/B：同一请求旧逻辑 `rejected`、新逻辑 `blocked`。

> 结论不变，但"为什么不变"现在有证据：**修复的是记账，不是判定。**

---

## 6. 诚实的边界（这四件事不能吹）

1. **Juice Shop 是公开靶场，我"知道"它的路径。**
   `/support/logs`、`/encryptionkeys` 不在 ffuf 词表里，是我按对项目的了解补的。
   所以本轮 LLM 层的增益被**高估**了——真实目标上不存在这种"记忆优势"。
   能算干净增量的只有一条链：`/ftp` 目录索引 → 读文件名 → 挑 3 个被拦文件 → 迁移 null-byte → 3/3 成功。这条是纯推理。
2. **11/116 的绝对数字没有意义。** 分母里大部分挑战需要浏览器（DOM XSS/Chatbot/密码学/上传），黑盒 HTTP 层结构上够不到。
   有意义的是"15 条确认发现 / 11 条被官方记账认证 / 10 条 oracle 用例零分歧"。
3. **没有 WAF、没有 CDN、没有认证复杂度。** 真实资产上 `blocked` 会大量出现，分母会缩水，误杀率会变成"漂亮的假数字"。
   这一条 lab 和 Juice Shop 都测不出来。
4. **只跑了 4 个工具，nuclei 不可用。** 覆盖面远不是"完整渗透"，是一份可复现的**方法学样本**。

---

## 7. 复现命令

```bash
cd vuln-range
# 0) 目标（官方预编译包，仅监听 127.0.0.1）
cd apps/juice/ext/juice-shop_20.3.0 && PORT=3001 NODE_ENV=production node build/app.js
# 1) 身份解析（只注册两个账号，不解任何挑战；会打印 solved baseline 必须为 none）
python apps/juice/identity.py
# 2) 生成 GT（值全部来自运行时 profile）
python apps/juice/gen_gt.py
# 3) 黑盒基线（注意 ffuf 会限速，全量词表会打挂目标）
python apps/juice/baseline_juice.py --run ffuf|dalfox|sqlmap
# 4) 闸门两轮
python verify.py --ground-truth --profile juiceshop --gt apps/juice/gt/ground_truth_juice.json --repeats 3
python verify.py --ground-truth --profile juiceshop --gt apps/juice/gt/llm_layer_cases.json   --repeats 3
# 5) 汇总（含 oracle 交叉核对）
python apps/juice/tally.py
```

产物：
- `apps/juice/out/baseline_juice.json` 扫描器原始输出（含耗时）
- `apps/juice/gt/ground_truth_juice.json`（15 条）、`llm_layer_cases.json`（8 条）
- `apps/juice/gt/final_tally.json` 判定 vs 官方记账
- `evidence/*.json` 每条的证据包（observations / inferences / unknowns + 3 轮重放）

---

## 8. 下一步（按价值排）

1. **换一个我没见过的真实应用**（自己部署的开源项目，JDK21 已在本机，如 Java 系靶场/自己搭的业务系统）。
   这是唯一能消掉"记忆优势"、量出 LLM 真实增益的办法。当前 `vuln-range/` 的工具链已可目标无关运行（profile 化）。
2. **加 WAF 一档**（前置 nginx + ModSecurity 或云 WAF），专门测 `blocked` 判定与分母崩塌。
3. **把"侦察污染"制度化**：每次侦察前后各拍一次官方记账快照，写进证据包。
4. nuclei 若可用再补：当前 4 工具对 CVE 型漏洞基本无覆盖。
