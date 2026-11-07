#!/usr/bin/env python3
"""_tools/test_p2_repair_loop.py —— P2 端到端验收（自动启停 lab 与补丁代理）

跑什么
------
1. 静态独立性自检 8/8
2. 四种补丁策略实跑：semantic / naive / literal / blockall
3. 断言指标形态：
     semantic  → patch_accuracy=1、regression_rate=0、无 unknown
     naive     → patch_accuracy < semantic（过拟合到训练见过的字面形态）
     literal   → train 侧全被挡但 held_out 漏（「用原 payload 验补丁」的假象）
     blockall  → regression_rate=1（证明回归指标不是摆设）
4. 零退化：11 条 GT 端到端 11/11 confirmed；verify.py / asserts.py /
   llm_gateway.py / task_liveness.py 四个判分层文件 SHA256 前后不变

用法：python _tools/test_p2_repair_loop.py
"""
import datetime
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VULN = ROOT
EVIDENCE = os.path.join(VULN, "evidence")
LAB_BASE = "http://127.0.0.1:8899"
PROXY_BASE = "http://127.0.0.1:8900"
WATCHED = ("verify.py", "asserts.py", "llm_gateway.py", "task_liveness.py")
STRATEGIES = ("semantic", "naive", "literal", "blockall")


def _get(url, timeout=2):
    req = urllib.request.Request(url)
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
            req, timeout=timeout) as r:
        return r.status, r.read()


def _wait(url, proc, name, seconds=20):
    t0 = time.time()
    while time.time() - t0 < seconds:
        if proc.poll() is not None:
            raise RuntimeError("%s 提前退出 (code=%s)" % (name, proc.returncode))
        try:
            st, _ = _get(url, 1)
            if st in (200, 403):
                return
        except Exception:
            pass
        time.sleep(0.3)
    raise RuntimeError("%s 在 %ds 内未就绪" % (name, seconds))


def _sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def _run(args, cwd=VULN, timeout=600):
    p = subprocess.run([sys.executable] + args, cwd=cwd, capture_output=True,
                       text=True, encoding="utf-8", errors="replace", timeout=timeout)
    return p.returncode, (p.stdout or ""), (p.stderr or "")


