#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
task_liveness.py — ARTEX 任务「活性」独立校验器（只读旁路）
================================================================
解决的问题
----------
ARTEX 的 `status = done` 只表示状态机走完了，**不等于检查真的做完了**。
2026-11-05 任务 #14 就是反例：Zro 免费额度耗尽返回 HTTP 402，模型一次都没
成功响应，引擎照样写 done + findings=0，看上去像「目标很安全」。

本脚本不改 ARTEX 任何表、不参与漏洞判定，只回答一个问题：
    「这次 status=done，到底是真跑完了，还是假性完成？」

判据（按优先级，证据独立性优先）
--------------------------------
1. incomplete —— 有明确的「没干活」证据（任一成立）
   a. 时间窗内网关有 4xx/5xx 或网络错误，且**成功响应数为 0**
   b. **尾部连续失败 + 目标未闭合**：最后一次成功响应之后接着 >=2 次上游错误、
      再无成功、completed_at 紧随最后一次错误（<=300s），**且**引擎侧没有任何
      目标闭合证据。这是 #14 的直接证据：09:27:59 最后一次成功 →
      09:28:01/07/14 三次 402 → 09:28:15 立刻 done，0 findings、根意图 blocked。
      反例 #13 尾部同样是 402，但已产出 4 条 confirmed finding，属「收尾时额度耗尽」，
      **不能判 incomplete** —— 网关信号单独不足以定罪。
      目标闭合 = goal(met|done|confirmed) 或 intent(done|met) 或 confirmed finding 节点。
   c. 根 intent 处于 blocked，且 findings == 0，且 goals_met == 0，
      且成功响应 < 10 —— 组合条件，避免误杀「真跑完但零发现、恰好有 blocked 意图」
   d. activity 记录为 0
   e. 引擎 status 本身不是 done

   注意：`stream done` 的时间戳是**完成时刻**而非请求时刻，长流式请求可能晚于
   completed_at 才回包；因此尾部分析只作信号，主判据放在引擎侧的目标闭合证据上。
2. unknown —— 没有失败证据，但证据不足，**不允许判 done**
   a. 时间窗内任何网关日志都没有一行记录（没有可核对的模型调用证据）
   b. first_run_at / completed_at 缺失，无法界定时间窗
   c. 既无 goal 节点也无 intent 节点（无法核对目标闭合情况）
3. done —— 证据充分且无上述失败信号

`warnings` 单独记录「发生过但已恢复」的事件（例如中途撞 402 后切上游跑完），
不推翻 done，但必须出现在报告里，避免把「恢复」误读成「全程正常」。

刻意不用的判据
--------------
- **tokens**：任务 #14 假性 done 时 activity 也累计了 222 万 input tokens，
  token 数完全不能区分「在干活」和「在报错重试」。
- **findings == 0**：这本身不是完成证明，也不是失败证明，只能作为组合条件之一。

数据源
------
- PostgreSQL：`tasks` / `exploration_nodes` / `activity` / `findings`
  （用 psql 子进程 + 单条 JSON 聚合查询；本机未装 psycopg2，且 `postgres://`
   conninfo 在本机 Git Bash 会被 SIGTERM，故一律用分离参数）
- 网关日志：`*.log` 中能识别出 `[YYYY-MM-DD HH:MM:SS]` + 网关事件行的文件，
  按任务时间窗过滤。多个网关实例（8790 / 8791）的日志会合并统计。
- provenance：`*.jsonl` 结构化模型溯源记录（网关 v2 产出）。优先按 `task_id`
  精确关联，无 task_id 时退化为时间窗关联。历史任务没有这类记录，属正常。

用法
----
  python task_liveness.py 14                 # 单任务，人读输出
  python task_liveness.py 13 14 15 16       # 多任务
  python task_liveness.py --all             # 最近 20 个任务
  python task_liveness.py --all --json      # 机器可读证据包（stdout）
  python task_liveness.py 14 --report out.json   # 写证据包到文件

退出码：0=全部 done；1=存在 incomplete；2=存在 unknown 且无 incomplete；
        3=运行错误（连不上库 / 找不到 psql）。

