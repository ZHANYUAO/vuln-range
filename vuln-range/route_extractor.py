#!/usr/bin/env python3
"""route_extractor.py —— P3：从 AltoroJ 3.1.1 源码提取可达路由，产出「覆盖率分母」

为什么换目标（沿用 v2 规划 §1）
------------------------------
Gitea 的 Go 路由散在 routers/api/v1 与 modules/… 里，150 行正则做不出可用提取器；
而且授权轮引擎已经打到 13 端点 × 3 身份，卡点不在「找不到门」。
AltoroJ 是 JSP + web.xml，路由是声明式的，能真正抽出一份**可枚举的分母**。

关键口径（这个模块最容易被误用的地方）
--------------------------------------
1. 产物是**分母**，不是提示词素材，也不是「漏洞清单」。
   不给 --reached 时 coverage 一律为 null，绝不编造「覆盖 47/213」。
2. web.xml 里的 ``/bank/*``、``*.jsp`` 是**通配符模式**，不是具体路径；
   单列在 wildcard_patterns，不进分母，否则分母虚高。
3. JSP 表达式（``action="<%=...%>"``）无法静态求值 → 记入 skipped，不猜。
4. 静态资源（css/js/图片/字体）与 WEB-INF/META-INF 不进分母：前者不是路由，
   后者容器保护不可达。
5. 覆盖率的分母是**源码里可枚举的路径**，不等于「该应用所有可达 URL」
   （运行时生成、REST 参数化、外部配置都可能漏）。这是上限未知的近似分母，
   报告里必须带上这句限定。

用法
----
  python route_extractor.py --self-test
  python route_extractor.py --out evidence/altoro-routes.json
  python route_extractor.py --reached reached.txt --out evidence/altoro-routes.json
"""
import argparse
import datetime
import json
import os
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
WORKSPACE = os.path.dirname(HERE)
DEFAULT_ROOT = os.path.join(WORKSPACE, "AltoroJ-master", "AltoroJ 3.1.1")
EVIDENCE_DIR = os.path.join(HERE, "evidence")

PAGE_EXT = {".jsp", ".htm", ".html"}
ASSET_EXT = {".css", ".js", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".ico",
             ".woff", ".woff2", ".ttf", ".swf", ".pdf", ".txt", ".xml", ".rtf"}
DYNAMIC_MARKERS = ("<%", "${", "#{", "%=")
BAD_SCHEMES = ("http://", "https://", "//", "mailto:", "javascript:", "data:",
               "tel:", "ftp://", "#")


# ------------------------------------------------------------------ 归一化
def normalize(raw, base_dir="/"):
    """把源码里的一条引用归一成站点内绝对路径；不可作分母时返回 None。

    base_dir 是**引用所在文件**相对 WebContent 的目录（如 "/bank"），
    相对路径必须按它解析，否则 `action="doLogin"` 会被错记成 "/doLogin"
    （本例恰好对，但 /bank/ccApply 就会错）。
    """
    if raw is None:
        return None
    s = str(raw).strip().strip('"').strip("'").strip()
    if not s or any(m in s for m in DYNAMIC_MARKERS):
        return None
    low = s.lower()
    if any(low.startswith(b) for b in BAD_SCHEMES):
        return None
    s = s.split("#", 1)[0].split("?", 1)[0]
    if not s:
        return None
    if not s.startswith("/"):
        s = posixpath.join(base_dir, s)
    s = posixpath.normpath(s)
    if not s.startswith("/"):
        s = "/" + s
    parts = [p for p in s.split("/") if p]
    if any(p.upper() in ("WEB-INF", "META-INF") for p in parts):
        return None
    if "*" in s:
        return None
    ext = posixpath.splitext(s)[1].lower()
    if ext in ASSET_EXT:
        return None
    return s


def _query_keys(raw):
    if not raw or "?" not in str(raw):
        return []
    q = str(raw).split("?", 1)[1].split("#", 1)[0]
    return sorted({k for k, _ in (p.split("=", 1) for p in re.findall(
        r"[A-Za-z0-9_\[\]%.\-]+(?:=[^&]*)?", q)) if k})


def _stripped_tag_attrs(tag, name):
    m = re.search(r"\b%s\s*=\s*([\"'])(.*?)\1" % re.escape(name), tag,
                  re.I | re.S)
    if m:
        return m.group(2)
    m = re.search(r"\b%s\s*=\s*([^\s>]+)" % re.escape(name), tag, re.I)
    return m.group(1) if m else None


# ------------------------------------------------------------------ 各来源
def _local(tag):
    """剥掉 ElementTree 的命名空间，返回局部标签名。"""
    return tag.rsplit("}", 1)[-1]


