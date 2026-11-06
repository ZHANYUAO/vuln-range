#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
L3 广度基线跑分器：把三个真实扫描器打到本机靶场（8899），
再和 lab/ground_truth.json 的 11 条标注逐条对账，算 recall / 假阳性。

设计原则（避免自欺）：
1) 只用现成扫描器自己的判定，不用我们手写的探测逻辑冒充扫描器。
2) 扫描器是黑盒：只给它 base URL（ffuf/nuclei）或爬到的入口 URL（sqlmap）。
3) 命中必须"路径 + 漏洞类别"同时对得上，才算一条 GT 被检出。
4) 工具缺失就如实标 MISSING，不计入 recall 分母以外的任何修饰。

用法：
  python baseline.py --run all
  python baseline.py --report-only
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "http://127.0.0.1:8899"
OUT = os.path.join(HERE, "baseline", "out")
BIN = os.path.join(HERE, "baseline", "bin")
WL = os.path.join(HERE, "baseline", "wordlist.txt")
GT_PATH = os.path.join(HERE, "lab", "ground_truth.json")
PY = sys.executable

os.makedirs(OUT, exist_ok=True)


def http_get(url, timeout=10):
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with op.open(url, timeout=timeout) as r:
            return r.status, r.read(2000).decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)


def lab_alive():
    code, _ = http_get(BASE + "/")
    return code == 200


# ---------------------------------------------------------------- 扫描器封装
def run_ffuf():
    """内容发现：根目录 + /api/ 二级。ffuf 不自带词表，用 baseline/wordlist.txt。"""
    ffuf = os.path.join(BIN, "ffuf.exe")
    if not os.path.isfile(ffuf):
        return {"tool": "ffuf", "status": "MISSING", "findings": []}
    if not os.path.isfile(WL):
        return {"tool": "ffuf", "status": "NO_WORDLIST", "findings": []}

    findings = []
    for label, tmpl in (("root", BASE + "/FUZZ"), ("api", BASE + "/api/FUZZ")):
        outfile = os.path.join(OUT, "ffuf_%s.json" % label)
        cmd = [ffuf, "-u", tmpl, "-w", WL, "-mc", "all", "-fc", "404",
               "-t", "20", "-s", "-of", "json", "-o", outfile]
        try:
            subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        except Exception as e:
            findings.append({"tool": "ffuf", "error": str(e)})
            continue
        if not os.path.isfile(outfile):
            continue
        try:
            d = json.load(open(outfile, encoding="utf-8"))
        except Exception:
            continue
        for r in d.get("results", []):
            findings.append({
                "tool": "ffuf",
                "scope": label,
                "path": re.sub(r"^https?://[^/]+", "", r.get("url", "")),
                "status": r.get("status"),
                "length": r.get("length"),
            })
    return {"tool": "ffuf", "status": "OK", "findings": findings}


def run_ffuf_ablation():
    """消融对照：词表里显式包含 /api/internal/export。
    用来区分「ffuf 探不到」是发现能力问题还是检测能力问题。不计入主 recall。"""
    ffuf = os.path.join(BIN, "ffuf.exe")
    if not os.path.isfile(ffuf):
        return {"tool": "ffuf_ablation", "status": "MISSING", "findings": []}
    wl = os.path.join(HERE, "baseline", "wordlist_ablation.txt")
    with open(wl, "w", encoding="utf-8") as f:
        f.write("api/internal/export\napi/v2/internal/audit-log\nnothing-here-xyz\n")
    outfile = os.path.join(OUT, "ffuf_ablation.json")
    cmd = [ffuf, "-u", BASE + "/FUZZ", "-w", wl, "-mc", "all", "-fc", "404",
           "-t", "5", "-s", "-of", "json", "-o", outfile]
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except Exception as e:
        return {"tool": "ffuf_ablation", "status": "ERROR", "findings": [], "error": str(e)}
    findings = []
    if os.path.isfile(outfile):
        try:
            d = json.load(open(outfile, encoding="utf-8"))
            for r in d.get("results", []):
                findings.append({"tool": "ffuf_ablation",
                                 "path": re.sub(r"^https?://[^/]+", "", r.get("url", "")),
                                 "status": r.get("status")})
        except Exception:
            pass
    return {"tool": "ffuf_ablation", "status": "OK", "findings": findings}