def main():
    os.makedirs(EVIDENCE, exist_ok=True)
    results, procs = [], []
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    try:
        # ---- 启动 lab
        lab_log = open(os.path.join(EVIDENCE, "p2-%s-lab.log" % stamp), "w",
                       encoding="utf-8")
        pl = subprocess.Popen([sys.executable, "lab/lab_app.py"], cwd=VULN,
                              stdout=lab_log, stderr=subprocess.STDOUT)
        procs.append(("lab", pl, lab_log))
        _wait(LAB_BASE + "/", pl, "lab")

        # ---- 启动补丁代理
        px_log = open(os.path.join(EVIDENCE, "p2-%s-proxy.log" % stamp), "w",
                      encoding="utf-8")
        pp = subprocess.Popen([sys.executable, "patch_proxy.py", "--port", "8900"],
                              cwd=VULN, stdout=px_log, stderr=subprocess.STDOUT)
        procs.append(("proxy", pp, px_log))
        _wait(PROXY_BASE + "/__health", pp, "patch_proxy")

        def rec(name, ok, detail=""):
            results.append({"name": name, "ok": bool(ok), "detail": detail})
            print("  %s %s%s" % ("PASS" if ok else "FAIL", name,
                                 ("  -> " + str(detail)) if detail else ""))

        # ---- 1) 静态自检
        rc, out, err = _run(["repair_loop.py", "--self-test"])
        rec("静态独立性自检 8/8", rc == 0 and "8/8 PASS" in out,
            out.strip().splitlines()[-1] if out.strip() else err.strip()[:200])

        # ---- 2) 四种策略实跑
        before = {f: _sha(os.path.join(VULN, f)) for f in WATCHED}
        reports = {}
        for s in STRATEGIES:
            outp = os.path.join(EVIDENCE, "p2-acceptance-%s-%s.json" % (s, stamp))
            rc, out, err = _run(["repair_loop.py", "--strategy", s, "--out", outp])
            try:
                rep = json.load(open(outp, encoding="utf-8"))
            except Exception as e:
                rec("策略 %s 产出证据包" % s, False, "%s / %s" % (e, err[:200]))
                continue
            reports[s] = rep
            m = rep["metrics"]
            rec("策略 %s 实跑完成且 overall=evaluated" % s,
                rc == 0 and m["overall"] == "evaluated",
                "rc=%s patch=%s regression=%s unknown=%d" % (
                    rc, m["patch_accuracy_fraction"], m["regression_fraction"],
                    m["held_out_unknown"]))

        def metric(s, k):
            return reports.get(s, {}).get("metrics", {}).get(k)

        # ---- 3) 指标形态断言
        rec("semantic：held_out 全被挡且 benign 零误伤",
            metric("semantic", "patch_accuracy") == 1.0 and
            metric("semantic", "regression_rate") == 0.0,
            "patch=%s regression=%s" % (metric("semantic", "patch_accuracy_fraction"),
                                        metric("semantic", "regression_fraction")))

        rec("naive：过拟合训练字面形态 → patch_accuracy 明显下降",
            metric("naive", "patch_accuracy") is not None and
            metric("naive", "patch_accuracy") < metric("semantic", "patch_accuracy"),
            "naive=%s vs semantic=%s" % (metric("naive", "patch_accuracy_fraction"),
                                         metric("semantic", "patch_accuracy_fraction")))

        lit_train = reports.get("literal", {}).get("families", {})
        train_blocked = sum(1 for f in lit_train.values()
                            for v in f["retest"]["train_side_evidence"].values()
                            if v["proxy_blocked_delta"] > 0)
        train_total = sum(len(f["retest"]["train_side_evidence"])
                          for f in lit_train.values())
        rec("literal：train 侧全被挡但 held_out 仍可打（原 payload 验补丁的假象）",
            train_total > 0 and train_blocked == train_total and
            metric("literal", "held_out_still_exploitable") > 0,
            "train blocked=%d/%d, held_out still=%s" % (
                train_blocked, train_total,
                metric("literal", "held_out_still_exploitable")))

        rec("blockall：benign 全被误伤 → regression_rate=1",
            metric("blockall", "regression_rate") == 1.0,
            "regression=%s patch=%s" % (metric("blockall", "regression_fraction"),
                                        metric("blockall", "patch_accuracy_fraction")))

        # ---- 4) 零退化：11 条 GT 端到端
        gt_out = os.path.join(EVIDENCE, "p2-acceptance-gt-%s" % stamp)
        rc, out, err = _run(["verify.py", "--ground-truth", "--repeats", "2",
                             "--label", "p2-acceptance", "--out", gt_out])
        bundles = []
        if os.path.isdir(gt_out):
            for fn in os.listdir(gt_out):
                if fn.endswith(".json"):
                    bundles.append(json.load(open(os.path.join(gt_out, fn),
                                                  encoding="utf-8")))
        confirmed = sum(1 for b in bundles if b.get("verdict") == "confirmed")
        rec("11 条 GT 端到端 11/11 confirmed（rc=0）",
            rc == 0 and confirmed == 11 and len(bundles) == 11,
            "rc=%s confirmed=%d bundles=%d" % (rc, confirmed, len(bundles)))

        after = {f: _sha(os.path.join(VULN, f)) for f in WATCHED}
        rec("判分层四文件本轮零改动（SHA256 前后一致）", before == after,
            "changed=%s" % [f for f in WATCHED if before[f] != after[f]])

        # ---- 汇总
        summary = {
            "schema": "p2-acceptance/1", "created_at": stamp,
            "checks": results,
            "metrics": {s: reports.get(s, {}).get("metrics", {}) for s in STRATEGIES},
            "passed": sum(1 for r in results if r["ok"]),
            "total": len(results),
        }
        sp = os.path.join(EVIDENCE, "p2-acceptance-summary-%s.json" % stamp)
        with open(sp, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        print("\n[acceptance] %d/%d PASS  → %s" % (
            summary["passed"], summary["total"], sp))
        return 0 if summary["passed"] == summary["total"] else 1
    finally:
        for name, p, log in reversed(procs):
            try:
                p.terminate()
                p.wait(timeout=8)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass
            try:
                log.close()
            except Exception:
                pass
        print("[acceptance] lab / patch_proxy 已停止")


if __name__ == "__main__":
    sys.exit(main())
