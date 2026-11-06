#!/usr/bin/env python3
"""ARTEX 本地授权靶场（故意留洞，仅监听 127.0.0.1，用于安全教学与工具验证）

包含的漏洞类型（全部为本地自造，不涉及任何外部系统）：
  1. SQL 注入（/search、/login）            - sqlite 字符串拼接
  2. 反射型 XSS（/search）                   - 未转义回显
  3. 目录遍历（/download?file=）             - 未校验 ../
  4. 敏感文件泄露（/.env、/.git/config、/backup.sql）
  5. 未授权访问（/admin、/api/users）        - 无鉴权，直接暴露用户与 API Key
  6. 安全响应头缺失                          - 无 CSP / X-Frame-Options，Server 版本泄露
  7. robots.txt 暴露后台路径
  8. 目录列表开启（/static/）
"""
import http.server
import json
import os
import socketserver
import sqlite3
import urllib.parse

PORT = 8899
# 目录遍历被限制在本工作区内，绝不越出（安全第一，即使它是靶场）
ROOT = os.path.dirname(os.path.abspath(__file__))
SECRETS_DIR = os.path.join(ROOT, "secrets")

DB = sqlite3.connect(":memory:", check_same_thread=False)
DB.execute(
    "CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT,"
    " email TEXT, role TEXT, api_key TEXT)"
)
DB.executemany(
    "INSERT INTO users VALUES (?,?,?,?,?,?)",
    [
        (1, "admin", "admin123", "admin@range.local", "admin", "AK-LIVE-9f2a3c8e1b4d"),
        (2, "alice", "wonderland", "alice@range.local", "user", "AK-LIVE-7712de90aa3f"),
        (3, "bob", "builder1", "bob@range.local", "user", "AK-LIVE-3341bc77ef05"),
    ],
)
DB.execute("CREATE TABLE orders (id INTEGER, user_id INTEGER, total REAL, note TEXT)")
DB.executemany(
    "INSERT INTO orders VALUES (?,?,?,?)",
    [(1001, 2, 199.0, "VIP 订单"), (1002, 3, 39.9, "普通订单")],
)
DB.commit()

LEAKS = {
    "/.env": (
        "DB_HOST=127.0.0.1\nDB_USER=range\nDB_PASS=RangePass!2026\n"
        "SECRET_KEY=dev-secret-do-not-ship\nAGNES_API_KEY=sk-live-DEADBEEF12345678\n"
    ),
    "/.git/config": (
        '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n'
        '[remote "origin"]\n\turl = http://range.local/git/backend.git\n'
    ),
    "/backup.sql": (
        "CREATE TABLE users (...);\nINSERT INTO users VALUES (1,'admin','admin123',"
        "'admin@range.local','admin','AK-LIVE-9f2a3c8e1b4d');\n"
    ),
    "/robots.txt": "User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /backup.sql\n",
}


def page(title: str, body: str) -> str:
    return (
        "<!doctype html><html><head><meta charset='utf-8'><title>"
        + title
        + "</title></head><body style='font-family:system-ui;margin:40px'>"
        + body
        + "<hr><p style='color:#888'>MiniShop v0.3.1 — internal test instance</p>"
        "</body></html>"
    )


