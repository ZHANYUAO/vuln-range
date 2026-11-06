"""长上下文探测：ARTEX 的任务上下文会长到 200K，而 ultra-550b 的长上下文表现从未实测。

方法：needle-in-haystack —— 在 filler 里埋一句 "The secret code is ZEBRA7741."（放中间和末尾各一处），
最后提问，看模型能否找回。阶梯加大：16K → 64K → 128K（估算 tokens ≈ 字符数/4）。

诚信约定：任一层失败就停，不跳过去报成功；记录每一层的 HTTP 码与耗时。
"""
import json, os, sys, time, urllib.request, urllib.error

os.environ["NO_PROXY"] = "*"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(k, None)
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))

GW = "http://127.0.0.1:8790/v1/chat/completions"
MODEL = "nvidia/nemotron-3-ultra-550b-a55b"
NEEDLE = "The secret code is ZEBRA7741."
FILLER = ("The audit log entry describes a routine health check on node %d "
          "with no anomalies detected in the storage subsystem. ")

LEVELS = [16000, 64000, 128000]


def build(target_tokens):
    """估算 tokens ≈ 字符数/4；把 needle 埋在中间和末尾各一次。"""
    chars = target_tokens * 4
    unit = FILLER % 0
    reps = max(1, chars // len(unit))
    parts = []
    half = reps // 2
    for i in range(half):
        parts.append(FILLER % i)
    parts.append(" " + NEEDLE + " ")          # 中间
    for i in range(half, reps):
        parts.append(FILLER % i)
    parts.append(" " + NEEDLE + " ")          # 末尾
    text = "".join(parts)
    return text, len(text)


def ask(text, timeout=900):
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "user", "content": text},
            {"role": "user", "content": "What is the secret code? Reply with only the code, nothing else."},
        ],
        "max_tokens": 64, "temperature": 0,
    }
    req = urllib.request.Request(GW, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    t0 = time.time()
    try:
        r = OP.open(req, timeout=timeout)
        return r.getcode(), r.read().decode("utf-8", "replace"), time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), time.time() - t0
    except Exception as e:
        return -1, repr(e), time.time() - t0


def main():
    print("needle = %s\n" % NEEDLE, flush=True)
    for lvl in LEVELS:
        text, nchars = build(lvl)
        print("--- 目标 ~%d tokens（实际 %d 字符）---" % (lvl, nchars), flush=True)
        code, body, dt = ask(text)
        if code != 200:
            print("  HTTP %s  %.1fs  %s" % (code, dt, body[:200].replace("\n", " ")), flush=True)
            print("  → 该层失败，停止加大（不跳过上报）", flush=True)
            sys.exit(1)
        try:
            content = json.loads(body)["choices"][0]["message"]["content"]
        except Exception:
            content = "(解析失败) " + body[:150]
        hit = "ZEBRA7741" in content
        print("  HTTP 200  %.1fs  命中=%s  回答=%r" % (dt, hit, (content or "")[:80]), flush=True)
        if not hit:
            print("  → 长上下文下 needle 丢失，停止加大", flush=True)
            sys.exit(1)
    print("\n三层全部命中", flush=True)


if __name__ == "__main__":
    main()
