"""pentagi 定向抓取（带重试）。用于核实其 LLM 配置字段，不依赖整包下载。"""
import json, os, re, time, urllib.request

OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
OUT = os.path.join(os.getcwd(), "_src", "pentagi")
PAT = re.compile(r"(llm|model|provider|config|settings|env|openai|anthropic|agent|docker)", re.I)
SKIP = re.compile(r"(\.png|\.jpg|\.svg|\.ico|\.woff|LOCK$|package-lock|\.min\.js|yarn\.lock|\.sum$)", re.I)


def get_raw(url, tries=4, timeout=90):
    last = None
    for i in range(tries):
        try:
            return OP.open(urllib.request.Request(url), timeout=timeout).read()
        except Exception as e:
            last = e
            time.sleep(2)
    raise last


def get_json(url, tries=4, timeout=90):
    return json.loads(get_raw(url, tries, timeout).decode("utf-8", "replace"))


def main():
    repo = "vxcontrol/pentagi"
    meta = get_json("https://api.github.com/repos/" + repo)
    br = meta.get("default_branch", "main")
    print("branch =", br, "size_kb =", meta.get("size"), flush=True)
    tree = get_json("https://api.github.com/repos/%s/git/trees/%s?recursive=1" % (repo, br), tries=6)
    blobs = [x for x in tree.get("tree", []) if x.get("type") == "blob"]
    print("files =", len(blobs), flush=True)
    sel = [b for b in blobs
           if PAT.search(os.path.basename(b["path"]))
           and not SKIP.search(b["path"])
           and b.get("size", 0) <= 120000]
    strong = re.compile(r"(llm|provider|model|openai|anthropic|\.env|docker-compose|config)", re.I)
    sel.sort(key=lambda b: (0 if strong.search(os.path.basename(b["path"])) else 1, b.get("size", 0)))
    sel = sel[:70]
    print("selected =", len(sel), flush=True)
    hits = []
    for b in sel:
        p = b["path"]
        dst = os.path.join(OUT, p.replace("/", os.sep))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        try:
            data = get_raw("https://raw.githubusercontent.com/%s/%s/%s" % (repo, br, p))
            with open(dst, "wb") as f:
                f.write(data)
            txt = data.decode("utf-8", "replace")
            m = re.search(r"(base[_ ]?url|api[_ ]?base|OPENAI|ANTHROPIC|LLM_|API_KEY|apiUrl)", txt, re.I)
            if m:
                hits.append((p, len(data), m.group(0)))
        except Exception as e:
            print("  ERR", p[:60], repr(e)[:60], flush=True)
        time.sleep(0.03)
    print("--- 命中 ---", flush=True)
    for p, n, h in hits:
        print("  %-62s %7d B [%s]" % (p[:62], n, h), flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