class Range(http.server.BaseHTTPRequestHandler):
    server_version = "nginx/1.18.0 (Ubuntu)"
    sys_version = ""

    def log_message(self, fmt, *args):
        print("[range] %s - %s" % (self.address_string(), fmt % args))

    def _send(self, code: int, body, ctype: str = "text/html; charset=utf-8"):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Server", "nginx/1.18.0 (Ubuntu)")
        self.send_header("X-Powered-By", "PHP/7.4.3")
        # 故意不加 CSP / X-Frame-Options / X-Content-Type-Options
        self.end_headers()
        self.wfile.write(body)

    def _q(self, key: str, default: str = "") -> str:
        return self._params.get(key, [default])[0]

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        self._params = urllib.parse.parse_qs(parsed.query)

        if path in LEAKS:
            ctype = "text/plain; charset=utf-8"
            if path == "/robots.txt":
                ctype = "text/plain; charset=utf-8"
            return self._send(200, LEAKS[path].encode(), ctype)

        if path == "/":
            return self._send(200, page("MiniShop", """
<h1>MiniShop — 内部测试站点</h1>
<ul>
  <li><a href="/search?q=alice">/search?q=</a> 用户搜索</li>
  <li><a href="/login?username=admin&amp;password=x">/login?username=&amp;password=</a> 登录</li>
  <li><a href="/product?id=1">/product?id=</a> 商品详情</li>
  <li><a href="/download?file=readme.txt">/download?file=</a> 附件下载</li>
  <li><a href="/static/">/static/</a> 静态资源</li>
  <li><a href="/api/users">/api/users</a> 用户接口</li>
  <li><a href="/admin">/admin</a> 管理后台</li>
</ul>"""))

        if path == "/search":
            q = self._q("q")
            sql = "SELECT id,username,email,role FROM users WHERE username LIKE '%" + q + "%'"
            rows = "<tr><td colspan=4>无结果</td></tr>"
            err = ""
            try:
                cur = DB.execute(sql)
                got = cur.fetchall()
                if got:
                    rows = "".join(
                        "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % r for r in got
                    )
            except Exception as e:  # SQL 报错直接回显 —— 方便探测注入
                err = "<pre style='color:#c00'>SQL error: %s</pre>" % e
            # 反射点：q 未做任何转义 → 反射型 XSS
            return self._send(200, page("搜索", """
<h1>用户搜索</h1>
<form><input name=q value="%s" placeholder="用户名"><button>搜索</button></form>
<p>查询： %s</p>
%s
<table border=1 cellpadding=6><tr><th>id</th><th>用户名</th><th>邮箱</th><th>角色</th></tr>%s</table>
""") % (q, q, err, rows))

        if path == "/login":
            u = self._q("username")
            p = self._q("password")
            if u or p:
                sql = (
                    "SELECT id,username,role FROM users WHERE username='" + u +
                    "' AND password='" + p + "'"
                )
                try:
                    r = DB.execute(sql).fetchone()
                except Exception as e:
                    return self._send(200, page("登录", "<h1>登录</h1><pre style='color:#c00'>SQL error: %s</pre>" % e))
                if r:
                    return self._send(200, page("登录", "<h1>登录成功</h1><p>欢迎 %s（角色 %s）</p>" % (r[1], r[2])))
                return self._send(200, page("登录", "<h1>登录失败</h1><p>用户名或密码错误</p>"))
            return self._send(200, page("登录", """
<h1>登录</h1>
<form><input name=username placeholder=用户名><input name=password placeholder=密码>
<button>登录</button></form>"""))

        if path == "/product":
            pid = self._q("id", "1")
            sql = "SELECT id,user_id,total,note FROM orders WHERE id=" + pid
            out = "<tr><td colspan=4>无此订单</td></tr>"
            err = ""
            try:
                got = DB.execute(sql).fetchall()
                if got:
                    out = "".join("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % r for r in got)
            except Exception as e:
                err = "<pre style='color:#c00'>SQL error: %s</pre>" % e
            return self._send(200, page("商品", "<h1>订单查询</h1>%s<table border=1 cellpadding=6>%s</table>" % (err, out)))

        if path == "/download":
            name = self._q("file", "readme.txt")
            # 目录遍历：直接 join，未做 realpath 校验
            target = os.path.normpath(os.path.join(SECRETS_DIR, name))
            if not target.startswith(ROOT):
                return self._send(403, page("403", "<h1>越界被拒（靶场限制）</h1>"))
            try:
                with open(target, "rb") as f:
                    return self._send(200, f.read(), "application/octet-stream")
            except Exception as e:
                return self._send(404, page("404", "<h1>文件不存在</h1><pre>%s</pre>" % e))

        if path.startswith("/static/"):
            rel = path[len("/static/"):]
            d = os.path.join(SECRETS_DIR, "static")
            target = os.path.normpath(os.path.join(d, rel))
            if os.path.isdir(target):  # 目录列表开启
                names = os.listdir(target)
                lst = "".join("<li><a href='%s'>%s</a></li>" % (n, n) for n in names)
                return self._send(200, page("目录列表", "<h1>/static/</h1><ul>%s</ul>" % lst))
            try:
                with open(target, "rb") as f:
                    return self._send(200, f.read(), "application/octet-stream")
            except Exception:
                return self._send(404, page("404", "<h1>404</h1>"))

        if path == "/api/users":  # 未授权接口
            rows = DB.execute("SELECT id,username,email,role,api_key FROM users").fetchall()
            data = [dict(zip(["id", "username", "email", "role", "api_key"], r)) for r in rows]
            return self._send(200, json.dumps(data, ensure_ascii=False, indent=2).encode(),
                              "application/json; charset=utf-8")

        if path == "/admin":  # 后台无鉴权
            rows = DB.execute("SELECT id,username,password,email,role,api_key FROM users").fetchall()
            out = "".join("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td><code>%s</code></td></tr>" % r
                          for r in rows)
            return self._send(200, page("管理后台", """
<h1>管理后台（未做鉴权）</h1>
<table border=1 cellpadding=6><tr><th>id</th><th>用户名</th><th>密码</th><th>邮箱</th>
<th>角色</th><th>API Key</th></tr>%s</table>""" % out))

        return self._send(404, page("404", "<h1>404 Not Found</h1><p>%s</p>" % path))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    os.makedirs(os.path.join(SECRETS_DIR, "static"), exist_ok=True)
    with open(os.path.join(SECRETS_DIR, "readme.txt"), "w", encoding="utf-8") as f:
        f.write("内部说明：本目录含部署脚本草稿，勿外传。\n")
    with open(os.path.join(SECRETS_DIR, "deploy-note.txt"), "w", encoding="utf-8") as f:
        f.write("staging 部署账号：deploy / Deploy@2026\n")
    for n in ["logo.png", "app.js", "old-theme.css"]:
        with open(os.path.join(SECRETS_DIR, "static", n), "w", encoding="utf-8") as f:
            f.write("placeholder\n")

    with Server(("127.0.0.1", PORT), Range) as httpd:
        print("[range] 靶场已启动 http://127.0.0.1:%d （仅本机可访问）" % PORT)
        httpd.serve_forever()