def from_web_xml(root):
    """返回 (servlet 路由, 通配符模式, filter 保护的 url-pattern)。"""
    path = os.path.join(root, "WebContent", "WEB-INF", "web.xml")
    hits, wildcards, filters = [], [], []
    if not os.path.isfile(path):
        return hits, wildcards, filters
    tree = ET.parse(path)
    servlet_class = {}
    for el in tree.iter():
        if _local(el.tag) == "servlet":
            name = cls = None
            for sub in el:
                if _local(sub.tag) == "servlet-name":
                    name = (sub.text or "").strip()
                elif _local(sub.tag) == "servlet-class":
                    cls = (sub.text or "").strip()
            if name:
                servlet_class[name] = cls
    lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    for el in tree.iter():
        tag = _local(el.tag)
        if tag not in ("servlet-mapping", "filter-mapping"):
            continue
        name, patterns = None, []
        for sub in el:
            if _local(sub.tag) == "servlet-name":
                name = (sub.text or "").strip()
            elif _local(sub.tag) == "filter-name":
                name = (sub.text or "").strip()
            elif _local(sub.tag) == "url-pattern":
                patterns.append((sub.text or "").strip())
        for pat in patterns:
            # 用源文件行号做可回溯定位（同一 pattern 可能重复出现，取首个）
            line = next((i + 1 for i, l in enumerate(lines)
                         if "<url-pattern>" in l and pat in l), None)
            entry = {"pattern": pat, "source_file": "WebContent/WEB-INF/web.xml",
                     "line": line, "bound_to": name}
            if tag == "filter-mapping":
                filters.append(entry)
                continue
            if "*" in pat:
                wildcards.append(dict(entry, servlet_class=servlet_class.get(name)))
                continue
            n = normalize(pat)
            if n:
                hits.append({"path": n, "method": "ANY", "kind": "web.xml/servlet-mapping",
                             "source_file": entry["source_file"], "line": line,
                             "params": [], "bound_to": name,
                             "servlet_class": servlet_class.get(name)})
    return hits, wildcards, filters


def from_java(root):
    """Java 里的显式跳转/转发目标 + @WebServlet 注解（本版本没有注解）。"""
    hits = []
    src = os.path.join(root, "src")
    for dirpath, _, files in os.walk(src):
        for fn in files:
            if not fn.endswith(".java"):
                continue
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, root).replace("\\", "/")
            for i, line in enumerate(open(p, encoding="utf-8", errors="replace"), 1):
                if "@WebServlet" in line:
                    m = re.search(r"@WebServlet\s*\(\s*[\"']([^\"']+)", line)
                    n = normalize(m.group(1)) if m else None
                    if n:
                        hits.append({"path": n, "method": "ANY",
                                     "kind": "java/@WebServlet", "source_file": rel,
                                     "line": i, "params": []})
                for kw in ("sendRedirect", "getRequestDispatcher", "forward"):
                    if kw not in line:
                        continue
                    for m in re.finditer(r"[\"'](/[^\"']+)[\"']", line):
                        # 拼接残留：sendRedirect("balance.jsp&acctId=" + id) 里的
                        # "&acctId=" 不是路径的一部分，截掉；"?k=" 同理。
                        frag = m.group(1).split("&", 1)[0].split("?", 1)[0]
                        n = normalize(frag)
                        if n:
                            hits.append({"path": n, "method": "ANY",
                                         "kind": "java/%s" % kw,
                                         "source_file": rel, "line": i,
                                         "params": []})
    return hits


