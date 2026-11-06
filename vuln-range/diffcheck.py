#!/usr/bin/env python
"""diffcheck.py —— patched 反事实差分：同一 PoC 打「有洞版」与「修复版」。

要解决的问题
------------
闸门现在的对照是「benign 请求」，它能排除「页面回显」「通用行为」，
但排除不了「这个版本本来就这样」。学术口径（arXiv 2608.09567 的
available → runnable → signal → confirmed 四级阶梯）要求：
**判据必须在 patched build 上失效**，否则只能叫 signal。

本脚本做的事
------------
1. 起两个 lab 实例：
     vuln   (127.0.0.1:8899, LAB_MODE=vuln)   —— 历史行为，一字不改
     secure (127.0.0.1:8895, LAB_MODE=secure) —— 每条漏洞按标准模式修复
   **两份 profile 的 artifacts 完全一致**，唯一差别是 base 与 control token 路径。
2. 用**同一份 ground_truth.json**（request / assert / control 全不改）分别打两版。
3. 逐条对照，输出严格判据结果。

判据（硬）
----------
- vuln 版：必须 confirmed（否则说明基线坏了，后面的对比无意义）
- secure 版：必须**不是** confirmed，且**不是 unknown**
    * rejected → 强证据：判据所依赖的可观测事实在修复后消失
    * blocked  → 中等证据：请求被鉴权层挡住（本 lab 里 HIDDEN-01 / EXPOSE-USERS-01
                 属此类，表现为 401）。差分本身仍成立（同一请求 vuln=200 有数据），
                 但要看 bundle 里的 status 才知道是不是真被修复挡的，不能只看 verdict。
- unknown 一律算**不合格**：它表示装置有问题，不是「修好了」。

用法
----
    python diffcheck.py                 # 起服务 → 跑两版 → 对照 → 关服务
    python diffcheck.py --keep          # 跑完不关 secure 实例（调试用）
    python diffcheck.py --gt lab/ground_truth.json
"""
import argparse
import json
import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

VULN_PORT = 8899
SECURE_PORT = 8895
SECURE_INTERNAL_PORT = 8894