def run_nuclei():
    """模板扫描。本机实测：v3.11.1 在 PDCP/云端初始化阶段挂死（-duc/-auth=false 均无效），
    且 -update-templates 报成功但落盘 0 个模板。这里只做一次带超时的尝试并如实记账。"""
    nuclei = os.path.join(BIN, "nuclei.exe")
    if not os.path.isfile(nuclei):
        return {"tool": "nuclei", "status": "MISSING", "findings": []}
    tdir = os.path.join(HERE, "baseline", "templates")
    outfile = os.path.join(OUT, "nuclei.jsonl")
    env = {k: v for k, v in os.environ.items()
           if k.lower() not in ("http_proxy", "https_proxy", "all_proxy")}
    cmd = [nuclei, "-auth=false", "-duc", "-u", BASE, "-t", tdir,
           "-dast", "-jsonl", "-o", outfile, "-silent",
           "-no-interactsh", "-stats=false", "-timeout", "8", "-retries", "1"]
    note = ""
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=120, env=env)
    except subprocess.TimeoutExpired:
        note = "启动阶段超时挂死（PDCP 云端初始化），本机不可用"
        return {"tool": "nuclei", "status": "BLOCKED", "findings": [], "note": note}
    findings = []
    if os.path.isfile(outfile):
        for line in open(outfile, encoding="utf-8", errors="replace"):
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            findings.append({
                "tool": "nuclei",
                "template": d.get("template-id"),
                "path": re.sub(r"^https?://[^/]+", "", d.get("matched-at", "") or d.get("host", "")),
                "severity": d.get("info", {}).get("severity"),
                "name": d.get("info", {}).get("name"),
            })
    return {"tool": "nuclei", "status": "OK" if findings else "NO_FINDINGS",
            "findings": findings, "note": note}


def run_sqlmap():
    """注入检测。入口 URL 来自靶场首页给出的 /api/search?q=（爬虫可达）。"""
    script = os.path.join(BIN, "sqlmap", "sqlmap.py")
    if not os.path.isfile(script):
        return {"tool": "sqlmap", "status": "MISSING", "findings": []}
    outdir = os.path.join(OUT, "sqlmap")
    os.makedirs(outdir, exist_ok=True)
    target = BASE + "/api/search?q=alice"
    cmd = [PY, script, "-u", target, "--batch", "--level", "2", "--risk", "2",
           "--technique", "BEU", "--threads", "1", "--timeout", "10",
           "--retries", "1", "--output-dir", outdir, "--flush-session"]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=1500,
                           cwd=os.path.join(BIN, "sqlmap"))
    except Exception as e:
        return {"tool": "sqlmap", "status": "ERROR", "findings": [], "error": str(e)}
    blob = (p.stdout or "") + (p.stderr or "")
    findings = []
    m = re.search(r"Parameter:\s*(\S+)\s*\(([^)]+)\)", blob)
    if m:
        findings.append({
            "tool": "sqlmap",
            "param": m.group(1),
            "place": m.group(2),
            "path": "/api/search",
            "technique": (re.search(r"Type:\s*(.+)", blob) or [None, ""])[1].strip() if re.search(r"Type:\s*(.+)", blob) else "",
        })
    return {"tool": "sqlmap", "status": "OK", "findings": findings,
            "vulnerable": "is vulnerable" in blob or bool(findings),
            "stderr": blob[-500:]}


