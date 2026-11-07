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
5. **模型溯源（provenance）**：每条请求分配 rid，把 rid / model / upstream / status /
   是否发生切换写进 JSONL。没有这个，跑模型对照实验时无法证明「这条 finding 是哪个
   模型产出的」。
6. **严格对照模式**：`GATEWAY_COMPARE=1` 时上游 402/429/5xx 立即 fail-fast，
   不重试、不切换上游。模型对照实验里静默换模型会毁掉整组数据；生产模式才允许
   显式 failover，且必须留响应头与日志痕迹，绝不静默。

环境变量：
  UPSTREAM_BASE   默认 https://integrate.api.nvidia.com/v1
  UPSTREAM_KEY    上游 API key（必填）
  GATEWAY_PORT    默认 8788
  GATEWAY_HOST    默认 127.0.0.1
  DEFAULT_MODEL   客户端未指定 model 时的兜底模型
  GATEWAY_PROXY   出站代理（如 http://127.0.0.1:7897）；留空=强制直连
  GATEWAY_LOG     日志路径，默认 llm_gateway.log
  GATEWAY_PROVENANCE   provenance JSONL 路径，默认 gateway_provenance.jsonl
  GATEWAY_COMPARE  1 = 严格对照模式（禁止重试与切换，失败即 fail-fast）
  FALLBACK_BASE / FALLBACK_KEY / FALLBACK_MODEL   生产模式的可选备线上游；
                  仅在非对照模式且主上游返回 402/429/网络错误时启用
  请求头 X-Task-Id  可选，客户端带上后会写进 provenance，用于把日志与任务关联
