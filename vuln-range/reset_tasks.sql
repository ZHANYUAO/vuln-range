-- 清空上一轮误建的任务与探索（seed 把示例 URL http://target 误解析成了站点）
DELETE FROM tasks;
DELETE FROM explorations;
