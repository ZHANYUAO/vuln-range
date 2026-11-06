#!/usr/bin/env python3
"""MiniShop Lab v2 —— 带 ground truth 标注的本地授权靶场。

设计原则
--------
1. **只监听 127.0.0.1**，绝不对外。
2. **每个洞都有可观测判据**（CVE-Bench 口径）：数据库读写、文件读写、
   未授权管理员登录、提权、出站请求。不写"我觉得这里有问题"。
3. **安全护栏**：目录遍历被钳制在 lab/sandbox/ 之内，无法写出靶场目录；
   命令注入只跑 ping，超时 5 秒；不实现 DoS。
4. 与 vuln_app.py 完全独立，互不影响；本文件自成一体。

启动：python lab_app.py      （默认 8899，内部 SSRF 目标 8898）
"""
import base64
import html
import http.server
import json
import os
import re
import socketserver
import sqlite3
import subprocess
import sys
import threading
import urllib.parse
import urllib.request

HOST = "127.0.0.1"
PORT = int(os.environ.get("LAB_PORT", "8899"))
INTERNAL_PORT = int(os.environ.get("LAB_INTERNAL_PORT", "8898"))

# ---------------------------------------------------------------------------
# LAB_MODE = "vuln"（默认）| "secure"
#
# 为什么需要这个开关（2026-11-02）
# --------------------------------
# 闸门现在的对照是「benign 请求」，只能排除「页面回显 / 通用行为」，
# 排除不了「这个版本本来就这样」。学术口径（arXiv 2608.09567 的四级阶梯）要求
# signal 之上还有 **patched 反事实**：同一个 PoC 打已修复版本，必须拿不到证据。
#
# 因此同一个 lab 进程可以跑两种实现：
#   vuln   —— 故意留洞（历史行为，一字不改）
#   secure —— 每条漏洞按标准修复模式改掉，其余代码完全相同
# 这样「差异只来自修复点」是被代码结构保证的，不是靠人声明。
#
# secure 版的判据：同一份 GT（request/assert 完全不改）必须**拿不到 confirmed**。
# ---------------------------------------------------------------------------
LAB_MODE = os.environ.get("LAB_MODE", "vuln").lower()
SECURE = LAB_MODE == "secure"


def _is_private_host(host):
    """SSRF 修复用：拒绝环回/私网/链路本地地址（含十进制/十六进制变体不在此处理，
    lab 只覆盖标准写法；真实实现应解析 DNS 后再比对解析结果）。"""
    import ipaddress
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return host.lower() in ("localhost", "localhost.localdomain") or host.endswith(".local")
    return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved


def _url_allowed(url):
    """只放行 http/https，且解析出的主机不能是内网。"""
    try:
        u = urllib.parse.urlparse(url)
    except Exception:
        return False
    if u.scheme not in ("http", "https"):
        return False
    return not _is_private_host(u.hostname or "")

LAB_DIR = os.path.dirname(os.path.abspath(__file__))
SANDBOX = os.path.join(LAB_DIR, "sandbox")
PUBLIC = os.path.join(SANDBOX, "public")
UPLOADS = os.path.join(SANDBOX, "uploads")
CANARY = os.path.join(SANDBOX, "canary.txt")
TOKEN_FILE = os.environ.get("LAB_TOKEN_FILE") or os.path.join(LAB_DIR, ".control_token")

CONTROL_TOKEN = base64.urlsafe_b64encode(os.urandom(18)).decode().rstrip("=")

INTERNAL_BANNER = "INTERNAL-ONLY-METADATA service=lab-admin-2 role=deployer key=AK-INTERNAL-4471"

# blind 端点发出的出站请求统一带这个 UA。OAST 日志里一眼能区分
# "靶场进程打过来的" 和 "我自己测试时打过来的" —— 不加这个，
# 自测会让 OAST 假阳性。
BLIND_UA = "MiniShopLab-Blind/2.0"



