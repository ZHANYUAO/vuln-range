#!/usr/bin/env python3
"""repair_loop.py —— P2：lab 上的 held-out 变体修复闭环（驱动 + 指标 + 证据包）

实验设计（为什么不写成 verify.py --auto-repair）
------------------------------------------------
一旦「补丁生成」和「判分」共用同一份状态，就会出现自己给自己发合格证：
拿生成补丁时见过的那几条 payload 去验补丁，只能证明「这些串被拉黑了」。
本模块把三件事物理隔开：

  generate_patch(train)  只看 train 变体 → 产出规则
  patch_proxy.py         只看规则        → 在 lab 前面拦请求
  verify.verify_case()   只看 HTTP 响应  → 三值判定，不知道补丁存在

评分只用 **held_out**（补丁生成时不可见）+ **benign 对照**（必须仍 200）。
train 的复测结果只作为「过拟合程度」的旁证，绝不进 patch_accuracy。

两个新指标
----------
  patch_accuracy  = held_out 中「不再成立」/ 可判定的 held_out
  regression_rate = benign 中「被误伤」/ 基线有效的 benign

两者必须一起看：blockall 能把前者刷到 1.0，同时把后者也刷到 1.0。
任何 unknown / 基线不成立都不许折算成「补丁成功」（三值、unknown 优先）。

用法
----
  python repair_loop.py --self-test                 # 不依赖服务的独立性/派生自检
  python repair_loop.py --strategy semantic --out evidence/p2-semantic.json
  python repair_loop.py --strategy naive     # 反例：只学训练见过的字面形态
  python repair_loop.py --strategy literal   # 反例：直接拉黑训练 payload
  python repair_loop.py --strategy blockall  # 反例：全拦，验证回归指标有效

前置：lab(8899) 与 patch_proxy(8900) 都要在跑；由 _tools/test_p2_repair_loop.py
统一启停。需要 PostgreSQL 吗？不需要 —— 本模块完全不碰 ARTEX 数据库。
"""
import argparse
import copy
import datetime
import hashlib
import inspect
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import asserts as _asserts          # noqa: E402
import verify as _verify            # noqa: E402

FAMILIES_FILE = os.path.join(HERE, "vhv", "web_variant_families.json")
PROXY_BASE = os.environ.get("PATCH_BASE", "http://127.0.0.1:8900")
PROFILE_SRC = os.path.join(HERE, "profiles", "lab.json")
EVIDENCE_DIR = os.path.join(HERE, "evidence")

# 先验字符类知识：与具体变体集无关，是 POSIX/Windows shell、HTML、路径语义的常识。
# 它**不是**从 held-out 抄来的；--self-test 会用哨兵扰动和文本泄漏检查证明这一点。
FEATURES = [
    ("shell_meta", r"[;&|`$<>()\n\r]", r"[;&|`$<>()]"),
    ("html_tag", r"<\s*[A-Za-z/!][^>]*>", r"<"),
    ("path_dotdot", r"\.\.[/\\]", r"\.\."),
]
STRATEGIES = ("semantic", "naive", "literal", "blockall")


# ------------------------------------------------------------------ 基础工具
def load_families(path=FAMILIES_FILE):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def user_values(case):
    """case 里所有用户可控值 —— 与 asserts.payload_text() 同一口径。"""
    r = case.get("request") or {}
    out = {}
    for src in (r.get("params") or {}, r.get("json") or {}):
        out.update({str(k): str(v) for k, v in src.items()})
    return out


def _all_cases(fam, group):
    return fam.get(group) or []


def _naive_fragment(value, feat, anchor_rx):
    m = re.search(anchor_rx, value)
    if not m:
        return None
    s = m.start()
    if feat == "shell_meta":
        chars = "&|;`$<>()"
        j = s
        while j < len(value) and value[j] in chars:
            j += 1
        return value[s:j] or value[s]
    if feat == "html_tag":
        mm = re.match(r"<\s*[A-Za-z/!][A-Za-z0-9]*", value[s:])
        return mm.group(0) if mm else value[s:s + 1]
    if feat == "path_dotdot":
        return value[s:s + 3]
    return None


