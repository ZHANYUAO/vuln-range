-- 建立「HCL/IBM AltoroJ 官方授权靶场」企业与其 scope
-- 授权依据：站点页脚原文 "published by HCL Technologies, Ltd. for the sole purpose of
--   demonstrating the effectiveness of HCL products in detecting web application vulnerabilities
--   and website defects. This site is not a real banking site."
INSERT INTO companies (name, nkey)
VALUES ('HCL AltoroJ 官方授权靶场 (demo.testfire.net)', 'altoroj testfire')
ON CONFLICT (nkey) DO NOTHING;

INSERT INTO company_scope (company_id, kind, domain, raw, reason)
SELECT id, 'domain', 'demo.testfire.net', 'http://demo.testfire.net',
       'HCL/IBM AltoroJ 官方 demo：页脚明文声明建站目的即用于演示 Web 应用漏洞检测；源码开源于 github.com/AppSecDev/AltoroJ'
FROM companies WHERE nkey = 'altoroj testfire'
ON CONFLICT DO NOTHING;

SELECT c.id, c.name, s.kind, coalesce(s.net::text, s.domain, s.value) AS scope_value
FROM companies c JOIN company_scope s ON s.company_id = c.id
ORDER BY c.id, s.id;