def from_pages(root):
    """JSP/HTML/JSPF 里的 form / a / jsp:include / jsp:forward / include 指令。"""
    hits, skipped = [], []
    web = os.path.join(root, "WebContent")
    for dirpath, _, files in os.walk(web):
        for fn in files:
            if posixpath.splitext(fn)[1].lower() not in (PAGE_EXT | {".jspf"}):
                continue
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, root).replace("\\", "/")
            # 🔴 Windows 实测坑：os.path.relpath 返回 "bank\main.jsp"，
            # posixpath.dirname 不认反斜杠 → 返回 ""，于是 /bank/ccApply
            # 被错记成 /ccApply。必须先统一成正斜杠再交给 posixpath。
            page_rel = os.path.relpath(p, web).replace("\\", "/")
            base = "/" + posixpath.dirname(page_rel)
            base = base.rstrip("/") or "/"
            text = open(p, encoding="utf-8", errors="replace").read()
            lines = text.splitlines()

            def add(raw, method, kind, lineno, params=None, self_page=False):
                n = normalize(raw if not self_page else posixpath.join(
                    base, fn), base)
                if not n:
                    if raw and any(m in str(raw) for m in DYNAMIC_MARKERS):
                        skipped.append({"source_file": rel, "line": lineno,
                                        "kind": kind, "raw": str(raw)[:100],
                                        "reason": "JSP 表达式无法静态求值"})
                    return
                all_params = set(params or [])
                if raw:
                    all_params |= set(_query_keys(raw))
                # .jspf 是被 include 的片段、/static/*.htm 常被从别的目录引用：
                # 它们的相对路径基准取决于「最终页面的 URL」，静态分析无法唯一确定。
                ambiguous = (rel.endswith(".jspf") or
                             (rel.startswith("WebContent/static/") and raw is not None
                              and not str(raw).startswith("/")))
                hits.append({"path": n, "method": method, "kind": kind,
                             "source_file": rel, "line": lineno,
                             "params": sorted(all_params),
                             "base_ambiguous": ambiguous})

            for i, line in enumerate(lines, 1):
                for m in re.finditer(r"<form\b[^>]*>", line, re.I):
                    tag = m.group(0)
                    action = _stripped_tag_attrs(tag, "action")
                    method = (_stripped_tag_attrs(tag, "method") or "GET").upper()
                    if method not in ("GET", "POST"):
                        method = "GET"
                    # 表单参数：从该 form 起扫到 </form>（含跨行，最多 60 行）
                    chunk = "\n".join(lines[i - 1:i + 60])
                    if "</form>" in chunk:
                        chunk = chunk.split("</form>", 1)[0]
                    params = re.findall(
                        r"<(?:input|select|textarea)\b[^>]*\bname\s*=\s*[\"']([^\"']+)",
                        chunk, re.I)
                    add(action, method, "form", i, params,
                        self_page=(action is None))
                for m in re.finditer(r"<a\b[^>]*\bhref\s*=\s*([\"'])(.*?)\1", line,
                                    re.I | re.S):
                    add(m.group(2), "GET", "link", i)
                for m in re.finditer(
                        r"<jsp:(?:include|forward)\b[^>]*\bpage\s*=\s*([\"'])(.*?)\1",
                        line, re.I | re.S):
                    add(m.group(2), "GET", "jsp:include/forward", i)
                for m in re.finditer(
                        r"<%@\s*include\b[^>]*\bfile\s*=\s*([\"'])(.*?)\1",
                        line, re.I | re.S):
                    add(m.group(2), "GET", "include-directive", i)
    return hits, skipped


def from_js(root):
    hits = []
    web = os.path.join(root, "WebContent")
    for dirpath, _, files in os.walk(web):
        for fn in files:
            if not fn.endswith(".js"):
                continue
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, root).replace("\\", "/")
            page_rel = os.path.relpath(p, web).replace("\\", "/")
            base = "/" + posixpath.dirname(page_rel)
            base = base.rstrip("/") or "/"
            for i, line in enumerate(open(p, encoding="utf-8", errors="replace"), 1):
                for m in re.finditer(
                        r"(?:fetch\s*\(\s*|url\s*:\s*|\.open\s*\(\s*[\"'][A-Z]+\s*,\s*)([\"'])(.*?)\1",
                        line, re.I):
                    n = normalize(m.group(2), base)
                    if n:
                        hits.append({"path": n, "method": "ANY", "kind": "js",
                                     "source_file": rel, "line": i, "params": []})
    return hits


def from_static_files(root):
    """WebContent 下可直接请求的页面文件本身。"""
    hits = []
    web = os.path.join(root, "WebContent")
    for dirpath, _, files in os.walk(web):
        for fn in files:
            if posixpath.splitext(fn)[1].lower() not in PAGE_EXT:
                continue
            rel = "/" + os.path.relpath(os.path.join(dirpath, fn), web).replace("\\", "/")
            n = normalize(rel)
            if n:
                hits.append({"path": n, "method": "GET", "kind": "static-file",
                             "source_file": "WebContent" + rel, "line": None,
                             "params": []})
    return hits


