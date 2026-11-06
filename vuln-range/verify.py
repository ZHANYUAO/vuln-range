#!/usr/bin/env python3
"""verify.py —— 重放验证闸门（L4）

为什么需要它
------------
ARTEX 的循环是「LLM 决策 → 执行 → report_finding」，中间没有独立复现。
结果是 #43 真的执行了转账、#42 把登录口的报错当改密口的证据。
本文件把「LLM 说发现了」变成「同一请求重放 N 次、对照 control 仍然成立」。

判定三分法对齐 REA 的 Evidence 契约：observations / inferences / unknowns。
**无法判定时必须返回 unknown，绝不返回通过。**

用法
----
  python verify.py --ground-truth          # 用靶场标注自检（应全部 confirmed）
  python verify.py --negative              # 拿 control 当"发现"喂进来（应全部 rejected）
  python verify.py --finding my_finding.json
  python verify.py --ground-truth --repeats 5

单条 finding 的 schema 与 lab/ground_truth.json 里的一条完全一致：
  id / class / request / assert / control / control_assert / pre / post
"""
import argparse
import datetime
import hashlib
import html
import http.client
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.join(HERE, "lab")
GT_FILE = os.path.join(LAB, "ground_truth.json")
SANDBOX = os.path.join(LAB, "sandbox")
EVIDENCE_DIR = os.path.join(HERE, "evidence")

BASE = "http://127.0.0.1:8899"
OAST = "http://127.0.0.1:8897"
PROFILE = {}

sys.path.insert(0, HERE)
import asserts as _asserts  # noqa: E402  （同目录，脚本与 import 两种跑法都要能用）


def configure(profile_name="lab"):
    """把闸门指向某个目标 profile（决定 BASE/OAST/artifacts/是否可复位）。

    2026-10-28 新增：此前 BASE 是写死的 127.0.0.1:8899，闸门只能打自己写的靶场。
    """
    global BASE, OAST, PROFILE, AUTH_PATHS
    PROFILE = _asserts.load_profile(profile_name)
    BASE = PROFILE["base"]
    OAST = PROFILE.get("oast") or OAST
    AUTH_PATHS = set(PROFILE.get("auth_paths") or DEFAULT_AUTH_PATHS)
    return PROFILE

# 「有状态断言」：结论取决于 OAST 的全局日志，而不是某个响应体。
# 这类断言不能用「把攻击断言打到 control 响应上」的方式做泄漏检测
# （control 响应与 OAST 日志之间没有因果关系），必须走时间窗隔离。
STATEFUL_ASSERTS = {"oast_hit", "oast_not_hit"}

# 认证端点本身：它返回 401 表示「凭证错」，不表示「需要先登录」。
# 不排除它，DEFAULTCRED-01 会被误分类成 blocked。
# 真实应用实测（Juice Shop 用 /rest/user/login）证明这个集合**必须按目标配置**，
# 否则「用错账号打登录口」会被判成 blocked，读者会以为「我只是没登录」。
DEFAULT_AUTH_PATHS = {"/login", "/api/login", "/auth", "/signin", "/api/token",
                      "/rest/user/login", "/rest/user/login/"}
AUTH_PATHS = set(DEFAULT_AUTH_PATHS)

# 导入即加载 profile（与 asserts.py 保持一致）。理由：pipeline.py / falsekill.py
# 这类入口不调 configure()，旧版由此让 PROFILE 为空 → 证据里 profile=null、
# 且 reset 端点判断自相矛盾（2026-10-29 自检）。环境变量 VULN_PROFILE 优先。
try:
    configure(os.environ.get("VULN_PROFILE", "lab"))
except OSError:
    pass

# 登录页路径特征。与 AUTH_PATHS 语义**不同**，别混用：
#   AUTH_PATHS  = 「我就是要打登录口」—— 故意打，被拒不算被挡；
#   LOGIN_HINTS = 「我被踢回登录页」—— 说明这次没带上有效会话。
# 2026-10-29 自检发现：classify_block 只认 401/407，传统表单栈（302 → /login）
# 会把「没带会话」判成 rejected，读者读成「漏洞不存在」。必须补这条路。
LOGIN_HINTS = ("/login", "/signin", "/sign-in", "/log-in", "/auth/login",
               "/session/new", "/users/sign_in", "/account/login")


def _norm_path(p):
    return (p or "").split("?")[0].split("#")[0].rstrip("/").lower()


def _is_login_path(p):
    n = _norm_path(p)
    if not n:
        return False
    for h in LOGIN_HINTS:
        h = h.rstrip("/")
        if n == h or n.endswith(h) or n.startswith(h + "/"):
            return True
    return False


def _hdr(headers, name):
    for k, v in (headers or {}).items():
        if k.lower() == name.lower():
            return v
    return ""


def classify_block(resp, case):
    """攻击请求被「鉴权层」挡下时，返回受阻原因；否则 None。

    为什么必须单独分类（2026-10-28 误杀实验）
    ----------------------------------------
    IDOR-01 / PRIV-01 在「没有会话」时目标返回 401，闸门据此输出 `rejected`。
    读者读 `rejected` 会理解成「漏洞不存在」，但真实含义只是「我没带凭证」。
    这是闸门自己在**没有证据的条件下断言了不存在** —— 必须改成 blocked（证据不足）。

    为什么还要看 final_url（2026-10-29 自检补）
    ------------------------------------------
    上面那条只覆盖 JSON API（401）。传统表单栈未认证返回的是 **302 → /login**，
    而 urllib 默认**跟随重定向**，`status` 最终会是登录页的 200，永远看不到 3xx。
    于是：攻击断言在登录页 HTML 上不成立 → rejected → 又一次把「没登录」
    写成「漏洞不存在」。所以判据必须落在**最终落点**上，而不是状态码上。
    """
    if resp.get("error"):
        return None
    path = (case.get("request") or {}).get("path", "")
    st = resp.get("_attack_status") or resp.get("status")
    if st == 401 and path not in AUTH_PATHS:
        return "目标返回 401（需要认证），本次未持有可用会话"
    if st == 407:
        return "目标要求代理认证（407）"
    if path in AUTH_PATHS:
        # 本条 case 攻击的就是登录口本身，落在登录页是预期行为，不是被挡。
        return None

    landed = ""
    if st in (301, 302, 303, 307, 308):
        loc = _hdr(resp.get("headers"), "Location")
        if loc and _is_login_path(urllib.parse.urlparse(loc).path):
            landed = loc
    if not landed:
        fin = resp.get("final_url") or ""
        fpath = urllib.parse.urlparse(fin).path if fin else ""
        if fpath and _is_login_path(fpath) and not _is_login_path(path):
            landed = fpath
    if landed:
        return "请求被重定向到登录页（%s），本次未持有可用会话" % landed
    return None


