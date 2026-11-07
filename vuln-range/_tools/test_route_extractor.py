#!/usr/bin/env python3
"""_tools/test_route_extractor.py —— P3 验收：路由分母的可回溯性、口径与覆盖率接口

验证清单
--------
1. 归一化自检 14/14
2. 幂等：两次抽取（去掉 generated_at）逐字节一致
3. 排除项：无外链 / 锚点 / WEB-INF / 静态资源后缀 / 通配符
4. web.xml 对照：非通配 servlet-mapping 数 = extractor 报的数
5. 抽样回源核对：固定随机种子抽 25 条来源，回源文件指定行验证路径确实出现在那里
6. 双口径：all / verified / by_path_class 三者自洽
7. 覆盖率接口：--reached 的交集、额外路径、外部链接、query 归一化；--strict 口径切换
8. 不给 --reached 时 coverage 必须为 null（不许编数）
9. 零退化：判分层四文件 SHA256 不变

用法：python _tools/test_route_extractor.py
"""
import datetime
import hashlib
import json
import os
import random
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
VULN = os.path.dirname(HERE)
WORKSPACE = os.path.dirname(VULN)
EVIDENCE = os.path.join(VULN, "evidence")
WATCHED = ("verify.py", "asserts.py", "llm_gateway.py", "task_liveness.py",
           "repair_loop.py", "patch_proxy.py")


def _run(args, timeout=180):
    p = subprocess.run([sys.executable] + args, cwd=VULN, capture_output=True,
                       text=True, encoding="utf-8", errors="replace", timeout=timeout)
    return p.returncode, (p.stdout or ""), (p.stderr or "")


