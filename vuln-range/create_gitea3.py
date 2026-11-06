#!/usr/bin/env python3
"""Gitea 第 3 轮：授权模型（前两轮完全没碰的面）。

选题理由：XSS / 路径穿越 / 认证面已在第 1、2 轮测过且全部为正确行为；
授权类缺陷是逻辑缺陷，不靠特征匹配，也不在训练语料的"挑战清单"里。
"""
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

【排错纪律 — 上一轮在这里烧掉了整段时间预算，务必遵守】
如果脚本报 SyntaxError，不要在旧文件上一行一行改。直接重写一个内容更短的新文件（例如 t1.py / t2.py），
一次只做一件事。禁止逐字符数"第几列"，禁止反复执行同一个报错文件。同一脚本连续失败 2 次就换思路。

【目标】http://127.0.0.1:3002 —— Gitea 28.3.0，本地自建实例，自有资产，已授权。
这是真实软件栈。它大部分行为本来就是对的。你的价值在于把"对"和"错"分开，不在于报数量。

【账号】
管理员 pentestadmin / GiteaPentest2026!
普通用户  lowpriv / LowPriv2026!
现有仓库：pentestadmin/public-demo（公开）、pentestadmin/secret-project（私有）
API 认证用 HTTP Basic。登录 cookie 走 POST /user/login 拿 i_like_gitea。

【已确认的事实 —— 不要重做，直接引用】
- 私有仓库未授权访问返回 404，响应体与"不存在"一致 → 正确。
- email 已脱敏为 xxx@noreply.localhost；用户搜索接口返回 is_admin 等字段 → 判为低敏感度默认行为，不报。
- 存储型 XSS：issue 标题/正文、仓库描述、nickname、markdown 接口全部被转义或 bluemonday 剥属性 → 正确，不报。
- 路径穿越：/attachments/ /avatars/ /raw/ 共 6 个变体全部 404 或返回默认头像 PNG → 无穿越，不报。
- 登录缺 CSRF token（全站 0 次 _csrf）→ 已单独记录，本轮不要重复报。

【本轮只做下面三件事，做成一件再做下一件】

A) 子资源鉴权一致性（重点，找"漏掉权限校验的那一个端点"）
私有仓库 secret-project 对无权限者应当整体不可见。逐个打它的 API 子资源，看是否**全都**返回 404：
   GET /api/v1/repos/pentestadmin/secret-project
   GET /api/v1/repos/pentestadmin/secret-project/issues
   GET /api/v1/repos/pentestadmin/secret-project/issues/1
   GET /api/v1/repos/pentestadmin/secret-project/pulls
   GET /api/v1/repos/pentestadmin/secret-project/releases
   GET /api/v1/repos/pentestadmin/secret-project/labels
   GET /api/v1/repos/pentestadmin/secret-project/milestones
   GET /api/v1/repos/pentestadmin/secret-project/hooks
   GET /api/v1/repos/pentestadmin/secret-project/collaborators
   GET /api/v1/repos/pentestadmin/secret-project/branches
   GET /api/v1/repos/pentestadmin/secret-project/contents/
   GET /api/v1/repos/pentestadmin/secret-project/commits
   GET /api/v1/repos/pentestadmin/secret-project/raw/main/README.md
对每个端点分别用三种身份各打一次：（1）不带任何凭证（2）lowpriv 的 Basic（3）pentestadmin 的 Basic。
判据：只有"pentestadmin 返回 200，而未认证或 lowpriv 返回 200 且响应体含真实数据"才算越权。
如果某端点对低权身份返回 200，立即把响应体里的敏感内容（issue 标题、分支名、提交信息）摘出来作为证据。
注意区分：返回 200 但 body 是空数组 []，和返回 200 且 body 有真实数据，是两回事——空数据不算越权，但要如实记录。

B) 附件直链的未授权访问
1. 用 pentestadmin 在 public-demo 建一个 issue，正文里通过网页表单上传一个附件（若 API 上传不可用，
   就改用 POST /pentestadmin/public-demo/issues 建 issue 时附带 markdown 引用，或直接用
   POST /api/v1/repos/{owner}/{repo}/issues/{index}/assets?name=test.txt 上传）。