# ------------------------------------------------------------------ HTTP 层
def make_opener(jar=None):
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        urllib.request.HTTPCookieProcessor(jar if jar is not None else http.cookiejar.CookieJar()),
    )


def _subst(obj, vars_):
    """把 `${name}` 替换成会话变量。

    为什么需要（真实应用必备）：靶场的会话靠 Cookie，requests 的 cookie jar 自动带；
    Juice Shop 这类 SPA 后端用 **JWT 放在 Authorization 头**，cookie jar 拿不到。
    没有模板替换，任何需要登录的用例都写不出来。
    """
    if isinstance(obj, str):
        for k, v in (vars_ or {}).items():
            obj = obj.replace("${%s}" % k, str(v))
        return obj
    if isinstance(obj, dict):
        return {k: _subst(v, vars_) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_subst(v, vars_) for v in obj]
    return obj


def _dig(node, path):
    for part in path.split("."):
        node = node[int(part)] if isinstance(node, list) else node[part]
    return node


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """让 3xx 直接以 HTTPError 抛出，从而保留原始状态码与 Location 头。

    urllib 默认会把 3xx 跟到底，Location 从返回值里消失 —— 见 do_request 里的说明。
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def do_request(opener, step, timeout=15, vars_=None):
    """执行一步。返回 dict(status, body, headers, error)。"""
    step = _subst(step, vars_) if vars_ else step
    method = step.get("method", "GET").upper()
    path = step.get("path", "/")
    params = step.get("params") or {}
    body = None
    url = BASE + path
    headers = dict(step.get("headers") or {})

    if method == "GET":
        if params:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    else:
        if "json" in step:
            body = json.dumps(step["json"], ensure_ascii=False).encode()
            headers["Content-Type"] = "application/json"
        else:
            body = urllib.parse.urlencode(params).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"

    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    # 「不要跟随重定向」（2026-11-02 实测补）
    # ---------------------------------------
    # urllib 默认跟随 3xx，于是 `GET /go?to=/admin` 这种开放重定向会被一路跟到
    # /login，最终 status=200，**Location 头彻底消失**。后果不是"判错"，而是
    # 「开放重定向 / CRLF 注入 Location / 重定向型 SSRF」这一整类漏洞**无法验证**，
    # 且静默落入 rejected —— 读者会理解成"漏洞不存在"。
    # 需要看重定向本身时，step 里写 "no_redirect": true。
    if step.get("no_redirect"):
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), _NoRedirectHandler())

    try:
        with opener.open(req, timeout=timeout) as r:
            raw = r.read()
            # final_url 必须记：urllib 默认跟随重定向，`status` 是**最终落点**的状态。
            # 少了它，「302 → /login」会被读成「200 正常响应」，
            # classify_block 就永远认不出「没带会话」（2026-10-29 自检补）。
            return {"status": r.status, "body": raw.decode("utf-8", "replace"),
                    "raw": raw, "headers": dict(r.headers), "error": None,
                    "final_url": r.url, "redirected": (r.url != url)}
    except http.client.IncompleteRead as e:
        # 🔴 真实应用会发「Content-Length 比实际 body 长」的响应（实测 Juice Shop 的 /ftp/
        # 就是这样：声明 11312，实发 11253）。默认 read() 会抛 IncompleteRead，
        # 让一条真漏洞被判成 transport error → unknown。
        # 正确做法：拿 e.partial，把它当成完整响应继续判定（并记下这个事实）。
        partial = e.partial or b""
        return {"status": 200, "body": partial.decode("utf-8", "replace"), "raw": partial,
                "headers": {}, "error": None, "final_url": url,
                "note": "IncompleteRead：响应被截断（声明长度大于实收），已用已收部分判定"}
    except urllib.error.HTTPError as e:
        rawb = e.read()
        return {"status": e.code, "body": rawb.decode("utf-8", "replace"), "raw": rawb,
                "headers": dict(e.headers), "error": None,
                "final_url": e.geturl() if hasattr(e, "geturl") else url}
    except Exception as e:
        return {"status": 0, "body": "", "headers": {}, "error": "%s: %s" % (type(e).__name__, e)}


def sha(b):
    return hashlib.sha256(b.encode("utf-8", "replace")).hexdigest()[:16]

# ------------------------------------------------------------------ OAST 层
def oast_clear():
    """清空 OAST 日志。拿不到控制 token 就跳过（时间窗过滤仍然生效）。"""
    rel = PROFILE.get("oast_token_file") or "lab/.oast_token"
    try:
        token = open(os.path.join(HERE, rel), encoding="utf-8").read().strip()
    except OSError:
        return False, "no oast token（oast.py 未启动？）"
    op = make_opener()
    req = urllib.request.Request(OAST + "/__clear", headers={"X-Oast-Control": token})
    try:
        with op.open(req, timeout=5) as r:
            return (r.status == 200), r.read(200).decode("utf-8", "replace")
    except Exception as e:
        return False, "oast clear failed: %s" % e


def oast_hits(token=None, ua=None, since=None):
    """取回连记录，按 token / UA / 时间窗过滤。

    since 是**必须有**的隔离手段：blind 漏洞的 payload 会在多轮之间复用
    同一个 token，不按时间切，第二轮的判定会读到第一轮的回连，
    于是「每一轮都成立」变成平庸的自我实现。
    """
    op = make_opener()
    try:
        with op.open(OAST + "/__log", timeout=5) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return None                     # None 与空列表语义不同：取不到 ≠ 没有
    hits = data.get("hits") or []
    out = []
    for h in hits:
        if token is not None and token not in (h.get("tokens") or []):
            continue
        if ua is not None and ua not in (h.get("user_agent") or ""):
            continue
        if since is not None and float(h.get("ts") or 0) < since:
            continue
        out.append(h)
    return out


def oast_poll(token, ua=None, since=None, timeout=4.0, interval=0.25):
    """轮询直到命中或超时。blind 回连是异步的，必须等。"""
    deadline = time.time() + timeout
    while True:
        hits = oast_hits(token=token, ua=ua, since=since)
        if hits is None:
            return None                 # 连不上 OAST → unknown，不是 rejected
        if hits:
            return hits
        if time.time() >= deadline:
            return []
        time.sleep(interval)


# ------------------------------------------------------------- 断言求值
_NOT_JSON = object()


def _parse_json_body(resp):
    """返回 (root, why)。不是 JSON 时返回 (_NOT_JSON, 原因)。"""
    try:
        return json.loads(resp["body"]), None
    except Exception:
        return _NOT_JSON, "响应不是 JSON（status=%s, len=%d）" % (
            resp.get("status"), len(resp.get("body") or ""))


def evaluate(assertion, resp, since=None):
    """返回 (bool, 说明)。断言不认识的类型一律判 None → 上层转 unknown。

    since 只对 oast_* 生效：它是该次请求发出的时间戳，用于把回连窗口
    切干净。
    """
    if not assertion:
        return None, "no assertion"

    # 复合断言：真实应用上「文件泄露」的判据是「200 **且** 不是 403 错误页」，
    # 单个断言表达不了 —— 200 也可能返回一页错误 HTML。
    if assertion.get("type") in ("all_of", "any_of"):
        subs = assertion.get("of") or []
        if not subs:
            return None, "%s 没有子断言" % assertion.get("type")
        oks, details = [], []
        for sub in subs:
            ok, d = evaluate(sub, resp, since=since)
            oks.append(ok)
            details.append(str(d))
        joined = " | ".join(details)
        if assertion["type"] == "any_of":
            if any(o is True for o in oks):
                return True, "any_of: " + joined
            if all(o is False for o in oks):
                return False, "any_of: " + joined
            return None, "any_of 有子断言无法判定: " + joined
        if any(o is False for o in oks):
            return False, "all_of 有子断言不成立: " + joined
        if any(o is None for o in oks):
            return None, "all_of 有子断言无法判定: " + joined
        return True, "all_of: " + joined

    t = assertion.get("type")
    val = assertion.get("value")

    if t in STATEFUL_ASSERTS:
        token = assertion.get("token")
        if not token:
            return None, "oast assertion without token"
        ua = assertion.get("ua")
        wait = float(assertion.get("wait", 4))
        hits = oast_poll(token, ua=ua, since=since, timeout=wait)
        if hits is None:
            return None, "OAST 不可达，无法判定带外回连"
        detail = "oast token=%s hits=%d ua=%s" % (token, len(hits), ua or "*")
        if t == "oast_hit":
            return (len(hits) > 0), detail
        return (len(hits) == 0), detail

    if resp.get("error"):
        return None, "transport error: %s" % resp["error"]

    if t == "status":
        return (resp["status"] == val), "status=%s expect %s" % (resp["status"], val)

    # 响应头断言（2026-11-02 新增）
    # 开放重定向、CRLF 注入 Location、重定向型 SSRF 的证据全在头里，body 里什么都没有。
    # 这类断言必须配合 step 的 "no_redirect": true 才有意义（否则头已经丢了）。
    if t in ("header_contains", "header_not_contains", "header_equals"):
        name = (assertion.get("header") or assertion.get("name") or "").lower()
        hdrs = resp.get("headers") or {}
        got = None
        for k, v in hdrs.items():
            if k.lower() == name:
                got = v
                break
        if got is None:
            return (t == "header_not_contains"), "响应头 %s 不存在" % (name or "(未指定)")
        if t == "header_equals":
            return (got == str(val)), "header %s=%r expect %r" % (name, got, str(val))
        hit = str(val) in got
        return (hit if t == "header_contains" else not hit), \
            "header %s=%r contains(%r)=%s" % (name, got[:60], str(val), hit)
    if t == "body_contains":
        return (str(val) in resp["body"]), "contains=%s" % (str(val) in resp["body"])
    if t == "body_not_contains":
        return (str(val) not in resp["body"]), "absent=%s" % (str(val) not in resp["body"])
    if t == "json_path_equals":
        p = assertion.get("path", "")
        # 语义分层（2026-10-28 真实应用实测后修正）：
        #   body 不是 JSON        → None（不知道这是什么，交 unknown）
        #   JSON 里没有该字段     → False（字段不存在，「等于 X」自然不成立）
        # 原来的实现把两者都判 None，结果 N-BASKET-404 这种「对象不存在」被拖成 unknown。
        root, why = _parse_json_body(resp)
        if root is _NOT_JSON:
            return None, why
        try:
            node = _dig(root, p)
        except Exception:
            return False, "JSON 里没有字段 %s（字段不存在 → 断言不成立）" % p
        return (node == val), "json[%s]=%r expect %r" % (p, node, val)
    if t == "json_path_contains":
        # 为什么需要它：body_contains 会被「payload 回显」骗到。
        # 实测 CMDI-01 —— 响应里 cmd 字段原样回显了 payload，于是
        # body_contains("CMDI-MARKER") 恒成立，哪怕命令根本没执行。
        # 必须把断言钉死在「命令输出」这个字段上，回显字段不算证据。
        p = assertion.get("path", "")
        root, why = _parse_json_body(resp)
        if root is _NOT_JSON:
            return None, why
        try:
            node = _dig(root, p)
        except Exception:
            return False, "JSON 里没有字段 %s（字段不存在 → 断言不成立）" % p
        return (str(val) in str(node)), "json[%s] contains %s = %s" % (
            p, val, str(val) in str(node))
    if t == "json_path_exists":
        # 用途：登录绕过这类「证据不是某个值，而是某条结构存在」的判定。
        # 例：auth bypass 成功后响应里才有 authentication.token；口令错时完全是另一份响应。
        p = assertion.get("path", "")
        try:
            node = json.loads(resp["body"])
            for k in p.split("."):
                node = node[int(k)] if isinstance(node, list) else node[k]
            return (node not in (None, "", [], {})), "json[%s] exists=%r" % (
                p, node not in (None, "", [], {}))
        except Exception:
            return False, "json[%s] 不存在（解析失败或路径缺失）" % p
    if t == "body_matches":
        # 正则形态的证据：用于「凭据泄漏」这类——证据不是某个固定串，
        # 而是「出现了密码散列的形状」。固定串会写死成靶场专属常量。
        try:
            rx = re.compile(str(val))
        except Exception as e:
            return None, "正则非法：%s" % e
        m = rx.search(resp["body"])
        return (m is not None), "regex=%s hit=%r" % (
            val, (m.group(0)[:40] if m else None))
    if t == "body_magic":
        # 二进制文件的证据形态是 **magic bytes**，不是文本内容。
        # 例：/ftp/incident-support.kdbx 是 KeePass 库，头 4 字节 03 D9 A2 9A。
        # 用 body_contains 判它是错的（解码后字节变 U+FFFD），只能比原始字节。
        want = str(val).replace(" ", "").lower()
        raw = resp.get("raw")
        if raw is None:
            raw = resp["body"].encode("latin-1", "replace")
        got = raw[:len(want) // 2].hex()
        return (got == want), "magic got=%s want=%s" % (got, want)
    if t == "body_not_matches":
        # 与 body_matches 严格对称。**缺它会静默降级成 unknown**：
        # 真实应用上 J-UNION-CRED 的 control_assert 就是手写了这个类型却没人实现，
        # 直接被判 unknown（幸好 unknown 优先级拦住了假 confirmed）。
        try:
            rx = re.compile(str(val))
        except Exception as e:
            return None, "正则非法：%s" % e
        m = rx.search(resp["body"])
        return (m is None), "regex=%s must_not_match hit=%r" % (
            val, (m.group(0)[:40] if m else None))
    if t == "file_exists":
        fp = os.path.join(SANDBOX, str(val))
        return (os.path.exists(fp)), "file=%s exists=%s" % (val, os.path.exists(fp))
    if t == "error_signal":
        # 语义：payload 破坏了语法，于是**期待报错**。这是弱 payload 唯一能提供的证据形态，
        # 因此它不能和「取到了数据」共用同一档判据（见 asserts.py 的设计说明）。
        keys = assertion.get("keys") or ["error"]
        pats = assertion.get("patterns") or []
        try:
            node = json.loads(resp["body"])
        except Exception:
            node = None
        for k in keys:
            if isinstance(node, dict) and node.get(k):
                return True, "错误键 %s 非空：%s" % (k, str(node.get(k))[:80])
        low = resp["body"].lower()
        for pat in pats:
            if pat.lower() in low:
                return True, "错误特征命中：%s" % pat
        return False, "无错误特征（keys=%s patterns=%d）" % ("/".join(keys), len(pats))
    if t == "error_absent":
        inv = {"type": "error_signal", "keys": assertion.get("keys"),
               "patterns": assertion.get("patterns")}
        ok, detail = evaluate(inv, resp, since=since)
        return (None if ok is None else (not ok)), "error_absent: %s" % detail
    if t == "unescaped":
        # 反射型 XSS 的判据必须是「原文出现 **且** 转义形式不存在」。
        # 只看 body_contains 会把「已正确转义」也判成命中 —— 那是假阳性。
        raw = str(val)
        hit = raw in resp["body"]
        # ⚠️ 只比较 quote=False 的转义形式有坑：dalfox 给的 payload 是
        # `" onmouseover=alert(1) class=xxx x="` —— 不含 < > &，escape 后与原文**相同**，
        # 于是「转义形式存在」恒真，真漏洞被判成没反射（实测踩过）。
        # 正确做法：把两种转义形式都算上，且**排除与原文相同的那种**；
        # 若 payload 本身没有可转义字符，则 raw 出现即为未转义。
        forms = {html.escape(raw, quote=False), html.escape(raw, quote=True)} - {raw}
        escaped = any(f in resp["body"] for f in forms)
        return (hit and not escaped), "raw=%s escaped=%s forms=%d" % (hit, escaped, len(forms))
    if t == "json_path_not_equals":
        p = assertion.get("path", "")
        root, why = _parse_json_body(resp)
        if root is _NOT_JSON:
            return None, why
        try:
            node = _dig(root, p)
        except Exception:
            # 字段不存在时「不等于 X」在字面上成立，但那不是证据（可能只是响应形式不同）。
            # 这里保守判 None：宁可 unknown，也不要把「字段缺失」当成「越权成立」。
            return None, "JSON 里没有字段 %s → 无法判断是否等于他人值" % p
        return (node != val), "json[%s]=%r != %r" % (p, node, val)
    if t == "status_not":
        return (resp["status"] != val), "status=%s != %s" % (resp["status"], val)
    if t == "json_has_keys":
        keys = assertion.get("keys") or []
        try:
            node = json.loads(resp["body"])
        except Exception:
            return False, "非 JSON 响应"
        if not isinstance(node, dict):
            return False, "响应不是对象"
        missing = [k for k in keys if k not in node]
        return (not missing), "missing=%s" % (missing or "none")
    if t == "json_missing_key":
        keys = assertion.get("keys") or []
        try:
            node = json.loads(resp["body"])
        except Exception:
            return True, "非 JSON 响应（必然缺键）"
        if not isinstance(node, dict):
            return True, "响应不是对象"
        missing = [k for k in keys if k not in node]
        return (bool(missing)), "missing=%s" % (missing or "none")
    return None, "unknown assertion type: %s" % t


# ------------------------------------------------------------------ 单步流程
def run_flow(case, jar=None, use_control=False):
    """跑 pre → request（或 control）→ post，返回 (最终响应, 步骤记录, 会话罐)。"""
    jar = jar or http.cookiejar.CookieJar()
    opener = make_opener(jar)
    sessions = {}
    record = []
    vars_ = dict(case.get("vars") or {})     # 允许用例自带变量（也可由 capture 产出）

    def run_step(op, step):
        r = do_request(op, step, vars_=vars_)
        # capture：从响应 JSON 里取值，供后续步骤用 ${name} 引用。
        # 这是「登录拿 token → 带着 token 打越权」这类链路的唯一写法。
        cap = step.get("capture")
        if isinstance(cap, dict) and cap.get("name") and cap.get("from"):
            try:
                vars_[cap["name"]] = _dig(json.loads(r["body"]), cap["from"])
            except Exception:
                pass
        return r

    # 对照组的语义：在"不该成立"的状态下发同一个请求。
    # 因此默认**不执行 pre**（pre 是为攻击链武装会话的），需要带状态时用 control_pre 显式声明。
    pre_steps = case.get("control_pre", []) if use_control else case.get("pre", [])
    for step in pre_steps:
        r = run_step(opener, step)
        record.append({"phase": "pre", "name": step.get("path"), "status": r["status"],
                       "body_len": len(r["body"]), "sha": sha(r["body"]), "error": r["error"]})
        if step.get("save_cookie"):
            sessions[step["save_cookie"]] = jar

    if use_control:
        ctl = case.get("control") or []
        r = {"status": 0, "body": "", "error": "no control defined"}
        for step in ctl:
            r = run_step(opener, step)
            record.append({"phase": "control", "name": step.get("path"), "status": r["status"],
                           "body_len": len(r["body"]), "sha": sha(r["body"]), "error": r["error"]})
        return r, record, jar

    req = case["request"]
    sess = req.get("session")
    opener_for_req = make_opener(sessions[sess]) if sess and sess in sessions else opener
    r = run_step(opener_for_req, req)
    record.append({"phase": "attack", "name": req.get("path"), "status": r["status"],
                   "body_len": len(r["body"]), "sha": sha(r["body"]), "error": r["error"]})

    for step in case.get("post", []):
        s2 = step.get("session")
        op2 = make_opener(sessions[s2]) if s2 and s2 in sessions else opener_for_req
        r2 = run_step(op2, step)
        ok, detail = evaluate(step.get("assert"), r2)
        record.append({"phase": "post", "name": step.get("path"), "status": r2["status"],
                       "body_len": len(r2["body"]), "sha": sha(r2["body"]),
                       "error": r2["error"], "assert_ok": ok, "assert_detail": detail})
        if ok is False:
            # 🔴 这一步的失败**不能**把这个响应交回上层当"攻击响应"判。
            # 实测事故：FILEWRITE-01 的 post（读回写入的文件）失败，返回了
            # 404 错误页，而错误页里带着文件路径 `...\sandbox\written.txt`，
            # 于是顶层 body_contains("written.txt") 命中 → 假 confirmed。
            # 打上标记，让上层直接判失败。
            r2["_post_failed"] = True
            r2["_post_detail"] = detail
            # 记下**攻击请求本身**的状态码。post 步骤通常是"用新权限访问某资源"，
            # 它返回 403 会把攻击请求的 401 盖掉 → blocked 判定失效。
            # 实测：PRIV-01 无会话时攻击是 401（需要认证），post 是 403（权限不足），
            # 只看最终响应就会把「我没带凭证」误判成「漏洞不存在」。
            r2["_attack_status"] = r["status"]
            return r2, record, jar
    return r, record, jar


def effective_reset_endpoint():
    """本目标的复位端点。**唯一真源** —— reset_lab() 与证据记账都必须问它。

    2026-10-29 自检踩过的坑：reset_lab() 用 `PROFILE.get("reset_endpoint", "/__reset")`
    带默认值，而记账侧用 `PROFILE.get("reset_endpoint")` 不带默认值。当 PROFILE 为空
    （pipeline / falsekill 这类不调 configure() 的入口）时，复位实际**成功了**，
    但证据里被记成「无复位端点 → 本轮未复位」，自相矛盾。
    """
    if "reset_endpoint" in PROFILE:
        return PROFILE["reset_endpoint"]
    return "/__reset"


def reset_lab():
    """复位靶场状态。真实目标没有这个端点 —— 那时返回 (True, 说明) 表示「跳过复位」。

    为什么跳过也要算成功：真实应用的状态不能也不该被我们清空，
    但「没有复位能力」必须是**显式记录**的事实，不能装作有。
    """
    ep = effective_reset_endpoint()
    if not ep:
        return True, "profile `%s` 无复位端点（真实目标）—— 本轮不做复位，跨轮状态可能相互影响" % (
            PROFILE.get("name", "?"))
    token_rel = PROFILE.get("control_token_file") or "lab/.control_token"
    token_file = os.path.join(HERE, token_rel)
    try:
        token = open(token_file, encoding="utf-8").read().strip()
    except OSError:
        return False, "no control token (lab 未启动？)"
    op = make_opener()
    req = urllib.request.Request(BASE + ep, data=b"", method="POST",
                                headers={"X-Lab-Control": token})
    try:
        with op.open(req, timeout=10) as r:
            return (r.status == 200), "reset ok"
    except Exception as e:
        return False, "reset failed: %s" % e


# ------------------------------------------------------------------ 判定
def verdict_of(results, control_results):
    """results / control_results 是每轮 (ok, detail)。"""
    if any(r[0] is None for r in results) or any(c[0] is None for c in control_results):
        return "unknown", "存在无法判定的轮次（传输错误或断言不支持）"
    hits = sum(1 for r in results if r[0])
    ctl_ok = sum(1 for c in control_results if c[0])

    if hits == 0:
        return "rejected", "全部 %d 轮都未观察到断言成立" % len(results)
    if hits < len(results):
        return "unknown", "跨轮不稳定：%d/%d 轮成立（疑似时序或状态污染）" % (hits, len(results))
    if ctl_ok < len(control_results):
        return "unknown", "control 反向断言未成立：差异无法归因到该漏洞"
    return "confirmed", "%d/%d 轮成立，且 control 反向断言全部成立" % (hits, len(results))


def verify_case(case, repeats=3, expect_control=False, derive=True, mode=None, run_label=None):
    """derive=True 时**忽略** case 里手写的 assert，改用 asserts.py 按 payload 派生。
    这是本轮 P1 的核心：判据不再允许硬编码。

    mode / run_label（2026-10-29 自检补）
    ------------------------------------
    没有这两个字段时，evidence/ 目录里正式结论、反向自检、弱化 payload 实验、
    旧代码产物混在一起，谁也分不清哪条能当结论。实测 55 个 case / 46 条重复 bundle。
    现在每条 bundle 自带 `mode` + `run_label` + `created_at`，消费方（tally / 报告）
    可以只取 `mode=attack`，按 `created_at` 排序取最新，而不再靠文件名字典序。
    """
    if derive:
        case = _asserts.apply(case)
    if mode is None:
        mode = "negative_selfcheck" if expect_control else "attack"
    bundle = {
        "case_id": case.get("id"),
        "class": case.get("class"),
        "criterion": case.get("criterion"),
        "target": BASE,
        "profile": PROFILE.get("name"),
        "mode": mode,
        "run_label": run_label or "unlabeled",
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "repeats": repeats,
        "derivation": case.get("_derivation"),
        "assertion_used": case.get("assert"),
        "observations": [],
        "inferences": [],
        "unknowns": [],
    }
    results, controls, leaks, blocks = [], [], [], []
    no_control = False

    for i in range(repeats):
        ok_reset, msg = reset_lab()
        # 复位结果**无条件**记录。旧版只在失败时写 msg，而 Juice Shop 没有复位端点、
        # 返回 (True, "无复位端点——跨轮状态可能相互影响") —— 这句解释被直接丢掉，
        # 与 reset_lab() 自己的 docstring「必须显式记录」矛盾（2026-10-29 自检）。
        if i == 0:
            ep = effective_reset_endpoint()
            bundle["state_control"] = {
                "reset_endpoint": ep,
                "reset_ok": ok_reset,
                "reset_detail": msg,
            }
        if not ok_reset:
            bundle["unknowns"].append("reset 失败（第 %d 轮），无法保证可复现：%s" % (i + 1, msg))
        elif i == 0 and not effective_reset_endpoint():
            bundle["unknowns"].append("本轮未复位：%s" % msg)
        time.sleep(0.05)

        if expect_control:
            # 反向自检：把 benign / 未授权的对照请求当成"发现"喂进来，
            # 正确的闸门必须判 rejected（证明它不会橡皮图章）。
            t0 = time.time()
            resp, rec, _ = run_flow(case, use_control=True)
            ok, detail = evaluate(case.get("assert"), resp, since=t0)
            results.append((ok, detail))
            bundle["observations"].append({
                "round": i + 1, "phase": "control_as_finding", "assert_ok": ok,
                "assert_detail": detail, "status": resp["status"],
                "body_sha256_16": sha(resp["body"]), "body_len": len(resp["body"]), "steps": rec,
            })
            continue

        t0 = time.time()
        resp, rec, _ = run_flow(case, use_control=False)
        blk = classify_block(resp, case)
        blocks.append(blk)
        if resp.get("_post_failed"):
            # post（多见于「写进去再读回来」这类二阶验证）没打通 → 攻击链不成立。
            ok, detail = False, "post 步骤断言失败，攻击链未打通：%s" % resp.get("_post_detail")
        elif blk:
            ok, detail = None, "攻击请求被鉴权层挡下：%s" % blk
        elif (case.get("_derivation") or {}).get("post_is_judgement"):
            # 二阶 case：主请求的 2xx 只说明「接口收了参数」，不是证据。
            # 走到这里说明 post 每一步都通过了。
            ok, detail = True, "二阶验证：post 步骤全部通过（真正判据在 post，主请求状态不参与判定）"
        else:
            ok, detail = evaluate(case.get("assert"), resp, since=t0)
        results.append((ok, detail))
        bundle["observations"].append({
            "round": i + 1, "phase": "attack", "assert_ok": ok, "assert_detail": detail,
            "status": resp["status"], "body_sha256_16": sha(resp["body"]),
            "body_len": len(resp["body"]), "steps": rec, "blocked": blk,
            "final_url": resp.get("final_url"),
        })

        t1 = time.time()
        ctl_resp, ctl_rec, _ = run_flow(case, use_control=True)
        if ctl_resp.get("error") == "no control defined":
            # 这不是「对照不成立」，是**根本没做对照** —— 装置缺陷。
            # 旧版会把它归因成「对照侧断言无法判定」，读者会以为是网络问题。
            no_control = True
        cok, cdetail = evaluate(case.get("control_assert"), ctl_resp, since=t1)
        if cok is None and ctl_resp.get("status") and ctl_resp["status"] >= 400:
            # 对照响应本身被拒（401/403/404）→ 它不可能携带漏洞证据。
            # 这时若 control_assert 是「取某个 JSON 字段」这类断言，会因为字段不存在
            # 而求值失败（None），进而把整条结论拖成 unknown —— 那是装置问题，不是结论。
            cok, cdetail = True, "control 返回 %s，无内容，反向断言视为成立（%s）" % (
                ctl_resp["status"], cdetail)
        controls.append((cok, cdetail))
        # 关键：把**同一条攻击断言**打到对照响应上。若对照也满足，
        # 说明该"发现"只是页面回显/通用行为，不能归因到漏洞。
        # 对 oast_* 这类有状态断言，since=t1 保证只统计"control 请求之后"
        # 的回连 —— 攻击阶段留下的命中不会误伤。
        if ctl_resp.get("status") and ctl_resp["status"] >= 400:
            # 对照被拒（401/403/404）→ 它**没有内容可泄漏**，不能因为
            # 「断言在这个响应上无法求值(None)」就把整条结论打成 unknown。
            # 实测踩过：IDOR 的 control 是 401，json_path 取不到字段 → None →
            # 归因不成立 → unknown，等于让一个正确的 confirmed 被对照拖死。
            leak, leak_detail = False, "control 返回 %s，无内容可泄漏" % ctl_resp["status"]
        else:
            leak, leak_detail = evaluate(case.get("assert"), ctl_resp, since=t1)
        leaks.append((leak, leak_detail))
        bundle["observations"].append({
            "round": i + 1, "phase": "control", "assert_ok": cok, "assert_detail": cdetail,
            "attack_assert_on_control": leak, "attack_assert_on_control_detail": leak_detail,
            "status": ctl_resp["status"], "body_sha256_16": sha(ctl_resp["body"]),
            "body_len": len(ctl_resp["body"]), "steps": ctl_rec,
        })

    if expect_control:
        hits = sum(1 for r in results if r[0])
        if hits == 0:
            verdict = "rejected"
            reason = "对照请求在 %d 轮内均未满足攻击断言 → 闸门未误判" % repeats
        elif any(r[0] is None for r in results):
            verdict = "unknown"
            reason = "存在无法判定的轮次，control 有效性无法确认"
        else:
            verdict = "unknown"
            reason = "对照请求有 %d/%d 轮满足攻击断言 → 该 case 的 control 失效，结论不可归因" % (hits, repeats)
    else:
        verdict, reason = verdict_of(results, controls)
        # 归因降级只在「攻击侧确实有证据」时才有意义。
        # 若攻击断言全部为 False（压根没复现），对照是否满足断言与结论无关 ——
        # 早期无条件降级会把「没复现」误判成 unknown（实测 N-LOG-FAKE / N-KDBX-FAKE）。
        attack_evidence = any(r[0] is True for r in results)
        if attack_evidence and any(l[0] is True for l in leaks):
            verdict = "unknown"
            reason = "对照响应同样满足攻击断言 → 该观察无法归因到漏洞（疑似回显/通用行为）"
        elif attack_evidence and any(l[0] is None for l in leaks):
            verdict = "unknown"
            reason = "对照侧断言无法判定，归因不成立"
        # blocked 放在最后覆盖：它是「为什么没有证据」的最具体解释。
        if verdict != "confirmed" and any(blocks):
            verdict = "blocked"
            reason = "攻击请求被挡下（%s）→ 证据不足，**不等于漏洞不存在**" % next(
                b for b in blocks if b)

    bundle["verdict"] = verdict
    # 断言根本没派生出来（典型：profile 缺 artifact）时，verdict_of 只能说
    # 「断言不支持」，读者会以为是网络问题。这里把真正的缺失原因顶上去
    # —— 实测旧版理由写着「传输错误或断言不支持」，而实际原因与传输毫无关系。
    _der = case.get("_derivation") or {}
    if verdict == "unknown" and case.get("assert") is None and _der.get("note"):
        reason = "判据不可用（断言未派生，故未做任何判定）：%s" % _der["note"]
    if no_control:
        reason = ("本 case 没有定义 control → 根本没做归因对照（装置缺陷，"
                  "**不等于漏洞不存在**）：%s" % reason)
        bundle["unknowns"].append("case 缺少 control 定义：无法排除回显/通用行为")
    bundle["verdict_reason"] = reason
    bundle["inferences"] = (
        ["%s 在 %s 上重复 %d 次均成立，且 benign 对照不成立，判定可利用" %
         (case.get("class"), case.get("request", {}).get("path"), repeats)]
        if verdict == "confirmed" else []
    )
    if verdict == "rejected":
        bundle["unknowns"].append("未复现，但**不等于不存在**：可能 payload 不匹配、需要前置状态、或该洞本来就没有")
    if verdict == "unknown":
        bundle["unknowns"].append(reason)
    if verdict == "blocked":
        bundle["unknowns"].append(reason)
        bundle["unknowns"].append("补证路径：取得可用会话（或更低权限账号）后重放同一条请求")

    # mode 进哈希：否则同一组 observations 在「攻击」与「反向自检」两种模式下会撞成同一个
    # evidence_id，后来的文件覆盖前一个 —— 实测正是这样让 evidence/ 变得无法解释。
    core = json.dumps({k: bundle[k] for k in ("case_id", "class", "mode", "verdict",
                                              "observations")},
                      sort_keys=True, ensure_ascii=False)
    bundle["evidence_id"] = "ev_" + hashlib.sha256(core.encode()).hexdigest()[:12]
    return bundle


# ------------------------------------------------------------------ 主程序
def load_gt(path=None):
    with open(path or GT_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_bundle(bundle, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    p = os.path.join(out_dir, "%s_%s.json" % (bundle["case_id"], bundle["evidence_id"]))
    with open(p, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ground-truth", action="store_true", help="用靶场标注自检，应全部 confirmed")
    ap.add_argument("--negative", action="store_true", help="只喂 control，应全部 rejected")
    ap.add_argument("--blind", action="store_true",
                    help="跑 blind 专项（lab/ground_truth_blind.json，3 条无回显、只能靠 OAST 回连判定）。"
                         "等价于 --ground-truth --gt lab/ground_truth_blind.json，"
                         "单列一个开关只是为了让『blind 3/3』有可复现的命令行。")
    ap.add_argument("--finding", help="单条 finding json 文件")
    ap.add_argument("--gt", help="指定 ground truth 文件（默认 lab/ground_truth.json）")
    ap.add_argument("--profile", default=os.environ.get("VULN_PROFILE", "lab"),
                    help="目标 profile（profiles/<name>.json），决定 BASE/OAST/artifacts")
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--no-derive", action="store_true",
                    help="回到手写断言（仅供对照实验，正常都该让 asserts.py 派生）")
    ap.add_argument("--label", default=None,
                    help="本次运行的批次标签，写进每条 bundle 的 run_label。"
                         "默认 <profile>-<日期>。做对照实验时必须显式给，"
                         "否则事后无法区分「正式结论」和「实验产物」。")
    ap.add_argument("--out", default=EVIDENCE_DIR)
    args = ap.parse_args()

    prof_name = args.profile
    if args.blind:
        # blind 的 assert 自带 token + ua（见 lab/ground_truth_blind.json），
        # 不依赖 profile 的 blind_ua；这里只把 GT 与预期结果切过去。
        args.gt = os.path.join(LAB, "ground_truth_blind.json")
        args.ground_truth = True
        prof_name = "lab"

    prof = configure(prof_name)
    run_label = args.label or "%s-%s" % (prof_name, datetime.date.today().isoformat())
    print("[profile] %s  kind=%s  base=%s  label=%s%s" % (
        prof.get("name"), prof.get("kind"), BASE, run_label,
        "  [blind]" if args.blind else ""))

    if args.finding:
        with open(args.finding, encoding="utf-8") as f:
            cases = [json.load(f)]
    else:
        cases = load_gt(args.gt)["vulns"]

    if not (args.ground_truth or args.negative or args.finding):
        ap.print_help()
        return 0

    # OAST 是可选依赖：这批 case 里有 oast_* 断言才需要它。
    needs_oast = any((c.get("assert") or {}).get("type") in STATEFUL_ASSERTS
                     or (c.get("control_assert") or {}).get("type") in STATEFUL_ASSERTS
                     for c in cases)
    if needs_oast:
        ok_oast, omsg = oast_clear()
        print("[oast] %s" % (("已就绪：" + omsg) if ok_oast
                             else ("不可用（%s）→ 带外断言将全部判 unknown" % omsg)))

    ok_run, msg = reset_lab()
    if not ok_run:
        print("[!] %s\n[!] 先启动靶场：python lab/lab_app.py" % msg)
        return 2

    print("target=%s  cases=%d  repeats=%d  mode=%s\n" %
          (BASE, len(cases), args.repeats,
           "negative" if args.negative else ("ground-truth" if args.ground_truth else "finding")))
    print("%-14s %-24s %-26s %-10s %s" % ("CASE", "CLASS", "CRITERION", "VERDICT", "EVIDENCE"))
    print("-" * 100)

    tally = {}
    got = {}
    for case in cases:
        b = verify_case(case, repeats=args.repeats, expect_control=args.negative,
                        derive=not args.no_derive, mode=("negative_selfcheck" if args.negative
                                                         else "attack"),
                        run_label=run_label)
        p = save_bundle(b, args.out)
        tally[b["verdict"]] = tally.get(b["verdict"], 0) + 1
        got[case.get("id")] = b["verdict"]
        print("%-20s %-24s %-26s %-10s %s" % (
            b["case_id"], b["class"] or "-", b["criterion"] or "-", b["verdict"],
            os.path.basename(p)))

    print("-" * 100)
    print("汇总: " + "  ".join("%s=%d" % (k, v) for k, v in sorted(tally.items())))

    # 预期必须**按条目**读，不能整批一刀切。
    # 混合 GT（Juice Shop 9 正 6 负）在旧版会被要求「全部 confirmed」，
    # 于是一次完全正确的运行也打出「[!] 与预期不符」并返回 1 —— 假警报会把真回归淹掉。
    default_expect = "rejected" if args.negative else "confirmed"
    per_case = {c.get("id"): c.get("expect") for c in cases if c.get("expect")}
    mism = []
    for cid, v in got.items():
        exp = per_case.get(cid) or default_expect
        if v != exp:
            mism.append((cid, exp, v))
    if mism:
        print("[!] 与预期不符 %d 条（预期取自各条 case 的 expect，缺省为 %s）：" % (
            len(mism), default_expect))
        for cid, exp, v in mism:
            print("      %-18s 期望 %-10s 实际 %s" % (cid, exp, v))
        return 1
    print("[OK] 全部符合预期（逐条 expect；缺省 %s）" % default_expect)
    return 0


if __name__ == "__main__":
    sys.exit(main())
