import urllib.request, ssl, json, base64, re, os

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx)
)
UA = {"User-Agent": "workbuddy-research/1.0", "Accept": "application/vnd.github+json"}


def get(url):
    return json.loads(opener.open(urllib.request.Request(url, headers=UA), timeout=30).read().decode("utf-8", "ignore"))


REPOS = ["usestrix/strix", "KeygraphHQ/shannon", "vxcontrol/pentagi"]
KW = re.compile(r"(OPENAI|ANTHROPIC|CLAUDE|LLM_|BASE_URL|API_KEY|MODEL|OPENROUTER|OLLAMA|GEMINI|DEEPSEEK|litellm|docker|Docker|uv |pipx)", re.I)

out = []
for repo in REPOS:
    out.append("=" * 72)
    out.append(f"### {repo}")
    try:
        r = get(f"https://api.github.com/repos/{repo}/readme")
        body = base64.b64decode(r["content"]).decode("utf-8", "ignore")
    except Exception as e:
        out.append(f"  readme ERROR {type(e).__name__} {getattr(e,'code','')}")
        continue
    out.append(f"  README {len(body)} bytes")
    seen, n = set(), 0
    for i, ln in enumerate(body.splitlines()):
        s = ln.strip()
        if s and KW.search(s):
            k = s[:70]
            if k in seen:
                continue
            seen.add(k)
            out.append(f"  L{i+1}: {s[:185]}")
            n += 1
            if n >= 30:
                break

txt = "\n".join(out)
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "readme_llm_out.txt"), "w", encoding="utf-8").write(txt)
print(txt)