def run_dalfox():
    """反射型 / DOM 型 XSS。

    为什么单独上 dalfox：nuclei 的 DAST 模板在本机拉不下来（云初始化被网络卡死），
    而 dalfox 自带 payload 变异 + DOM 验证 + **结论分级**：
        v = vulnerable（dalfox 断言可利用）
        r = reflected（只是反射，不可利用）
        a = AST DOM XSS
        i = informational
    最后这个分级很关键 —— 它意味着"扫描器自己也在做判定"。
    所以拿 dalfox 当基线，比拿一个只会报反射的扫描器当基线要**严苛得多**。
    """
    dalfox = os.path.join(BIN, "dalfox.exe")
    if not os.path.isfile(dalfox):
        return {"tool": "dalfox", "status": "MISSING", "findings": []}
    outfile = os.path.join(OUT, "dalfox.json")
    target = BASE + "/search?q=alice"
    cmd = [dalfox, "url", target, "-f", "json", "-o", outfile]
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except Exception as e:
        return {"tool": "dalfox", "status": "ERROR", "findings": [], "error": str(e)}

    findings = []
    try:
        data = json.load(open(outfile, encoding="utf-8"))
    except Exception as e:
        return {"tool": "dalfox", "status": "ERROR", "findings": [], "error": "parse: %s" % e}

    for f in data.get("findings") or []:
        findings.append({
            "tool": "dalfox",
            "path": "/search",
            "param": f.get("param"),
            "type": f.get("type"),                 # v / r / a / i
            "type_desc": f.get("type_description"),
            "confidence": f.get("confidence"),
            "confidence_reason": f.get("confidence_reason"),
            "detection_method": f.get("detection_method"),
            "inject_type": f.get("inject_type"),
            "payload": f.get("payload"),
            "cwe": f.get("cwe"),
            "url": f.get("data"),
        })
    meta = data.get("meta") or {}
    return {"tool": "dalfox", "status": "OK" if findings else "NO_FINDINGS",
            "findings": findings,
            "meta": {"total_requests": meta.get("total_requests"),
                     "scan_duration_ms": meta.get("scan_duration_ms"),
                     "incomplete": meta.get("incomplete")}}


# ---------------------------------------------------------------- 对账
def load_gt():
    d = json.load(open(GT_PATH, encoding="utf-8"))
    return d["vulns"]