# ------------------------------------------------------------------ 汇总
def extract(root=DEFAULT_ROOT):
    if not os.path.isdir(root):
        raise FileNotFoundError("AltoroJ 源码目录不存在：%s" % root)
    wx_hits, wildcards, filters = from_web_xml(root)
    page_hits, skipped = from_pages(root)
    groups = {
        "web.xml/servlet-mapping": wx_hits,
        "java": from_java(root),
        "page": page_hits,
        "js": from_js(root),
        "static-file": from_static_files(root),
    }

    routes = {}
    for kind, hits in groups.items():
        for h in hits:
            key = h["path"]
            r = routes.setdefault(key, {
                "path": key, "methods": set(), "sources": [], "params": set(),
            })
            r["methods"].add(h["method"])
            r["params"].update(h.get("params") or [])
            r["sources"].append({
                "kind": h["kind"], "source_file": h["source_file"],
                "line": h["line"],
                **({"base_ambiguous": True} if h.get("base_ambiguous") else {}),
                **({"bound_to": h["bound_to"], "servlet_class": h["servlet_class"]}
                   if "bound_to" in h else {}),
            })
    web = os.path.join(root, "WebContent")
    out_routes = []
    for r in sorted(routes.values(), key=lambda x: x["path"]):
        fp = os.path.join(web, r["path"].lstrip("/").replace("/", os.sep))
        kinds = {s["kind"] for s in r["sources"]}
        if "web.xml/servlet-mapping" in kinds:
            path_class = "servlet-mapped"
        elif os.path.isfile(fp) or "static-file" in kinds:
            path_class = "file-backed"
        else:
            path_class = "reference-only"
        out_routes.append({
            "path": r["path"],
            "methods": sorted(r["methods"]),
            "params": sorted(r["params"]),
            "path_class": path_class,
            "base_ambiguous": any(s.get("base_ambiguous") for s in r["sources"]),
            "sources": r["sources"],
        })
    by_kind = Counter(s["kind"] for r in out_routes for s in r["sources"])
    by_class = Counter(r["path_class"] for r in out_routes)
    verified = sum(v for k, v in by_class.items() if k != "reference-only")
    return {
        "schema": "route-extractor/1",
        "target": "AltoroJ 3.1.1 (OWASP / IBM AppScan demo bank)",
        "root": os.path.relpath(root, WORKSPACE).replace("\\", "/"),
        "root_note": "相对工作区根目录的路径（正式产物不写本机绝对路径）；"
                     "换机器时用 --root 指定。",
        "generated_at": datetime.datetime.now(datetime.timezone.utc)
                        .isoformat(timespec="seconds"),
        "counts": {
            "routes": len(out_routes),
            "by_source_kind": dict(sorted(by_kind.items())),
            "by_path_class": dict(sorted(by_class.items())),
            "wildcard_patterns": len(wildcards),
            "dynamic_skipped": len(skipped),
            "servlet_mappings": len(groups["web.xml/servlet-mapping"]),
            "base_ambiguous_routes": sum(1 for r in out_routes
                                         if r["base_ambiguous"]),
        },
        "coverage_denominator": len(out_routes),
        "denominators": {
            "all": len(out_routes),
            "verified": verified,
            "verified_definition": "file-backed + servlet-mapped；剔除只被链接引用、"
                                   "源码里找不到对应文件或 servlet 映射的路径",
        },
        "routes": out_routes,
        "wildcard_patterns": wildcards,
        "filter_url_patterns": filters,
        "dynamic_skipped": skipped,
        "coverage": None,
        "coverage_note": "未给 --reached：只有分母，没有覆盖率。",
        "limitations": [
            "分母是源码里可枚举的具体路径，不等于应用全部可达 URL：运行时生成、"
            "REST 参数化、外部配置、容器默认 servlet 都可能漏。",
            "web.xml 的通配符模式（/* 、*.jsp）单列，不进分母，否则分母虚高。",
            "JSP 表达式（action=\"<%=...%>\"）无法静态求值，记入 dynamic_skipped，不猜。",
            "jspf 与 /static/*.htm 里的相对引用基准取决于「最终被请求页面的 URL」，"
            "静态分析无法唯一确定；这类来源标了 base_ambiguous，用时按 verified 口径更稳。",
            "Java 只抽 sendRedirect / getRequestDispatcher / forward 行里以 / 开头的"
            "路径字面量；相对跳转与运行时拼接不进分母。",
            "reference-only 路径是源码里被引用到、但没有对应文件或 servlet 映射的 URL，"
            "可能是历史遗留链接或 404；能发请求不等于有效端点。",
            "分母≠漏洞数，也≠检出率分母（后者见 AltoroJ-ground-truth-v2.md）。",
        ],
    }


def load_reached(path):
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    if path.lower().endswith(".json"):
        obj = json.loads(raw)
        if isinstance(obj, dict):
            obj = obj.get("paths") or obj.get("requests") or []
        items = []
        for x in obj:
            items.append(x.get("path") if isinstance(x, dict) else x)
    else:
        items = [l.strip() for l in raw.splitlines()
                 if l.strip() and not l.strip().startswith("#")]
    return [str(x) for x in items if x]


