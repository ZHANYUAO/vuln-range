"""B 段地面真值：私有仓附件直链，匿名/低权能否读到。"""
import os, base64, json, urllib.request, urllib.error, uuid as uuidlib
for v in ("http_proxy","https_proxy","HTTP_PROXY","HTTPS_PROXY"): os.environ.pop(v, None)
B = "http://127.0.0.1:3002"
ADM = base64.b64encode(b"pentestadmin:GiteaPentest2026!").decode()
LOW = base64.b64encode(b"lowpriv:LowPriv2026!").decode()
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
PAY = b"AUTHZ-PROBE-CONTENT-4f19b2 SECRET"

def req(method, path, auth=None, data=None, ctype=None):
    h = {"Accept": "application/json"}
    if auth: h["Authorization"] = "Basic " + auth
    if ctype: h["Content-Type"] = ctype
    try:
        r = op.open(urllib.request.Request(B + path, data=data, headers=h, method=method), timeout=20)
        return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 0, str(e)[:80].encode()

def multipart(field, fname, content):
    bd = "----probe" + uuidlib.uuid4().hex
    body = (f"--{bd}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{fname}\"\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n").encode() + content + f"\r\n--{bd}--\r\n".encode()
    return body, "multipart/form-data; boundary=" + bd

# 找出密钥仓里最新 issue 编号
c, b = req("GET", "/api/v1/repos/pentestadmin/secret-project/issues?limit=1&state=all", ADM)
print("list issues:", c, b[:120])
nums = [i["number"] for i in json.loads(b)] if c == 200 else []
num = nums[0] if nums else 1
print("用 issue #%d 上传附件" % num)

body, ct = multipart("attachment", "probe.txt", PAY)
c, b = req("POST", f"/api/v1/repos/pentestadmin/secret-project/issues/{num}/assets?name=probe.txt", ADM, body, ct)
print("upload asset:", c, b[:220])
if c not in (200, 201):
    raise SystemExit("上传失败")
d = json.loads(b)
uid = d.get("uuid") or str(d.get("id"))
print("uuid =", uid)

print()
print("=== 三种身份访问附件直链 ===")
for who, auth in (("anon", None), ("lowpriv", LOW), ("admin", ADM)):
    c1, b1 = req("GET", f"/attachments/{uid}", auth)
    print(f"  [{who:8s}] -> {c1} len={len(b1)} 内容泄漏={PAY in b1} head={b1[:50]!r}")

print()
print("=== 大小写/去横线变体（仅匿名） ===")
for p in (f"/attachments/{uid.replace('-', '')}", f"/attachments/{uid.upper()}"):
    c1, b1 = req("GET", p)
    print(f"  {p[:58]:58s} -> {c1} len={len(b1)} 泄漏={PAY in b1}")
