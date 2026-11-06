#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
本地统一 LLM 网关（OpenAI 兼容）
--------------------------------
用途：把本机上多个依赖 OpenAI 兼容端点的工具（ARTEX / strix / shannon / pentagi）
统一指到这一个本地端点，换模型/换上游只改本文件的一处配置。

关键设计：
1. 纯 Python 标准库实现，无第三方依赖，装不上包也能跑。
2. 上游转发**强制直连**（ProxyHandler({})），绕开系统代理——本机系统代理会让
   integrate.api.nvidia.com 不可达，此前已踩过一次坑。
3. 同时支持流式（SSE 透传）与非流式（整包返回）。这是关键：某些免密钥 LLM 服务
   只支持流式，而这批工具的 agent 客户端大量依赖非流式 completion。
4. 上游凭据从环境变量读，不硬编码。

环境变量：
  UPSTREAM_BASE   默认 https://integrate.api.nvidia.com/v1
  UPSTREAM_KEY    上游 API key（必填）
  GATEWAY_PORT    默认 8788
  GATEWAY_HOST    默认 127.0.0.1
  DEFAULT_MODEL   客户端未指定 model 时的兜底模型
  GATEWAY_PROXY   出站代理（如 http://127.0.0.1:7897）；留空=强制直连
  GATEWAY_LOG     日志路径，默认 llm_gateway.log
