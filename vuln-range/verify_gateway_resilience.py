"""网关健壮性验证：故障注入 + 并发闸门。

为什么不拿真实上游压测：上游出现过 503 ResourceExhausted，主动打爆它既慢又不礼貌，
而且失败次数不可复现。改用**假上游**（本地 mock）精确控制失败次数，逻辑可重复验证。

测四件事：
  A. 上游连续 503 两次后成功 → 网关应重试成功，客户端拿到 200（而不是看到 503）
  B. 上游一直 503        → 网关重试耗尽后返回 503，且总请求次数 == MAX_RETRIES+1
  C. 上游 400（非瞬时）  → 不应重试（4xx 重试无意义），总请求次数 == 1
  D. 并发 8 路、闸门设为 2 → 全部成功，且日志出现"排队"，说明确实被限流而非放任并发
"""
import json, os, subprocess, sys, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ["NO_PROXY"] = "*"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(k, None)

HERE = os.path.dirname(os.path.abspath(__file__))
MOCK_PORT = 8891
GW_PORT = 8892
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
fails = []


def check(name, ok, detail=""):
    print("[%s] %-52s %s" % ("PASS" if ok else "FAIL", name, detail), flush=True)
    if not ok:
        fails.append(name)


# ---------------- 假上游 ----------------
class MockState:
    mode = "flaky"      # flaky / always503 / bad400 / ok
    count = 0
    lock = threading.Lock()


def _chat_body(text, stream=False):
    if stream:
        return ("data: " + json.dumps({"choices": [{"delta": {"content": text},
                                                    "finish_reason": None}]}) + "\n\n"
                + "data: [DONE]\n\n").encode()
    return json.dumps({"choices": [{"message": {"role": "assistant", "content": text},
                                    "finish_reason": "stop"}]}).encode()


class MockHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(n)
        with MockState.lock:
            MockState.count += 1
            i = MockState.count
        mode = MockState.mode
        if mode == "flaky" and i <= 2:
            body = b'{"error":"ResourceExhausted"}'
            self.send_response(503)
        elif mode == "always503":
            body = b'{"error":"ResourceExhausted"}'
            self.send_response(503)
        elif mode == "bad400":
            body = b'{"error":"bad request"}'
            self.send_response(400)
        else:
            body = _chat_body("MOCK_OK")
            self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        body = json.dumps({"data": [{"id": "mock/model"}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_gateway(max_retries, max_conc):
    env = dict(os.environ)
    env.update({
        "UPSTREAM_KEY": "mock-key",
        "UPSTREAM_BASE": "http://127.0.0.1:%d/v1" % MOCK_PORT,
        "DEFAULT_MODEL": "mock/model",
        "GATEWAY_HOST": "127.0.0.1",
        "GATEWAY_PORT": str(GW_PORT),
        "GATEWAY_MAX_RETRIES": str(max_retries),
        "GATEWAY_MAX_CONCURRENCY": str(max_conc),
        "GATEWAY_RETRY_BASE": "0.4",
        "GATEWAY_LOG": os.path.join(HERE, "gw_mock_test.log"),
    })
    return subprocess.Popen([sys.executable, os.path.join(HERE, "llm_gateway.py")],
                            env=env, cwd=HERE,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def ask(text="hi", timeout=90):
    payload = {"model": "mock/model", "messages": [{"role": "user", "content": text}],
               "max_tokens": 32, "temperature": 0}
    req = urllib.request.Request("http://127.0.0.1:%d/v1/chat/completions" % GW_PORT,
                                 data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        r = OP.open(req, timeout=timeout)
        return r.getcode(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, repr(e)


def scenario(mode, expect_code, expect_calls, label):
    MockState.mode = mode
    with MockState.lock:
        MockState.count = 0
    t0 = time.time()
    code, body = ask()
    calls = MockState.count
    ok = (code == expect_code) and (calls == expect_calls)
    check(label, ok, "HTTP %s 上游被调 %d 次（期望 %d 次）%.1fs"
          % (code, calls, expect_calls, time.time() - t0))
    return code, body


def main():
    mock = ThreadingHTTPServer(("127.0.0.1", MOCK_PORT), MockHandler)
    threading.Thread(target=mock.serve_forever, daemon=True).start()
    gw = start_gateway(max_retries=3, max_conc=2)
    time.sleep(4)
    try:
        # A: 前两次 503，第三次成功
        code, body = scenario("flaky", 200, 3, "A 瞬时503重试后成功（客户端不看到503）")
        if code == 200:
            check("A 返回的是真实内容", "MOCK_OK" in body, body[:60].replace("\n", " "))

        # B: 一直 503 → 重试耗尽后透传 503，且恰好 MAX_RETRIES+1 = 4 次
        scenario("always503", 503, 4, "B 持续503：重试耗尽后返回503（1+3次）")

        # C: 400 不重试
        scenario("bad400", 400, 1, "C 4xx不重试（重试无意义）")

        # D: 并发闸门
        MockState.mode = "ok"
        with MockState.lock:
            MockState.count = 0
        results = []
        lock = threading.Lock()

        def worker(i):
            c, b = ask("req%d" % i)
            with lock:
                results.append(c)

        t0 = time.time()
        ts = [threading.Thread(target=worker, args=(i,)) for i in range(8)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        allok = all(c == 200 for c in results) and len(results) == 8
        check("D 8 路并发全部成功（闸门=2）", allok,
              "codes=%s %.1fs" % (sorted(set(results)), time.time() - t0))
        logtxt = ""
        p = os.path.join(HERE, "gw_mock_test.log")
        if os.path.exists(p):
            logtxt = open(p, encoding="utf-8", errors="replace").read()
        check("D 确有排队发生（说明闸门生效）", "排队" in logtxt,
              "排队次数=%d" % logtxt.count("排队"))
    finally:
        gw.terminate()
        mock.shutdown()
    print("\n失败项：%s" % (fails if fails else "无"), flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
