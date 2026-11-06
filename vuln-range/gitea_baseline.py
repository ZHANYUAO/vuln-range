#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Independent baseline for the Gitea 28.3.0 lab.

Runs the same six checks the ARTEX task was given, so every finding the engine
reports can be judged against a known-good measurement instead of a guess.

  python gitea_baseline.py
"""

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

for _v in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"):
    os.environ.pop(_v, None)
os.environ["no_proxy"] = "*"

BASE = "http://127.0.0.1:3002"
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

ADMIN = ("pentestadmin", "GiteaPentest2026!")
LOW = ("lowpriv", "LowPriv2026!")


def req(method, path, body=None, cookie=None, user=None, ctype="application/json"):
    url = path if path.startswith("http") else BASE + path
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode() if isinstance(body, (dict, list)) else body.encode()
        headers["Content-Type"] = ctype
    if cookie:
        headers["Cookie"] = cookie
    if user:
        import base64
        token = base64.b64encode(("%s:%s" % user).encode()).decode()
        headers["Authorization"] = "Basic " + token
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with OPENER.open(r, timeout=20) as resp:
            raw = resp.read()
            return resp.status, dict(resp.headers), raw
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
    except Exception as e:
        return 0, {}, ("%s: %s" % (type(e).__name__, e)).encode()


def text(raw):
    return raw.decode("utf-8", "ignore")


def login(user):
    """form login -> cookie string"""
    body = urllib.parse.urlencode({
        "user_name": user[0], "password": user[1], "_csrf": "",
    })
    st, hd, raw = req("POST", "/user/login", body=body,
                      ctype="application/x-www-form-urlencoded")
    cookies = []
    for k, v in hd.items():
        if k.lower() == "set-cookie":
            cookies.append(v.split(";")[0])
    return st, "; ".join(cookies), hd


print("=" * 72)
print("1) RECON")
print("=" * 72)
for p in ["/api/v1/version", "/explore/repos", "/api/v1/repos/pentestadmin/public-demo"]:
    st, hd, raw = req("GET", p)
    ct = hd.get("Content-Type", "")
    print("%-45s -> %s  %s" % (p, st, ct[:30]))
    if "json" in ct:
        try:
            d = json.loads(text(raw))
            print("    keys:", list(d.keys())[:10] if isinstance(d, dict) else type(d).__name__)
        except Exception:
            print("    body:", text(raw)[:120])
    else:
        print("    bytes:", len(raw))

print()
print("=" * 72)
print("2) AUTHORIZATION CONTROL  (expected: 404 both)")
print("=" * 72)
st_low, ck_low, _ = login(LOW)
print("lowpriv login: HTTP %s | cookie len %d" % (st_low, len(ck_low)))
st_adm, ck_adm, _ = login(ADMIN)
print("admin   login: HTTP %s | cookie len %d" % (st_adm, len(ck_adm)))

for label, ck in [("anonymous", None), ("lowpriv", ck_low), ("admin", ck_adm)]:
    st, _, raw = req("GET", "/api/v1/repos/pentestadmin/secret-project", cookie=ck)
    st2, _, raw2 = req("GET", "/pentestadmin/secret-project", cookie=ck)
    print("  %-10s api=%-4s html=%-4s (body %d B)" % (label, st, st2, len(raw)))

print()
print("=" * 72)
print("3) USER INFO EXPOSURE")
print("=" * 72)
st, _, raw = req("GET", "/api/v1/users/lowpriv")
try:
    d = json.loads(text(raw))
    print("unauthenticated /api/v1/users/lowpriv -> %s" % st)
    print("  fields:", sorted(d.keys()))
    for k in ("email", "is_admin", "last_login", "created", "login"):
        print("    %-12s %r" % (k, d.get(k)))
except Exception as e:
    print("  parse err", e, text(raw)[:150])
st, _, raw = req("GET", "/api/v1/users/search?q=low")
print("  /api/v1/users/search?q=low -> %s | %s" % (st, text(raw)[:160]))

print()
print("=" * 72)
print("4) STORED XSS  (expect escaped)")
print("=" * 72)
payloads = {
    "script": "<script>alert(1)</script>",
    "img": "<img src=x onerror=alert(1)>",
}
created = {}
for name, pl in payloads.items():
    body = {"title": "xss probe %s %s" % (name, pl), "body": "body %s" % pl}
    st, _, raw = req("POST", "/api/v1/repos/pentestadmin/public-demo/issues",
                     body=body, cookie=ck_adm)
    if st in (200, 201):
        d = json.loads(text(raw))
        created[name] = d.get("number")
        print("  created issue #%s (%s) -> %s" % (d.get("number"), name, st))
    else:
        print("  %s -> HTTP %s %s" % (name, st, text(raw)[:100]))

for name, num in created.items():
    st, _, raw = req("GET", "/pentestadmin/public-demo/issues/%s" % num)
    page = text(raw)
    escaped = "&lt;script&gt;" in page or "&lt;img" in page
    raw_tag = "<script>alert(1)</script>" in page or "<img src=x onerror=alert(1)>" in page
    api_st, _, api_raw = req("GET", "/api/v1/repos/pentestadmin/public-demo/issues/%s" % num)
    print("  issue #%s page=%s escaped=%s raw_tag_present=%s"
          % (num, st, escaped, raw_tag))

print()
print("=" * 72)
print("5) AUTH SURFACE")
print("=" * 72)
for i in range(5):
    st, hd, raw = req("POST", "/user/login",
                      body=urllib.parse.urlencode({"user_name": "pentestadmin", "password": "wrong%d" % i}),
                      ctype="application/x-www-form-urlencoded")
    body_txt = text(raw)
    m = re.search(r'class="[^"]*(?:error|flash)[^"]*"[^>]*>([^<]{0,120})', body_txt)
    print("  bad pw #%d -> %s | %s" % (i + 1, st, (m.group(1).strip() if m else "no flash matched")[:70]))

st, hd, raw = req("POST", "/user/login",
                  body=urllib.parse.urlencode({"user_name": "nosuchuser_xyz", "password": "whatever"}),
                  ctype="application/x-www-form-urlencoded")
print("  unknown user -> %s" % st)

cookies = [v for k, v in hd.items() if k.lower() == "set-cookie"]
print("  Set-Cookie on login:")
for c in cookies:
    flags = [f for f in ("HttpOnly", "SameSite", "Secure") if f.lower() in c.lower()]
    print("    %-28s flags=%s" % (c.split("=")[0], flags or "NONE"))

st, _, raw = req("GET", "/api/v1/user")
print("  /api/v1/user anonymous -> %s" % st)

print()
print("=" * 72)
print("6) PATH / TRAVERSAL")
print("=" * 72)
probes = [
    "/attachments/../../data/gitea.db",
    "/attachments/..%2f..%2fdata%2fgitea.db",
    "/api/v1/repos/pentestadmin/public-demo/raw/../../../../data/gitea.db",
    "/api/v1/repos/pentestadmin/public-demo/contents/..%2f..%2f..%2fdata",
    "/avatars/../../data/gitea.db",
]
for p in probes:
    st, hd, raw = req("GET", p)
    print("  %-62s -> %s (%d B)" % (p, st, len(raw)))

print()
print("=" * 72)
print("BASELINE DONE")
print("=" * 72)
