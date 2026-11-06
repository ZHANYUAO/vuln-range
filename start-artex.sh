#!/usr/bin/env bash
# ARTEX 本地启动脚本（Windows / Git Bash）
# 用法： bash start-artex.sh            # 前台启动 ARTEX（PG 自动拉起）
#        bash start-artex.sh stop       # 停止所有相关进程
#
# 启动后访问： http://127.0.0.1:8787   （首次进入走 /setup 初始化）
#
# LLM 配置走环境变量，**不要把 key 写进本文件**：
#   export OPENAI_API_KEY=...                                 # OpenAI 兼容端点用这个
#   export ARTEX_LLM_PROVIDER=openai                          # openai | anthropic | openai-responses
#   export ARTEX_LLM_BASE_URL=https://integrate.api.nvidia.com/v1
#   export ARTEX_LLM_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
# 不设 LLM 时服务照常起、UI 照常开，但引擎 idle，不能执行任务。
#
# ── NVIDIA 端点可用模型（2026-10-12 实测，按延迟）──────────────────────────
#   nvidia/nemotron-3.5-lightning-30b-a3b   5.6s   ← 推荐，官方定位长程 agent
#   nvidia/nemotron-3-super-120b-a12b       18.6s  1M context
#   openai/gpt-oss-20b                      27.2s
#   z-ai/glm-5.3-flash                      88.8s
#   ✗ kimi-k3 / deepseek-v4.1-flash / glm-5.3   持续超时（就是报告里攻击者用的那几个）
#   ✗ 约 40 个模型 HTTP 404 Function Not Found（serverless 未部署/下架）

PG_HOME="/c/Users/yuao/.workbuddy/binaries/postgres"
PG_BIN="$PG_HOME/pgsql/bin"
PG_DATA="$(cd "$PG_HOME" && pwd -W)\\pgdata"
PG_PORT=5433
ARTEX_DIR="/c/Users/yuao/WorkBuddy/2026-10-10-17-02-37/ARTEX"

pg_ready() { "$PG_BIN/psql.exe" -h 127.0.0.1 -p "$PG_PORT" -U artex -d postgres -c "select 1" >/dev/null 2>&1; }

if [ "$1" = "stop" ]; then
  echo "停止 ARTEX 与 PostgreSQL ..."
  taskkill //F //IM artex.exe 2>/dev/null | head -2
  taskkill //F //IM postgres.exe 2>/dev/null | head -2
  echo "已停止"
  exit 0
fi

# 1) 拉起 PostgreSQL（若未运行）
if pg_ready; then
  echo "[ok] PostgreSQL 已在 $PG_PORT 运行"
else
  echo "[..] 启动 PostgreSQL ..."
  if [ -f "$PG_HOME/pgdata/postmaster.pid" ]; then rm -f "$PG_HOME/pgdata/postmaster.pid"; fi
  nohup "$PG_BIN/postgres.exe" -D "$PG_DATA" -p "$PG_PORT" > "$PG_HOME/pg-run.log" 2>&1 &
  for i in $(seq 1 15); do pg_ready && break; sleep 1; done
  pg_ready && echo "[ok] PostgreSQL 就绪" || { echo "[!!] PostgreSQL 启动失败，见 $PG_HOME/pg-run.log"; exit 1; }
fi

# 2) 检查 LLM 配置
if [ -n "$OPENAI_API_KEY" ] || [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "[ok] LLM: ${ARTEX_LLM_PROVIDER:-auto推断} / ${ARTEX_LLM_MODEL:-默认} @ ${ARTEX_LLM_BASE_URL:-官方端点}"
else
  echo "[warn] 未设 OPENAI_API_KEY / ANTHROPIC_API_KEY —— 引擎将 idle，只能看 UI 不能跑任务"
fi

# 3) 启动 ARTEX
cd "$ARTEX_DIR" || exit 1
export ARTEX_PG_DSN="postgres://artex@127.0.0.1:$PG_PORT/artex?sslmode=disable"

# agent 的 bash 工具在 Windows 上实际执行 PowerShell（norma tool/shellCmd()），
# 子进程继承本 PATH。把 python 显式带上，否则 agent 发 HTTP 请求时会找不到 python。
PY_MANAGED="/c/Users/yuao/.workbuddy/binaries/python/versions/3.13.12"
if [ -d "$PY_MANAGED" ]; then
  export PATH="$PY_MANAGED:$PATH"
fi
echo "[..] 启动 ARTEX → http://127.0.0.1:8787"
exec ./artex.exe -addr 127.0.0.1:8787
