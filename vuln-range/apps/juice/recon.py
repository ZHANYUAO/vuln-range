#!/usr/bin/env python3
"""recon.py —— Juice Shop 上的运行时侦察 / 身份解析

为什么要这一步
--------------
靶场的 artifact（api_key、idor_owner_uid=3、canary）都是我手工埋的常量。
真实应用没有这些东西。`asserts.py` 已经改成「artifact 缺失 → unknown」，
但那样闸门在真实应用上会大面积不可判定。

真正的解法是**在运行时把 artifact 造出来**：
  1. 注册两个全新账号 A / B（邮箱里带唯一随机串 → 天然 canary）
  2. 用 A 的会话去要 B 的资源
  3. 判据 = 「B 的邮箱/bid 出现在 A 的响应里」
     —— 这个判据不需要任何预置常量，它由**身份解析**产出。

输出 artifacts.json，交给 profiles/juiceshop.json 使用。
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

BASE = os.environ.get("JUICE_BASE", "http://127.0.0.1:3001")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "artifacts.json")


def opener():
    # 必须直连：本机系统代理会把 localhost 也判 502
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def req(op, method, path, body=None, token=None, ctype="application/json"):
    url = BASE + path
    data = None
    headers = {}
    if body is not None:
        if ctype == "application/json":
            data = json.dumps(body).encode()
        else:
            data = urllib.parse.urlencode(body).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        if "Content-Type" not in headers:
            headers["Content-Type"] = ctype
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with op.open(r, timeout=15) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return resp.status, raw, dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), dict(e.headers)
    except Exception as e:
        return 0, "ERR %s" % e, {}


def register(op, email, password):
    body = {
        "email": email, "password": password, "passwordRepeat": password,
        "securityQuestion": {"id": 1, "question": "Your eldest siblings middle name?"},
        "securityAnswer": "canary",
    }
    st, raw, _ = req(op, "POST", "/api/Users", body)
    return st, raw


def login(op, email, password):
    st, raw, _ = req(op, "POST", "/rest/user/login", {"email": email, "password": password})
    try:
        d = json.loads(raw)
    except Exception:
        return st, None, raw
    auth = (d.get("authentication") or {})
    return st, auth, raw


def main():
    op = opener()
    ts = str(int(time.time()))[-6:]
    users = {}
    for who in ("a", "b"):
        email = "canary.%s.%s@lab.local" % (who, ts)
        pw = "Canary#%s" % ts
        st, raw = register(op, email, pw)
        print("[register %s] %s %s" % (who, st, raw[:120]))
        if st not in (200, 201):
            print("  !! 注册失败，后续无法进行")
            return 1
        st2, auth, raw2 = login(op, email, pw)
        if not auth or not auth.get("token"):
            print("[login %s] 失败 %s %s" % (who, st2, raw2[:200]))
            return 1
        users[who] = {"email": email, "password": pw, "token": auth["token"],
                      "bid": auth.get("bid"), "umail": auth.get("umail"),
                      "uid": (auth.get("id") or None)}
        print("[login %s] ok bid=%s uid=%s token=%s..." %
              (who, users[who]["bid"], users[who]["uid"], users[who]["token"][:18]))

    # ---- 侦察：把可用的「证据位」逐个实测一遍，别猜 ----
    probes = {}
    A = users["a"]["token"]
    B = users["b"]["token"]
    probes["basket_own"] = req(op, "GET", "/rest/basket/%s" % users["a"]["bid"], token=A)[:2]
    probes["basket_other"] = req(op, "GET", "/rest/basket/%s" % users["b"]["bid"], token=A)[:2]
    probes["users_api_noauth"] = req(op, "GET", "/api/Users")[:2]
    probes["users_api_as_user"] = req(op, "GET", "/api/Users", token=A)[:2]
    probes["ftp_root"] = req(op, "GET", "/ftp/")[:2]
    probes["metrics"] = req(op, "GET", "/metrics")[:2]
    probes["search_sqli"] = req(op, "GET", "/rest/products/search?q=" + urllib.parse.quote("apple'"))[:2]
    probes["whoami"] = req(op, "GET", "/rest/user/whoami", token=A)[:2]
    probes["challenges"] = req(op, "GET", "/api/Challenges", token=A)[:2]

    print("\n===== 探测结果（截断）=====")
    artifacts = {"users": users, "ts": ts,
                 "canary_email_a": users["a"]["email"],
                 "canary_email_b": users["b"]["email"],
                 "basket_a": users["a"]["bid"], "basket_b": users["b"]["bid"]}
    for k, (st, raw) in probes.items():
        print("\n-- %s -> %s (len=%d)" % (k, st, len(raw)))
        print("   " + raw[:260].replace("\n", " "))

    # 自动确认「B 的 bid / 邮箱是否泄漏进 A 的响应」——这是 IDOR 判据的来源
    st, raw = probes["basket_other"]
    leak = {}
    if st == 200:
        leak["basket_other_status"] = st
        leak["contains_b_bid"] = str(users["b"]["bid"]) in raw
        leak["contains_b_email"] = users["b"]["email"] in raw
    artifacts["idor_probe"] = leak

    # 官方 solved 快照（第二 oracle 的基线）
    st, raw = probes["challenges"]
    solved0 = []
    if st == 200:
        try:
            items = json.loads(raw)["data"]
            solved0 = [x["key"] for x in items if x.get("solved")]
        except Exception:
            pass
    artifacts["solved_baseline"] = solved0

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(artifacts, f, ensure_ascii=False, indent=2)
    print("\n[saved] %s" % OUT)
    print("solved baseline: %s" % (solved0 or "(none)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
