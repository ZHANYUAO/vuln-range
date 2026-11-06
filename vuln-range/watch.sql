-- 监控一次任务运行：探索图 / finding / LLM 调用 / 资产
\pset pager off

\echo '===== 任务 ====='
SELECT id, description, status, created_at
FROM tasks ORDER BY id DESC LIMIT 5;

\echo '===== 探索节点（按类型）====='
SELECT type, count(*) FROM exploration_nodes GROUP BY type ORDER BY 2 DESC;

\echo '===== 探索边（按关系）====='
SELECT rel, count(*) FROM exploration_edges GROUP BY rel ORDER BY 2 DESC;

\echo '===== 最新 10 个节点 ====='
SELECT id, type, left(summary, 60) AS summary
FROM exploration_nodes ORDER BY id DESC LIMIT 10;

\echo '===== Findings ====='
SELECT id, left(title, 50) AS title, severity, status
FROM findings ORDER BY id DESC LIMIT 10;

\echo '===== LLM 调用统计 ====='
SELECT count(*) AS calls,
       sum(prompt_tokens) AS prompt_tok,
       sum(completion_tokens) AS comp_tok
FROM llm_usage;

\echo '===== 资产 ====='
SELECT type, count(*) FROM assets GROUP BY type ORDER BY 2 DESC;