def _sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def main():
    os.makedirs(EVIDENCE, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    checks = []

    def rec(name, ok, detail=""):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})
        print("  %s %s%s" % ("PASS" if ok else "FAIL", name,
                             ("  -> " + str(detail)) if detail else ""))

    before = {f: _sha(os.path.join(VULN, f)) for f in WATCHED}

    # 1
    rc, out, err = _run(["route_extractor.py", "--self-test"])
    rec("归一化自检 14/14", rc == 0 and "14/14 PASS" in out,
        out.strip().splitlines()[-1] if out.strip() else err[:150])

    # 2 + 正式产物
    prod = os.path.join(VULN, "altoro_routes.json")
    tmp = os.path.join(EVIDENCE, "p3-routes-%s.json" % stamp)
    rc1, o1, e1 = _run(["route_extractor.py", "--out", prod])
    rc2, o2, e2 = _run(["route_extractor.py", "--out", tmp])
    a = json.load(open(prod, encoding="utf-8"))
    b = json.load(open(tmp, encoding="utf-8"))
    for d in (a, b):
        d.pop("generated_at", None)
    rec("两次抽取幂等（去时间戳后逐字节一致）",
        rc1 == 0 and rc2 == 0 and a == b,
        "routes=%d" % a["counts"]["routes"])

    # 3
    bad = []
    for r in a["routes"]:
        p = r["path"]
        low = p.lower()
        if (any(low.startswith(x) for x in ("http://", "https://", "//", "mailto:",
                                            "javascript:", "data:")) or
                "#" in p or "*" in p or "WEB-INF" in p.upper() or
                os.path.splitext(p)[1].lower() in
                (".css", ".js", ".jpg", ".png", ".gif", ".woff", ".svg")):
            bad.append(p)
    rec("分母不含外链/锚点/WEB-INF/静态资源/通配符", not bad, "bad=%s" % bad[:5])

    # 4
    wx = os.path.join(WORKSPACE, a["root"], "WebContent", "WEB-INF", "web.xml")
    txt = open(wx, encoding="utf-8", errors="replace").read()
    mapping_blocks = re.findall(r"<servlet-mapping>(.*?)</servlet-mapping>", txt, re.S)
    concrete = [p.strip() for blk in mapping_blocks
                for p in re.findall(r"<url-pattern>(.*?)</url-pattern>", blk, re.S)
                if "*" not in p]
    rec("web.xml 非通配 servlet-mapping 数与抽取一致",
        len(concrete) == a["counts"]["servlet_mappings"],
        "grep=%d extractor=%d" % (len(concrete), a["counts"]["servlet_mappings"]))

    # 5 抽样回源核对
    rng = random.Random(20261107)
    srcs = [(r["path"], s) for r in a["routes"] for s in r["sources"]
            if s["line"] is not None and s["kind"] != "static-file"]
    sample = rng.sample(srcs, min(25, len(srcs)))
    miss = []
    for path, s in sample:
        fp = os.path.join(WORKSPACE, a["root"], s["source_file"])
        if not os.path.isfile(fp):
            miss.append("%s: 文件不存在 %s" % (path, s["source_file"]))
            continue
        lines = open(fp, encoding="utf-8", errors="replace").read().splitlines()
        if s["line"] > len(lines):
            miss.append("%s: 行号越界 %s:%s" % (path, s["source_file"], s["line"]))
            continue
        # 相对引用在源码里只写了末段，归一化后才是绝对路径 —— 核对末段即可
        leaf = path.rstrip("/").rsplit("/", 1)[-1]
        if leaf and leaf not in lines[s["line"] - 1]:
            miss.append("%s: %s:%s 未出现 %r" % (
                path, s["source_file"], s["line"], leaf))
    rec("抽样 25 条来源回源文件逐行核对", not miss,
        "sampled=%d miss=%s" % (len(sample), miss[:3]))

    # 6
    bc = a["counts"]["by_path_class"]
    verified = a["denominators"]["verified"]
    rec("双口径自洽（all = 三类之和，verified = 非 reference-only）",
        a["denominators"]["all"] == sum(bc.values()) ==
        a["coverage_denominator"] == len(a["routes"]) and
        verified == sum(v for k, v in bc.items() if k != "reference-only") and
        verified < a["denominators"]["all"],
        "all=%d verified=%d by_class=%s" % (a["denominators"]["all"], verified, bc))

    # 7 覆盖率接口
    real = [r["path"] for r in a["routes"] if r["path_class"] == "servlet-mapped"][:3]
    reached_lines = [
        "# P3 接口验收：这是构造样本，不是扫描日志",
        real[0], real[1] + "?acctId=123", real[2],
        "/definitely-not-a-route-9f3a",
        "https://example.com/external",
    ]
    reached_file = os.path.join(EVIDENCE, "p3-reached-demo-%s.txt" % stamp)
    with open(reached_file, "w", encoding="utf-8") as f:
        f.write("\n".join(reached_lines) + "\n")
    cov_out = os.path.join(EVIDENCE, "p3-coverage-%s.json" % stamp)
    rc, o, e = _run(["route_extractor.py", "--reached", reached_file,
                     "--out", cov_out])
    c = json.load(open(cov_out, encoding="utf-8"))["coverage"]
    rec("--reached：交集 3 条、query 归一化生效",
        rc == 0 and c["covered"] == 3 and
        all(any(p.startswith(x) for x in real) for p in c["covered_paths"]),
        "covered=%s" % c["covered_paths"])
    rec("--reached：额外路径与外部链接被如实记录",
        "/definitely-not-a-route-9f3a" in c["reached_not_in_denominator"] and
        any("example.com" in x for x in c["unresolved_reached_entries"]),
        "extra=%s unresolved=%s" % (c["reached_not_in_denominator"][:2],
                                    c["unresolved_reached_entries"][:2]))
    strict_out = os.path.join(EVIDENCE, "p3-coverage-strict-%s.json" % stamp)
    _run(["route_extractor.py", "--reached", reached_file, "--strict",
          "--out", strict_out])
    cs = json.load(open(strict_out, encoding="utf-8"))["coverage"]
    rec("--strict：主口径切到 verified 且分母变小",
        cs["primary_scope"] == "verified" and
        cs["denominator"] == a["denominators"]["verified"] and
        cs["by_denominator"]["all"]["denominator"] == a["denominators"]["all"],
        "strict=%s all=%s" % (cs["denominator"],
                              cs["by_denominator"]["all"]["denominator"]))

    # 8
    rec("不给 --reached 时 coverage=null（不编数）",
        json.load(open(prod, encoding="utf-8"))["coverage"] is None and
        "未给" in json.load(open(prod, encoding="utf-8"))["coverage_note"], "")

    # 9
    after = {f: _sha(os.path.join(VULN, f)) for f in WATCHED}
    rec("判分层与 P2 模块本轮零改动（SHA256）", before == after,
        "changed=%s" % [f for f in WATCHED if before[f] != after[f]])

    summary = {"schema": "p3-acceptance/1", "created_at": stamp,
               "product": prod, "checks": checks,
               "denominators": a["denominators"],
               "by_path_class": bc,
               "passed": sum(1 for x in checks if x["ok"]), "total": len(checks)}
    sp = os.path.join(EVIDENCE, "p3-acceptance-summary-%s.json" % stamp)
    with open(sp, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print("\n[acceptance] %d/%d PASS  → %s" % (
        summary["passed"], summary["total"], sp))
    print("[acceptance] 正式产物：%s" % prod)
    return 0 if summary["passed"] == summary["total"] else 1


if __name__ == "__main__":
    sys.exit(main())
