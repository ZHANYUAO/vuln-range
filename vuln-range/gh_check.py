import json, urllib.request, time
REPOS = ["GreyDGL/PentestGPT","vxcontrol/pentagi","0x4m4/hexstrike-ai","usestrix/strix",
         "aliasrobotics/cai","berylliumsec/nebula","CyberSecurityUP/NeuroSploit",
         "xoxruns/deadend-cli","samugit83/redamon","KeygraphHQ/shannon",
         "Autumn-27/artex","vxcontrol/pentagi"]
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
rows=[]
for r in dict.fromkeys(REPOS):
    try:
        req = urllib.request.Request("https://api.github.com/repos/"+r,
              headers={"Accept":"application/vnd.github+json","User-Agent":"probe"})
        d = json.loads(op.open(req, timeout=20).read())
        if "full_name" not in d:
            rows.append((r,"-","-","-","-",str(d.get("message"))[:40])); continue
        rows.append((r, d["stargazers_count"], d["forks_count"], d.get("language"),
                     d["pushed_at"][:10], (d.get("license") or {}).get("spdx_id") or "NOASSERTION"))
    except Exception as e:
        rows.append((r,"ERR","","","",str(e)[:50]))
    time.sleep(0.4)
print(f"{'repo':34s} {'star':>8s} {'fork':>7s} {'lang':>10s} {'pushed':>11s}  license")
for r in rows:
    print(f"{r[0]:34s} {str(r[1]):>8s} {str(r[2]):>7s} {str(r[3]):>10s} {str(r[4]):>11s}  {r[5]}")