"""
import json
import os
import random
import sys
import threading
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM_BASE = os.environ.get("UPSTREAM_BASE", "https://integrate.api.nvidia.com/v1").rstrip("/")
UPSTREAM_KEY = os.environ.get("UPSTREAM_KEY", "").strip()
# 实测（2026-10-23）：nemotron-3-super-120b-a12b 对本账号已 404 Not found for account；
# nemotron-3.5-super-vl-120b-a12b 长输出 content 恒空；仅 ultra-550b 长输出/工具调用/流式三项全通过。
DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "nvidia/nemotron-3-ultra-550b-a55b")
GATEWAY_HOST = os.environ.get("GATEWAY_HOST", "127.0.0.1")
GATEWAY_PORT = int(os.environ.get("GATEWAY_PORT", "8790"))
# 上游并发上限：四个工具共用一个网关，放任并发会撞上游 503 ResourceExhausted（实测出现过）。
# 超限的请求排队等待，而不是把 503 直接甩给 agent。
MAX_CONCURRENCY = int(os.environ.get("GATEWAY_MAX_CONCURRENCY", "4"))
# 瞬时故障重试：429 / 5xx / 网络错误。指数退避 + 抖动，尊重 Retry-After。
MAX_RETRIES = int(os.environ.get("GATEWAY_MAX_RETRIES", "3"))
RETRY_BASE = float(os.environ.get("GATEWAY_RETRY_BASE", "1.5"))
RETRY_STATUS = (429, 500, 502, 503, 504)
_SEM = threading.BoundedSemaphore(MAX_CONCURRENCY)
# 鉴权：绑非回环地址（容器/局域网工具要用 0.0.0.0）时必须设置，否则拒绝启动。
# 原因：网关持有上游真实凭据，且不做任何限速；裸奔的 0.0.0.0 等于在局域网上开一个免认证转发口。
GATEWAY_TOKEN = os.environ.get("GATEWAY_TOKEN", "").strip()
_LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")
if GATEWAY_HOST not in _LOOPBACK_HOSTS and not GATEWAY_TOKEN:
    sys.stderr.write(
        "FATAL: GATEWAY_HOST=%s 非回环地址，但未设置 GATEWAY_TOKEN。\n"
        "       容器（shannon/pentagi/strix 走 host.docker.internal）访问时需要 0.0.0.0，\n"
        "       请先 export GATEWAY_TOKEN=<自选长随机串>，并在各工具里把它填为 API key。\n"
        % GATEWAY_HOST
    )
    sys.exit(2)
LOG_PATH = os.environ.get("GATEWAY_LOG", os.path.join(os.path.dirname(os.path.abspath(__file__)), "llm_gateway.log"))

# 出站代理：默认强制直连（忽略系统代理）；设置 GATEWAY_PROXY 时改走该代理。
# 直连是历史默认（系统代理曾让 integrate.api.nvidia.com 不可达）。但境外端点
# （Gemini / Groq / Mistral / xAI …）直连根本出不去，此时必须显式给代理，
# 例如 GATEWAY_PROXY=http://127.0.0.1:7897。
GATEWAY_PROXY = os.environ.get("GATEWAY_PROXY", "").strip()
if GATEWAY_PROXY:
    _OPENER = urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": GATEWAY_PROXY, "https": GATEWAY_PROXY})
    )
else:
    _OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

# 出站 User-Agent：urllib 默认 UA（Python-urllib/3.x）会被 Cloudflare 按
# "browser_signature_banned"（Error 1010）直接拒掉——实测 api.groq.com 即如此，
# 而同样请求用 curl 是 401（正常鉴权失败）。故默认发一个浏览器 UA，可用
# GATEWAY_UA 覆盖成上游要求的客户端标识。
GATEWAY_UA = os.environ.get(
    "GATEWAY_UA",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
)


def log(msg):
    line = "[%s] %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass
    print(line, flush=True)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # 静音默认访问日志，统一走 log()

    # ---------- 鉴权 ----------
    def _authorized(self):
        if not GATEWAY_TOKEN:
            return True
        return self.headers.get("Authorization", "") == "Bearer " + GATEWAY_TOKEN

    def _guard(self):
        """除 /health 外的所有接口都要求 token（未设 token 时放行）。"""
        if self.path.startswith("/health"):
            return True
        if self._authorized():
            return True
        log("401 拒绝：来自 %s 的请求缺少/错误的 GATEWAY_TOKEN，path=%s" % (self.client_address[0], self.path))
        self._send_json(401, {"error": {"message": "unauthorized: missing or wrong GATEWAY_TOKEN",
                                        "type": "invalid_request_error"}})
        return False

    # ---------- 路由 ----------
    def do_GET(self):
        if not self._guard():
            return
        if self.path.startswith("/v1/models") or self.path == "/models":
            self._proxy("GET", "/models", None, stream=False)
        elif self.path.startswith("/health"):
            self._send_json(200, {"ok": True, "upstream": UPSTREAM_BASE, "model": DEFAULT_MODEL})
        else:
            self._send_json(404, {"error": "not found: " + self.path})

    def do_POST(self):
        if not self._guard():
            return
        if self.path.startswith("/v1/chat/completions") or self.path.startswith("/chat/completions"):
            self._handle_chat()
        elif self.path.startswith("/v1/completions"):
            self._proxy("POST", "/completions", self._read_body(), stream=False)
        else:
            self._send_json(404, {"error": "not found: " + self.path})

    # ---------- chat/completions ----------
    def _handle_chat(self):
        raw = self._read_body()
        if raw is None:
            return
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception as e:
            self._send_json(400, {"error": "bad json: %s" % e})
            return

        if not payload.get("model"):
            payload["model"] = DEFAULT_MODEL
        stream = bool(payload.get("stream"))
        body = json.dumps(payload).encode("utf-8")

        log("chat model=%s stream=%s msgs=%d" % (
            payload.get("model"), stream, len(payload.get("messages", []))))
        self._proxy("POST", "/chat/completions", body, stream=stream, model=payload.get("model"))

    # ---------- 转发 ----------
    def _open_upstream(self, req):
        """带指数退避重试的上游请求。

        只在**尚未向客户端写出任何字节**时才重试——流式一旦开始就不能回头，
        所以调用方保证重试只发生在建立连接阶段。
        返回 (resp, err)；err 为 None 表示成功。
        """
        err = None
        for attempt in range(MAX_RETRIES + 1):
            if attempt:
                delay = RETRY_BASE * (2 ** (attempt - 1)) + random.uniform(0, 0.4)
                log("上游重试 %d/%d，退避 %.1fs（上次：%s）"
                    % (attempt, MAX_RETRIES, delay, (err[1] if err else "")))
                time.sleep(delay)
            try:
                return _OPENER.open(req, timeout=600), None
            except urllib.error.HTTPError as e:
                detail = e.read().decode("utf-8", "replace")[:2000]
                err = ("http", e.code, detail)
                if e.code not in RETRY_STATUS:
                    break  # 4xx（非 429）是请求本身有问题，重试无意义
                ra = e.headers.get("Retry-After") if e.headers else None
                if ra:
                    try:
                        time.sleep(min(float(ra), 30))
                    except ValueError:
                        pass
            except Exception as e:
                err = ("net", 0, repr(e))
        return None, err

    def _proxy(self, method, path, body, stream=False, model=None):
        url = UPSTREAM_BASE + path
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream" if stream else "application/json",
            "User-Agent": GATEWAY_UA,
        }
        # UPSTREAM_KEY 为空则不发 Authorization 头。
        # 有些免费网关（如 Kilo 公共网关）只接受"完全不带鉴权头"的匿名请求，
        # 带任何假 key 反而返回 401 INVALID_TOKEN。
        if UPSTREAM_KEY:
            headers["Authorization"] = "Bearer " + UPSTREAM_KEY
        req = urllib.request.Request(url, data=body, headers=headers, method=method)

        # 并发闸门：占不到名额就排队，而不是放任并发把上游打爆
        if not _SEM.acquire(blocking=False):
            log("并发已达上限 %d，请求排队等待" % MAX_CONCURRENCY)
            t_wait = time.time()
            _SEM.acquire()
            log("排队 %.1fs 后获得名额" % (time.time() - t_wait))
        t0 = time.time()
        try:
            resp, err = self._open_upstream(req)
            if err is not None:
                kind, code, detail = err
                if kind == "http":
                    log("UPSTREAM HTTP %s（已重试 %d 次）: %s" % (code, MAX_RETRIES, detail[:300]))
                    self._send_json(code, {"error": {"message": detail, "code": code,
                                                     "gateway_retries": MAX_RETRIES}})
                else:
                    log("UPSTREAM ERROR（已重试 %d 次）: %s" % (MAX_RETRIES, detail[:300]))
                    self._send_json(502, {"error": {"message": "upstream unreachable: %s" % detail,
                                                    "gateway_retries": MAX_RETRIES}})
                return

            status = resp.getcode()
            if stream:
                self.send_response(status)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self.send_header("Transfer-Encoding", "chunked")
                self.end_headers()
                sent = 0
                try:
                    while True:
                        chunk = resp.read(4096)
                        if not chunk:
                            break
                        sent += len(chunk)
                        self.wfile.write(b"%X\r\n" % len(chunk) + chunk + b"\r\n")
                        self.wfile.flush()
                    self.wfile.write(b"0\r\n\r\n")
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    log("client disconnected early after %d bytes" % sent)
                    return
                log("stream done %.1fs %d bytes" % (time.time() - t0, sent))
            else:
                data = resp.read()
                log("non-stream done %.1fs %d bytes" % (time.time() - t0, len(data)))
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        finally:
            _SEM.release()

    # ---------- 工具 ----------
    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return b"{}"
        return self.rfile.read(length)

    def _send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    if not UPSTREAM_KEY and os.environ.get("ALLOW_ANONYMOUS_UPSTREAM", "").strip() not in ("1", "true", "yes"):
        print(
            "FATAL: UPSTREAM_KEY 未设置。用法见 start_gateway.sh\n"
            "       若上游是匿名网关（如 Kilo 公共网关，要求完全不带 Authorization 头），\n"
            "       请显式 export ALLOW_ANONYMOUS_UPSTREAM=1 后再启动。",
            file=sys.stderr,
        )
        sys.exit(2)
    srv = ThreadingHTTPServer((GATEWAY_HOST, GATEWAY_PORT), Handler)
    log("gateway up http://%s:%d -> %s (model=%s, 并发上限=%d, 重试=%d, 鉴权=%s)"
        % (GATEWAY_HOST, GATEWAY_PORT, UPSTREAM_BASE, DEFAULT_MODEL,
           MAX_CONCURRENCY, MAX_RETRIES, "开" if GATEWAY_TOKEN else "关(仅回环)"))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