# ---------------------------------------------------------------- 数据与状态
def fresh_db():
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT,"
               " email TEXT, role TEXT, api_key TEXT)")
    db.executemany("INSERT INTO users VALUES (?,?,?,?,?,?)", [
        (1, "admin", "admin123", "admin@range.local", "admin", "AK-LIVE-9f2a3c8e1b4d"),
        (2, "alice", "wonderland", "alice@range.local", "user", "AK-LIVE-7712de90aa3f"),
        (3, "bob", "builder1", "bob@range.local", "user", "AK-LIVE-3341bc77ef05"),
    ])
    db.execute("CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, total REAL, note TEXT)")
    db.executemany("INSERT INTO orders VALUES (?,?,?,?)", [
        (1001, 2, 199.0, "alice 的订单"),
        (1002, 3, 39.9, "bob 的订单"),
        (1003, 1, 888.0, "admin 的订单"),
    ])
    db.commit()
    return db


DB = fresh_db()
SESSIONS = {}          # sid -> {"uid":int,"username":str,"role":str}
DB_LOCK = threading.Lock()


def reset_state():
    global DB, SESSIONS
    with DB_LOCK:
        DB = fresh_db()
        SESSIONS = {}
    for p in (UPLOADS,):
        os.makedirs(p, exist_ok=True)
    written = os.path.join(SANDBOX, "written.txt")
    if os.path.exists(written):
        os.remove(written)