"""
import json
import itertools
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

# ---------------------------------------------------------------- 溯源与对照模式
PROVENANCE_LOG = os.environ.get(
    "GATEWAY_PROVENANCE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "gateway_provenance.jsonl"),
)
# 对照模式：换模型会让「同套检查只换模型」的实验彻底失效，因此失败必须显式暴露。
GATEWAY_COMPARE = os.environ.get("GATEWAY_COMPARE", "").strip().lower() in ("1", "true", "yes")
# 生产模式的可选备线。不配置 = 与旧版行为一致（单上游 + 原有重试）。
FALLBACK_BASE = os.environ.get("FALLBACK_BASE", "").strip().rstrip("/")
FALLBACK_KEY = os.environ.get("FALLBACK_KEY", "").strip()
FALLBACK_MODEL = os.environ.get("FALLBACK_MODEL", "").strip()
HAS_FALLBACK = bool(FALLBACK_BASE and FALLBACK_MODEL and not GATEWAY_COMPARE)
_RID = itertools.count(1)


def new_rid():
    return "%s-%05d" % (time.strftime("%Y%m%d%H%M%S"), next(_RID))


def provenance(rec):
    """写一条结构化溯源记录（JSONL）。失败不影响主流程。"""
    rec.setdefault("ts", time.strftime("%Y-%m-%d %H:%M:%S"))
    try:
        with open(PROVENANCE_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception:
        pass


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
            self._send_json(200, {
                "ok": True,
                "upstream": UPSTREAM_BASE,
                "model": DEFAULT_MODEL,
                "mode": "compare(fail-fast)" if GATEWAY_COMPARE else "production",
                "fallback_configured": HAS_FALLBACK,
                "fallback_model": FALLBACK_MODEL if HAS_FALLBACK else None,
                "provenance_log": os.path.basename(PROVENANCE_LOG),
            })
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

        rid = new_rid()
        task_id = (self.headers.get("X-Task-Id") or "").strip()[:64]
        if not payload.get("model"):
            payload["model"] = DEFAULT_MODEL
        stream = bool(payload.get("stream"))
        body = json.dumps(payload).encode("utf-8")

        # 格式约束：必须以 "chat model=" 开头，task_liveness.py 靠这个抓请求与模型名。
        log("chat model=%s rid=%s task=%s stream=%s msgs=%d" % (
            payload.get("model"), rid, task_id or "-", stream,
            len(payload.get("messages", []))))
        self._proxy("POST", "/chat/completions", body, stream=stream,
                    model=payload.get("model"), rid=rid, task_id=task_id,
                    payload=payload)

    # ---------- 转发 ----------
    def _open_upstream(self, req, retries=None):
        """带指数退避重试的上游请求。

        只在**尚未向客户端写出任何字节**时才重试——流式一旦开始就不能回头，
        所以调用方保证重试只发生在建立连接阶段。
        retries 由调用方传入：严格对照模式下为 0（重试会掩盖失败、污染实验）。
        返回 (resp, err)；err 为 None 表示成功。
        """
        retries = MAX_RETRIES if retries is None else max(0, retries)
        err = None
        for attempt in range(retries + 1):
            if attempt:
                delay = RETRY_BASE * (2 ** (attempt - 1)) + random.uniform(0, 0.4)
                log("上游重试 %d/%d，退避 %.1fs（上次：%s）"
                    % (attempt, retries, delay, (err[1] if err else "")))
                time.sleep(delay)
            try:
                return _OPENER.open(req, timeout=600), None
            except urllib.error.HTTPError as e:
                detail = e.read().decode("utf-8", "replace")[:2000]
                err = ("http", e.code, detail)
                if e.code not in RETRY_STATUS:
                    break  # 4xx（非 429）是请求本身有问题，重试无意义
                if GATEWAY_COMPARE:
                    break  # 对照模式：429/5xx 也立即失败，不重试
                ra = e.headers.get("Retry-After") if e.headers else None
                if ra:
                    try:
                        time.sleep(min(float(ra), 30))
                    except ValueError:
                        pass
            except Exception as e:
                err = ("net", 0, repr(e))
                if GATEWAY_COMPARE:
                    break
        return None, err

    def _build_request(self, path, body, method, stream, base, key):
        """按指定上游构造请求。fallback 时 base/key/model 都会变，故需可重建。"""
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream" if stream else "application/json",
            "User-Agent": GATEWAY_UA,
        }
        if key:
            headers["Authorization"] = "Bearer " + key
        return urllib.request.Request(base + path, data=body, headers=headers, method=method)

    def _proxy(self, method, path, body, stream=False, model=None,
               rid=None, task_id="", payload=None):
        """转发到主上游；仅生产模式且配置了备线时，才在 402/429/5xx/网络错误后切换。

        切换绝不静默：写 GATEWAY_FALLBACK 日志事件 + `X-Gateway-Fallback` 响应头 +
        provenance 记录。严格对照模式（GATEWAY_COMPARE=1）下既不重试也不切换。
        """
        rid = rid or new_rid()
        task_id = task_id or ""
        retries = 0 if GATEWAY_COMPARE else MAX_RETRIES

        # UPSTREAM_KEY 为空时不发 Authorization 头（Kilo 等匿名网关要求完全不带鉴权头）。
        targets = [(UPSTREAM_BASE, UPSTREAM_KEY, model, body, "primary")]
        if HAS_FALLBACK and payload is not None:
            fb_payload = dict(payload)
            fb_payload["model"] = FALLBACK_MODEL
            targets.append((FALLBACK_BASE, FALLBACK_KEY, FALLBACK_MODEL,
                            json.dumps(fb_payload).encode("utf-8"), "fallback"))

        # 并发闸门：占不到名额就排队，而不是放任并发把上游打爆
        if not _SEM.acquire(blocking=False):
            log("并发已达上限 %d，请求排队等待" % MAX_CONCURRENCY)
            t_wait = time.time()
            _SEM.acquire()
            log("排队 %.1fs 后获得名额" % (time.time() - t_wait))
        t0 = time.time()
        try:
            for idx, (base, key, mdl, b, tag) in enumerate(targets):
                req = self._build_request(path, b, method, stream, base, key)
                resp, err = self._open_upstream(req, retries)

                if err is not None:
                    kind, code, detail = err
                    if kind == "http":
                        log("UPSTREAM HTTP %s（已重试 %d 次）: %s" % (code, retries, detail[:300]))
                    else:
                        log("UPSTREAM ERROR（已重试 %d 次）: %s" % (retries, detail[:300]))
                    provenance({
                        "rid": rid, "task_id": task_id, "model": mdl, "upstream": base,
                        "path": path, "stream": stream, "tag": tag, "ok": False,
                        "status": code or 0, "elapsed_s": round(time.time() - t0, 3),
                        "bytes": 0, "fallback": tag == "fallback",
                        "failfast": False, "compare": GATEWAY_COMPARE,
                        "error": detail[:200],
                    })
                    failfastable = code in (402, 429, 408) or code == 0 or code >= 500
                    can_fallback = (idx == 0 and len(targets) > 1 and failfastable)
                    if can_fallback:
                        log("GATEWAY_FALLBACK rid=%s task=%s 触发切换 %s -> %s（上游 %s）"
                            % (rid, task_id or "-", model, FALLBACK_MODEL, code or "network"))
                        continue
                    if GATEWAY_COMPARE and failfastable:
                        # 对照模式：让失败显性暴露，绝不用备线把实验数据洗掉。
                        log("COMPARE_FAILFAST rid=%s task=%s 上游 %s；"
                            "对照模式禁止重试与切换，任务应判 incomplete"
                            % (rid, task_id or "-", code or "network"))
                        self._send_json(
                            code if code else 502,
                            {"error": {"message": detail, "code": code or 502,
                                       "gateway_mode": "compare", "failfast": True}},
                            extra={"X-Gateway-Failfast": "1"})
                        return
                    if kind == "http":
                        self._send_json(code, {"error": {"message": detail, "code": code,
                                                         "gateway_retries": retries}})
                    else:
                        self._send_json(502, {"error": {"message": "upstream unreachable: %s" % detail,
                                                        "gateway_retries": retries}})
                    return

                # ---- 成功：转发响应 ----
                status = resp.getcode()
                extra = {"X-Gateway-Fallback": FALLBACK_MODEL} if tag == "fallback" else {}

                def emit_ok(sent_bytes, chunked=False):
                    """必须在向客户端写出响应之前落盘。
                    否则 Content-Length 已满足，客户端一收到 body 就返回，
                    服务端这边的 provenance 还没写 —— 实测出现过空记录。"""
                    provenance({
                        "rid": rid, "task_id": task_id, "model": mdl, "upstream": base,
                        "path": path, "stream": stream, "tag": tag, "ok": True,
                        "status": status, "elapsed_s": round(time.time() - t0, 3),
                        "bytes": sent_bytes, "fallback": tag == "fallback",
                        "failfast": False, "compare": GATEWAY_COMPARE,
                        "bytes_note": "chunked; final size in log" if chunked else None,
                    })

                sent = 0
                if stream:
                    emit_ok(0, chunked=True)
                    self.send_response(status)
                    self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("Connection", "keep-alive")
                    for k, v in extra.items():
                        self.send_header(k, v)
                    self.send_header("Transfer-Encoding", "chunked")
                    self.end_headers()
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
                    sent = len(data)
                    log("non-stream done %.1fs %d bytes" % (time.time() - t0, sent))
                    emit_ok(sent)
                    self.send_response(status)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(data)))
                    for k, v in extra.items():
                        self.send_header(k, v)
                    self.end_headers()
                    self.wfile.write(data)
                return
        finally:
            _SEM.release()

    # ---------- 工具 ----------
    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return b"{}"
        return self.rfile.read(length)

    def _send_json(self, code, obj, extra=None):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
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
    log("模式=%s  备线=%s  provenance=%s"
        % ("对照(fail-fast，禁止重试/切换)" if GATEWAY_COMPARE else "生产",
           (FALLBACK_MODEL + " @ " + FALLBACK_BASE) if HAS_FALLBACK else "未配置",
           PROVENANCE_LOG))
    if GATEWAY_COMPARE and FALLBACK_BASE:
        log("注意：对照模式下已配置的 FALLBACK_* 被强制忽略（防止污染模型对照实验）")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