def evaluate(runs, gt):
    """命中判定：路径 + 类别同时对上。规则写死在这里，便于别人复核。"""
    ffuf_paths = {f.get("path", "").rstrip("/") for f in next(
        (r["findings"] for r in runs if r["tool"] == "ffuf"), []) if f.get("path")}
    ffuf_ok = {f["path"].rstrip("/") for f in next(
        (r["findings"] for r in runs if r["tool"] == "ffuf"), [])
        if f.get("path") and f.get("status") not in (404,)}
    nuc = next((r["findings"] for r in runs if r["tool"] == "nuclei"), [])
    sql = next((r["findings"] for r in runs if r["tool"] == "sqlmap"), [])
    dal = next((r["findings"] for r in runs if r["tool"] == "dalfox"), [])

    rows = []
    for v in gt:
        vid = v["id"]
        cls = v["class"]
        path = v.get("request", {}).get("path", "")
        want = (v.get("assert") or {}).get("value")
        hit, by, why = False, "", ""

        def confirm(p):
            """扫描器只给出"这个路径存在"；是否真是漏洞要回原始判据复验（L4 闸门的最小化应用）。"""
            code, body = http_get(BASE + p)
            return code < 400 and isinstance(want, str) and want in body, code

        if cls == "sql_injection":
            if sql:
                hit, by = True, "sqlmap: 参数 %s 可注入" % sql[0].get("param")
            else:
                why = "sqlmap 未报注入"
        elif cls in ("exposed_internal_api", "unauthorized_data_access"):
            if path.rstrip("/") in ffuf_ok:
                ok, code = confirm(path)
                if ok:
                    hit, by = True, "ffuf 发现路径 + 判据复验通过（%s -> %s，正文含判据值）" % (path, code)
                else:
                    why = "ffuf 报告路径存在，但判据复验不通过（疑似假阳性）"
            else:
                why = "词表未命中该路径（黑盒发现失败）"
        elif cls == "reflected_xss":
            # 只认 dalfox 的 type=v（它自己断言可利用）。type=r 是"只是反射"，
            # 按 confirmed 口径不能算检出 —— 这一步刻意比"有反射就算命中"严。
            dal_v = [d for d in dal if (d.get("type") or "").lower() == "v"]
            dal_r = [d for d in dal if (d.get("type") or "").lower() in ("r", "a")]
            nuc_hits = [n for n in nuc if n.get("path", "").startswith(path) and
                        ("xss" in (n.get("template") or "").lower())]
            if dal_v:
                hit, by = True, "dalfox: type=v confidence=%s param=%s" % (
                    dal_v[0].get("confidence"), dal_v[0].get("param"))
            elif dal_r:
                why = "dalfox 只判到 type=%s（反射/AST，未断言可利用），不足以确认" % dal_r[0].get("type")
            elif nuc_hits:
                hit, by = True, "nuclei: %s" % nuc_hits[0].get("template")
            else:
                why = "dalfox 与 nuclei 均未检出"
        elif cls in ("path_traversal_read",):
            hits = [n for n in nuc if "traversal" in (n.get("template") or "").lower()
                    or "lfi" in (n.get("template") or "").lower()]
            if hits:
                hit, by = True, "nuclei: %s" % hits[0].get("template")
            else:
                why = "无 traversal 类模板命中"
        elif cls == "default_credentials":
            hits = [n for n in nuc if "default-login" in (n.get("template") or "").lower()
                    or "default" in (n.get("template") or "").lower()]
            if hits:
                hit, by = True, "nuclei: %s" % hits[0].get("template")
            else:
                why = "自定义登录页不在 nuclei 默认凭据模板覆盖范围"
        else:
            why = "该类漏洞黑盒扫描器结构性不可达（需多身份/OAST/业务语义）"
        rows.append({"id": vid, "class": cls, "path": path,
                     "detected": hit, "by": by, "why_not": why})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="all", choices=["all", "ffuf", "nuclei", "sqlmap", "dalfox"])
    ap.add_argument("--report-only", action="store_true")
    args = ap.parse_args()

    if not lab_alive():
        print("[FATAL] 靶场 %s 未响应，先启动 lab_app.py" % BASE)
        return 2

    run_file = os.path.join(OUT, "runs.json")
    if args.report_only and os.path.isfile(run_file):
        runs = json.load(open(run_file, encoding="utf-8"))
    else:
        prior = {}
        if os.path.isfile(run_file):
            try:
                for r in json.load(open(run_file, encoding="utf-8")):
                    prior[r.get("tool")] = r
            except Exception:
                prior = {}
        runs = []
        which = ["ffuf", "nuclei", "sqlmap", "dalfox"] if args.run == "all" else [args.run]
        for name, fn in (("ffuf", run_ffuf), ("nuclei", run_nuclei),
                         ("sqlmap", run_sqlmap), ("dalfox", run_dalfox)):
            if name not in which:
                continue
            t0 = time.time()
            print("[*] running %s ..." % name, flush=True)
            r = fn()
            r["elapsed_s"] = round(time.time() - t0, 1)
            prior[r["tool"]] = r
            print("    %s -> %s, %d findings, %.1fs" % (name, r["status"], len(r["findings"]), r["elapsed_s"]),
                  flush=True)
            runs.append(r)
        if args.run == "all":
            print("[*] running ffuf_ablation ...", flush=True)
            ra = run_ffuf_ablation()
            print("    ffuf_ablation -> %s, %d findings" % (ra["status"], len(ra["findings"])), flush=True)
            prior[ra["tool"]] = ra
            runs.append(ra)
        merged = []
        for tool in ("ffuf", "ffuf_ablation", "nuclei", "sqlmap", "dalfox"):
            if tool in prior:
                merged.append(prior[tool])
        for r in prior.values():
            if r not in merged:
                merged.append(r)
        json.dump(merged, open(run_file, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        runs = merged

    gt = load_gt()
    rows = evaluate(runs, gt)
    n_hit = sum(1 for r in rows if r["detected"])
    total = len(rows)

    print()
    print("=" * 78)
    print("L3 广度基线 vs ground truth（%d 条）" % total)
    print("=" * 78)
    for r in rows:
        mark = "HIT " if r["detected"] else "MISS"
        print("%-4s %-14s %-26s %s" % (mark, r["id"], r["class"], r["by"] or r["why_not"]))
    print("-" * 78)
    print("recall = %d/%d = %.1f%%" % (n_hit, total, 100.0 * n_hit / total))
    for r in runs:
        print("  tool %-8s %-8s findings=%d elapsed=%ss" % (r["tool"], r["status"], len(r["findings"]),
                                                            r.get("elapsed_s", "-")))
    outjson = os.path.join(OUT, "baseline_report.json")
    json.dump({"rows": rows, "recall": {"hit": n_hit, "total": total},
               "runs": runs}, open(outjson, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("report ->", outjson)
    return 0


if __name__ == "__main__":
    sys.exit(main())
