import urllib.request, re, ssl, sys

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx)
)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"

TARGETS = [
    ("Chrome VRP rules", "https://bughunters.google.com/about/rules"),
    ("Google VRP (bughunters)", "https://bughunters.google.com/"),
    ("IBB", "https://internetbugbounty.org/"),
    ("MSRC bounty", "https://www.microsoft.com/en-us/msrc/bounty"),
    ("H1 directory", "https://hackerone.com/directory/programs"),
]

KW = re.compile(r"automat|scanner|scanning|fuzz|brute|rate.?limit|DoS|tool", re.I)

for name, url in TARGETS:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        r = opener.open(req, timeout=20)
        body = r.read().decode("utf-8", "ignore")
        print("=" * 60)
        print(f"[{name}] {url} -> {r.status}, {len(body)} bytes")
        # crude text extraction
        txt = re.sub(r"<script[\s\S]*?</script>", " ", body)
        txt = re.sub(r"<style[\s\S]*?</style>", " ", txt)
        txt = re.sub(r"<[^>]+>", " ", txt)
        txt = re.sub(r"&nbsp;?", " ", txt)
        txt = re.sub(r"\s+", " ", txt)
        hits = []
        for m in KW.finditer(txt):
            s = max(0, m.start() - 180)
            e = min(len(txt), m.end() + 220)
            hits.append(txt[s:e].strip())
        seen = set()
        for h in hits[:12]:
            k = h[:60]
            if k in seen:
                continue
            seen.add(k)
            print("  ..." + h)
        if not hits:
            print("  (no keyword hits; first 400 chars)")
            print("  " + txt[:400])
    except Exception as ex:
        print("=" * 60)
        print(f"[{name}] {url} -> ERROR {type(ex).__name__}: {ex}")
