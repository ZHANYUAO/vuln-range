#!/usr/bin/env python3
"""legacy_app.py —— 最小「传统表单登录栈」，只为验证闸门的一条分支。

为什么需要它
------------
2026-10-29 自检发现：`classify_block` 只认 401/407。
传统栈未认证时的表现是 **302 → /login**，而 urllib 默认跟随重定向，
最终 status 变成登录页的 200 —— 于是攻击断言在登录页 HTML 上不成立 →
结论被写成 `rejected`，读者理解成「漏洞不存在」，实际只是「我没带会话」。
Juice Shop 是 JSON API（返回 401），测不出这条路，所以单独做一个靶。

行为
----
  GET  /admin   无 SESSION=ok cookie → 302 /login；有 → 200 内含 ADMIN-PANEL-SECRET
  POST /login   form: user=admin&pass=admin123 → 302 /admin，并 Set-Cookie
  GET  /public  永远 200，不含 SECRET（用作 control：同一站点、非敏感内容）

只监听 127.0.0.1，端口 8896。
"""
import http.server
import urllib.parse

PORT = 8896
SECRET = "ADMIN-PANEL-SECRET"


class H(http.server.BaseHTTPRequestHandler):
    def _send(self, code, body, extra=None):
        raw = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw)

    def _authed(self):
        return "SESSION=ok" in (self.headers.get("Cookie") or "")

    def do_GET(self):
        p = urllib.parse.urlparse(self.path).path
        if p == "/login":
            return self._send(200, "<form method=post action=/login>login page</form>")
        if p == "/public":
            return self._send(200, "<p>public info</p>")
        if p == "/admin":
            if not self._authed():
                # 关键：传统栈就是这样挡人的 —— 302，不是 401。
                return self._send(302, "", {"Location": "/login?next=/admin"})
            return self._send(200, "<div>%s</div>" % SECRET)
        if p == "/go":
            # 开放重定向：Location 直接取请求参数，没有任何白名单。
            # 加这个端点的目的（2026-11-02）：验证闸门能不能判「302 型漏洞」。
            # urllib 默认跟随重定向，最终 status 会变成目标站的响应码，
            # 于是 Location 里的证据在闸门侧**根本看不到**。
            to = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("to", ["/"])[0]
            return self._send(302, "", {"Location": to})
        return self._send(404, "not found")

    def do_POST(self):
        p = urllib.parse.urlparse(self.path).path
        n = int(self.headers.get("Content-Length") or 0)
        form = urllib.parse.parse_qs(self.rfile.read(n).decode())
        if p == "/login" and form.get("user") == ["admin"] and form.get("pass") == ["admin123"]:
            return self._send(302, "", {"Location": "/admin", "Set-Cookie": "SESSION=ok; Path=/"})
        return self._send(401, "bad credentials")

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print("legacy stack on http://127.0.0.1:%d  (GET /admin 无会话 → 302 /login)" % PORT)
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
