-- 建立「外部官方授权靶场」企业与其 scope
-- 授权依据：站点首页明文声明 deliberately vulnerable（Acunetix 官方 demo 站）
DELETE FROM tasks WHERE id = 1;

INSERT INTO companies (name, nkey)
VALUES ('Acunetix 官方授权靶场', 'acunetix vulnweb')
ON CONFLICT (nkey) DO NOTHING;

INSERT INTO company_scope (company_id, kind, domain, raw, reason)
SELECT id, 'domain', 'testasp.vulnweb.com', 'testasp.vulnweb.com',
       'Acunetix 官方 demo 站，首页声明 deliberately vulnerable to SQL Injections, directory traversal'
FROM companies WHERE nkey = 'acunetix vulnweb'
ON CONFLICT DO NOTHING;

INSERT INTO company_scope (company_id, kind, domain, raw, reason)
SELECT id, 'domain', 'testaspnet.vulnweb.com', 'testaspnet.vulnweb.com',
       'Acunetix 官方 demo 站（ASP.NET 版本），同上授权声明'
FROM companies WHERE nkey = 'acunetix vulnweb'
ON CONFLICT DO NOTHING;

SELECT c.id, c.name, s.kind, coalesce(s.net::text, s.domain, s.value) AS scope_value, s.reason
FROM companies c JOIN company_scope s ON s.company_id = c.id
ORDER BY c.id, s.id;
