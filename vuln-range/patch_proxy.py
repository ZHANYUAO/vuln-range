#!/usr/bin/env python3
"""patch_proxy.py —— P2 实验用的「可装载补丁」反向代理（独立进程，不改 lab 一行代码）

为什么是独立代理
----------------
P2 要形成「发现 → 证明 → 修复 → 再证明」闭环，但绝不能把修复做成
``verify.py --auto-repair`` 那样的顺手开关：那会让判分链路和补丁生成共用同一份
状态，等于自己给自己发合格证。

这里把「补丁」实现成一个**运行时可装载的规则集**，放在 lab 前面：
  * 生成补丁的人（repair_loop.generate_patch）只看得见 train 变体；
  * 应用补丁的人（本文件）只看得见规则，不知道变体分组；
  * 判分的人（verify.verify_case）只看得见 HTTP 响应，不知道有没有补丁。
三者物理隔离，held-out 才真的是 held-out。

被拦下的请求返回 403 + 固定空 JSON，**不回显 payload**（回显陷阱红线），
并带 ``X-Patch-Blocked: <rule_id>`` 头供外部核对。/api/diag 的断言钉在
output 字段，空 output 是「命令根本没执行」的真实反映，不是伪造证据。

启动
----
  python patch_proxy.py --port 8900 --lab http://127.0.0.1:8899

控制端点（只听 127.0.0.1）
  POST /__patch   body = {"strategy": "...", "rules": [...]}  装载并清零统计
  POST /__clear   清空规则
  GET  /__stats   {"requests", "blocked_total", "by_rule", "rules_loaded"}
  GET  /__health  存活探针

规则形态
  {"id","pattern","paths":["/api/diag"],"params":["host"],"origin":"..."}
  pattern 是正则串，只在这些路径的这些参数值上做 re.search；params 为空表示查全部值。
"""
import argparse
import datetime
import json
import os
import re
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CONTROL_PATHS = {"/__patch", "/__clear", "/__stats", "/__health", "/__reset"}
BLOCK_BODY = json.dumps({"error": "blocked_by_patch", "output": ""}).encode("utf-8")

_LOCK = threading.Lock()
_RULES = []
_STATE = {"strategy": None, "requests": 0, "blocked_total": 0, "by_rule": {},
          "loaded_at": None}
_LAB = "http://127.0.0.1:8899"


# ------------------------------------------------------------------ 规则匹配
def _user_values(path, headers, raw_body, query):
    """抽 GET query / POST form / POST json 里的用户可控值，返回 {name: str}。"""
    vals = {k: v for k, v in query.items()}
    ctype = (headers.get("Content-Type") or "").lower()
    if raw_body:
        if "application/json" in ctype:
            try:
                obj = json.loads(raw_body.decode("utf-8", "replace"))
                if isinstance(obj, dict):
                    vals.update({str(k): str(v) for k, v in obj.items()})
            except (ValueError, TypeError):
                vals["__body__"] = raw_body.decode("utf-8", "replace")
        else:
            try:
                vals.update({k: v for k, v in
                             urllib.parse.parse_qsl(raw_body.decode("utf-8", "replace"),
                                                    keep_blank_values=True)})
            except Exception:
                vals["__body__"] = raw_body.decode("utf-8", "replace")
    return {k: str(v) for k, v in vals.items()}


def match_rule(rules, path, vals):
    """返回命中的 rule_id；无命中返回 None。规则按装载顺序，先命中先记。"""
    for rule in rules:
        paths = rule.get("paths") or []
        if paths and path not in paths:
            continue
        names = rule.get("params") or []
        targets = [vals[n] for n in names if n in vals] if names else list(vals.values())
        try:
            rx = re.compile(rule["pattern"])
        except (re.error, KeyError, TypeError):
            continue
        if any(rx.search(v) for v in targets):
            return rule.get("id") or "(unnamed)"
    return None