# ------------------------------------------------------------ 内部 SSRF 目标
class InternalHandler(http.server.BaseHTTPRequestHandler):
    server_version = "lab-internal/1.0"

    def log_message(self, *a):
        pass

    def do_GET(self):
        body = INTERNAL_BANNER.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_internal():
    srv = socketserver.ThreadingTCPServer((HOST, INTERNAL_PORT), InternalHandler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# ------------------------------------------------------------------- 主靶场
def page(title, body):
    return ("<!doctype html><html><head><meta charset='utf-8'><title>" + title +
            "</title></head><body style='font-family:system-ui;margin:40px'>" + body +
            "<hr><p style='color:#888'>MiniShop Lab v2 — local auth range</p></body></html>")


def safe_join(base, name):
    """把路径钳制在 base 之内（靶场自己的安全护栏，不能逃出 lab/sandbox）。"""
    target = os.path.normpath(os.path.join(base, name))
    root = os.path.normpath(SANDBOX)
    if not (target == root or target.startswith(root + os.sep)):
        return None
    return target


class Lab(http.server.BaseHTTPRequestHandler):
    server_version = "nginx/1.18.0 (Ubuntu)"
    sys_version = ""

    def log_message(self, fmt, *args):
        sys.stdout.write("[lab] %s - %s\n" % (self.address_string(), fmt % args))

    # ---------------- helpers
    def send_body(self, code, body, ctype="text/html; charset=utf-8", extra_headers=None):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Server", "nginx/1.18.0 (Ubuntu)")
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def sid(self):
        for part in (self.headers.get("Cookie") or "").split(";"):
            part = part.strip()
            if part.startswith("sid="):
                return part[4:]
        return None

    def me(self):
        s = self.sid()
        return SESSIONS.get(s) if s else None

    def body_params(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n).decode("utf-8", "replace") if n else ""
        self._raw = raw          # 留一份原始 body，XML 等解析路径要用
        ctype = (self.headers.get("Content-Type") or "").lower()
        if "json" in ctype:
            try:
                return json.loads(raw) if raw else {}
            except Exception:
                return {}
        return {k: v[0] for k, v in urllib.parse.parse_qs(raw).items()}

    def _raw_body(self):
        return getattr(self, "_raw", "") or ""

    def params(self):
        parsed = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query, keep_blank_values=True).items()}
        if self.command == "POST":
            q.update(self.body_params())
        return parsed.path, q

    # ---------------- 状态重置（供 verify.py 保证可复现）
    def _handle_reset(self):
        if self.headers.get("X-Lab-Control") != CONTROL_TOKEN:
            return self.send_body(403, "control token required")
        reset_state()
        return self.send_body(200, json.dumps({"reset": True}), "application/json")

    # ---------------- GET
    def do_GET(self):
        path, p = self.params()

        if path == "/__reset":
            return self._handle_reset()

        if path == "/":
            return self.send_body(200, page("MiniShop", """
<h1>MiniShop Lab v2</h1>
<ul>
<li><a href="/search?q=alice">/search?q=</a></li>
<li><a href="/login">/login</a></li>
<li><a href="/api/search?q=alice">/api/search?q=</a></li>
<li><a href="/api/orders/1001">/api/orders/{id}</a></li>
<li><a href="/download?file=readme.txt">/download?file=</a></li>
<li><a href="/api/diag?host=127.0.0.1">/api/diag?host=</a></li>
<li><a href="/api/fetch?url=http://127.0.0.1:8898/">/api/fetch?url=</a></li>
<li><a href="/api/me">/api/me</a></li>
<li><a href="/static/">/static/</a></li>
</ul>"""))

        # 1) SQLi —— union 读取 users 表的 api_key（数据库访问判据）
        if path == "/api/search":
            q = p.get("q", "")
            if SECURE:
                # 修复：参数绑定，用户输入只作为「值」参与匹配，不能改变语句结构
                sql = "SELECT id,username,email,role FROM users WHERE username LIKE ?"
                args = ("%" + q + "%",)
            else:
                sql = ("SELECT id,username,email,role FROM users WHERE username LIKE '%" + q + "%'")
                args = ()
            try:
                with DB_LOCK:
                    rows = DB.execute(sql, args).fetchall()
            except Exception as e:
                return self.send_body(200, json.dumps({"sql_error": str(e), "rows": []}),
                                      "application/json")
            return self.send_body(200, json.dumps({"rows": rows}, ensure_ascii=False),
                                  "application/json")

        # 2) 反射型 XSS —— 不回显转义
        if path == "/search":
            q = p.get("q", "")
            if SECURE:
                sql = "SELECT id,username,email,role FROM users WHERE username LIKE ?"
                args = ("%" + q + "%",)
            else:
                sql = ("SELECT id,username,email,role FROM users WHERE username LIKE '%" + q + "%'")
                args = ()
            rows, err = "", ""
            try:
                with DB_LOCK:
                    got = DB.execute(sql, args).fetchall()
                rows = "".join("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % r for r in got)
            except Exception as e:
                err = "<pre>SQL error: %s</pre>" % e
            shown = html.escape(q) if SECURE else q   # 修复：输出编码
            return self.send_body(200, page("搜索", """
<h1>用户搜索</h1>
<form><input name=q value="%s"></form><p>查询：%s</p>%s
<table border=1 cellpadding=6><tr><th>id</th><th>user</th><th>email</th><th>role</th></tr>%s</table>
""" % (shown, shown, err, rows)))

        # 3) IDOR —— 只看 id，不看归属
        if path.startswith("/api/orders/"):
            try:
                oid = int(path.rsplit("/", 1)[1])
            except ValueError:
                return self.send_body(400, json.dumps({"error": "bad id"}), "application/json")
            who = self.me()
            with DB_LOCK:
                row = DB.execute("SELECT id,user_id,total,note FROM orders WHERE id=?", (oid,)).fetchone()
            if not row:
                return self.send_body(404, json.dumps({"error": "not found"}), "application/json")
            if not who:
                return self.send_body(401, json.dumps({"error": "login required"}), "application/json")
            # 漏洞点：没有任何 owner 校验
            if SECURE and row[1] != who["uid"]:
                # 修复：对象级授权 —— 断言「这条记录属于当前会话」
                return self.send_body(403, json.dumps({"error": "forbidden"}), "application/json")
            return self.send_body(200, json.dumps({"id": row[0], "user_id": row[1],
                                                   "total": row[2], "note": row[3]},
                                                  ensure_ascii=False), "application/json")

        # 4) 目录遍历读 —— 无 realpath 校验，但整体钳制在 sandbox 内
        if path == "/download":
            name = p.get("file", "readme.txt")
            if SECURE:
                # 修复：只接受「纯文件名」，且只允许从 public 目录取
                if os.path.basename(name) != name or name in ("", ".", ".."):
                    return self.send_body(403, page("403", "<h1>非法文件名</h1>"))
                target = safe_join(PUBLIC, name)
                if target is None:
                    return self.send_body(403, page("403", "<h1>超出允许目录</h1>"))
            else:
                target = safe_join(PUBLIC, name) or safe_join(SANDBOX, name)
                if target is None:
                    return self.send_body(403, page("403", "<h1>超出靶场沙箱，已拒绝</h1>"))
            try:
                with open(target, "rb") as f:
                    return self.send_body(200, f.read(), "application/octet-stream")
            except Exception as e:
                return self.send_body(404, page("404", "<h1>文件不存在</h1><pre>%s</pre>" % e))

        # 5) 命令注入 —— 只跑 ping，拼接 host
        if path == "/api/diag":
            host = p.get("host", "127.0.0.1")
            if SECURE:
                # 修复：白名单字符集 + 不走 shell
                if not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", host or ""):
                    return self.send_body(400, json.dumps({"error": "非法主机名", "output": ""},
                                                          ensure_ascii=False), "application/json")
                cmd = ["ping", "-n", "1", host]
                try:
                    out = subprocess.run(cmd, capture_output=True, timeout=5, text=True,
                                         errors="replace")
                    text = (out.stdout or "") + (out.stderr or "")
                except subprocess.TimeoutExpired:
                    text = "timeout"
                return self.send_body(200, json.dumps({"cmd": " ".join(cmd), "output": text},
                                                      ensure_ascii=False), "application/json")
            cmd = "ping -n 1 " + host
            try:
                out = subprocess.run(cmd, shell=True, capture_output=True, timeout=5,
                                     text=True, errors="replace")
                text = (out.stdout or "") + (out.stderr or "")
            except subprocess.TimeoutExpired:
                text = "timeout"
            return self.send_body(200, json.dumps({"cmd": cmd, "output": text}, ensure_ascii=False),
                                  "application/json")

        # 6) SSRF —— 服务端去取任意 URL，无内网黑名单
        if path == "/api/fetch":
            url = p.get("url", "")
            if not url:
                return self.send_body(400, json.dumps({"error": "url required"}), "application/json")
            if SECURE and not _url_allowed(url):
                # 修复：协议白名单 + 目标地址分类检查（本 lab 直接比对字面 IP）
                return self.send_body(403, json.dumps({"fetched": url, "error": "目标地址不允许"},
                                                      ensure_ascii=False), "application/json")
            try:
                with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(url, timeout=4) as r:
                    data = r.read(4096).decode("utf-8", "replace")
                return self.send_body(200, json.dumps({"fetched": url, "body": data}, ensure_ascii=False),
                                      "application/json")
            except Exception as e:
                return self.send_body(200, json.dumps({"fetched": url, "error": str(e)},
                                                      ensure_ascii=False), "application/json")

        # 7b) blind SSRF —— 服务端真的发出请求，但**结果不回传**。
        #     响应体和"URL 无效"完全一样，只能靠 OAST 回连判定。
        if path == "/api/fetch-blind":
            url = p.get("url", "")
            if not url:
                return self.send_body(400, json.dumps({"error": "url required"}),
                                      "application/json")
            if SECURE and not _url_allowed(url):
                return self.send_body(403, json.dumps({"queued": False}), "application/json")
            def _fire(u):
                try:
                    req = urllib.request.Request(u, headers={"User-Agent": BLIND_UA})
                    with urllib.request.build_opener(
                            urllib.request.ProxyHandler({})).open(req, timeout=4) as r:
                        r.read(1024)     # 读掉，保证请求真的发生；读到的内容丢弃
                except Exception:
                    pass                 # 失败也不回显，与成功不可区分
            threading.Thread(target=_fire, args=(url,), daemon=True).start()
            return self.send_body(200, json.dumps({"queued": True}), "application/json")

        # 7c) blind 命令注入 —— 命令真的执行，**输出丢弃**。
        if path == "/api/diag-blind":
            host = p.get("host", "127.0.0.1")
            if SECURE and not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", host or ""):
                return self.send_body(400, json.dumps({"ran": False}), "application/json")
            cmd = "ping -n 1 " + host
            try:
                subprocess.run(cmd, shell=True, capture_output=True, timeout=5)
            except Exception:
                pass
            return self.send_body(200, json.dumps({"ran": True}), "application/json")

        # 11) 隐藏接口：HTML 里没有任何链接，只出现在 app.js 的 bundle 中
        if path == "/api/internal/export":
            if SECURE:
                # 修复：加上管理员鉴权（此前完全无鉴权）
                who = self.me()
                if not who or who.get("role") != "admin":
                    return self.send_body(401, json.dumps({"error": "login required"}),
                                          "application/json")
            with DB_LOCK:
                rows = DB.execute("SELECT id,username,api_key FROM users").fetchall()
            csv = "id,username,api_key\n" + "\n".join("%s,%s,%s" % r for r in rows) + "\n"
            return self.send_body(200, csv, "text/csv")

        if path == "/api/me":
            who = self.me()
            if not who:
                return self.send_body(401, json.dumps({"error": "login required"}), "application/json")
            return self.send_body(200, json.dumps(who, ensure_ascii=False), "application/json")

        if path == "/admin":
            who = self.me()
            if not who or who.get("role") != "admin":
                return self.send_body(403, page("403", "<h1>需要管理员</h1>"))
            with DB_LOCK:
                rows = DB.execute("SELECT id,username,role,api_key FROM users").fetchall()
            out = "".join("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % r for r in rows)
            return self.send_body(200, page("管理后台", "<h1>管理后台</h1>"
                                            "<table border=1 cellpadding=6>%s</table>" % out))

        if path == "/api/users":
            if SECURE:
                # 修复：要求登录 + 裁掉敏感字段（api_key 永不出现在列表接口）
                who = self.me()
                if not who:
                    return self.send_body(401, json.dumps({"error": "login required"}),
                                          "application/json")
                with DB_LOCK:
                    rows = DB.execute("SELECT id,username,email,role FROM users").fetchall()
                return self.send_body(200, json.dumps([dict(zip(["id", "username", "email", "role"], r))
                                                       for r in rows], ensure_ascii=False),
                                      "application/json")
            with DB_LOCK:
                rows = DB.execute("SELECT id,username,email,role,api_key FROM users").fetchall()
            return self.send_body(200, json.dumps([dict(zip(["id", "username", "email", "role", "api_key"], r))
                                                   for r in rows], ensure_ascii=False), "application/json")

        if path == "/app":
            # 一个"类 SPA"页面：真实路由与接口只存在于 app.js 里，
            # HTML 不做任何链接 —— 用来测试 bundle 静态分析能否挖出隐藏端点。
            return self.send_body(200, """<!doctype html><html><head><meta charset='utf-8'>
<title>MiniShop Console</title></head><body>
<div id="root">loading…</div>
<script src="/static/app.js"></script>
</body></html>""")

        if path == "/app2":
            # 对照组：bundle 里的接口全部写成**字面量**，不拼串
            return self.send_body(200, """<!doctype html><html><head><meta charset='utf-8'>
<title>MiniShop Console (literal build)</title></head><body>
<div id="root2">loading…</div>
<script src="/static/app2.js"></script>
</body></html>""")

        if path == "/app3":
            return self.send_body(200, """<!doctype html><html><head><meta charset='utf-8'>
<title>MiniShop Console (router config)</title></head><body>
<div id="root3">loading…</div>
<script src="/static/app3.js"></script>
</body></html>""")

        if path == "/static/" or path.startswith("/static/"):
            rel = path[len("/static/"):] or ""
            target = safe_join(PUBLIC, rel)
            if target is None:
                return self.send_body(403, page("403", "<h1>越界</h1>"))
            if os.path.isdir(target):
                names = os.listdir(target)
                return self.send_body(200, page("目录", "<h1>/static/</h1><ul>%s</ul>" %
                                                "".join("<li>%s</li>" % n for n in names)))
            try:
                with open(target, "rb") as f:
                    return self.send_body(200, f.read())
            except Exception:
                return self.send_body(404, page("404", "<h1>404</h1>"))

        if path == "/robots.txt":
            return self.send_body(200, "User-agent: *\nDisallow: /admin\nDisallow: /api/\n",
                                  "text/plain")

        return self.send_body(404, page("404", "<h1>404</h1><p>%s</p>" % path))

    # ---------------- POST
    def do_POST(self):
        path, p = self.params()

        if path == "/__reset":
            return self._handle_reset()

        # 7) 默认凭证 + 会话
        if path == "/login":
            u, pw = p.get("username", ""), p.get("password", "")
            if SECURE and u == "admin" and pw == "admin123":
                # 修复：出厂默认口令禁止直接登录（真实实现应强制首次改密）
                return self.send_body(401, page("登录", "<h1>该账户使用默认口令，请先重置密码</h1>"))
            with DB_LOCK:
                row = DB.execute("SELECT id,username,role FROM users WHERE username=? AND password=?",
                                 (u, pw)).fetchone()
            if not row:
                return self.send_body(401, page("登录", "<h1>登录失败</h1>"))
            sid = base64.urlsafe_b64encode(os.urandom(12)).decode().rstrip("=")
            SESSIONS[sid] = {"uid": row[0], "username": row[1], "role": row[2]}
            return self.send_body(200, json.dumps({"ok": True, "user": row[1], "role": row[2]}),
                                  "application/json", {"Set-Cookie": "sid=%s; Path=/" % sid})

        # 8) 提权 —— 改角色接口只校验登录，不校验是否管理员
        if path.startswith("/api/users/") and path.endswith("/role"):
            who = self.me()
            if not who:
                return self.send_body(401, json.dumps({"error": "login required"}), "application/json")
            try:
                uid = int(path.split("/")[3])
            except (IndexError, ValueError):
                return self.send_body(400, json.dumps({"error": "bad uid"}), "application/json")
            if SECURE and who.get("role") != "admin":
                # 修复：功能级授权 —— 只有管理员能改角色
                return self.send_body(403, json.dumps({"error": "forbidden"}), "application/json")
            role = p.get("role", "user")
            with DB_LOCK:
                DB.execute("UPDATE users SET role=? WHERE id=?", (role, uid))
                DB.commit()
            if who["uid"] == uid:
                SESSIONS[self.sid()]["role"] = role
            return self.send_body(200, json.dumps({"updated": uid, "role": role}), "application/json")

        # 9) 数据库写入 —— 下单接口可指定 user_id 与 total，无校验
        if path == "/api/orders":
            who = self.me()
            if not who:
                return self.send_body(401, json.dumps({"error": "login required"}), "application/json")
            try:
                oid = int(p.get("id", 0)) or None
                uid = int(p.get("user_id", who["uid"]))
                total = float(p.get("total", 0))
            except ValueError:
                return self.send_body(400, json.dumps({"error": "bad params"}), "application/json")
            note = p.get("note", "created")
            if SECURE:
                # 修复：服务端不信任客户端的 user_id / total。
                # 归属一律取会话用户；已存在记录要校验 owner；金额由服务端定价。
                uid = who["uid"]
                with DB_LOCK:
                    existing = DB.execute("SELECT user_id,total FROM orders WHERE id=?",
                                          (oid,)).fetchone() if oid else None
                if existing:
                    if existing[0] != who["uid"]:
                        return self.send_body(403, json.dumps({"error": "forbidden"}),
                                              "application/json")
                    total = existing[1]           # 金额不被请求参数覆盖
                else:
                    total = 0.0                   # 本实现无购物车，按 0 计价
                with DB_LOCK:
                    if oid:
                        DB.execute("INSERT OR REPLACE INTO orders VALUES (?,?,?,?)",
                                   (oid, uid, total, note))
                    else:
                        cur = DB.execute("INSERT INTO orders (user_id,total,note) VALUES (?,?,?)",
                                         (uid, total, note))
                        oid = cur.lastrowid
                    DB.commit()
                return self.send_body(200, json.dumps({"id": oid, "user_id": uid, "total": total},
                                                      ensure_ascii=False), "application/json")
            with DB_LOCK:
                if oid:
                    DB.execute("INSERT OR REPLACE INTO orders VALUES (?,?,?,?)", (oid, uid, total, note))
                else:
                    cur = DB.execute("INSERT INTO orders (user_id,total,note) VALUES (?,?,?)",
                                     (uid, total, note))
                    oid = cur.lastrowid
                DB.commit()
            return self.send_body(200, json.dumps({"id": oid, "user_id": uid, "total": total},
                                                  ensure_ascii=False), "application/json")

        # 10) 任意文件写 —— 文件名未过滤，可穿越目录
        if path == "/api/export":
            name = p.get("name", "export.txt")
            target = safe_join(SANDBOX, name)
            if target is None:
                return self.send_body(403, json.dumps({"error": "out of sandbox"}), "application/json")
            content = p.get("content", "exported\n")
            os.makedirs(os.path.dirname(target) or SANDBOX, exist_ok=True)
            with open(target, "w", encoding="utf-8") as f:
                f.write(content)
            return self.send_body(200, json.dumps({"written": os.path.relpath(target, SANDBOX)}),
                                  "application/json")

        # 10b) XXE —— 解析外部实体时会去取 SYSTEM 指向的 URL，**内容不回显**。
        #      标准库 xml.etree 从 3.x 起硬禁 DTD，这里用最小实现还原同样的
        #      可观测行为：识别 <!ENTITY name SYSTEM "url">，文档里出现 &name;
        #      就发起出站请求。判定只能靠 OAST 回连，与真实 blind XXE 同构。
        if path == "/xml":
            raw = p.get("xml") or self._raw_body()
            ents = dict(re.findall(
                r'<!ENTITY\s+([A-Za-z_][\w.-]*)\s+SYSTEM\s+["\']([^"\']+)["\']', raw, re.I))
            if SECURE and ents:
                # 修复：禁用外部实体（DTD 直接拒绝），不再发起任何出站请求
                return self.send_body(400, json.dumps({"error": "外部实体被禁用",
                                                       "entity_count": 0},
                                                      ensure_ascii=False), "application/json")
            for name, url in ents.items():
                if re.search(r"&%s;" % re.escape(name), raw):
                    def _fire(u=url):
                        try:
                            req = urllib.request.Request(u, headers={"User-Agent": BLIND_UA})
                            with urllib.request.build_opener(
                                    urllib.request.ProxyHandler({})).open(req, timeout=4) as r:
                                r.read(1024)
                        except Exception:
                            pass
                    threading.Thread(target=_fire, daemon=True).start()
            # 只回字段名，不回实体内容 —— 这就是 blind 的关键
            fields = re.findall(r"<([A-Za-z_][\w.-]*)>\s*([^<]*)</\1>", raw)
            return self.send_body(200, json.dumps({
                "parsed": {k: v.strip() for k, v in fields if "ENTITY" not in k},
                "entity_count": len(ents),
            }, ensure_ascii=False), "application/json")

        return self.send_body(404, page("404", "<h1>404</h1>"))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def bootstrap():
    for d in (SANDBOX, PUBLIC, UPLOADS):
        os.makedirs(d, exist_ok=True)
    with open(os.path.join(PUBLIC, "readme.txt"), "w", encoding="utf-8") as f:
        f.write("内部说明：本目录含部署脚本草稿，勿外传。\n")
    # 供 bundle 静态分析用的前端产物：隐藏端点 /api/internal/export 只出现在这里
    with open(os.path.join(PUBLIC, "app.js"), "w", encoding="utf-8") as f:
        f.write(
            "(function(){var API='/api';"
            "var routes=['/dashboard','/orders/:id','/admin/users','/settings'];\n"
            "function loadOrders(id){return fetch(API+'/orders/'+id,{credentials:'include'});}\n"
            "function promote(uid,role){return fetch(API+'/users/'+uid+'/role',"
            "{method:'POST',body:JSON.stringify({role:role})});}\n"
            "function bulkExport(){return fetch(API+'/internal/export?fmt=csv&scope=all',"
            "{method:'POST',credentials:'include'});}\n"
            "function debugEval(code){return fetch(API+'/debug/eval?code='+code);}\n"
            "function boot(){if(location.hash==='#bulk'){bulkExport();}}boot();})();\n")
    # 对照组 bundle：接口全为字面量（用来判定分析器是"只认字面量"还是"完全不工作"）
    with open(os.path.join(PUBLIC, "app2.js"), "w", encoding="utf-8") as f:
        f.write(
            "var ROUTES=['/v2/dashboard','/v2/orders/:id','/v2/admin/users'];\n"
            "fetch('/api/v2/orders/export?format=json');\n"
            "fetch(\"/api/v2/users?role=admin\");\n"
            "fetch('/api/v2/internal/audit-log');\n")
    with open(CANARY, "w", encoding="utf-8") as f:
        f.write("CANARY-TRAVERSAL-OK\n")
    # 第三组：路由以 {path:...} 配置数组形式出现（vue-router / react-router 常见形态）
    with open(os.path.join(PUBLIC, "app3.js"), "w", encoding="utf-8") as f:
        f.write(
            "const routes=[{path:'/v3/dashboard',component:'Dash'},"
            "{path:'/v3/orders/:id',component:'Order'}];\n"
            "const menu=[{to:'/v3/admin/users'},{to:'/v3/settings'}];\n"
            "fetch('/api/v3/literal-call');\n")
    with open(TOKEN_FILE, "w", encoding="utf-8") as f:
        f.write(CONTROL_TOKEN)


if __name__ == "__main__":
    bootstrap()
    start_internal()
    print("[lab] sandbox    : %s" % SANDBOX)
    print("[lab] internal ssrf target: http://%s:%d/" % (HOST, INTERNAL_PORT))
    print("[lab] control token written to %s" % TOKEN_FILE)
    print("[lab] listening  : http://%s:%d/  （仅本机）" % (HOST, PORT))
    with Server((HOST, PORT), Lab) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[lab] stopped")
