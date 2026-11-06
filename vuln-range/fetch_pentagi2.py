"""pentagi 关键配置文件并发抓取（只取最可能含 LLM 配置的少量文件）。

串行抓取实测 ~10 分钟/文件（本机到 raw.githubusercontent 极不稳定），故改为：
1) tree 落盘缓存，避免重复拉 495KB；
2) 只取 12 个强相关文件；
3) ThreadPoolExecutor 并发。
"""
import json, os, re, urllib.request
from concurrent.futures import ThreadPoolExecutor

OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "_src", "pentagi")
CACHE = os.path.join(HERE, "_src", "pentagi_tree.json")
REPO = "vxcontrol/pentagi"

STRONG = re.compile(
    r"(^|\.)(env\.example|\.env|docker-compose\.ya?ml|README\.md|llm|provider|model|config|settings|agent)(\.|$)",
    re.I)


def raw(path, br, tries=3):
    url = "https://raw.githubusercontent.com/%s/%s/%s" % (REPO, br, path)
    last = None
    for _ in range(tries):
        try:
            return OP.open(urllib.request.Request(url), timeout=45).read()
        except Exception as e:
            last = e
    raise last


def main():
    meta = json.loads(OP.open(urllib.request.Request(
        "https://api.github.com/repos/" + REPO), timeout=60).read().decode())
    br = meta.get("default_branch", "main")

    if os.path.exists(CACHE):
        tree = json.load(open(CACHE, encoding="utf-8"))
    else:
        tree = json.loads(OP.open(urllib.request.Request(
            "https://api.github.com/repos/%s/git/trees/%s?recursive=1" % (REPO, br)),
            timeout=120).read().decode())
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        json.dump(tree, open(CACHE, "w", encoding="utf-8"))
    blobs = [x for x in tree.get("tree", []) if x.get("type") == "blob"]
    print("files =", len(blobs), flush=True)

    cands = [b for b in blobs
             if STRONG.search(os.path.basename(b["path"]))
             and b.get("size", 0) <= 200000
             and not re.search(r"(\.png|\.jpg|\.svg|LOCK|\.min\.)", b["path"])]
    # 排序：README/.env.example/docker-compose/config 优先
    def rank(b):
        n = os.path.basename(b["path"]).lower()
        for i, kw in enumerate(("readme.md", ".env.example", "docker-compose", "llm", "provider", "config", "settings")):
            if kw in n:
                return i
        return 9
    cands.sort(key=lambda b: (rank(b), b.get("size", 0)))
    sel = cands[:12]
    print("selected =", len(sel), flush=True)

    def work(b):
        p = b["path"]
        try:
            data = raw(p, br)
            dst = os.path.join(OUT, p.replace("/", os.sep))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, "wb") as f:
                f.write(data)
            txt = data.decode("utf-8", "replace")
            m = re.search(r"(base[_ ]?url|api[_ ]?base|OPENAI|ANTHROPIC|LLM_|model[s]?\s*[:=]|provider)", txt, re.I)
            return (p, len(data), m.group(0) if m else "")
        except Exception as e:
            return (p, -1, "ERR " + repr(e)[:60])

    with ThreadPoolExecutor(max_workers=8) as ex:
        for p, n, h in ex.map(work, sel):
            print("  %-60s %8s B  %s" % (p[:60], n, h), flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