def generate_patch(train_cases, strategy="semantic"):
    """**只**接收 train 变体，产出补丁规则。

    独立性铁律：本函数不得读取族定义全局量、不得引用任何分组键名。
    --self-test 会检查源码与规则文本。四种策略共享这一约束。
    """
    if strategy not in STRATEGIES:
        raise ValueError("unknown strategy: %s" % strategy)
    if strategy == "blockall":
        return {"strategy": strategy,
                "rules": [{"id": "blockall", "pattern": r".*", "paths": [],
                           "params": [], "origin": "control: block everything"}],
                "train_ids": [c["id"] for c in train_cases]}

    rules, seen = [], set()
    for case in train_cases:
        req = case.get("request") or {}
        path = req.get("path", "")
        for name, value in user_values(case).items():
            for feat, klass_rx, anchor_rx in FEATURES:
                if not re.search(klass_rx, value):
                    continue
                if strategy == "semantic":
                    pattern, label = klass_rx, "class:%s" % feat
                elif strategy == "naive":
                    frag = _naive_fragment(value, feat, anchor_rx)
                    if not frag:
                        continue
                    pattern, label = re.escape(frag), "seen:%s" % frag
                else:  # literal
                    m = re.search(anchor_rx, value)
                    if not m:
                        continue
                    frag = value[m.start():].rstrip()[:60]
                    pattern, label = re.escape(frag), "payload-fragment"
                key = (strategy, pattern, path, name)
                if key in seen:
                    continue
                seen.add(key)
                rules.append({
                    "id": "%s-%02d" % (strategy, len(rules) + 1),
                    "pattern": pattern,
                    "paths": [path],
                    "params": [name],
                    "origin": "%s via %s (%s)" % (label, case.get("id"), feat),
                })
    return {"strategy": strategy, "rules": rules,
            "train_ids": [c["id"] for c in train_cases]}


# ------------------------------------------------------------------ 静态自检
def self_test():
    """不依赖 lab / proxy 的独立性、派生来源、语料重叠检查。"""
    fam_db = load_families()
    checks = []

    def chk(name, ok, detail=""):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    fams = fam_db["families"]
    chk("族数=3 且均声明 layer=web-http",
        len(fams) == 3 and fam_db.get("layer") == "web-http",
        "families=%s" % list(fams))

    # 1) 断言不得硬编码；不得声明跨层 vhv_family（P1 的边界）
    hardcoded, cross_layer = [], []
    for fname, fam in fams.items():
        for grp in ("train", "held_out", "benign"):
            for c in _all_cases(fam, grp):
                if "assert" in c:
                    hardcoded.append(c["id"])
                if c.get("vhv_family"):
                    cross_layer.append(c["id"])
    chk("所有 case 都不含手写 assert（必须由 derive 派生）",
        not hardcoded, "violations=%s" % hardcoded)
    chk("无跨层 vhv_family 自动映射", not cross_layer,
        "violations=%s" % cross_layer)

    # 2) 派生来源：必须是四级证据源之一，且 assert 非 None
    bad_source = []
    for fname, fam in fams.items():
        for grp in ("train", "held_out"):
            for c in _all_cases(fam, grp):
                d = _asserts.derive(c)
                if d.get("assert") is None or d.get("source") not in (
                        "payload", "artifact", "structure", "oast"):
                    bad_source.append("%s:%s:%s" % (c["id"], d.get("source"),
                                                   (d.get("note") or "")[:60]))
    chk("train/held_out 断言全部成功派生且非 unknown/manual",
        not bad_source, "bad=%s" % bad_source)

    # 3) 三组语料互不重叠
    overlaps = []
    for fname, fam in fams.items():
        sets = {}
        for grp in ("train", "held_out", "benign"):
            sets[grp] = {"|".join(sorted(user_values(c).values()))
                         for c in _all_cases(fam, grp)}
        for a, b in (("train", "held_out"), ("train", "benign"),
                     ("held_out", "benign")):
            if sets[a] & sets[b]:
                overlaps.append("%s:%s∩%s" % (fname, a, b))
    chk("train / held_out / benign 三组 payload 无交集",
        not overlaps, "overlaps=%s" % overlaps)

    # 4) 生成器源码不得引用分组名或全局族数据
    src = inspect.getsource(generate_patch)
    forbidden = [w for w in ("held_out", "benign", "FAMILIES_FILE", "load_families",
                             "fams", "fam_db") if w in src]
    chk("generate_patch 源码不引用 held_out/benign/全局族数据",
        not forbidden, "forbidden=%s" % forbidden)

    # 5) 规则文本不得泄漏 held_out / benign 的完整 payload
    leaks = []
    for strategy in STRATEGIES:
        for fname, fam in fams.items():
            patch = generate_patch(_all_cases(fam, "train"), strategy)
            text = json.dumps(patch, ensure_ascii=False)
            for grp in ("held_out", "benign"):
                for c in _all_cases(fam, grp):
                    for v in user_values(c).values():
                        if len(v) >= 8 and v in text:
                            leaks.append("%s/%s/%s" % (strategy, fname, c["id"]))
    chk("四种策略的规则文本均不含 held_out/benign 完整 payload",
        not leaks, "leaks=%s" % sorted(set(leaks)))

    # 6) 哨兵扰动：把 train 的可疑形态抹掉后，规则必须跟着变（证明规则确实派生自
    #    train 而不是写死）；把 held_out 整组换掉，规则必须逐字节不变（独立性）。
    perturb_ok, perturb_bad = True, []
    for strategy in STRATEGIES:
        for fname, fam in fams.items():
            train = _all_cases(fam, "train")
            base = json.dumps(generate_patch(train, strategy), sort_keys=True)
            poisoned = copy.deepcopy(train)
            sentinel = "SENTINEL-%s-%s" % (strategy, fname)
            for c in poisoned:
                for k in (c["request"].get("params") or {}):
                    c["request"]["params"][k] = re.sub(
                        r"[;&|`$<>()]|<\s*[A-Za-z/!]|\.\.", sentinel,
                        c["request"]["params"][k])
            changed = json.dumps(generate_patch(poisoned, strategy), sort_keys=True)
            if strategy in ("naive", "literal") and changed == base:
                perturb_ok = False
                perturb_bad.append("%s/%s:train 抹除特征后规则未变" % (strategy, fname))
            # 生成器的输入只有 train：把 held_out 全换掉，规则必须不变
            fam2 = copy.deepcopy(fam)
            for c in _all_cases(fam2, "held_out"):
                for k in (c["request"].get("params") or {}):
                    c["request"]["params"][k] = "POISON-HELD-OUT-9f3a"
            same = json.dumps(generate_patch(_all_cases(fam2, "train"), strategy),
                              sort_keys=True) == base
            if not same:
                perturb_ok = False
                perturb_bad.append("%s/%s:held_out 污染改变了规则" % (strategy, fname))
    chk("哨兵扰动：train 特征敏感、held_out 完全不敏感", perturb_ok,
        "detail=%s" % perturb_bad)

    passed = sum(1 for c in checks if c["ok"])
    print("[self-test] %d/%d PASS" % (passed, len(checks)))
    for c in checks:
        print("  %s %s%s" % ("PASS" if c["ok"] else "FAIL", c["name"],
                            ("  -> " + c["detail"]) if c["detail"] else ""))
    return 0 if passed == len(checks) else 1


