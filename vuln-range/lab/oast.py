#!/usr/bin/env python3
"""本地 OAST（Out-of-Band Application Security Testing）收集器。

为什么需要它
------------
有回显的漏洞（响应体里带出数据）靠差分双控就能判。但真实世界里大量漏洞
**不回显**：
    - blind SSRF：服务端发了请求，响应被丢弃
    - blind 命令注入：命令执行了，输出没有回传
    - XXE：实体被解析，结果不在响应里
    - blind XSS：payload 存进后台，等管理员浏览才触发
这些情况"响应看起来正常"和"没漏洞"完全一样。唯一可靠的判据是
**带外回连**：让 payload 指向一个我们控制的地址，然后看有没有人打过来。

设计
----
1. **只绑 127.0.0.1**，不对外，不解析真实 DNS。
2. 任意路径都当 token 记录：`/oast/<token>` 会记成 hit(token)。
   这样一条 payload 一个 token，互不串味。
3. 控制面 `/__log` `/__clear` `/__hits/<token>`，与其他 OAST 平台
   （interactsh / Collaborator）的"轮询取回连"语义一致。
4. 记录内容含 source_ip / UA / 完整 query，用于区分"是靶场打过来的"
   还是"我们自己测试时打过来的"——这个区分很重要，否则自测会假阳性。

启动：python oast.py            （默认 8897）
"""
import base64
import json
import os
import re
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ.get("OAST_PORT", "8897"))

LAB_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(LAB_DIR, ".oast_token")

OAST_TOKEN = base64.urlsafe_b64encode(os.urandom(18)).decode().rstrip("=")

LOCK = threading.Lock()
HITS = []           # 全部回连记录，按时间追加
MAX_HITS = 2000

# token 允许的字符集，避免把控制面路径当成 token
TOKEN_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def record(entry):
    with LOCK:
        HITS.append(entry)
        if len(HITS) > MAX_HITS:
            del HITS[: len(HITS) - MAX_HITS]


def extract_token(path, query):
    """从路径/查询里挖出所有 token 候选。

    兼容三种写法：
      /oast/<token>            显式前缀（推荐）
      /<token>                 裸路径
      /anything?x=<token>      查询参数里（XSS/SSRF 常用）
    """
    toks = []
    p = path.strip("/")
    if p.startswith("oast/"):
        rest = p[5:]
        if TOKEN_RE.match(rest):
            toks.append(rest)
    elif p and TOKEN_RE.match(p):
        toks.append(p)
    # 查询串里任何值都当候选，方便 ?cb=<token> 这种写法
    for k, vs in urllib.parse.parse_qs(query, keep_blank_values=True).items():
        for v in vs:
            if TOKEN_RE.match(v):
                toks.append(v)
    return toks


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "lab-oast/1.0"

    def log_message(self, fmt, *args):
        pass    # 静默，日志走 /__log

    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def _control(self, path, query):
        """控制面。返回 True 表示已处理。"""
        if path == "/__log":
            with LOCK:
                data = list(HITS)
            return self._send(200, json.dumps({"count": len(data), "hits": data},
                                              ensure_ascii=False)) or True
        if path == "/__clear":
            if self.headers.get("X-Oast-Control") != OAST_TOKEN:
                return self._send(403, json.dumps({"error": "control token required"})) or True
            with LOCK:
                n = len(HITS)
                HITS.clear()
            return self._send(200, json.dumps({"cleared": n})) or True
        if path.startswith("/__hits/"):
            tok = path[len("/__hits/"):]
            with LOCK:
                matched = [h for h in HITS if tok in h.get("tokens", [])]
            return self._send(200, json.dumps({"token": tok, "count": len(matched),
                                               "hits": matched}, ensure_ascii=False)) or True
        if path == "/__health":
            return self._send(200, json.dumps({"ok": True, "hits": len(HITS)})) or True
        return False

    def _handle(self, method):
        parsed = urllib.parse.urlparse(self.path)
        path, query = parsed.path, parsed.query

        if self._control(path, query):
            return

        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n).decode("utf-8", "replace") if n else ""

        entry = {
            "ts": time.time(),
            "method": method,
            "path": path,
            "query": query,
            "body": body[:2000],
            "source_ip": self.client_address[0],
            "user_agent": self.headers.get("User-Agent", ""),
            "host": self.headers.get("Host", ""),
            "tokens": extract_token(path, query),
        }
        record(entry)

        # 回一个无害的 200，让 blind XSS 的 JS / SSRF 的 fetch 不报错，
        # 也让 payload 在页面里看起来"正常加载成功"。
        accept = self.headers.get("Accept", "")
        if "html" in accept:
            return self._send(200, "<html><body>ok</body></html>", "text/html")
        return self._send(200, json.dumps({"ok": True}))

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_PUT(self):
        self._handle("PUT")

    def do_HEAD(self):
        self._handle("HEAD")

    def do_DELETE(self):
        self._handle("DELETE")

    def do_OPTIONS(self):
        self._handle("OPTIONS")


def main():
    with open(TOKEN_FILE, "w", encoding="utf-8") as f:
        f.write(OAST_TOKEN)
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    srv.daemon_threads = True
    print("[oast] listening on http://%s:%d" % (HOST, PORT), flush=True)
    print("[oast] control token written to %s" % TOKEN_FILE, flush=True)
    print("[oast] payload 形如: http://%s:%d/oast/<token>" % (HOST, PORT), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
