import os, urllib.request, urllib.parse, urllib.error, http.cookiejar
for v in ("http_proxy","https_proxy","HTTP_PROXY","HTTPS_PROXY"): os.environ.pop(v, None)
BASE = "http://127.0.0.1:3002"

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

op = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)
cj = http.cookiejar.CookieJar()
opc = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect,
                                  urllib.request.HTTPCookieProcessor(cj))

payloads = [
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example",
    "https:/\\evil.example",
    "%2F%2Fevil.example%2F",
    "///evil.example",
]
def probe(path, follow=False):
    try:
        r = op.open(BASE + path, timeout=12)
        return r.status, dict(r.headers).get("Location"), r.read(80)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers).get("Location"), b""

print("=== 未登录 GET /user/login?redirect_to= ===")
for p in payloads:
    q = "/user/login?redirect_to=" + urllib.parse.quote(p, safe="")
    code, loc, body = probe(q)
    print(f"  {p:28s} -> {code}  Location={loc}")

print()
print("=== 登录 POST 时带 redirect_to（应跳回站内） ===")
for p in payloads[:3]:
    data = urllib.parse.urlencode({"user_name":"pentestadmin","password":"GiteaPentest2026!",
                                   "redirect_to":p}).encode()
    req = urllib.request.Request(BASE + "/user/login", data=data, method="POST",
        headers={"Content-Type":"application/x-www-form-urlencoded"})
    try:
        r = opc.open(req, timeout=15)
        print(f"  {p:28s} -> {r.status}  Location={dict(r.headers).get('Location')}")
    except urllib.error.HTTPError as e:
        print(f"  {p:28s} -> {e.code}  Location={dict(e.headers).get('Location')}")

print()
print("=== 已登录 + 明显站外地址（决定性测试） ===")
for p in ["https://evil.example/", "//evil.example/"]:
    q = "/user/settings?redirect_to=" + urllib.parse.quote(p, safe="")
    code, loc, body = probe(q)
    print(f"  GET /user/settings?redirect_to={p} -> {code} Location={loc}  body80={body[:80]}")
