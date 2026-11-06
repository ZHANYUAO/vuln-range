#!/usr/bin/env python3
"""通过 API 建 ARTEX 任务（用自签 JWT，绕开 UI）。"""
import json, subprocess, sys, os, time

BASE = "http://127.0.0.1:8787"
HERE = os.path.dirname(os.path.abspath(__file__))

def token():
    return subprocess.check_output(
        [sys.executable, os.path.join(HERE, "mktoken.py")], text=True).strip()

ENV_NOTE = """【执行环境 — 必读，违反会直接失败】
本机为 Windows，你的 shell 工具实际执行的是 PowerShell 5.1，不是 bash：
- 禁止使用 curl / wget / nc / nmap / sqlmap 等命令：不存在，或 curl 是 Invoke-WebRequest 的别名，bash 式参数会报错。
- 禁止使用管道、重定向、&& 等 bash 语法。
- 发 HTTP 请求请用 python（已确认可用），例如：
  python -c "import urllib.request;print(urllib.request.urlopen('http://testasp.vulnweb.com/',timeout=20).status)"
  需要看响应头/正文时：
  python -c "import urllib.request;r=urllib.request.urlopen('http://testasp.vulnweb.com/',timeout=20);print(r.status);print(dict(r.headers));print(r.read()[:2000].decode('utf-8','ignore'))"
- 需要 POST / 带参数时，把脚本写成临时 .py 文件再执行，避免引号嵌套出错。
- 单次命令请控制在 60 秒内返回。

【严格边界】
只允许访问下列域名：testasp.vulnweb.com、testaspnet.vulnweb.com。
禁止访问其他任何主机、IP 或域名；禁止对目标做拒绝服务、暴力破解、上传文件、删除数据。"""

DESC = f"""{ENV_NOTE}

【目标】
http://testasp.vulnweb.com/  （Acunetix 官方 demo 站，首页明文声明为 deliberately vulnerable，授权测试）
http://testaspnet.vulnweb.com/  （同一系列的 ASP.NET 版本，可选）

【任务】
对该站点做一次完整的 Web 安全评估，覆盖：
1. 信息收集：HTTP 响应头、Server / X-Powered-By 指纹、目录与文件枚举、注释与隐藏字段、备份/配置文件。
2. SQL 注入：对 search / login / 商品详情等所有带参数的入口逐一测试（报错型、布尔型、UNION 型）。
3. 目录遍历 / 文件读取：尝试常见的路径穿越向量。
4. 跨站脚本 XSS：反射型，注意输出上下文与过滤绕过。
5. 认证与会话：弱口令、Cookie 属性（HttpOnly/Secure/SameSite）、会话固定。
6. 其他：开放重定向、CSRF、敏感信息泄露。

【要求】
- 每个结论必须有可复现的证据：给出你实际执行的完整命令和实际返回的关键片段。
- 不要凭页面文案猜测漏洞，必须实测。
- 区分「已确认可利用」与「疑似」，不确定的要标注。
"""

GOAL = "在 testasp.vulnweb.com 上找出并实测确认 Web 漏洞（SQL 注入、目录遍历、XSS、信息泄露等），每条结论附可复现命令与实际响应证据，形成可交付的安全评估报告。"

def main():
    body = {
        "name": "Acunetix 官方靶场评估 (testasp.vulnweb.com)",
        "description": DESC,
        "goal": GOAL,
        "company_ids": [2],
        "seed_first_intent": True,
        "coverage_enabled": True,
        "timeout_seconds": 3600,
    }
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    tok = token()
    # 写到临时文件再用 curl --data-binary 传，避免 bash 对中文/引号的破坏
    p = os.path.join(HERE, "_task.json")
    open(p, "wb").write(data)
    out = subprocess.run([
        "curl", "-s", "-m", "30", "-X", "POST",
        "-H", "Authorization: Bearer " + tok,
        "-H", "Content-Type: application/json; charset=utf-8",
        "--data-binary", "@" + p,
        BASE + "/api/tasks", "-w", "\n[HTTP %{http_code}]",
    ], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    print(out.stdout[:1500])
    if out.stderr:
        print("STDERR:", out.stderr[:300])

if __name__ == "__main__":
    main()
