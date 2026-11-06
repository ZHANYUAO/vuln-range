#!/usr/bin/env python3
"""Gitea 第 2 轮：只补第 1 轮被额度打断的第 4-6 项。"""
import json, subprocess, sys, os

BASE = "http://127.0.0.1:8787"
HERE = os.path.dirname(os.path.abspath(__file__))


def token():
    return subprocess.check_output(
        [sys.executable, os.path.join(HERE, "mktoken.py")], text=True).strip()


DESC = """【执行环境 — 必读，违反会直接失败】
本机 Windows，shell 是 PowerShell 5.1，不是 bash：禁止 curl / wget / nc / nmap / sqlmap / 管道 / 重定向 / && 。
发 HTTP 一律写 python 脚本执行，并且必须绕开系统代理直连：
  import urllib.request, os
  for v in ("http_proxy","https_proxy","HTTP_PROXY","HTTPS_PROXY"): os.environ.pop(v, None)
  op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
python: C:\\Users\\yuao\\.workbuddy\\binaries\\python\\versions\\3.13.12\\python.exe
单条命令 60 秒内返回。

【目标】http://127.0.0.1:3002 —— Gitea 28.3.0，本地自建实例，自有资产，已授权。
这是真实软件栈，不是靶场。它大部分行为本来就是正确的。你的价值在于把"正确"和"错误"分开，不在于报数量。

【账号】管理员 pentestadmin / GiteaPentest2026!  ；普通用户 lowpriv / LowPriv2026!
【API 认证用 Basic】（实测该实例对 /api/v1/user 返回 401 "token is required"，Basic 在仓库类接口上可用；登录 cookie 走 POST /user/login 拿 i_like_gitea）。

【第 1 轮已确认的事实 —— 不要重做，直接引用】
- 未认证 GET /api/v1/repos/pentestadmin/secret-project 返回 404，lowpriv 登录态同样 404 且响应体一致 → 私有仓库访问控制正确。
- 未认证 GET /api/v1/repos/pentestadmin/public-demo 返回 200 → 正确。
- 未认证 GET /api/v1/users/search?q= 和 /api/v1/users/lowpriv 返回 200，含 is_admin / created / last_login(零值)；email 已脱敏为 xxx@noreply.localhost → 判为低敏感度默认行为，不报。
- 未认证 GET / 的 Set-Cookie: i_like_gitea 带 HttpOnly、SameSite=Lax，无 Secure（http 环境属正常）。

【本轮只做下面三件事，做成一件再做下一件】

A) 存储型 XSS（重点）
用 pentestadmin 通过 POST /api/v1/repos/pentestadmin/public-demo/issues 建 issue，标题与正文分别放：
   <script>alert(1)</script>  和  <img src=x onerror=alert(1)>
建完后分别取回三个渲染面，逐处检查 payload 是否被转义（正确结果应看到 &lt;script&gt; / &lt;img）：
   1. HTML 页面 GET /pentestadmin/public-demo/issues/<号>
   2. API 返回 GET /api/v1/repos/pentestadmin/public-demo/issues/<号>
   3. 列表页 GET /pentestadmin/public-demo/issues
再测两个位置：仓库描述（PATCH 或 web 表单，允许 POST）与用户 nickname（管理员改 lowpriv 的资料）。
注意：Gitea 使用 markdown 渲染 + bluemonday 过滤，通常会把 script 去掉但保留部分 HTML。请明确区分三种情况：
   (a) 原样输出 <script> 未转义 → 真 XSS，报 finding；
   (b) 被转义成 &lt;script&gt; → 正确，写"已测，行为正确"；
   (c) HTML 标签被保留但危险属性被剥掉（例如 <img src=x> 保留了、onerror 被删）→ 这是预期防护，写"已测，防护有效"，不要报。
另外单独验证 CSP 头（第 1 轮看到 default-src * data: blob:;script-src ...），如果 CSP 允许 inline script，在报告里作为"纵深防御不足"提一句，但不作为漏洞。

B) 认证面
1. POST /user/login 用错误密码连打 5 次（同一个不存在的用户名、以及一个存在的用户名各 5 次），记录每次状态码与提示文案，判断是否用户枚举（存在 vs 不存在的提示不同才算）。
2. 检查登录成功响应的 Set-Cookie 属性（HttpOnly / SameSite / Secure / Path）。
3. GET /api/v1/user 无凭证 → 记录状态码（应为 401）。
4. 测是否可未认证创建用户：POST /api/v1/admin/users 无凭证、以及 lowpriv 凭证，期望 401/403。若 200 才报。
5. 检查是否有注册入口开放：GET /user/sign_up 状态码（200 且能注册 = 配置问题，不是漏洞，仅在报告里记一句）。

C) 路径与文件
对 /attachments/ /avatars/ /raw/ /api/v1/repos/pentestadmin/public-demo/raw/ 各测 4 个变体：
   ../../../../etc/passwd
   ..%2f..%2f..%2f..%2fetc%2fpasswd
   ..%252f..%252f..%252fetc%252fpasswd
   /api/v1/repos/pentestadmin/public-demo/contents/../../../etc/passwd
逐条记录状态码 + 响应前 80 字节。判据：只有真正读到仓库目录之外的文件内容才算穿越。返回 404/400/403，或返回的是一张默认头像 PNG，都不算。
（第 1 轮教训：/avatars/../../data/gitea.db 曾返回 200，但实际是 Gitea 用默认头像兜底，不是穿越。必须看内容特征，不能只看状态码。）

【边界】只允许访问 127.0.0.1:3002；禁止任何外网；禁止 DELETE；禁止删除/关闭仓库、issue、用户；禁止改配置文件。允许 GET / POST / PATCH（PATCH 仅用于改仓库描述与用户资料这两个测试点）。

【强制】
- 每确认一条才发现立即 report_finding，含：标题 / 完整 URL / 完整请求（方法+头+体）/ 实际响应证据（状态码+关键片段）/ 影响 / 修复建议。
- 没有 HTTP 证据的一律写「未验证」，禁止臆测，禁止把预期行为包装成漏洞。
- 三件事全部做完才允许收官。收官时输出交接清单，逐条写「已测，行为正确」或「已确认，见 finding #N」，并各附一条真实响应片段。
- 你只有三项任务，请把预算花在把每一项测透，而不是拓展新的攻击面。
"""

GOAL = ("对本地 Gitea 28.3.0 完成三项定向检查（存储型 XSS / 认证面 / 路径穿越），"
        "每项都必须有对照与实测证据；确认无问题也要显式记录为结论。")

body = {
    "name": "Gitea-28.3.0 第2轮（补 XSS/认证面/路径穿越）",
    "description": DESC,
    "goal": GOAL,
    "company_ids": None,
    "seed_first_intent": True,
    "coverage_enabled": True,
    "timeout_seconds": 2700,
}

p = os.path.join(HERE, "_task_gitea2.json")
open(p, "w", encoding="utf-8").write(json.dumps(body, ensure_ascii=False))
out = subprocess.run([
    "curl", "-s", "-m", "30", "-X", "POST",
    "-H", "Authorization: Bearer " + token(),
    "-H", "Content-Type: application/json; charset=utf-8",
    "--data-binary", "@" + p,
    BASE + "/api/tasks", "-w", "\n[HTTP %{http_code}]",
], capture_output=True, text=True, encoding="utf-8", errors="ignore")
print(out.stdout[:1200])
if out.stderr:
    print("STDERR:", out.stderr[:300])
