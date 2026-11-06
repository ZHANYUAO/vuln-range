-- 本地授权靶场企业与范围（仅 127.0.0.1，自建靶场）
INSERT INTO companies (name, nkey)
VALUES ('本地靶场 MiniShop', '本地靶场 minishop')
ON CONFLICT (nkey) DO NOTHING;

INSERT INTO company_scope (company_id, kind, net, raw, reason)
SELECT id, 'ip', '127.0.0.1/32', '127.0.0.1', '本地自建授权靶场 127.0.0.1:8899'
FROM companies WHERE nkey = '本地靶场 minishop'
  AND NOT EXISTS (SELECT 1 FROM company_scope WHERE kind='ip' AND net='127.0.0.1/32');

INSERT INTO company_scope (company_id, kind, domain, raw, reason)
SELECT id, 'domain', 'localhost', 'localhost', '本地回环域名'
FROM companies WHERE nkey = '本地靶场 minishop'
  AND NOT EXISTS (SELECT 1 FROM company_scope WHERE kind='domain' AND domain='localhost');

SELECT c.id, c.name, s.kind, coalesce(s.net, s.domain, s.value) AS scope_value, s.reason
FROM companies c JOIN company_scope s ON s.company_id = c.id;
