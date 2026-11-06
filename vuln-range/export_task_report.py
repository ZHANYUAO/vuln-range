#!/usr/bin/env python3
"""导出某个任务的 findings 为 Markdown，并与源码 ground truth 做检出率对照。

用法: python export_task_report.py <task_id> <输出.md>
"""
import os, re, subprocess, sys, datetime

PSQL = r"C:\Users\yuao\.workbuddy\binaries\postgres\pgsql\bin\psql.exe"
DSN = "postgres://artex@127.0.0.1:5433/artex?sslmode=disable"

# ground truth：来自 AltoroJ 源码审计 + 开跑前我自己的实测验证
GROUND_TRUTH = [
    ("SQL 注入 · 登录绕过", "/doLogin (uid)", "DBUtil.java:219", "✅ 开跑前已实测绕过成功"),
    ("SQL 注入 · 交易日期参数", "/bank/showTransactions?startDate", "DBUtil.java:399", "✅ 开跑前已实测 500 SQL 错误"),
    ("SQL 注入 · 账户查询", "/bank/showAccount?accountNo", "DBUtil.java:451/276", "— 需登录态"),
    ("SQL 注入 · feedback 表单", "/feedback.jsp", "DBUtil.java:519", "— POST 参数"),
    ("SQL 注入 · 用户信息查询", "USER_ID 查询", "DBUtil.java:242", "— 需登录态"),
    ("反射 XSS · lang 参数", "/bank/customize.jsp?lang=", "customize.jsp:44", "✅ 开跑前已实测原样回显"),
    ("反射 XSS · query 参数", "/bank/queryxpath.jsp?query=", "queryxpath.jsp:36", "✅ 开跑前已实测原样回显"),
    ("反射 XSS · HostName 参数", "/util/serverStatusCheckService.jsp", "serverStatusCheckService.jsp:4", "✅ 开跑前已实测回显"),
    ("反射 XSS · 交易日期参数", "/bank/transaction.jsp?startDate", "transaction.jsp:126", "— 需登录态"),
    ("本地文件包含 / 路径遍历", "/index.jsp?content=", "index.jsp:34→101 jsp:include", "⚠️ 开跑前实测 500（include 被拒）"),
    ("后台未授权访问", "/admin/*", "web.xml /admin/*", "—"),
    ("信息泄露 · 详细错误页", "SQL 异常堆栈", "错误页未处理", "✅ 500 错误页"),
    ("API 文档暴露", "/swagger/", "web.xml /swagger/*", "✅ 200 可达"),
]

def fetch(task_id):
    task_ids = ",".join(str(int(t)) for t in task_id.split(","))
    q = f"""\\pset format unaligned
\\pset tuples_only on
SELECT 'ID=' || f.id::text || E'\\x01' || f.severity || E'\\x01' || coalesce(nullif(f.name,''), f.summary) || E'\\x01'
    || f.vulnclass || E'\\x01' || replace(coalesce(f.summary,''), E'\\n', ' ') || E'\\x01'
    || coalesce(f.report,'') || E'\\x01' || coalesce(f.evidence,'') || E'\\x02'
FROM findings f WHERE f.task_id IN ({task_ids}) ORDER BY f.id;"""
    env = dict(os.environ, PGCLIENTENCODING="UTF8")
    raw = subprocess.run([PSQL, DSN], input=q.encode("utf-8"), capture_output=True, env=env)
    txt = raw.stdout.decode("utf-8", "ignore")
    items = []
    for seg in txt.split("\x02"):
        if "\x01" not in seg:
            continue
        p = seg.strip("\r\n").split("\x01")
        if len(p) < 7:
            continue
        m = re.search(r"ID=(\d+)", p[0])
        items.append(dict(id=m.group(1) if m else p[0], severity=p[1].strip(), name=p[2],
                          vulnclass=p[3], summary=p[4], report=p[5], evidence=p[6]))
    return items

