"""pentagi 接入网关的配置验证。

不能真跑 pentagi（需 Docker Compose + Kali 镜像），只验证**可验证的那一段**：
1. 从 pentagi 自己的 .env.example 里抽出 Custom LLM provider 的字段名（而非照抄 README）；
2. 校验我写出的 .env 片段用对了字段；
3. 用该配置真打到网关——含一项真实风险探测：vllm 示例用 max_tokens=32768，
   上游是否接受这个上限（不接受的话 provider.yml 必须调小）。
"""
import json, os, re, sys, time, urllib.request, urllib.error

os.environ["NO_PROXY"] = "*"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(k, None)
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_SRC = os.path.join(HERE, "_src", "pentagi", ".env.example")
ENV_MINE = os.path.join(HERE, "pentagi-gw.env")
MODEL = "nvidia/nemotron-3-ultra-550b-a55b"
TOKEN = os.environ.get("GATEWAY_TOKEN", "")

fails = []


def check(name, ok, detail=""):
    print("[%s] %-50s %s" % ("PASS" if ok else "FAIL", name, detail), flush=True)
    if not ok:
        fails.append(name)


# ---- L1: 字段名来自 pentagi 自己的 .env.example ----
src = open(ENV_SRC, encoding="utf-8", errors="replace").read()
need = ["LLM_SERVER_URL", "LLM_SERVER_KEY", "LLM_SERVER_MODEL", "LLM_SERVER_API_TYPE"]
missing = [n for n in need if not re.search(r"^%s=" % n, src, re.M)]
check("L1 .env.example 含 Custom LLM provider 字段", not missing,
      "缺: %s" % missing if missing else ",".join(need))
plain = re.search(r"^## leave it empty for a plain OpenAI-compatible endpoint.*$", src, re.M)
check("L1 文档确认 API_TYPE 留空=纯 OpenAI 兼容", bool(plain),
      (plain.group(0)[:60] if plain else "未找到"))

# ---- L2: 我写出的配置用对字段 ----
mine = open(ENV_MINE, encoding="utf-8").read()
cfg = dict(re.findall(r"^([A-Z_]+)=(.*)$", mine, re.M))
check("L2 LLM_SERVER_URL 指向网关", "8790" in cfg.get("LLM_SERVER_URL", ""), cfg.get("LLM_SERVER_URL", ""))
check("L2 容器内用 host.docker.internal",
      "host.docker.internal" in cfg.get("LLM_SERVER_URL", ""), cfg.get("LLM_SERVER_URL", ""))
check("L2 LLM_SERVER_API_TYPE 留空（纯 OpenAI 兼容）", cfg.get("LLM_SERVER_API_TYPE", "x") == "",
      repr(cfg.get("LLM_SERVER_API_TYPE")))
check("L2 模型 id 正确", cfg.get("LLM_SERVER_MODEL") == MODEL, cfg.get("LLM_SERVER_MODEL", ""))


def post(payload, timeout=180):
    url = cfg["LLM_SERVER_URL"].replace("host.docker.internal", "127.0.0.1") + "/chat/completions"
    hdr = {"Content-Type": "application/json"}
    if TOKEN:
        hdr["Authorization"] = "Bearer " + TOKEN
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=hdr, method="POST")
    try:
        r = OP.open(req, timeout=timeout)
        return r.getcode(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, repr(e)


# ---- L3: 真打网关 ----
t0 = time.time()
code, body = post({"model": MODEL,
                   "messages": [{"role": "user", "content": "Reply with exactly: PENTAGI_GATEWAY_OK"}],
                   "max_tokens": 300, "temperature": 0})
check("L3 chat/completions 非流式", code == 200 and "PENTAGI_GATEWAY_OK" in body,
      "HTTP %s %.1fs" % (code, time.time() - t0))

# 风险探测：vllm 示例的 max_tokens=32768 是否被上游接受
t0 = time.time()
code2, body2 = post({"model": MODEL,
                     "messages": [{"role": "user", "content": "Reply with exactly: CAP_OK"}],
                     "max_tokens": 32768, "temperature": 0})
ok2 = code2 == 200 and "CAP_OK" in body2
check("L3 max_tokens=32768 被上游接受（provider.yml 可沿用）", ok2,
      "HTTP %s %.1fs %s" % (code2, time.time() - t0,
                            (body2[:110].replace("\n", " ") if not ok2 else "")))

# pentagi 的 agent 强依赖工具调用
t0 = time.time()
code3, body3 = post({"model": MODEL,
                     "messages": [{"role": "user", "content": "Run: echo hello. Use the tool."}],
                     "tools": [{"type": "function", "function": {
                         "name": "terminal", "description": "Run a shell command",
                         "parameters": {"type": "object",
                                        "properties": {"command": {"type": "string"}},
                                        "required": ["command"]}}}],
                     "tool_choice": "auto", "max_tokens": 400, "temperature": 0})
try:
    msg = json.loads(body3)["choices"][0]["message"] if code3 == 200 else {}
except Exception:
    msg = {}
check("L3 function calling 可用（agent 依赖）", bool(msg.get("tool_calls")),
      "HTTP %s %.1fs calls=%d" % (code3, time.time() - t0, len(msg.get("tool_calls") or [])))

print("\n失败项：%s" % (fails if fails else "无"), flush=True)
sys.exit(1 if fails else 0)
