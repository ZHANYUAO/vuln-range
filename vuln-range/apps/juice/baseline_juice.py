#!/usr/bin/env python3
"""baseline_juice.py —— 对 OWASP Juice Shop（真实开源应用）跑纯黑盒基线

与 lab 的 baseline.py 分开，原因：
  - lab 的评分逻辑绑在 lab 自己的 GT 上（路径/参数都是已知的）
  - 真实应用上我们**不知道**洞在哪，评分只能事后做（对官方 challenge 的 solved 记账）

本脚本只做「扫描器说它发现了什么」，不做任何判定。
输出 apps/juice/out/baseline_juice.json，并记录每次运行的耗时与 solved 变化。

用法： python apps/juice/baseline_juice.py [--run all|ffuf|dalfox|sqlmap|nuclei]
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("JUICE_BASE", "http://127.0.0.1:3001")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BIN = os.path.join(ROOT, "baseline", "bin")
OUTDIR = os.path.join(HERE, "out")
WORDLIST = os.path.join(ROOT, "baseline", "wordlist.txt")
PROFILE = os.path.join(ROOT, "profiles", "juiceshop.json")


def op():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def http_get(path, timeout=10):
    try:
        with op().open(BASE + path, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)


def solved_now():
    """应用自身的记账。用攻击者 A 的会话查，solved 是按用户记的。"""
    try:
        prof = json.load(open(PROFILE, encoding="utf-8"))
        tok = prof["artifacts"]["auth_token"]
    except Exception:
        tok = None
    hdrs = {"Authorization": "Bearer " + tok} if tok else {}
    r = urllib.request.Request(BASE + "/api/Challenges", headers=hdrs)
    try:
        with op().open(r, timeout=15) as resp:
            d = json.loads(resp.read().decode())["data"]
            return sorted(x["key"] for x in d if x.get("solved"))
    except Exception as e:
        return ["<error:%s>" % e]


def alive():
    st, body = http_get("/")
    return st == 200 and "html" in body[:200].lower()


# ---------------------------------------------------------------- 扫描器
def run_ffuf():
    """内容发现。真实应用上 ffuf 的价值是**摸到攻击面**，它不做漏洞判定。"""
    exe = os.path.join(BIN, "ffuf.exe")
    if not os.path.exists(exe):
        return {"tool": "ffuf", "status": "NO_BINARY", "findings": [], "elapsed": 0}
    if not os.path.exists(WORDLIST):
        return {"tool": "ffuf", "status": "NO_WORDLIST", "findings": [], "elapsed": 0}

    out_json = os.path.join(OUTDIR, "ffuf_juice.json")
    if os.path.exists(out_json):
        os.remove(out_json)

    t0 = time.time()
    res = []
    # 三个前缀各跑一次：只用根目录会漏掉 /rest/*、/api/* 这类
    for label, tmpl in (("root", BASE + "/FUZZ"),
                        ("api", BASE + "/api/FUZZ"),
                        ("rest", BASE + "/rest/FUZZ")):
        # 过滤器是**实测出来的**，不是猜的：
        #   -fs 10017      → Angular 的 index.html 外壳（未知路由全返 200 + 这个长度）
        #   -fr "Unexpected path" → 500 错误页（回显路径 + 堆栈），长度随路径变化骗过 -fs
        cmd = [exe, "-u", tmpl, "-w", WORDLIST, "-mc", "all", "-fc", "404",
               "-fs", "10017", "-fr", "Unexpected path|Cannot GET|ENOENT",
               "-t", "10", "-timeout", "5", "-s", "-of", "json",
               "-o", os.path.join(OUTDIR, "ffuf_%s.json" % label)]
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            raw = p.stdout
        except subprocess.TimeoutExpired:
            raw = ""
        f = os.path.join(OUTDIR, "ffuf_%s.json" % label)
        if os.path.exists(f):
            try:
                d = json.load(open(f, encoding="utf-8"))
                for r in d.get("results", []):
                    res.append({
                        "path": urllib.parse.urlparse(r.get("url", "")).path,
                        "status": r.get("status"),
                        "length": r.get("length"),
                        "prefix": label,
                        "words": r.get("words"),
                    })
            except Exception:
                pass
    elapsed = time.time() - t0
    # 去重（同一路径可能被多个前缀命中）
    seen, uniq = set(), []
    for r in res:
        k = (r["path"], r["status"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(r)
    return {"tool": "ffuf", "status": "OK", "findings": uniq, "elapsed": round(elapsed, 1)}


def run_dalfox():
    exe = os.path.join(BIN, "dalfox.exe")
    if not os.path.exists(exe):
        return {"tool": "dalfox", "status": "NO_BINARY", "findings": [], "elapsed": 0}
    out = os.path.join(OUTDIR, "dalfox_juice.json")
    if os.path.exists(out):
        os.remove(out)
    url = BASE + "/rest/products/search?q=apple"
    t0 = time.time()
    # 3.2.4（Rust 重写版）没有 --no-spinner/--no-color，加了会直接报错退出（0.1s 空结果）
    cmd = [exe, "url", url, "-f", "json", "-o", out, "--timeout", "10"]
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=240)
    except subprocess.TimeoutExpired:
        pass
    elapsed = time.time() - t0
    findings = []
    if os.path.exists(out):
        for line in open(out, encoding="utf-8", errors="replace"):
            line = line.strip()
            if not line or not line.startswith("{"):
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            findings.append({
                "type": d.get("type"),
                "param": d.get("param"),
                "payload": d.get("payload"),
                "evidence": (d.get("evidence") or "")[:200],
                "severity": d.get("severity"),
                "confidence": d.get("confidence"),
                "message": d.get("message_str") or d.get("message"),
            })
    return {"tool": "dalfox", "status": "OK", "findings": findings, "elapsed": round(elapsed, 1)}


def run_sqlmap():
    sm = os.path.join(BIN, "sqlmap", "sqlmap.py")
    if not os.path.exists(sm):
        return {"tool": "sqlmap", "status": "NO_BINARY", "findings": [], "elapsed": 0}
    py = sys.executable
    target = BASE + "/rest/products/search?q=apple"
    t0 = time.time()
    cmd = [py, sm, "-u", target, "--batch", "--level=2", "--risk=1",
           "--technique=BEU", "--threads=1", "--timeout=10", "--retries=1",
           "--output-dir", os.path.join(OUTDIR, "sqlmap")]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        log = p.stdout
    except subprocess.TimeoutExpired as e:
        log = (e.stdout or b"").decode("utf-8", "replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
    elapsed = time.time() - t0
    findings = []
    # 只认 sqlmap 自己的结论行，不自己猜
    for line in log.splitlines():
        if re.search(r"Parameter:\s+(\S+)", line):
            findings.append({"kind": "parameter", "raw": line.strip()})
        if re.search(r"Type:\s+(.+)$", line):
            findings.append({"kind": "technique", "raw": line.strip()})
        if re.search(r"back-end DBMS:", line, re.I):
            findings.append({"kind": "dbms", "raw": line.strip()})
        if re.search(r"Payload:", line):
            findings.append({"kind": "payload", "raw": line.strip()})
    status = "INJECTABLE" if any(f["kind"] == "parameter" for f in findings) else "NOT_INJECTABLE"
    open(os.path.join(OUTDIR, "sqlmap_juice.log"), "w", encoding="utf-8").write(log)
    return {"tool": "sqlmap", "status": status, "findings": findings,
            "elapsed": round(elapsed, 1)}


def run_nuclei():
    exe = os.path.join(BIN, "nuclei.exe")
    if not os.path.exists(exe):
        return {"tool": "nuclei", "status": "NO_BINARY", "findings": [], "elapsed": 0}
    tdir = os.path.join(ROOT, "baseline", "templates")
    out = os.path.join(OUTDIR, "nuclei_juice.jsonl")
    if os.path.exists(out):
        os.remove(out)
    t0 = time.time()
    cmd = [exe, "-auth=false", "-duc", "-u", BASE, "-t", tdir,
           "-jsonl", "-o", out, "-silent", "-timeout", "8", "-retries", "1"]
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        return {"tool": "nuclei", "status": "BLOCKED_TIMEOUT", "findings": [],
                "elapsed": round(time.time() - t0, 1)}
    findings = []
    if os.path.exists(out):
        for line in open(out, encoding="utf-8", errors="replace"):
            try:
                d = json.loads(line)
            except Exception:
                continue
            findings.append({"template": d.get("template-id"), "matched": d.get("matched-at"),
                             "severity": d.get("info", {}).get("severity")})
    return {"tool": "nuclei", "status": "OK" if findings else "NO_MATCH", "findings": findings,
            "elapsed": round(time.time() - t0, 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="all", choices=["all", "ffuf", "dalfox", "sqlmap", "nuclei"])
    args = ap.parse_args()
    os.makedirs(OUTDIR, exist_ok=True)
    if not alive():
        print("[FATAL] %s 未响应，先启动 Juice Shop" % BASE)
        return 2

    before = solved_now()
    print("[baseline] solved before = %s" % (before or "(none)"))
    runs = []
    fns = {"ffuf": run_ffuf, "dalfox": run_dalfox, "sqlmap": run_sqlmap, "nuclei": run_nuclei}
    which = list(fns) if args.run == "all" else [args.run]
    for name in which:
        print("[run] %s ..." % name, flush=True)
        r = fns[name]()
        r["solved_after"] = solved_now()
        runs.append(r)
        print("  -> %s  findings=%d  %.1fs  solved=%s" % (
            r["status"], len(r["findings"]), r["elapsed"],
            r["solved_after"] or "(none)"), flush=True)

    doc = {
        "target": BASE,
        "tool": "OWASP Juice Shop 20.3.0 (official prebuilt)",
        "solved_before": before,
        "solved_final": solved_now(),
        "runs": runs,
        "note": "扫描器原始输出，未做任何真伪判定；判定在 verify.py 里做",
    }
    p = os.path.join(OUTDIR, "baseline_juice.json")
    json.dump(doc, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("[saved] %s" % p)

    new = sorted(set(doc["solved_final"]) - set(before))
    print("\n===== 扫描器这一轮解掉的官方挑战 =====")
    print(new or "(none)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
