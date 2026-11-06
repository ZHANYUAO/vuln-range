#!/usr/bin/env python3
"""把 findings 表（含 reporter 自动生成的 Markdown 报告）导出成本地报告文件。"""
import os, re, subprocess, sys, datetime

PSQL = r"C:\Users\yuao\.workbuddy\binaries\postgres\pgsql\bin\psql.exe"
DSN = "postgres://artex@127.0.0.1:5433/artex?sslmode=disable"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ARTEX-漏洞报告-testasp.md")

Q = r"""\pset format unaligned
\pset tuples_only on
SELECT 'ID=' || f.id::text || E'\x01' || f.severity || E'\x01' || f.name || E'\x01'
    || f.vulnclass || E'\x01' || replace(coalesce(f.summary,''), E'\n', ' ') || E'\x01'
    || coalesce(f.report,'') || E'\x01' || coalesce(f.evidence,'') || E'\x02'
FROM findings f ORDER BY f.id;"""

def main():
    env = dict(os.environ, PGCLIENTENCODING="UTF8")
    raw = subprocess.run([PSQL, DSN], input=Q.encode("utf-8"),
                         capture_output=True, env=env)
    txt = raw.stdout.decode("utf-8", "ignore")
    if raw.stderr:
        sys.stderr.write(raw.stderr.decode("utf-8", "ignore")[:400])
    rows = [l.strip("\r\n") for l in txt.split("\x02") if "\x01" in l]
    sev_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    items = []
    for l in rows:
        p = l.split("\x01")
        if len(p) < 7:
            continue
        mid = re.search(r"ID=(\d+)", p[0])
        items.append(dict(id=mid.group(1) if mid else p[0], severity=p[1].strip(), name=p[2], vulnclass=p[3],
                          summary=p[4], report=p[5], evidence=p[6]))
    items.sort(key=lambda x: (sev_rank.get(x["severity"], 9), int(x["id"] or 0)))
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    out = ["# ARTEX 自主渗透 · 漏洞报告（Acunetix 官方授权靶场）", "",
           f"- 目标：`testasp.vulnweb.com` / `testaspnet.vulnweb.com`（Acunetix 官方 demo，首页明文声明 deliberately vulnerable，属授权测试）",
           f"- 引擎：ARTEX 本地实例 · 模型 `nvidia/nemotron-3-super-120b-a12b`（NVIDIA API）",
           f"- 导出时间：{now} · 漏洞总数：**{len(items)}**", "",
           "## 漏洞清单", "",
           "| # | 严重级别 | 漏洞 | 类别 |", "|---|---|---|---|"]
    for i, it in enumerate(items, 1):
        out.append(f"| {i} | {it['severity']} | {it['name']} | {it['vulnclass']} |")
    out += ["", "> 本报告由 ARTEX 的 reporter agent 在 `report_finding` 登记后自动生成，"
            "证据均来自本机实际发出的 HTTP 请求与响应。", ""]
    for i, it in enumerate(items, 1):
        out += ["---", "", f"## {i}. [{it['severity'].upper()}] {it['name']}", "",
                f"- **漏洞类别**：{it['vulnclass']}", f"- **finding id**：{it['id']}", ""]
        if it["report"].strip():
            out += [it["report"].strip(), ""]
        else:
            out += [f"**摘要**：{it['summary']}", "", "```", it["evidence"][:4000], "```", "",
                    "_（reporter 报告尚未生成）_", ""]
    open(OUT, "w", encoding="utf-8").write("\n".join(out))
    print(f"导出 {len(items)} 条 → {os.path.abspath(OUT)}")

if __name__ == "__main__":
    main()
