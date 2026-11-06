import os, urllib.request, urllib.error, re
for v in ("http_proxy","https_proxy","HTTP_PROXY","HTTPS_PROXY"): os.environ.pop(v,None)
os.environ["no_proxy"]="*"
op=urllib.request.build_opener(urllib.request.ProxyHandler({}))
for p in ["/ftp/","/ftp/quarantine/"]:
    try:
        r=op.open("http://127.0.0.1:3001"+p, timeout=15)
        chunks=[]
        while True:
            try:
                d=r.read(8192)
            except Exception:
                break
            if not d: break
            chunks.append(d)
        b=b"".join(chunks)
        code=r.status
    except urllib.error.HTTPError as e:
        b=e.read(); code=e.code
    links=re.findall(r'href="([^"]+)"', b.decode('utf-8','ignore'))
    print(f"{p} -> {code} total_bytes={len(b)} links={len(links)}")
    print("   links:", links[:15])
    print("   含 .bak/.md/.pdf:", [l for l in links if any(x in l for x in ('.bak','.md','.pdf'))][:10])
