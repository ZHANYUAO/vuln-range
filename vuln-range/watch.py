#!/usr/bin/env python3
"""监控 ARTEX 任务进展：探索图 / 工具调用 / LLM 消耗。"""
import subprocess, sys, os

PSQL = r"C:\Users\yuao\.workbuddy\binaries\postgres\pgsql\bin\psql.exe"
DSN = ["-h", "127.0.0.1", "-p", "5433", "-U", "artex", "-d", "artex"]


def q(sql, tuple_only=True):
    args = [PSQL] + DSN + (["-t", "-A"] if tuple_only else []) + ["-c", sql]
    env = dict(os.environ, PGCLIENTENCODING="UTF8")
    r = subprocess.run(args, capture_output=True, text=True,
                       encoding="utf-8", errors="ignore", env=env)
    return (r.stdout or "").strip() or (r.stderr or "").strip()


def main():
    print("=== 任务 ===")
    print(q("select id||'  status='||status||'  paused='||paused||'  queued='||queued "
            "from tasks order by id;", False))

    print("\n=== 探索图节点（按类型）===")
    print(q("select kind||' : '||count(*)||'  (open='||count(*) filter (where state='open')"
            "||', running='||count(*) filter (where state='running')"
            "||', done='||count(*) filter (where state='done')||')' "
            "from exploration_nodes group by kind order by 1;", False))

    print("\n=== 探索图边（按关系）===")
    print(q("select kind||' : '||count(*) from exploration_edges group by kind order by 1;", False)
          or "(暂无边)")

    print("\n=== findings ===")
    print(q("select count(*) from exploration_nodes where kind='finding';", False))

    print("\n=== 工具调用（最近 8 条）===")
    rows = q("select id, coalesce(tool,'?'), substr(coalesce(command,input,''),1,90) "
             "from tool_runs order by id desc limit 8;").splitlines()
    print("\n".join(rows) if rows and "错误" not in rows[0] else "(表结构不同，跳过)")

    print("\n=== LLM 消耗 ===")
    print(q("select 'calls='||count(*)||'  in='||coalesce(sum(input_tokens),0)||"
            "'  out='||coalesce(sum(output_tokens),0) from llm_usage;", False))

    print("\n=== 最近活动（8 条）===")
    rows = q("select id||' | '||coalesce(worker,'?')||' | '||substr(coalesce(text,content,''),1,110) "
             "from activity order by id desc limit 8;").splitlines()
    print("\n".join(rows) if rows else "(无)")


if __name__ == "__main__":
    main()
