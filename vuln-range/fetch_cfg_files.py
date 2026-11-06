"""按文件精确抓取 shannon / pentagi 中与 LLM 配置相关的源码文件。

为什么不全量下载：github.com:443 本机直连超时，codeload 大包(92MB)传输易中断。
raw.githubusercontent.com 直连 0.9s 可达，逐文件取小文件更可靠。
"""
import json, os, re, time, urllib.request, urllib.error

OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
OUT = os.path.join(os.getcwd(), "_src")

PAT = re.compile(
    r"(llm|model|provider|config|settings|env|openai|anthropic|base_?url|api_?base|docker-compose|\.env)",
    re.I,
)
SKIP = re.compile(r"(\.png|\.jpg|\.svg|\.ico|\.woff|LOCK$|package-lock|\.min\.js|yarn\.lock)", re.I)


def get(url, timeout=60, raw=False):
    r = OP.open(urllib.request.Request(url), timeout=timeout)
    b = r.read()
    return b if raw else json.loads(b.decode("utf-8", "replace"))


def tree(repo, br):
    d = get("https://api.github.com/repos/%s/git/trees/%s?recursive=1" % (repo, br), timeout=90)
    return [x for x in d.get("tree", []) if x.get("type") == "blob"]


def pick(blobs, limit=60):
    out = []
    for b in blobs:
        p = b["path"]
        if SKIP.search(p):
            continue
        if not PAT.search(os.path.basename(p)):
            continue
        if b.get("size", 0) > 120000:
            continue
        out.append(b)
    # 优先：文件名强相关
    strong = re.compile(r"(llm|provider|model|openai|anthropic|\.env|docker-compose)", re.I)
    out.sort(key=lambda b: (0 if strong.search(os.path.basename(b["path"])) else 1, b.get("size", 0)))
    return out[:limit]


def fetch_raw(repo, br, path):
    url = "https://raw.githubusercontent.com/%s/%s/%s" % (repo, br, path)
    return get(url, timeout=60, raw=True)


def main():
    repos = ["KeygraphHQ/shannon", "vxcontrol/pentagi"]
    summary = {}
    for repo in repos:
        name = repo.split("/")[1]
        br = json.loads(OP.open(urllib.request.Request(
            "https://api.github.com/repos/" + repo), timeout=60).read().decode()).get("default_branch", "main")
        blobs = tree(repo, br)
        sel = pick(blobs)
        print("=== %s (branch=%s) 总文件 %d，选取 %d 个 ===" % (repo, br, len(blobs), len(sel)), flush=True)
        ok = []
        for b in sel:
            p = b["path"]
            dst = os.path.join(OUT, name, p.replace("/", os.sep))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            try:
                data = fetch_raw(repo, br, p)
                with open(dst, "wb") as f:
                    f.write(data)
                # 只保留含关键词的，减少噪音
                txt = data.decode("utf-8", "replace")
                hit = re.search(r"(base[_ ]?url|api[_ ]?base|OPENAI|ANTHROPIC|LLM_|apiKey|api_key)", txt, re.I)
                if hit:
                    ok.append((p, len(data), hit.group(0)))
            except Exception as e:
                print("  ERR %s %s" % (p[:60], repr(e)[:60]), flush=True)
            time.sleep(0.05)
        summary[name] = ok
        print("--- %s 命中 LLM 配置关键词的文件 ---" % name, flush=True)
        for p, n, h in ok:
            print("  %-64s %7d B  [%s]" % (p[:64], n, h), flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
