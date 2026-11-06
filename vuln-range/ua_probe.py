import urllib.request, ssl, time

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx)
)

UAS = {
    "artex-enrich/1.0": "artex-enrich/1.0",
    "curl/8.5.0": "curl/8.5.0",
    "Go-http-client/1.1": "Go-http-client/1.1",
    "Chrome131": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
}
SITES = [
    ("hackerone.com", "https://hackerone.com/robots.txt"),
    ("bugcrowd.com", "https://www.bugcrowd.com/robots.txt"),
    ("intigriti.com", "https://www.intigriti.com/robots.txt"),
]
for host, url in SITES:
    print("=" * 58)
    for label, ua in UAS.items():
        t0 = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": ua})
            r = opener.open(req, timeout=20)
            body = r.read()
            print(f"  {host:<14} UA={label:<22} -> {r.status} {len(body):>6}B  {time.time()-t0:.2f}s  srv={r.headers.get('server','-')}")
        except Exception as ex:
            code = getattr(ex, "code", "-")
            print(f"  {host:<14} UA={label:<22} -> ERR {code} {type(ex).__name__}  {time.time()-t0:.2f}s")