2. 拿到附件 UUID，拼出 /attachments/{uuid}，然后**不带任何 cookie、不带任何凭证**访问它。
   公开仓库的附件被匿名读到属正常。
3. 同样在 secret-project（私有）里造一个附件，拿它的 UUID，用**匿名**和 **lowpriv** 两种身份访问
   /attachments/{uuid}。判据：私有仓库的附件被无权限者读到 200 且内容是真实文件 → 越权，报 finding。
   如果返回 404/403，或返回的是登录页 HTML，就是正确行为，写明。
4. 附加：把 UUID 做一次大小写变换 / 去掉横线，确认不是靠 UUID 难猜来兜底（弱防护只在报告里提一句，不算漏洞）。

C) 权限提升面（lowpriv 是个已注册普通用户）
用 lowpriv 的身份依次尝试，逐条记录状态码：
   1. GET  /api/v1/admin/users                     期望 403
   2. GET  /api/v1/admin/repos                     期望 403
   3. POST /api/v1/admin/users  {username,email,password,...}  期望 403
   4. PUT  /api/v1/repos/pentestadmin/secret-project/collaborators/lowpriv  期望 403/404
   5. POST /api/v1/repos/pentestadmin/secret-project/transfer  期望 403/404
   6. POST /api/v1/repos/pentestadmin/secret-project/forks     期望 403/404（fork 私有仓）
   7. POST /api/v1/repos/pentestadmin/public-demo/hooks        期望 403/404（普通用户给别人的仓加 webhook）
   8. PATCH /api/v1/repos/pentestadmin/public-demo             期望 403（改别人仓库描述）
   9. DELETE /api/v1/repos/pentestadmin/public-demo             【禁止执行】只记录"未测，出于边界约束"
只有返回 200/201 且产生了实际状态变更（新增了协作者、发出去了 webhook、仓库描述真的变了）才算提权。
返回 403/404 一律写"已测，行为正确"。测完把 4/8 两项造成的变更复原（如果意外成功）。

【边界】
只允许访问 127.0.0.1:3002；禁止任何外网；禁止任何 DELETE 请求；
禁止删除/关闭仓库、issue、用户；禁止改 custom/conf/app.ini。
允许 GET / POST / PUT / PATCH，且 PUT/PATCH 仅用于上面 C 段列出的测试点。

【强制】
- 每确认一条才发现立即 report_finding，含：标题 / 完整 URL / 完整请求（方法+头+体）/ 实际响应证据
  （状态码 + 关键片段）/ 影响 / 修复建议。
- 没有 HTTP 证据的一律写「未验证」，禁止臆测，禁止把预期行为包装成漏洞。
- 三件事全部做完才允许收官。收官输出交接清单：逐条写「已测，行为正确（证据：…）」或
  「已确认，见 finding #N」，每条都要附一段真实响应片段。
- 预算有限：把 100% 的预算花在这 24 个端点上，不要拓展新的攻击面。
"""

GOAL = ("对本地 Gitea 28.3.0 完成授权模型三项定向检查（私有仓子资源鉴权一致性、附件直链未授权访问、"
        "普通用户权限提升面），每项都要有匿名/低权/管理员三方对照，确认无问题也必须显式记录为结论。")

body = {
    "name": "Gitea-28.3.0 第3轮（授权模型）",
    "description": DESC,
    "goal": GOAL,
    "company_ids": None,
    "seed_first_intent": True,
    "coverage_enabled": True,
    "timeout_seconds": 2400,
}

p = os.path.join(HERE, "_task_gitea3.json")
open(p, "w", encoding="utf-8").write(json.dumps(body, ensure_ascii=False))
out = subprocess.run([
    "curl", "-s", "-m", "30", "-X", "POST",
    "-H", "Authorization: Bearer " + token(),
    "-H", "Content-Type: application/json; charset=utf-8",
    "--data-binary", "@" + p,
    BASE + "/api/tasks", "-w", "\n[HTTP %{http_code}]",
], capture_output=True, text=True, encoding="utf-8", errors="ignore")
print(out.stdout[:1500])
if out.stderr:
    print("STDERR:", out.stderr[:300])