def main():
    task_id = sys.argv[1] if len(sys.argv) > 1 else "3"
    out = sys.argv[2] if len(sys.argv) > 2 else "ARTEX-漏洞报告-testfire.md"
    items = fetch(task_id)
    rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    items.sort(key=lambda x: (rank.get(x["severity"], 9), int(x["id"] or 0)))
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    txt_all = " ".join((it["name"] + " " + it["summary"] + " " + it["evidence"]).lower() for it in items)

    L = ["# ARTEX 自主渗透报告 · HCL/IBM AltoroJ（demo.testfire.net）", "",
         f"- 目标：`http://demo.testfire.net` —— HCL Technologies 官方发布的 AltoroJ 演示银行应用",
         f"- 授权：页脚原文 “published by HCL … for the sole purpose of demonstrating the effectiveness "
         "of HCL products in detecting web application vulnerabilities and website defects”",
         f"- 引擎：ARTEX 本地实例 · 模型 `nvidia/nemotron-3-super-120b-a12b`（NVIDIA API）",
         f"- 任务 id：{task_id} · 导出时间：{now} · **登记漏洞 {len(items)} 条**", "",
         "## 一、漏洞清单", "", "| # | 级别 | 漏洞 | 类别 |", "|---|---|---|---|"]
    for i, it in enumerate(items, 1):
        L.append(f"| {i} | {it['severity']} | {it['name']} | {it['vulnclass']} |")

    # 检出率对照
    L += ["", "## 二、与源码 ground truth 的对照（检出率评估）", "",
          "标准答案来自 AltoroJ 开源源码审计（`AltoroJ-master/`，源码自带 "
          "`/* BAD - user input should always be sanitized */` 注释）+ 开跑前我自己的实测验证。", "",
          "| 漏洞（源码定位） | 入口 | 源码位置 | ARTEX 是否检出 |", "|---|---|---|---|"]
    hit = 0
    for name, entry, src, pre in GROUND_TRUTH:
        keys = {
            "SQL 注入 · 登录绕过": ["login", "bypass", "dologin"],
            "SQL 注入 · 交易日期参数": ["showtransactions", "startdate"],
            "SQL 注入 · 账户查询": ["showaccount", "accountno"],
            "SQL 注入 · feedback 表单": ["feedback.jsp", "feedback form", "comments'"],
            "SQL 注入 · 用户信息查询": ["user_id", "userid"],
            "反射 XSS · lang 参数": ["customize", "lang="],
            "反射 XSS · query 参数": ["queryxpath", "query="],
            "反射 XSS · HostName 参数": ["hostname", "serverstatus"],
            "反射 XSS · 交易日期参数": ["transaction.jsp"],
            "本地文件包含 / 路径遍历": ["index.jsp", "content=", "lfi", "traversal", "include"],
            "后台未授权访问": ["admin"],
            "信息泄露 · 详细错误页": ["error", "stack", "disclosure"],
            "API 文档暴露": ["swagger"],
        }[name]
        ok = any(k in txt_all for k in keys)
        if ok:
            hit += 1
        L.append(f"| {name} | `{entry}` | {src} | {'✅ 已检出' if ok else '❌ 漏报'} |")
    L += ["", f"**检出 {hit} / {len(GROUND_TRUTH)} = {hit*100//len(GROUND_TRUTH)}%**，"
          f"漏报 {len(GROUND_TRUTH)-hit} 项。", "",
          "> 说明：对照按关键词匹配，属于粗粒度估计，用于看趋势，不是精确判定。", "", "---", ""]

    for i, it in enumerate(items, 1):
        L += [f"## 三.{i} [{it['severity'].upper()}] {it['name']}", "",
              f"- **类别**：{it['vulnclass']} · **finding id**：{it['id']}", ""]
        L += [it["report"].strip(), ""] if it["report"].strip() else [
            f"**摘要**：{it['summary']}", "", "```", it["evidence"][:4000], "```", ""]
    open(out, "w", encoding="utf-8").write("\n".join(L))
    print(f"导出 {len(items)} 条（检出 {hit}/{len(GROUND_TRUTH)}）→ {os.path.abspath(out)}")

if __name__ == "__main__":
    main()
