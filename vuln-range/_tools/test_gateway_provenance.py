#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_gateway_provenance.py — llm_gateway.py 改造后的端到端验收
================================================================
用本地 mock 上游，不消耗任何真实 LLM 额度。覆盖三条路径：

  A 生产模式 / 正常 200          -> provenance 记录 ok=true + task_id
  B 对照模式 / 上游 402          -> fail-fast、禁止重试、禁止切换、带响应头
  C 生产模式 / 上游 402 + 备线    -> 显式切换，带响应头与 GATEWAY_FALLBACK 日志

用法：python _tools/test_gateway_provenance.py
退出码 0 = 全部通过，1 = 有断言失败。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GW = os.path.join(ROOT, "llm_gateway.py")
TMP = os.path.join(HERE, "_gwtest")
os.makedirs(TMP, exist_ok=True)

MOCK_MAIN = 18991
MOCK_FALLBACK = 18992
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class MockUpstream(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def _reply(self, code, obj):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n)
        # 备线实例无条件成功：主上游的 402 是由 mock 按 content 触发的，
        # 若备线也按 content 判断，会把「上游切换」误测成「切换仍失败」。
        if self.server.server_port == MOCK_FALLBACK:
            return self._reply(200, {"choices": [{"message": {"content": "ok-from-fallback"}}],
                                     "model": "mock/fallback"})
        if b"FORCE402" in body:
            return self._reply(402, {"error": {"message": "mock budget_exceeded",
                                               "code": "budget_exceeded"}})
        if b"FORCE500" in body:
            return self._reply(500, {"error": {"message": "mock upstream 500"}})
        return self._reply(200, {
            "id": "mock", "object": "chat.completion",
            "model": self.headers.get("X-Mock-Port", "mock"),
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "ok"},
                         "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        })

    def do_GET(self):
        self._reply(200, {"object": "list", "data": [{"id": "mock-model"}]})


def serve(port):
    srv = ThreadingHTTPServer(("127.0.0.1", port), MockUpstream)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


def start_gateway(tag, port, extra):
    logp = os.path.join(TMP, "%s.log" % tag)
    provp = os.path.join(TMP, "%s.prov.jsonl" % tag)
    for p in (logp, provp):
        if os.path.exists(p):
            os.remove(p)
    env = dict(os.environ)
    for k in list(env):
        if k.startswith("FALLBACK_") or k in ("GATEWAY_COMPARE", "GATEWAY_PROXY", "GATEWAY_TOKEN"):
            env.pop(k, None)
    env.update({
        "UPSTREAM_BASE": "http://127.0.0.1:%d/v1" % MOCK_MAIN,
        "UPSTREAM_KEY": "mock-key",
        "DEFAULT_MODEL": "mock/main",
        "GATEWAY_PORT": str(port),
        "GATEWAY_HOST": "127.0.0.1",
        "GATEWAY_LOG": logp,
        "GATEWAY_PROVENANCE": provp,
        "GATEWAY_MAX_RETRIES": "2",
        "GATEWAY_RETRY_BASE": "0.05",
    })
    env.update(extra)
    p = subprocess.Popen([sys.executable, GW], env=env,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            with OPENER.open("http://127.0.0.1:%d/health" % port, timeout=1) as r:
                if r.status == 200:
                    return p, logp, provp, json.load(r)
        except Exception:
            time.sleep(0.1)
    p.terminate()
    raise RuntimeError("[%s] 网关未就绪" % tag)


def call(port, content, task_id="task-42", model="mock/main", max_tokens=16):
    body = json.dumps({
        "model": model, "stream": False,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": max_tokens,
    }).encode("utf-8")
    req = urllib.request.Request(
        "http://127.0.0.1:%d/v1/chat/completions" % port,
        data=body, headers={"Content-Type": "application/json", "X-Task-Id": task_id},
        method="POST")
    try:
        with OPENER.open(req, timeout=10) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def read(path):
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def prov_records(path):
    out = []
    for line in read(path).splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def real_check(check):
    """可选：真实上游冒烟（python _tools/test_gateway_provenance.py --real）。

    只发一条 ping，不消耗显著额度；key 从 .zro_key 读，绝不写进仓库。
    """
    keypath = os.path.join(ROOT, ".zro_key")
    if not os.path.exists(keypath):
        print("  SKIP 真实上游：找不到 .zro_key")
        return
    with open(keypath, "r", encoding="utf-8") as f:
        key = f.read().strip()
    print("\n[E] 真实上游冒烟（Zro / deepseek-v4.1-flash，单条 ping）")
    try:
        p, logp, provp, health = start_gateway("REAL", 18905, {
            "UPSTREAM_BASE": "https://zro.moonmath.ai/v1",
            "UPSTREAM_KEY": key,
            "DEFAULT_MODEL": "deepseek-v4.1-flash",
        })
    except Exception as e:
        print("  SKIP 真实上游：网关未就绪 %s" % e)
        return
    try:
        # deepseek-v4.1-flash 是推理模型：max_tokens 太小时预算全被 reasoning 吃掉，
        # 返回 200 但 content 恒空。这是测试参数问题，不是网关故障。
        code, hdr, data = call(18905, "ping", task_id="real-smoke",
                               model="deepseek-v4.1-flash", max_tokens=2000)
        check("真实上游返回 200", code == 200,
              "code=%s body=%s" % (code, data[:160]))
        if code == 200:
            obj = json.loads(data)
            content = obj["choices"][0]["message"].get("content") or ""
            check("返回非空 content", bool(content.strip()), repr(content)[:100])
        recs = prov_records(provp)
        check("真实请求有 provenance 记录", bool(recs) and recs[0].get("ok") is True,
              json.dumps(recs, ensure_ascii=False)[:200])
        check("真实请求 model 正确", bool(recs)
              and recs[0].get("model") == "deepseek-v4.1-flash")
    finally:
        p.terminate()


def main():
    serve(MOCK_MAIN)
    serve(MOCK_FALLBACK)
    checks = []

    def check(name, cond, detail=""):
        checks.append((name, bool(cond), detail))
        print("  %s %s%s" % ("PASS" if cond else "FAIL", name,
                             ("  <- " + detail) if detail and not cond else ""))

    # ---------- A：生产模式正常转发 ----------
    print("\n[A] 生产模式 / 上游 200")
    p, logp, provp, health = start_gateway("A", 18901, {})
    try:
        check("health.mode=production", health["mode"] == "production", str(health))
        code, hdr, data = call(18901, "hello")
        check("返回 200", code == 200, "code=%s" % code)
        check("无 fallback 响应头", "X-Gateway-Fallback" not in hdr)
        recs = prov_records(provp)
        check("provenance 有 1 条 ok 记录", len(recs) == 1 and recs[0]["ok"] is True,
              json.dumps(recs, ensure_ascii=False)[:200])
        check("task_id 已透传", bool(recs) and recs[0].get("task_id") == "task-42")
        check("日志保留 non-stream done 格式", "non-stream done" in read(logp))
    finally:
        p.terminate()

    # ---------- B：对照模式 fail-fast ----------
    print("\n[B] 对照模式 / 上游 402（必须 fail-fast，禁止切换）")
    p, logp, provp, health = start_gateway("B", 18902, {
        "GATEWAY_COMPARE": "1",
        # 故意同时配置备线：对照模式必须忽略它
        "FALLBACK_BASE": "http://127.0.0.1:%d/v1" % MOCK_FALLBACK,
        "FALLBACK_MODEL": "mock/fallback",
    })
    try:
        check("health.mode=compare", "compare" in health["mode"], str(health))
        check("health.fallback_configured=False", health["fallback_configured"] is False)
        t0 = time.time()
        code, hdr, data = call(18902, "FORCE402")
        elapsed = time.time() - t0
        check("402 直接透传", code == 402, "code=%s" % code)
        check("带 X-Gateway-Failfast 响应头", hdr.get("X-Gateway-Failfast") == "1", str(hdr))
        log = read(logp)
        check("日志含 COMPARE_FAILFAST", "COMPARE_FAILFAST" in log)
        check("日志无 GATEWAY_FALLBACK", "GATEWAY_FALLBACK" not in log)
        check("对照模式未重试", "上游重试" not in log)
        check("无指数退避耗时(<2s)", elapsed < 2.0, "elapsed=%.2fs" % elapsed)
        recs = prov_records(provp)
        check("provenance 标记 compare=True", bool(recs) and recs[0].get("compare") is True)
        check("provenance 标记 ok=False", bool(recs) and recs[0].get("ok") is False)
    finally:
        p.terminate()

    # ---------- C：生产模式显式 failover ----------
    print("\n[C] 生产模式 / 上游 402 + 已配备线（必须留痕）")
    p, logp, provp, health = start_gateway("C", 18903, {
        "FALLBACK_BASE": "http://127.0.0.1:%d/v1" % MOCK_FALLBACK,
        "FALLBACK_KEY": "mock-key",
        "FALLBACK_MODEL": "mock/fallback",
    })
    try:
        check("health.fallback_configured=True", health["fallback_configured"] is True)
        code, hdr, data = call(18903, "FORCE402")
        check("备线返回 200", code == 200, "code=%s body=%s" % (code, data[:120]))
        check("带 X-Gateway-Fallback 响应头", hdr.get("X-Gateway-Fallback") == "mock/fallback",
              str(hdr))
        log = read(logp)
        check("日志含 GATEWAY_FALLBACK 事件", "GATEWAY_FALLBACK" in log)
        check("日志无 COMPARE_FAILFAST", "COMPARE_FAILFAST" not in log)
        recs = prov_records(provp)
        check("provenance 有主+备两条", len(recs) == 2, "n=%d" % len(recs))
        check("主上游记录 ok=False", bool(recs) and recs[0].get("ok") is False
              and recs[0].get("tag") == "primary")
        check("备线记录 ok=True/fallback=True", len(recs) > 1
              and recs[1].get("ok") is True and recs[1].get("fallback") is True)
        check("备线记录换了 model", len(recs) > 1 and recs[1].get("model") == "mock/fallback")
    finally:
        p.terminate()

    # ---------- D：task_liveness 能读新日志事件与 provenance ----------
    print("\n[D] task_liveness.py 能识别 COMPARE_FAILFAST / GATEWAY_FALLBACK / provenance")
    sys.path.insert(0, ROOT)
    import task_liveness as tl
    fake = [os.path.join(TMP, "B.log"), os.path.join(TMP, "C.log")]
    import datetime as dt
    alltime = (dt.datetime(2000, 1, 1), dt.datetime(2100, 1, 1))
    stat = tl.scan_window(fake, *alltime)
    check("识别 failfast_events", stat["failfast_events"] >= 1, str(stat["failfast_events"]))
    check("识别 fallback_events", stat["fallback_events"] >= 1, str(stat["fallback_events"]))

    pa = tl.scan_provenance([os.path.join(TMP, "A.prov.jsonl")], *alltime, "task-42")
    check("provenance 按 task_id 精确关联",
          pa["records"] == 1 and pa["matched_by"] == "task_id", json.dumps(pa))
    check("provenance 模型名正确", "mock/main" in pa["models"], str(pa["models"]))
    check("provenance 错误 task_id 不匹配",
          tl.scan_provenance([os.path.join(TMP, "A.prov.jsonl")], *alltime, "task-999")["records"] == 0)
    pc = tl.scan_provenance([os.path.join(TMP, "C.prov.jsonl")], *alltime, "task-42")
    check("provenance 记录模型切换", pc["records"] == 2 and pc["fallback"] == 1,
          json.dumps(pc))
    pb = tl.scan_provenance([os.path.join(TMP, "B.prov.jsonl")], *alltime, "task-42")
    check("provenance 标记对照模式", pb["compare_records"] >= 1, json.dumps(pb))

    if "--real" in sys.argv:
        real_check(check)

    ok = sum(1 for _, c, _ in checks if c)
    print("\n" + "=" * 60)
    print("验收: %d/%d 通过" % (ok, len(checks)))
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