def apply_reached(report, reached_path, strict=False):
    raw = load_reached(reached_path)
    denoms = {
        "all": {r["path"] for r in report["routes"]},
        "verified": {r["path"] for r in report["routes"]
                     if r["path_class"] != "reference-only"},
    }
    norm = set()
    unresolved = []
    for x in raw:
        n = normalize(x)
        if n:
            norm.add(n)
        else:
            unresolved.append(x)
    by = {}
    for scope, denom in denoms.items():
        covered = sorted(denom & norm)
        by[scope] = {
            "covered": len(covered),
            "denominator": len(denom),
            "coverage_ratio": (len(covered) / len(denom)) if denom else None,
            "covered_paths": covered,
        }
    primary = "verified" if strict else "all"
    report["coverage"] = {
        "reached_file": os.path.abspath(reached_path).replace("\\", "/"),
        "reached_raw_count": len(raw),
        "reached_normalized_count": len(norm),
        "primary_scope": primary,
        "covered": by[primary]["covered"],
        "denominator": by[primary]["denominator"],
        "coverage_ratio": by[primary]["coverage_ratio"],
        "covered_paths": by[primary]["covered_paths"],
        "by_denominator": by,
        "reached_not_in_denominator": sorted(norm - denoms["all"]),
        "unresolved_reached_entries": unresolved,
        "caveat": "分母只含源码可枚举的具体路径；分子若来自扫描日志，"
                  "必须先确认日志里的路径已按同样口径归一化，否则比率不可比。"
                  "verified 口径剔除了 reference-only 路径，通常更可信。",
    }
    report["coverage_note"] = ("已按 --reached 计算覆盖率（primary=%s），"
                               "口径限定见 coverage.caveat。" % primary)
    return report


# ------------------------------------------------------------------ 自检
def self_test():
    cases = [
        ("绝对站内路径", "/bank/showAccount", "/", "/bank/showAccount"),
        ("相对路径按所在目录解析", "ccApply", "/bank", "/bank/ccApply"),
        ("带 query 去参", "/search.jsp?q=x&lang=en", "/", "/search.jsp"),
        ("带锚点", "/static/business.htm#top", "/", "/static/business.htm"),
        ("外链排除", "https://example.com/x", "/", None),
        ("协议相对外链排除", "//cdn.example.com/a.js", "/", None),
        ("mailto 排除", "mailto:a@b.com", "/", None),
        ("javascript 排除", "javascript:void(0)", "/", None),
        ("纯锚点排除", "#top", "/", None),
        ("JSP 表达式排除", "<%=foo%>/x", "/", None),
        ("WEB-INF 排除", "/WEB-INF/web.xml", "/", None),
        ("静态资源排除", "/static/site.css", "/", None),
        ("通配符排除", "/bank/*", "/", None),
        ("上级目录归一", "../login.jsp", "/bank", "/login.jsp"),
    ]
    ok = 0
    for name, raw, base, want in cases:
        got = normalize(raw, base)
        good = got == want
        ok += good
        print("  %s %-24s %r -> %r" % ("PASS" if good else "FAIL", name, raw, got))
    print("[route_extractor self-test] %d/%d PASS" % (ok, len(cases)))
    return 0 if ok == len(cases) else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--root", default=DEFAULT_ROOT)
    ap.add_argument("--reached", default=None,
                    help="实测到达路由文件（.json 数组 / 每行一条）；不给则 coverage=null")
    ap.add_argument("--strict", action="store_true",
                    help="覆盖率主口径改用 verified 分母（剔除 reference-only）")
    ap.add_argument("--out", default=os.path.join(HERE, "altoro_routes.json"))
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    report = extract(a.root)
    if a.reached:
        apply_reached(report, a.reached, a.strict)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print("[route_extractor] %s" % a.out)
    print("  routes(分母 all)=%d  verified=%d  wildcard=%d  dynamic_skipped=%d" % (
        report["counts"]["routes"], report["denominators"]["verified"],
        report["counts"]["wildcard_patterns"], report["counts"]["dynamic_skipped"]))
    print("  by_path_class=%s" % json.dumps(report["counts"]["by_path_class"],
                                           ensure_ascii=False))
    if report["coverage"]:
        c = report["coverage"]
        print("  coverage(%s)=%d/%d = %s ；verified=%s" % (
            c["primary_scope"], c["covered"], c["denominator"],
            c["coverage_ratio"],
            c["by_denominator"]["verified"]["coverage_ratio"]))
    else:
        print("  coverage=null（未提供 --reached，只报分母）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