def port_open(port, host="127.0.0.1", timeout=0.4):
    s = socket.socket()
    s.settimeout(timeout)
    try:
        s.connect((host, port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def wait_port(port, seconds=20):
    t0 = time.time()
    while time.time() - t0 < seconds:
        if port_open(port):
            return True
        time.sleep(0.25)
    return False


def start_lab(mode, port, internal_port, token_file, log_path):
    env = dict(os.environ)
    env.update({
        "LAB_MODE": mode,
        "LAB_PORT": str(port),
        "LAB_INTERNAL_PORT": str(internal_port),
        "LAB_TOKEN_FILE": token_file,
        "no_proxy": "*",
        "NO_PROXY": "*",
    })
    log = open(log_path, "w", encoding="utf-8")
    p = subprocess.Popen([sys.executable, os.path.join(HERE, "lab", "lab_app.py")],
                         cwd=HERE, env=env, stdout=log, stderr=subprocess.STDOUT)
    return p, log


def run_gt(label, profile, gt_path, repeats):
    """跑一遍 GT，返回 {case_id: (verdict, 主请求状态, 断言说明, evidence_path)}。

    注意（2026-11-02 实测）：bundle.observations[i]["status"] 是**该轮最后一个步骤**的响应，
    不是主请求的响应。DEFAULTCRED-01 修复版就是这个坑：主请求 401（登录被拒），
    但 post 步骤 GET /admin 是 403，于是 status 显示 403。
    想说明「修复后主请求变成了什么」，必须从 steps 里按 phase=attack 取。
    """
    import verify as V
    V.configure(profile)
    with open(gt_path, encoding="utf-8") as f:
        cases = json.load(f)["vulns"]

    out = {}
    for case in cases:
        b = V.verify_case(json.loads(json.dumps(case)), repeats=repeats,
                          expect_control=False, derive=True,
                          mode="attack", run_label=label)
        p = V.save_bundle(b, V.EVIDENCE_DIR)
        obs = [o for o in b["observations"] if o.get("phase") == "attack"]
        status, detail = None, ""
        if obs:
            steps = obs[0].get("steps") or []
            att = [s for s in steps if s.get("phase") == "attack"]
            status = att[0].get("status") if att else obs[0].get("status")
            detail = (obs[0].get("assert_detail") or "")[:60]
        out[b["case_id"]] = (b["verdict"], status, detail, p)
    return out


def probe_auth_variant(base):
    """用「普通用户会话」再打一次敏感端点，把 blocked 升级为强证据。

    为什么需要这一步（2026-11-02）
    -----------------------------
    HIDDEN-01 / EXPOSE-USERS-01 的修复版返回 401，闸门判 blocked。
    但 blocked 只说明「被挡住了」，不区分：
      (a) 修复加了鉴权 → 挡住
      (b) 这个端点本来就要登录 → 挡住
    带一个真实普通用户会话再打，如果返回 200 **但内容里没有密钥**，
    就能把 (a) 和 (b) 分开 —— 这是「修复真的改变了数据可见性」的直接证据。
    """
    import urllib.parse
    import urllib.request
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def req(path, data=None, cookie=None):
        h = {"Cookie": cookie} if cookie else {}
        body = urllib.parse.urlencode(data).encode() if data else None
        r = urllib.request.Request(base + path, data=body, headers=h)
        try:
            with op.open(r, timeout=5) as x:
                return x.status, x.read().decode("utf-8", "replace"), x.headers.get("Set-Cookie")
        except Exception as e:
            code = getattr(e, "code", 0)
            try:
                bd = e.read().decode("utf-8", "replace")
            except Exception:
                bd = ""
            hd = getattr(e, "headers", None)
            return code, bd, hd.get("Set-Cookie") if hd else None

    login_st, _, ck = req("/login", {"username": "bob", "password": "builder1"})
    sid = (ck or "").split(";")[0]
    out = {"base": base, "login_status": login_st, "has_session": bool(sid), "probes": []}
    if not sid:
        out["error"] = "无法取得普通用户会话，本步骤无法执行"
        return out
    for path, needle in [("/api/users", "AK-LIVE"),
                         ("/api/internal/export", "AK-LIVE")]:
        st, body, _ = req(path, cookie=sid)
        out["probes"].append({"path": path, "status": st, "leaked": needle in body,
                              "len": len(body)})
    return out


def classify(vuln_v, sec_v, sec_status):
    """返回 (是否通过差分, 证据强度, 说明)。"""
    if vuln_v != "confirmed":
        return False, "基线失效", "有洞版没判出来（%s），差分无从谈起" % vuln_v
    if sec_v == "confirmed":
        return False, "修复无效", "修复版仍判 confirmed —— 该「修复」没有改变可观测事实"
    if sec_v == "unknown":
        return False, "装置缺陷", "unknown 表示判不了，不等于修好了"
    if sec_v == "rejected":
        return True, "强", "判据依赖的事实已消失（响应 %s）" % sec_status
    if sec_v == "blocked":
        return True, "中", "被鉴权层挡下（响应 %s）；同一请求在有洞版是 200 且有数据" % sec_status
    return False, "未知", "未覆盖的 verdict: %s" % sec_v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gt", default=os.path.join("lab", "ground_truth.json"))
    ap.add_argument("--repeats", type=int, default=2)
    ap.add_argument("--keep", action="store_true", help="跑完不关闭 secure 实例")
    ap.add_argument("--label", default="diff-%s" % time.strftime("%m%d-%H%M"))
    args = ap.parse_args()

    procs = []
    logs = []
    try:
        # ---- 1) 有洞版：优先复用已在跑的 8899（用户环境常驻），没有再起
        if port_open(VULN_PORT):
            print("[diff] 复用已运行的 vuln 实例 :%d" % VULN_PORT)
        else:
            print("[diff] 启动 vuln 实例 :%d" % VULN_PORT)
            p, lg = start_lab("vuln", VULN_PORT, 8898, "lab/.control_token",
                              os.path.join(HERE, "lab", ".diff_vuln.log"))
            procs.append(p)
            logs.append(lg)
            if not wait_port(VULN_PORT):
                print("[!] vuln 实例未能就绪，见 lab/.diff_vuln.log")
                return 2

        # ---- 2) 修复版
        print("[diff] 启动 secure 实例 :%d（internal :%d）" % (SECURE_PORT, SECURE_INTERNAL_PORT))
        p, lg = start_lab("secure", SECURE_PORT, SECURE_INTERNAL_PORT,
                          "lab/.control_token_secure",
                          os.path.join(HERE, "lab", ".diff_secure.log"))
        procs.append(p)
        logs.append(lg)
        if not wait_port(SECURE_PORT):
            print("[!] secure 实例未能就绪，见 lab/.diff_secure.log")
            return 2

        # ---- 3) 同一份 GT，打两版
        print("[diff] 跑 vuln 版 ...")
        vuln = run_gt(args.label + "-vuln", "lab", args.gt, args.repeats)
        print("[diff] 跑 secure 版 ...")
        sec = run_gt(args.label + "-secure", "lab_secure", args.gt, args.repeats)

        print("[diff] 会话变体（带普通用户会话，验证敏感数据是否真的不可见）...")
        authv = probe_auth_variant("http://127.0.0.1:%d" % SECURE_PORT)

        # ---- 4) 对照
        print()
        print("=" * 104)
        print("patched 反事实差分（同一 GT / 同一 payload / 只换被测实现）")
        print("=" * 104)
        print("%-16s %-11s %-9s %-11s %-7s %-6s %s" %
              ("CASE", "有洞版", "主请求", "修复版", "响应码", "强度", "结论"))
        print("-" * 104)

        rows, passed = [], 0
        for cid in sorted(vuln, key=lambda x: x):
            vv, vst, _, _ = vuln[cid]
            sv, sst, sdetail, _ = sec.get(cid, ("MISSING", None, "", None))
            ok, strength, why = classify(vv, sv, sst)
            passed += 1 if ok else 0
            rows.append({"case": cid, "vuln": vv, "vuln_status": vst, "secure": sv,
                         "secure_status": sst, "secure_detail": sdetail,
                         "strength": strength, "ok": ok, "why": why})
            print("%-16s %-11s %-9s %-11s %-7s %-6s %s" %
                  (cid, vv, str(vst), sv, sst, strength, why))
            if sv == "rejected" and sdetail:
                print("%-16s %s" % ("", "└ 断言说明：" + sdetail))

        print("-" * 104)
        print("通过 %d / %d" % (passed, len(vuln)))

        weak = [r for r in rows if r["ok"] and r["strength"] == "中"]
        if weak:
            print()
            print("中等强度（blocked）%d 条 —— 用会话变体交叉验证：" % len(weak))
            print("  普通用户 bob 登录：%s，拿到会话：%s" %
                  (authv.get("login_status"), authv.get("has_session")))
            for pr in authv.get("probes") or []:
                verdict = "✅ 数据不可见" if (pr["status"] == 200 and not pr["leaked"]) else \
                          ("⛔ 仍泄漏" if pr["leaked"] else "⚠ 被拦（%s），无法区分是鉴权还是本来就要求登录" % pr["status"])
                print("  %-24s -> %s  %s" % (pr["path"], pr["status"], verdict))

        failed = [r for r in rows if not r["ok"]]
        if failed:
            print()
            print("未通过：")
            for r in failed:
                print("  %-16s 有洞=%-10s 修复=%-10s %s" % (r["case"], r["vuln"], r["secure"], r["why"]))

        out_path = os.path.join(HERE, "baseline", "out", "diffcheck_%s.json" % args.label)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"label": args.label, "gt": args.gt, "repeats": args.repeats,
                       "passed": passed, "total": len(vuln), "rows": rows,
                       "auth_variant": authv},
                      f, ensure_ascii=False, indent=2)
        print()
        print("报告 ->", out_path)
        return 0 if passed == len(vuln) else 1

    finally:
        if not args.keep:
            for p in procs:
                try:
                    p.terminate()
                except Exception:
                    pass
            for lg in logs:
                try:
                    lg.close()
                except Exception:
                    pass


if __name__ == "__main__":
    sys.exit(main())
