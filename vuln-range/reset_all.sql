-- 清空上一轮实战数据，保留配置表（companies / company_scope / agents / users / llm_profiles）
-- 用动态 DO 块：清空除白名单外的所有 public 表，避免漏表或表不存在报错
DO $$
DECLARE
    keep text[] := ARRAY[
        'companies', 'company_scope', 'agents', 'users', 'llm_profiles',
        'schema_migrations', 'goose_db_version'
    ];
    t text;
BEGIN
    FOR t IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        ORDER BY tablename
    LOOP
        IF NOT (t = ANY(keep)) THEN
            EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', t);
            RAISE NOTICE 'truncated: %', t;
        END IF;
    END LOOP;
END $$;

-- 核验：配置表应保留
SELECT 'companies' AS tbl, count(*) FROM companies
UNION ALL SELECT 'company_scope', count(*) FROM company_scope
UNION ALL SELECT 'agents', count(*) FROM agents;