环境变量
--------
  ARTEX_PSQL      psql 可执行文件路径（默认自动探测）
  PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD   数据库连接（默认本机 5433/artex）
  LIVENESS_LOGS   额外日志目录或逗号分隔的日志文件（默认扫脚本所在目录 *.log）
  LIVENESS_PAD    时间窗起点向前容差秒数，默认 120（终点固定只放宽 2 秒）
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- 配置

def _psql_path() -> str:
    env = os.environ.get("ARTEX_PSQL")
    if env and os.path.isfile(env):
        return env
    found = shutil.which("psql")
    if found:
        return found
    fallback = r"C:\Users\yuao\.workbuddy\binaries\postgres\pgsql\bin\psql.exe"
    if os.path.isfile(fallback):
        return fallback
    raise RuntimeError("找不到 psql：请设置 ARTEX_PSQL 或把 psql 放进 PATH")


PG = {
    "host": os.environ.get("PGHOST", "127.0.0.1"),
    "port": os.environ.get("PGPORT", "5433"),
    "user": os.environ.get("PGUSER", "artex"),
    "dbname": os.environ.get("PGDATABASE", "artex"),
}
PAD_SECONDS = int(os.environ.get("LIVENESS_PAD", "120"))

TS_RE = re.compile(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s*(.*)$")
HTTP_ERR_RE = re.compile(r"UPSTREAM HTTP (\d{3})")
NET_ERR_RE = re.compile(r"UPSTREAM ERROR")
CHAT_RE = re.compile(r"chat model=(\S+)")
DONE_RE = re.compile(r"(?:stream done|non-stream done)")
MODEL_REQ_RE = re.compile(r"chat model=")
UPSTREAM_ANY_RE = re.compile(r"UPSTREAM ")
FALLBACK_RE = re.compile(r"GATEWAY_FALLBACK")
FAILFAST_RE = re.compile(r"COMPARE_FAILFAST")
BAD_CODES = (402, 408, 409, 425, 429, 500, 502, 503, 504)

# ---------------------------------------------------------------- 数据库

# 一条 SQL 出完整 JSON，避免多次往返与 psycopg2 依赖。
TASK_SQL_TMPL = """
SELECT coalesce(json_agg(row_to_json(x)), '[]'::json) FROM (
  SELECT
    t.id, t.name, t.status, t.exploration_id, t.llm_profile_id,
    to_char(t.created_at,    'YYYY-MM-DD HH24:MI:SS') AS created_at,
    to_char(t.first_run_at,  'YYYY-MM-DD HH24:MI:SS') AS first_run_at,
    to_char(t.completed_at,  'YYYY-MM-DD HH24:MI:SS') AS completed_at,
    (SELECT count(*) FROM findings f WHERE f.task_id = t.id) AS findings,
    (SELECT coalesce(json_agg(json_build_object('kind', n.kind, 'state', n.state)), '[]'::json)
       FROM exploration_nodes n WHERE n.exploration_id = t.exploration_id) AS nodes,
    (SELECT count(*) FROM activity a WHERE a.exploration_id = t.exploration_id) AS activities,
    (SELECT count(*) FROM activity a
      WHERE a.exploration_id = t.exploration_id AND a.is_error) AS activity_errors,
    (SELECT to_char(min(a.created_at), 'YYYY-MM-DD HH24:MI:SS') FROM activity a
      WHERE a.exploration_id = t.exploration_id) AS act_first,
    (SELECT to_char(max(a.created_at), 'YYYY-MM-DD HH24:MI:SS') FROM activity a
      WHERE a.exploration_id = t.exploration_id) AS act_last
  FROM tasks t
  WHERE {where}
  ORDER BY t.id
) x;
"""


def run_sql(sql: str):
    psql = _psql_path()
    cmd = [
        psql, "-w", "-h", PG["host"], "-p", PG["port"], "-U", PG["user"],
        "-d", PG["dbname"], "-A", "-t", "-P", "pager=off", "-P", "footer=off",
        "-c", sql,
    ]
    env = dict(os.environ)
    env.setdefault("PGPASSWORD", "")
    env.setdefault("PGCLIENTENCODING", "UTF8")
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", env=env, timeout=60)
    if p.returncode != 0:
        raise RuntimeError("psql 失败 (rc=%d): %s" % (p.returncode, p.stderr.strip()[:400]))
    return p.stdout.strip()


def fetch_tasks(ids=None, all_recent=False):
    if ids:
        where = "t.id IN (%s)" % ",".join(str(int(i)) for i in ids)
    elif all_recent:
        where = "t.id IN (SELECT id FROM tasks ORDER BY id DESC LIMIT 20)"
    else:
        where = "t.id IN (SELECT id FROM tasks ORDER BY id DESC LIMIT 1)"
    return json.loads(run_sql(TASK_SQL_TMPL.format(where=where)))


# ---------------------------------------------------------------- 日志

def _parse_ts(s):
    if not s:
        return None
    try:
        return dt.datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def log_files():
    """挑出真正属于 LLM 网关的日志文件（按内容特征，不按文件名猜）。"""
    extra = os.environ.get("LIVENESS_LOGS", "").strip()
    candidates = []
    if extra:
        for part in extra.split(","):
            part = part.strip()
            if os.path.isdir(part):
                candidates += glob.glob(os.path.join(part, "*.log"))
            elif os.path.isfile(part):
                candidates.append(part)
    candidates += glob.glob(os.path.join(HERE, "*.log"))
    out = []
    for path in sorted(set(os.path.abspath(p) for p in candidates)):
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                head = f.read(200_000)
        except OSError:
            continue
        if MODEL_REQ_RE.search(head) or UPSTREAM_ANY_RE.search(head) or DONE_RE.search(head):
            out.append(path)
    return out


def provenance_files():
    """扫 provenance JSONL（网关 v2 写的结构化模型溯源记录）。"""
    paths = list(glob.glob(os.path.join(HERE, "*.jsonl")))
    extra = os.environ.get("LIVENESS_LOGS", "").strip()
    if extra:
        for part in extra.split(","):
            part = part.strip()
            if os.path.isdir(part):
                paths += glob.glob(os.path.join(part, "*.jsonl"))
            elif part.endswith(".jsonl") and os.path.isfile(part):
                paths.append(part)
    return sorted(set(os.path.abspath(p) for p in paths))


def scan_provenance(paths, t0, t1, task_id):
    """按 task_id 精确关联；没有 task_id 的记录退化为时间窗关联。"""
    out = {"files": [], "records": 0, "models": {}, "fallback": 0,
           "failfast": 0, "compare_records": 0, "matched_by": "none"}
    if t0 is None or t1 is None:
        return out
    models = Counter()
    matched_id, matched_window = 0, 0
    for path in paths:
        hit = 0
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    ts = _parse_ts(rec.get("ts"))
                    if ts is None or ts < t0 or ts > t1:
                        continue
                    rid_task = str(rec.get("task_id") or "")
                    if rid_task:
                        if rid_task != str(task_id):
                            continue
                        matched_id += 1
                    else:
                        matched_window += 1
                    hit += 1
                    out["records"] += 1
                    if rec.get("model"):
                        models[rec["model"]] += 1
                    if rec.get("fallback"):
                        out["fallback"] += 1
                    if rec.get("failfast"):
                        out["failfast"] += 1
                    if rec.get("compare"):
                        out["compare_records"] += 1
        except OSError:
            continue
        if hit:
            out["files"].append(os.path.basename(path))
    out["models"] = dict(models)
    if matched_id:
        out["matched_by"] = "task_id"
    elif matched_window:
        out["matched_by"] = "time_window"
    return out


def scan_window(files, t0, t1, completed_at=None):
    """统计 [t0, t1] 时间窗内的网关事件，并保留有序事件序列供尾部分析。"""
    stat = {
        "files": [], "lines": 0, "requests": 0, "successes": 0,
        "http_errors": {}, "net_errors": 0, "fallback_events": 0,
        "failfast_events": 0, "models": {},
        "last_ok": None, "last_bad": None, "tail_bad": 0,
        "tail_events": [], "completed_gap_s": None,
    }
    if t0 is None or t1 is None:
        return stat
    err_counter = Counter()
    model_counter = Counter()
    events = []  # [(ts_str, "ok"|"bad")]
    for path in files:
        hit = 0
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    m = TS_RE.match(line.rstrip("\r\n"))
                    if not m:
                        continue
                    ts = _parse_ts(m.group(1))
                    if ts is None or ts < t0 or ts > t1:
                        continue
                    body = m.group(2)
                    if not (MODEL_REQ_RE.search(body) or UPSTREAM_ANY_RE.search(body)
                            or DONE_RE.search(body) or FALLBACK_RE.search(body)
                            or FAILFAST_RE.search(body)):
                        continue
                    hit += 1
                    stat["lines"] += 1
                    stamp = m.group(1)
                    cm = CHAT_RE.search(body)
                    if cm:
                        stat["requests"] += 1
                        model_counter[cm.group(1)] += 1
                    is_ok, is_bad = False, False
                    if DONE_RE.search(body):
                        stat["successes"] += 1
                        is_ok = True
                    hm = HTTP_ERR_RE.search(body)
                    if hm:
                        err_counter[int(hm.group(1))] += 1
                        is_bad = True
                    if NET_ERR_RE.search(body):
                        stat["net_errors"] += 1
                        is_bad = True
                    if FALLBACK_RE.search(body):
                        stat["fallback_events"] += 1
                    if FAILFAST_RE.search(body):
                        stat["failfast_events"] += 1
                        is_bad = True
                    if is_ok:
                        events.append((stamp, "ok"))
                    elif is_bad:
                        events.append((stamp, "bad"))
        except OSError:
            continue
        if hit:
            stat["files"].append({"path": os.path.basename(path), "lines": hit})
    stat["http_errors"] = {str(k): v for k, v in sorted(err_counter.items())}
    stat["models"] = dict(model_counter)
    stat["bad_responses"] = sum(v for k, v in err_counter.items() if k in BAD_CODES)
    stat["bad_responses"] += stat["net_errors"]

    # --- 尾部形态：最后一次成功之后是否只剩错误 ---
    events.sort(key=lambda e: e[0])
    ok_positions = [i for i, (_, k) in enumerate(events) if k == "ok"]
    tail = events[ok_positions[-1] + 1:] if ok_positions else events
    tail = [e for e in tail if e[1] == "bad"]
    stat["tail_bad"] = len(tail)
    stat["tail_events"] = [{"at": s, "kind": k} for s, k in tail[-8:]]
    if ok_positions:
        stat["last_ok"] = events[ok_positions[-1]][0]
    bad_positions = [i for i, (_, k) in enumerate(events) if k == "bad"]
    if bad_positions:
        stat["last_bad"] = events[bad_positions[-1]][0]
        done_ts = _parse_ts(completed_at)
        bad_ts = _parse_ts(stat["last_bad"])
        if done_ts and bad_ts:
            stat["completed_gap_s"] = int((done_ts - bad_ts).total_seconds())
    return stat


# ---------------------------------------------------------------- 判定

def judge(task, gw, prov):
    """返回 (verdict, reasons, warnings, facts)。有失败证据优先，其次 unknown，最后 done。"""
    nodes = task.get("nodes") or []
    states = Counter((n.get("state") or "").lower() for n in nodes)
    kinds = Counter((n.get("kind") or "").lower() for n in nodes)

    goal_nodes = [n for n in nodes if (n.get("kind") or "").lower() == "goal"]
    goals_total = len(goal_nodes)
    goals_met = sum(1 for n in goal_nodes
                    if (n.get("state") or "").lower() in ("met", "done", "confirmed"))
    # 没有显式 goal 节点时，用 intent 的闭合状态做代理，但必须标注 proxy。
    goal_basis = "goal"
    if goals_total == 0:
        goal_basis = "intent(proxy)"
        goals_total = kinds.get("intent", 0)
        goals_met = sum(1 for n in nodes
                        if (n.get("kind") or "").lower() == "intent"
                        and (n.get("state") or "").lower() in ("done", "met", "confirmed"))

    blocked = states.get("blocked", 0) + states.get("stopped", 0)
    open_intents = states.get("open", 0) + states.get("exhausted", 0) + blocked
    closed_states = ("met", "done", "confirmed")
    goal_closed = any(
        (n.get("kind") or "").lower() in ("goal", "intent")
        and (n.get("state") or "").lower() in closed_states
        for n in nodes
    )
    confirmed_findings = sum(
        1 for n in nodes
        if (n.get("kind") or "").lower() == "finding"
        and (n.get("state") or "").lower() == "confirmed"
    )
    goal_closed = goal_closed or confirmed_findings > 0
    goal_evidence = []
    if any((n.get("kind") or "").lower() == "goal"
           and (n.get("state") or "").lower() in closed_states for n in nodes):
        goal_evidence.append("goal met")
    if any((n.get("kind") or "").lower() == "intent"
           and (n.get("state") or "").lower() in ("done", "met") for n in nodes):
        goal_evidence.append("intent done")
    if confirmed_findings:
        goal_evidence.append("confirmed finding x%d" % confirmed_findings)
    findings = int(task.get("findings") or 0)
    acts = int(task.get("activities") or 0)
    errs = int(task.get("activity_errors") or 0)

    facts = {
        "task_id": task["id"],
        "engine_status": task.get("status"),
        "findings": findings,
        "activities": acts,
        "activity_errors": errs,
        "activity_error_rate": round(errs / acts, 4) if acts else None,
        "goals_met": goals_met,
        "goals_total": goals_total,
        "goal_basis": goal_basis,
        "goal_closed": goal_closed,
        "goal_evidence": goal_evidence,
        "confirmed_finding_nodes": confirmed_findings,
        "blocked_or_stopped_intents": blocked,
        "open_or_exhausted_intents": open_intents,
        "node_states": dict(states),
        "gateway": gw,
        "provenance": prov,
        "window": {"from": gw.pop("_t0", None), "to": gw.pop("_t1", None)},
    }

    reasons, warnings = [], []

    # --- 硬失败证据
    if task.get("status") != "done":
        reasons.append("引擎 status=%s（非 done）" % task.get("status"))
    if acts == 0:
        reasons.append("activity 记录为 0，引擎没有产生任何动作")
    if gw["lines"] > 0 and gw["bad_responses"] > 0 and gw["successes"] == 0:
        reasons.append("网关窗口内 %d 次上游错误且 0 次成功响应（模型没干活）"
                       % gw["bad_responses"])
    gap = gw.get("completed_gap_s")
    tail_fail = (gw["tail_bad"] >= 2 and gap is not None and -60 <= gap <= 300)
    if tail_fail and not goal_closed:
        reasons.append(
            "尾部连续失败且目标未闭合：最后一次成功 %s 之后 %d 次上游错误、再无成功，"
            "任务在最后一次错误后 %ds 就 done；引擎侧无 goal met / intent done / "
            "confirmed finding 任一闭合证据"
            % (gw.get("last_ok") or "(无成功)", gw["tail_bad"], gap))
    if (blocked >= 1 and findings == 0 and goals_met == 0
            and gw["successes"] < 10):
        reasons.append("根/子意图处于 blocked|stopped，且 findings=0、goals_met=0，"
                       "且成功响应 <10（组合条件，避免误杀真跑完的零发现任务）")
    if gw["failfast_events"] > 0:
        reasons.append("对照模式触发 fail-fast（%d 次），本次运行被显式中断"
                       % gw["failfast_events"])

    # --- 证据不足（不能判 done）
    unknown = []
    if not task.get("first_run_at") or not task.get("completed_at"):
        unknown.append("缺少 first_run_at / completed_at，无法界定时间窗")
    elif gw["lines"] == 0:
        unknown.append("时间窗内没有任何网关日志行，缺少模型调用证据")
    if goals_total == 0:
        unknown.append("既无 goal 也无 intent 节点，无法核对目标闭合")

    # --- 警告（不推翻 done）
    if gw["bad_responses"] > 0 and gw["successes"] > 0 and gw["tail_bad"] == 0:
        warnings.append("窗口内发生过 %d 次上游错误，随后有 %d 次成功响应且尾部无残留错误 → "
                        "「中断后恢复」，非全程正常"
                        % (gw["bad_responses"], gw["successes"]))
    if gw["tail_bad"] > 0:
        if tail_fail and goal_closed:
            warnings.append("尾部有未恢复的上游错误，但引擎已留下目标闭合证据（%s）→ "
                            "判为「收尾期额度耗尽」，核心产物已落库，仍需人工确认收尾完整性"
                            % ("、".join(goal_evidence) or "-"))
        else:
            warnings.append("窗口尾部仍有 %d 次上游错误且未再成功（末次成功=%s）"
                            % (gw["tail_bad"], gw.get("last_ok") or "无"))
    if gw["fallback_events"] > 0:
        warnings.append("日志中有 %d 次上游切换事件；模型对照实验中这是污染，须核对 provenance"
                        % gw["fallback_events"])
    if prov["records"] > 0:
        warnings.append("provenance: %d 条(%s)，模型=%s%s"
                        % (prov["records"], prov["matched_by"],
                           ",".join(prov["models"]) or "-",
                           "【对照实验】" if prov["compare_records"] else ""))
    if prov["fallback"] > 0:
        warnings.append("provenance 显示本次任务发生过 %d 次模型切换 → "
                        "该任务的模型对照数据不可用于「只换模型」的对比"
                        % prov["fallback"])
    if prov["failfast"] > 0:
        warnings.append("provenance 中有 %d 条 fail-fast 记录（对照模式显式失败）"
                        % prov["failfast"])
    if findings == 0:
        warnings.append("findings=0 本身不构成完成证明（也不构成失败证明），已结合其余判据")
    if acts and errs / acts > 0.10:
        warnings.append("activity 错误率 %.1f%% 偏高" % (100 * errs / acts))
    if open_intents > 0:
        warnings.append("仍有 %d 个 intent 处于 open/exhausted/blocked 未闭合" % open_intents)
    warnings.append("token 数未参与判定：假性 done 的任务同样会累计百万级 input tokens")

    if reasons:
        return "incomplete", reasons, warnings, facts
    if unknown:
        return "unknown", unknown, warnings, facts
    return "done", ["证据充分：网关有成功响应、无致命错误、目标状态可核对"], warnings, facts


def evaluate(task, files, prov_files=None):
    pad = dt.timedelta(seconds=PAD_SECONDS)
    start_candidates = [_parse_ts(task.get("first_run_at")),
                        _parse_ts(task.get("act_first")),
                        _parse_ts(task.get("created_at"))]
    start_candidates = [x for x in start_candidates if x is not None]
    end_candidates = [_parse_ts(task.get("completed_at")),
                      _parse_ts(task.get("act_last"))]
    end_candidates = [x for x in end_candidates if x is not None]
    t0 = (min(start_candidates) - pad) if start_candidates else None
    # 上界只放宽 2 秒（容忍秒级时间戳精度），不能像下界那样放 120 秒：
    # 否则会把任务完成后其它请求（例如手动测网关）扫进窗口，污染「尾部形态」判定。
    t1 = (max(end_candidates) + dt.timedelta(seconds=2)) if end_candidates else None
    gw = scan_window(files, t0, t1, task.get("completed_at"))
    prov = scan_provenance(prov_files or [], t0, t1, task["id"])
    gw["_t0"] = t0.strftime("%Y-%m-%d %H:%M:%S") if t0 else None
    gw["_t1"] = t1.strftime("%Y-%m-%d %H:%M:%S") if t1 else None
    verdict, reasons, warnings, facts = judge(task, gw, prov)
    return {
        "verdict": verdict,
        "task_id": task["id"],
        "name": task.get("name"),
        "reasons": reasons,
        "warnings": warnings,
        "facts": facts,
        "checked_at": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "judge_version": "1.0",
    }


# ---------------------------------------------------------------- 输出

def human(results):
    print("=" * 78)
    print("ARTEX 任务活性校验  |  judge_version=1.0  |  只读，未修改任何引擎表")
    print("=" * 78)
    for r in results:
        f, gw = r["facts"], r["facts"]["gateway"]
        print("\n[#%s] %s" % (r["task_id"], (r["name"] or "")[:56]))
        print("  判定: %s   (引擎 status=%s)" % (r["verdict"].upper(), f["engine_status"]))
        print("  证据: 网关窗口 %s ~ %s" % (f["window"]["from"], f["window"]["to"]))
        print("        日志行=%d 请求=%d 成功=%d 上游错误=%d  net错误=%d  模型=%s"
              % (gw["lines"], gw["requests"], gw["successes"], gw["bad_responses"],
                 gw["net_errors"], ",".join(gw["models"]) or "-"))
        show_gap = (gw.get("completed_gap_s") is not None and gw["tail_bad"] > 0)
        gap_txt = ("%ds" % gw["completed_gap_s"] if show_gap else "-")
        print("        尾部: 末次成功=%s  之后错误=%d  done距末次错误=%s"
              % (gw.get("last_ok") or "-", gw["tail_bad"], gap_txt))
        print("        findings=%d  activity=%d(错误%d)  goals=%d/%d(%s)  目标闭合=%s(%s)  blocked=%d"
              % (f["findings"], f["activities"], f["activity_errors"],
                 f["goals_met"], f["goals_total"], f["goal_basis"],
                 f["goal_closed"], ",".join(f["goal_evidence"]) or "无",
                 f["blocked_or_stopped_intents"]))
        if f["provenance"]["records"] > 0:
            p = f["provenance"]
            print("        provenance: %d条(%s) 模型=%s 切换=%d failfast=%d 对照=%d"
                  % (p["records"], p["matched_by"], ",".join(p["models"]) or "-",
                     p["fallback"], p["failfast"], p["compare_records"]))
        for x in r["reasons"]:
            print("    - 依据: %s" % x)
        for x in r["warnings"]:
            print("    ! %s" % x)
    print("\n" + "-" * 78)
    c = Counter(r["verdict"] for r in results)
    print("汇总: done=%d  incomplete=%d  unknown=%d"
          % (c["done"], c["incomplete"], c["unknown"]))
    print("退出码语义: 0=全 done, 1=有 incomplete, 2=有 unknown, 3=运行错误")
    return c


def main(argv=None):
    ap = argparse.ArgumentParser(description="ARTEX 任务活性独立校验器（只读）")
    ap.add_argument("ids", nargs="*", type=int, help="任务 id，可多个")
    ap.add_argument("--all", action="store_true", help="校验最近 20 个任务")
    ap.add_argument("--json", action="store_true", help="stdout 输出完整 JSON 证据包")
    ap.add_argument("--report", metavar="PATH", help="把 JSON 证据包写到文件")
    ap.add_argument("--no-logs", action="store_true",
                    help="忽略网关日志（日志已被轮转时使用；此时缺证据会判 unknown）")
    args = ap.parse_args(argv)

    try:
        tasks = fetch_tasks(args.ids or None, args.all)
    except Exception as e:
        print("ERROR: 读取数据库失败: %s" % e, file=sys.stderr)
        return 3
    if not tasks:
        print("ERROR: 没有匹配的任务", file=sys.stderr)
        return 3

    files = [] if args.no_logs else log_files()
    prov_files = [] if args.no_logs else provenance_files()
    results = [evaluate(t, files, prov_files) for t in tasks]
    results.sort(key=lambda r: r["task_id"])

    payload = {
        "judge_version": "1.0",
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "log_sources": [os.path.basename(p) for p in files],
        "provenance_sources": [os.path.basename(p) for p in prov_files],
        "tasks": results,
    }
    if args.report:
        out = os.path.abspath(args.report)
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print("证据包已写入: %s" % out)
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        c = human(results)
        if c["incomplete"]:
            return 1
        if c["unknown"]:
            return 2
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
