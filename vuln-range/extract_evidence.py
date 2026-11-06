"""从 ARTEX 数据库提取本轮实战的完整证据：confirmed facts + 关键工具结果。"""
import json
import subprocess
import sys

PSQL = r"C:\Users\yuao\.workbuddy\binaries\postgres\pgsql\bin\psql.exe"
DSN = ["-h", "127.0.0.1", "-p", "5433", "-U", "artex", "-d", "artex"]


def q(sql):
    p = subprocess.run([PSQL] + DSN + ["-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
                       capture_output=True, text=True, encoding="utf-8")
    if p.returncode != 0:
        print("SQL 错误:", p.stderr[:200], file=sys.stderr)
        return ""
    return p.stdout


def facts():
    """所有 confirmed fact 的完整 payload"""
    out = q("select payload::text from exploration_nodes "
            "where kind='fact' and state='confirmed' order by id;")
    res = []
    for line in out.split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            res.append(json.loads(line))
        except Exception:
            res.append({"_raw": line[:200]})
    return res


def tool_results():
    """所有 WebFetch / Bash 的实际返回（截断到 700 字符）"""
    out = q("select id||chr(31)||kind||chr(31)||coalesce(tool,'')||chr(31)||detail "
            "from activity where kind='tool_result' order by id;")
    res = []
    for line in out.split("\n"):
        parts = line.split("\x1f")
        if len(parts) >= 4:
            res.append({"id": parts[0], "tool": parts[2], "detail": parts[3][:700]})
    return res


def main():
    f = facts()
    t = tool_results()
    print("=== confirmed facts: %d ===" % len(f))
    for i, x in enumerate(f, 1):
        print("\n--- fact %d ---" % i)
        print(json.dumps(x, ensure_ascii=False, indent=1)[:1400])
    print("\n\n=== tool_result 条数: %d ===" % len(t))
    json.dump({"facts": f, "tool_results": t},
              open("evidence.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("已写入 evidence.json")


if __name__ == "__main__":
    main()