# ------------------------------------------------------------------ HTTP 转发
class Proxy(BaseHTTPRequestHandler):
    server_version = "patch-proxy/1.0"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a):
        sys.stderr.write("[patch-proxy] %s - %s\n" % (self.address_string(), fmt % a))

    def _send(self, code, body, headers=None, ctype="application/json; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, code, obj, headers=None):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), headers)

    def _read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n > 0 else b""

    def _control(self, path, raw_body):
        """raw_body 由 _handle 统一读取并传入 —— 不能在控制端点里再读一次，
        否则 POST /__patch 会永久等待第二份 Content-Length 字节（实测 10s 超时）。"""
        if path == "/__health":
            return self._json(200, {"ok": True, "lab": _LAB})
        if path == "/__stats":
            with _LOCK:
                return self._json(200, dict(_STATE, rules_loaded=len(_RULES)))
        if path == "/__clear":
            with _LOCK:
                _RULES.clear()
                _STATE.update({"strategy": None, "requests": 0, "blocked_total": 0,
                               "by_rule": {}, "loaded_at": None})
            return self._json(200, {"cleared": True})
        if path == "/__patch":
            raw = raw_body
            try:
                doc = json.loads(raw.decode("utf-8"))
                rules = doc["rules"]
                assert isinstance(rules, list)
                for r in rules:
                    assert isinstance(r, dict) and r.get("pattern")
                    re.compile(r["pattern"])
            except (ValueError, KeyError, AssertionError, TypeError, re.error) as e:
                return self._json(400, {"error": "bad patch: %s" % e})
            with _LOCK:
                _RULES[:] = rules
                _STATE.update({
                    "strategy": doc.get("strategy") or "(unspecified)",
                    "requests": 0, "blocked_total": 0, "by_rule": {},
                    "loaded_at": datetime.datetime.now(datetime.timezone.utc)
                                       .isoformat(timespec="seconds"),
                })
            return self._json(200, {"loaded": len(rules),
                                    "strategy": _STATE["strategy"]})
        return None

    def _handle(self, method):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        raw = self._read_body()
        if path in CONTROL_PATHS and path != "/__reset":
            return self._control(path, raw)

        query = {k: v[0] for k, v in
                 urllib.parse.parse_qs(parsed.query, keep_blank_values=True).items()}
        vals = _user_values(path, self.headers, raw, query)

        # /__reset 是闸门的状态控制通道，任何补丁都不得拦它 —— 否则复位失败会把
        # 整轮结论拖成 unknown，那不是「补丁生效」而是实验装置坏了。
        if path != "/__reset":
            with _LOCK:
                rules = list(_RULES)
                _STATE["requests"] += 1
            rid = match_rule(rules, path, vals)
            if rid:
                with _LOCK:
                    _STATE["blocked_total"] += 1
                    _STATE["by_rule"][rid] = _STATE["by_rule"].get(rid, 0) + 1
                return self._send(403, BLOCK_BODY, {"X-Patch-Blocked": rid})

        # 原样转发（含 Cookie / X-Lab-Control / Content-Type），不改写 body。
        url = _LAB + (path + ("?" + parsed.query if parsed.query else ""))
        fwd_headers = {}
        for k, v in self.headers.items():
            if k.lower() in ("host", "content-length", "connection", "accept-encoding"):
                continue
            fwd_headers[k] = v
        req = urllib.request.Request(url, data=(raw or None if method != "GET" else None),
                                     headers=fwd_headers, method=method)
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
                    req, timeout=20) as r:
                body, code, hdrs = r.read(), r.status, dict(r.headers)
        except urllib.error.HTTPError as e:
            body, code, hdrs = e.read(), e.code, dict(e.headers)
        except Exception as e:
            return self._json(502, {"error": "lab unreachable: %s" % e})
        out = {}
        for k, v in hdrs.items():
            if k.lower() in ("content-length", "transfer-encoding", "connection",
                             "content-encoding"):
                continue
            out[k] = v
        self.send_response(code)
        for k, v in out.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_PUT(self):
        self._handle("PUT")

    def do_DELETE(self):
        self._handle("DELETE")


def main():
    global _LAB
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PATCH_PORT", "8900")))
    ap.add_argument("--lab", default=os.environ.get("PATCH_LAB", "http://127.0.0.1:8899"))
    a = ap.parse_args()
    _LAB = a.lab.rstrip("/")
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Proxy)
    srv.daemon_threads = True
    print("[patch-proxy] listening 127.0.0.1:%d -> %s" % (a.port, _LAB), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
