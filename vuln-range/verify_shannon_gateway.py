"""shannon 接入网关的配置解析模拟验证。

不能真跑 shannon（需 Docker + npm），所以这里做的是**可验证的那一段**：
1. 镜像 models.ts 的 parseModelSpec 规则（按第一个冒号切分）解析 SHANNON_AI_MODEL；
2. 在 models.json 里解析出 provider，取出 baseUrl / api 方言；
3. 用解析结果真发请求到网关（把 host.docker.internal 换回 127.0.0.1，因为不在容器里）。

没覆盖：容器内 host.docker.internal→宿主 的 NAT 可达性（无 Docker，测不了）；
        pi 目录/preflight 是否接受该 provider（需 pi 目录在线校验）。
"""
import json, os, sys, time, urllib.request, urllib.error

os.environ["NO_PROXY"] = "*"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(k, None)
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS_JSON = os.path.join(HERE, "shannon-models.json")
SPEC = os.environ.get("SHANNON_AI_MODEL", "artex-gw:nvidia/nemotron-3-ultra-550b-a55b")
TOKEN = os.environ.get("GATEWAY_TOKEN", "")

fails = []


def check(name, ok, detail=""):
    print("[%s] %-46s %s" % ("PASS" if ok else "FAIL", name, detail), flush=True)
    if not ok:
        fails.append(name)


# ---- L1: 解析规则（镜像 apps/worker/src/ai/models.ts:99-118）----
sep = SPEC.find(":")
check("L1 SHANNON_AI_MODEL 含 provider 分隔符", sep != -1, SPEC)
provider_id = SPEC[:sep].strip()
model_id = SPEC[sep + 1:].strip()
check("L1 provider/model 均非空", bool(provider_id and model_id),
      "provider=%s model=%s" % (provider_id, model_id))

cfg = json.load(open(MODELS_JSON, encoding="utf-8"))
prov = cfg.get("providers", {}).get(provider_id)
check("L2 models.json 中存在该 provider", prov is not None, provider_id)
if prov is None:
    print("ABORT"); sys.exit(1)

check("L2 方言为 openai-completions（网关仅实现 chat/completions）",
      prov.get("api") == "openai-completions", str(prov.get("api")))
check("L2 models[].id 与 SHANNON_AI_MODEL 的模型段一致",
      any(m.get("id") == model_id for m in prov.get("models", [])), model_id)

base = prov["baseUrl"].rstrip("/")
local_base = base.replace("host.docker.internal", "127.0.0.1")
check("L2 容器内用 host.docker.internal（非 localhost）",
      "host.docker.internal" in base, base)


def post(path, payload, timeout=120, token=None):
    url = local_base + path
    hdr = {"Content-Type": "application/json"}
    if token:
        hdr["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=hdr, method="POST")
    try:
        r = OP.open(req, timeout=timeout)
        return r.getcode(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, repr(e)


# ---- L3: 按解析结果真发请求 ----
code, body = post("/models", None) if False else (None, None)
t0 = time.time()
code, body = post("/chat/completions", {
    "model": model_id,
    "messages": [{"role": "user", "content": "Reply with exactly: SHANNON_GATEWAY_OK"}],
    "max_tokens": 300, "temperature": 0,
})
ok = code == 200 and "SHANNON_GATEWAY_OK" in body
check("L3 chat/completions 非流式", ok, "HTTP %s %.1fs" % (code, time.time() - t0))

# 工具调用：shannon 的 agent 强依赖 function calling
t0 = time.time()
code2, body2 = post("/chat/completions", {
    "model": model_id,
    "messages": [{"role": "user", "content": "List the files in /tmp. Use the tool."}],
    "tools": [{"type": "function", "function": {
        "name": "run_command",
        "description": "Run a shell command",
        "parameters": {"type": "object", "properties": {"cmd": {"type": "string"}}, "required": ["cmd"]},
    }}],
    "tool_choice": "auto", "max_tokens": 400, "temperature": 0,
})
try:
    msg = json.loads(body2)["choices"][0]["message"] if code2 == 200 else {}
except Exception:
    msg = {}
check("L3 function calling 可用（agent 依赖）", bool(msg.get("tool_calls")),
      "HTTP %s %.1fs calls=%d" % (code2, time.time() - t0, len(msg.get("tool_calls") or [])))

# 流式
t0 = time.time()
code3, body3 = post("/chat/completions", {
    "model": model_id,
    "messages": [{"role": "user", "content": "Reply with exactly: STREAM_OK"}],
    "max_tokens": 300, "temperature": 0, "stream": True,
}, timeout=150)
check("L3 流式 SSE", code3 == 200 and ("STREAM_OK" in body3 or "data:" in body3),
      "HTTP %s %.1fs %d B" % (code3, time.time() - t0, len(body3)))

# ---- L4: 若设了 token，确认鉴权生效（容器场景会是 0.0.0.0）----
if TOKEN:
    c_no, _ = post("/chat/completions", {"model": model_id,
                                         "messages": [{"role": "user", "content": "hi"}], "max_tokens": 16})
    check("L4 无 token 被拒 401", c_no == 401, str(c_no))

print("\n失败项：%s" % (fails if fails else "无"), flush=True)
sys.exit(1 if fails else 0)
