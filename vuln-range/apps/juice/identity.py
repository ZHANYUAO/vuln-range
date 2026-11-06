#!/usr/bin/env python3
"""identity.py —— 只做身份解析，不触发任何漏洞

为什么单独一个脚本
------------------
`recon.py` 会顺手探测 /metrics、/ftp/、错口令搜索…… 这些**本身就会解掉挑战**，
导致后面用「官方 solved 状态」当第二 oracle 时，基线已经被污染。

本脚本只做三件事，且每一步都不构成漏洞利用：
  1. 注册账号 A / B（正常功能）
  2. 各自登录，拿自己的会话
  3. 各自读**自己的**购物车 → 得到自己的 uid

产出：profiles/juiceshop.json 的 artifacts（self_uid/other_uid/self_email/other_email/bid）。
这样 IDOR 的判据就成了「返回的对象是不是别人的」，不需要任何预置常量。
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("JUICE_BASE", "http://127.0.0.1:3001")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))          # vuln-range/
PROFILE = os.path.join(ROOT, "profiles", "juiceshop.json")


def op():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def req(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    hdrs = {}
    if body is not None:
        hdrs["Content-Type"] = "application/json"
    if token:
        hdrs["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=hdrs)
    try:
        with op().open(r, timeout=15) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, "ERR %s" % e


def make_user(tag, ts):
    email = "canary.%s.%s@lab.local" % (tag, ts)
    pw = "Canary#%s!" % ts
    st, raw = req("POST", "/api/Users", {
        "email": email, "password": pw, "passwordRepeat": pw,
        "securityQuestion": {"id": 1, "question": "Your eldest siblings middle name?"},
        "securityAnswer": "canary",
    })
    if st not in (200, 201):
        print("[!] 注册 %s 失败 %s %s" % (tag, st, raw[:160]))
        return None
    st, raw = req("POST", "/rest/user/login", {"email": email, "password": pw})
    if st != 200:
        print("[!] 登录 %s 失败 %s %s" % (tag, st, raw[:160]))
        return None
    auth = json.loads(raw)["authentication"]
    uid = None
    st2, raw2 = req("GET", "/rest/basket/%s" % auth["bid"], token=auth["token"])
    if st2 == 200:
        uid = json.loads(raw2)["data"]["UserId"]
    return {"email": email, "password": pw, "token": auth["token"],
            "bid": auth["bid"], "uid": uid}


def main():
    ts = str(int(time.time()))[-6:]
    A = make_user("a", ts)
    B = make_user("b", ts)
    if not A or not B or A["uid"] is None or B["uid"] is None:
        print("[!] 身份解析失败，无法继续")
        return 2

    print("A: uid=%s bid=%s %s" % (A["uid"], A["bid"], A["email"]))
    print("B: uid=%s bid=%s %s" % (B["uid"], B["bid"], B["email"]))
    assert A["uid"] != B["uid"], "两个账号 uid 相同，身份解析不成立"

    prof = json.load(open(PROFILE, encoding="utf-8"))
    prof["artifacts"] = {
        "self_uid": A["uid"], "other_uid": B["uid"],
        "self_email": A["email"], "other_email": B["email"],
        "self_bid": A["bid"], "other_bid": B["bid"],
        "auth_token": A["token"], "other_token": B["token"],
        "auth_password": A["password"],
    }
    prof["artifacts_note"] = ("由 apps/juice/identity.py 在 %s 运行时生成：注册两个全新账号，"
                              "各自读自己的购物车得到 uid。不含任何预置常量。" % time.strftime("%Y-%m-%d %H:%M"))
    with open(PROFILE, "w", encoding="utf-8") as f:
        json.dump(prof, f, ensure_ascii=False, indent=2)
    print("[saved] %s" % PROFILE)

    # 确认这次身份解析没有解掉任何挑战（干净基线）
    st, raw = req("GET", "/api/Challenges", token=A["token"])
    solved = []
    if st == 200:
        solved = [x["key"] for x in json.loads(raw)["data"] if x.get("solved")]
    print("solved baseline after identity: %s" % (solved or "(none)"))
    if solved:
        print("[!] 警告：身份解析阶段已解掉挑战 %s —— 这些不能计入闸门战果" % solved)
    return 0


if __name__ == "__main__":
    sys.exit(main())
