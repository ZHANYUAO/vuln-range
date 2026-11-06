import urllib.request, ssl, json, re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx)
)
UA = {"User-Agent": "workbuddy-research/1.0", "Accept": "application/vnd.github+json"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    return json.loads(opener.open(req, timeout=25).read().decode("utf-8", "ignore"))


QUERIES = [
    "strix",
    "shannon pentest",
    "pentagi",
]
for q in QUERIES:
    print("=" * 70)
    print(f"SEARCH: {q}")
    try:
        d = get(f"https://api.github.com/search/repositories?q={urllib.parse.quote(q)}+pentest+OR+security&sort=stars&per_page=6")
        for r in d.get("items", []):
            print(f"  {r['stargazers_count']:>7} ★  {r['full_name']:<40} lic={ (r.get('license') or {}).get('spdx_id') } ")
            print(f"           {r['html_url']}")
            print(f"           {(r.get('description') or '')[:150]}")
    except Exception as e:
        print(f"  ERROR {type(e).__name__}: {e}")

# direct repo lookups for the most likely full names
print("=" * 70)
print("DIRECT LOOKUPS")
CANDIDATES = [
    "usestrix/strix",
    "strix-ai/strix",
    "KeygraphHQ/shannon",
    "keygraph/shannon",
    "pentagi/pentagi",
    "vxcontrol/pentagi",
]
for name in CANDIDATES:
    try:
        r = get(f"https://api.github.com/repos/{name}")
        print(f"  ✅ {r['full_name']:<28} {r['stargazers_count']:>7} ★  lang={r.get('language')} lic={(r.get('license') or {}).get('spdx_id')}")
        print(f"     {r['html_url']}")
        print(f"     {(r.get('description') or '')[:160]}")
        print(f"     created={r['created_at'][:10]} pushed={r['pushed_at'][:10]} archived={r['archived']}")
    except Exception as e:
        code = getattr(e, "code", "?")
        print(f"  ❌ {name:<28} -> {code} {type(e).__name__}")
