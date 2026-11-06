import json, urllib.request, time
REPOS = ["knostic/OpenAnt","ProtectAI/vulnhuntr","trailofbits/buttercup",
         "Team-Atlanta/aixcc-afc-atlantis","shellphish/artiphishell",
         "google/oss-fuzz-gen","google/oss-fuzz","tob/crs-buttercup",
         "SecVulEval/SecVulEval","CyberGym/cybergym","Tsinghua-Asymmetric/CyberGym",
         "FuzzingBrain/fuzzingbrain","irislabs/iris","squaresLab/IRIS-LLM",
         "l3yx/Choccy","wooluo/VulnBot","NVIDIA/garak","projectzero/naptime",
         "googleprojectzero/bigsleep","zaproxy/zaproxy"]
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
for r in dict.fromkeys(REPOS):
    try:
        req = urllib.request.Request("https://api.github.com/repos/"+r,
              headers={"Accept":"application/vnd.github+json","User-Agent":"probe"})
        d = json.loads(op.open(req, timeout=15).read())
        if "full_name" not in d:
            print(f"{r:42s} -- {str(d.get('message'))[:40]}"); continue
        print(f"{r:42s} {d['stargazers_count']:>7} ★  {str(d.get('language')):10s} "
              f"{d['pushed_at'][:10]}  {(d.get('license') or {}).get('spdx_id') or '-':12s} "
              f"{(d.get('description') or '')[:60]}")
    except Exception as e:
        print(f"{r:42s} ERR {str(e)[:40]}")
    time.sleep(0.35)