# ------------------------------------------------------------------ 代理交互
def _proxy_json(path, payload=None, timeout=10):
    url = PROXY_BASE.rstrip("/") + path
    data = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
            req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _lab_alive():
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
                "http://127.0.0.1:8899/", timeout=5) as r:
            return r.status == 200
    except Exception:
        return False


def _patched_profile():
    """临时 profile：只把 base 指向代理，其余（artifacts / reset / token）完全沿用 lab。

    不写进 profiles/ 目录 —— 它是实验运行期的派生物，不该进版本库。
    """
    with open(PROFILE_SRC, encoding="utf-8") as f:
        prof = json.load(f)
    prof["name"] = "lab_patched_proxy"
    prof["base"] = PROXY_BASE.rstrip("/")
    prof["desc"] = "P2 运行期派生：经 patch_proxy 访问同一个 lab，判据与 lab 完全一致"
    fd, path = tempfile.mkstemp(prefix="vr-p2-profile-", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(prof, f, ensure_ascii=False, indent=2)
    return path


def _headers_lower(resp):
    return {str(k).lower(): str(v) for k, v in (resp.get("headers") or {}).items()}


# ------------------------------------------------------------------ 主闭环
def run_loop(strategy, out_path=None, only_family=None):
    if strategy not in STRATEGIES:
        raise ValueError("unknown strategy: %s" % strategy)
    if not _lab_alive():
        print("[repair_loop] lab(8899) 不可达 —— 请先启动 lab_app.py", file=sys.stderr)
        return 3
    try:
        _proxy_json("/__health")
    except Exception as e:
        print("[repair_loop] patch_proxy(8900) 不可达：%s" % e, file=sys.stderr)
        return 3

    fam_db = load_families()
    fams = {k: v for k, v in fam_db["families"].items()
            if not only_family or k == only_family}
    if not fams:
        print("[repair_loop] 没有匹配的族：%s" % only_family, file=sys.stderr)
        return 3

    profile_path = _patched_profile()
    report = {
        "schema": "p2-repair-loop/1",
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "strategy": strategy,
        "families_file": os.path.relpath(FAMILIES_FILE, HERE).replace("\\", "/"),
        "lab": "http://127.0.0.1:8899",
        "proxy": PROXY_BASE.rstrip("/"),
        "independence": {
            "patch_input": "train only (generate_patch 签名与源码见 --self-test)",
            "scoring_input": "held_out + benign only; train 复测不进 patch_accuracy",
            "judge": "verify.verify_case 三值判定，对补丁存在与否不可见",
            "unknown_policy": "unknown / baseline 失败一律不折算为补丁成功",
        },
        "families": {},
        "metrics": {},
        "unknowns": [],
    }

    try:
        # ---- 阶段 1：无补丁基线（直连 lab）
        _proxy_json("/__clear", {})
        _verify.configure("lab")
        baselines = {}
        for fname, fam in fams.items():
            fb = {"attacks": {}, "benign": {}}
            for grp in ("train", "held_out"):
                for c in _all_cases(fam, grp):
                    b = _verify.verify_case(c, repeats=1, derive=True, mode="attack",
                                            run_label="p2-baseline/%s" % strategy)
                    fb["attacks"][c["id"]] = {
                        "verdict": b["verdict"],
                        "assertion": b.get("assertion_used"),
                        "derivation": b.get("derivation"),
                        "reason": b.get("verdict_reason"),
                    }
            for c in _all_cases(fam, "benign"):
                r = _verify.do_request(_verify.make_opener(), c["request"])
                fb["benign"][c["id"]] = {
                    "status": r["status"], "error": r["error"],
                    "blocked": "x-patch-blocked" in _headers_lower(r),
                }
            baselines[fname] = fb

        # ---- 阶段 2：只从 train 生成补丁并装载
        patches = {}
        for fname, fam in fams.items():
            patches[fname] = generate_patch(_all_cases(fam, "train"), strategy)
        all_rules, offset = [], 0
        for fname, p in patches.items():
            for r in p["rules"]:
                rr = dict(r)
                rr["id"] = "%s:%s" % (fname, r["id"])
                rr["_offset"] = offset
                all_rules.append(rr)
            offset += 1
        for r in all_rules:
            r.pop("_offset", None)
        _proxy_json("/__patch", {"strategy": strategy, "rules": all_rules})

        # ---- 阶段 3：经代理复测（held_out 评分 / benign 回归 / train 仅旁证）
        _verify.configure(profile_path)
        retest = {}
        for fname, fam in fams.items():
            fb = {"held_out": {}, "benign": {}, "train_side_evidence": {}}
            for c in _all_cases(fam, "held_out"):
                before = _proxy_json("/__stats")["blocked_total"]
                b = _verify.verify_case(c, repeats=1, derive=True, mode="attack",
                                        run_label="p2-retest/%s" % strategy)
                after = _proxy_json("/__stats")["blocked_total"]
                delta = after - before
                v = b["verdict"]
                if v == "confirmed":
                    outcome = "still_exploitable"
                elif delta > 0 or v == "rejected":
                    outcome = "patched"
                else:
                    outcome = "unknown"
                fb["held_out"][c["id"]] = {
                    "verdict": v, "proxy_blocked_delta": delta, "outcome": outcome,
                    "reason": b.get("verdict_reason"),
                    "evidence_id": b.get("evidence_id"),
                }
            for c in _all_cases(fam, "benign"):
                r = _verify.do_request(_verify.make_opener(), c["request"])
                hdr = _headers_lower(r)
                broken = (r["status"] != 200 or r["error"] is not None
                          or "x-patch-blocked" in hdr)
                fb["benign"][c["id"]] = {
                    "status": r["status"], "error": r["error"],
                    "blocked": "x-patch-blocked" in hdr,
                    "broken": broken,
                }
            for c in _all_cases(fam, "train"):
                before = _proxy_json("/__stats")["blocked_total"]
                b = _verify.verify_case(c, repeats=1, derive=True, mode="attack",
                                        run_label="p2-train-side/%s" % strategy)
                after = _proxy_json("/__stats")["blocked_total"]
                fb["train_side_evidence"][c["id"]] = {
                    "verdict": b["verdict"], "proxy_blocked_delta": after - before}
            retest[fname] = fb
    finally:
        try:
            _proxy_json("/__clear", {})
        except Exception:
            pass
        try:
            os.unlink(profile_path)
        except OSError:
            pass

    # ---- 阶段 4：指标（unknown 优先，绝不折算成成功）
    valid_h, patched_h, still_h, unknown_h = 0, 0, 0, 0
    valid_b, broken_b = 0, 0
    for fname, fam in fams.items():
        base, ret = baselines[fname], retest[fname]
        fam_report = {
            "endpoint": fam["endpoint"],
            "patch_rules": [r for r in all_rules
                            if not r["paths"] or fam["endpoint"] in r["paths"]],
            "patch_train_ids": patches[fname]["train_ids"],
            "baseline": base, "retest": ret,
            "held_out_valid": 0, "held_out_patched": 0,
            "held_out_still_exploitable": 0, "held_out_unknown": 0,
            "benign_valid": 0, "benign_broken": 0,
        }
        for c in _all_cases(fam, "held_out"):
            cid = c["id"]
            if base["attacks"].get(cid, {}).get("verdict") != "confirmed":
                unknown_h += 1
                fam_report["held_out_unknown"] += 1
                report["unknowns"].append("%s: 基线未复现，不进评分" % cid)
                continue
            o = ret["held_out"][cid]["outcome"]
            if o == "unknown":
                unknown_h += 1
                fam_report["held_out_unknown"] += 1
                report["unknowns"].append("%s: 复测无法判定（%s）" % (
                    cid, ret["held_out"][cid]["verdict"]))
                continue
            valid_h += 1
            fam_report["held_out_valid"] += 1
            if o == "patched":
                patched_h += 1
                fam_report["held_out_patched"] += 1
            else:
                still_h += 1
                fam_report["held_out_still_exploitable"] += 1
        for c in _all_cases(fam, "benign"):
            cid = c["id"]
            b0 = base["benign"][cid]
            if b0["status"] != 200 or b0["error"]:
                report["unknowns"].append("%s: 基线 benign 非 200，不进评分" % cid)
                continue
            valid_b += 1
            fam_report["benign_valid"] += 1
            if ret["benign"][cid]["broken"]:
                broken_b += 1
                fam_report["benign_broken"] += 1
        report["families"][fname] = fam_report

    report["metrics"] = {
        "patch_accuracy": (patched_h / valid_h) if valid_h else None,
        "patch_accuracy_fraction": "%d/%d" % (patched_h, valid_h),
        "regression_rate": (broken_b / valid_b) if valid_b else None,
        "regression_fraction": "%d/%d" % (broken_b, valid_b),
        "held_out_still_exploitable": still_h,
        "held_out_unknown": unknown_h,
        "train_side_note": "train 复测结果只作过拟合旁证，不进 patch_accuracy",
        "overall": "unknown" if unknown_h or valid_h == 0 or valid_b == 0 else "evaluated",
    }
    if report["metrics"]["overall"] == "unknown":
        report["unknowns"].append("存在 unknown 或有效样本为 0 → 本轮指标不得当结论引用")

    out_path = out_path or os.path.join(
        EVIDENCE_DIR, "p2-repair-%s-%s.json" % (
            strategy, datetime.datetime.now().strftime("%Y%m%d-%H%M%S")))
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    report["_out"] = out_path

    print("[repair_loop] strategy=%s  %s" % (strategy, out_path))
    print("  %-18s %-22s %-22s %s" % ("family", "held_out patched", "benign broken", "unknown"))
    for fname, fr in report["families"].items():
        print("  %-18s %-22s %-22s %s" % (
            fname,
            "%d/%d" % (fr["held_out_patched"], fr["held_out_valid"]),
            "%d/%d" % (fr["benign_broken"], fr["benign_valid"]),
            fr["held_out_unknown"]))
    m = report["metrics"]
    print("  patch_accuracy=%s  regression_rate=%s  overall=%s" % (
        m["patch_accuracy_fraction"], m["regression_fraction"], m["overall"]))
    return 2 if m["overall"] == "unknown" else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true", help="不依赖服务的静态独立性自检")
    ap.add_argument("--strategy", default="semantic", choices=STRATEGIES)
    ap.add_argument("--family", default=None, help="只跑一个族")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    return run_loop(a.strategy, a.out, a.family)


if __name__ == "__main__":
    sys.exit(main())
