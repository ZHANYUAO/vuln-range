"""A 段地面真值：私有仓 12 个子资源 × 3 种身份，只读 GET。"""
import os, base64, json, urllib.request, urllib.error
for v in ("http_proxy","https_proxy","HTTP_PROXY","HTTPS_PROXY"): os.environ.pop(v, None)
B = "http://127.0.0.1:3002"
R = "/api/v1/repos/pentestadmin/secret-project"
EPS = ["", "/issues", "/issues/1", "/pulls", "/releases", "/labels", "/milestones",
       "/hooks", "/collaborators", "/branches", "/contents/", "/commits",
       "/raw/main/README.md"]
IDS = {"anon": None,
       "lowpriv": base64.b64encode(b"lowpriv:LowPriv2026!").decode(),
       "admin": base64.b64encode(b"pentestadmin:GiteaPentest2026!").decode()}
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def get(path, auth):
    h = {"Accept": "application/json"}
    if auth: h["Authorization"] = "Basic " + auth
    try:
        r = op.open(urllib.request.Request(B + path, headers=h), timeout=12)
        return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 0, str(e)[:60].encode()

print(f"{'endpoint':22s} {'anon':>14s} {'lowpriv':>14s} {'admin':>14s}")
rows = []
for ep in EPS:
    cells = []
    detail = {}
    for name, auth in IDS.items():
        code, body = get(R + ep, auth)
        # 判定是否含真实数据
        real = False
        try:
            d = json.loads(body)
            if isinstance(d, list): real = len(d) > 0
            elif isinstance(d, dict): real = bool(d) and "message" not in d
        except Exception:
            real = len(body) > 200 and b"<html" not in body[:200].lower()
        detail[name] = (code, len(body), real)
        cells.append(f"{code}/{len(body)}/{'D' if real else '-'}")
    print(f"{ep or '/':22s} {cells[0]:>14s} {cells[1]:>14s} {cells[2]:>14s}")
    rows.append((ep, detail))

print()
print("=== 越权嫌疑：低权或匿名返回 200 且含真实数据 ===")
hits = 0
for ep, d in rows:
    for who in ("anon", "lowpriv"):
        code, ln, real = d[who]
        if code == 200 and real:
            print(f"  [{who}] {ep or '/'} -> 200, {ln} bytes, real_data=True")
            hits += 1
print(f"  合计 {hits} 处")
