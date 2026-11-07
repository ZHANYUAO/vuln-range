#!/usr/bin/env python3
"""asserts.py —— 断言派生层：判据必须由 payload 派生，禁止手写固定字符串。

为什么要把这层单独拆出来
------------------------
2026-10-28 误杀率实验：把**真漏洞**配上「扫描器级」的近似 payload，8 条里有 3 条被判
`rejected`（37.5%）。根因不是闸门逻辑写错，而是**判据是手写的固定常量**：

    SQLI-01 的 payload 被换成 `alice'`（只探语法错误），
    判据却还在等 union 取数才会出现的 `AK-LIVE-...`。

判据和 payload 脱节 → 闸门输出 `rejected` → 读者读成「漏洞不存在」。
这就是文献说的 "aggressive FP reduction suppresses true vulnerabilities"。

本层的铁律
----------
1. **断言只能由 (漏洞类, payload, 前置状态) 派生**，不允许在 GT 里硬编码一个常量。
2. 派生器必须声明**证据来源**，因为不同来源的可信度和失效方式不同：

   `payload`   判据常量直接来自 payload（echo 的 marker、提交的金额、反射的标签）
               失效方式：payload 被目标清洗/转义 → 断言自然为假，语义正确。
   `artifact`  判据常量来自我们**事先埋下的真值**（canary 文件、自家内网服务 banner、api_key）
               失效方式：artifact 泄漏到别处 → 假阳性。必须保证 artifact 全局唯一。
   `structure` 判据是**响应结构**（错误键、字段集、status），与 payload 形态绑定
               失效方式：payload 形态判断错了（把 union 当成盲注）→ 派生出错误期待。
   `oast`      判据是带外回连，与 payload 里的回连地址绑定
               失效方式：token 跨轮复用 → 时间窗污染（见 verify.oast_poll 的 since）。

3. **payload 形态决定断言形态**。同一类漏洞，payload 弱就派生出弱断言
   （只能证明语法被破坏 → error_signal），payload 强才派生出强断言
   （取到数据 → 凭据泄漏）。**绝不能用一个强断言去判一个弱 payload。**

通用化边界（必须承认）
----------------------
`artifact` 类的常量目前是靶场预置的。真实目标上它要靠：自己上传的 canary 文件、
自建 OAST 域名、探到的内网服务指纹。**IDOR 的「order→owner 映射」是最难通用化的**，
它需要身份解析（谁是谁），本轮仍是预置值，已标 `TODO(identity)`。
"""
import html
import json
import os
import re
import urllib.parse

PROFILE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "profiles")

# 当前生效的目标 profile。artifacts 不再是模块常量 —— 换目标就是换 profile。
PROFILE = {}
ARTIFACTS = {}


def load_profile(name="lab"):
    """加载 profiles/<name>.json（或传一个 .json 路径）。

    为什么必须做成 profile 而不是常量（2026-10-28）：
    这些常量全是**靶场里我埋的真值**。换一个真实应用，它们不但取不到值，
    更危险的是「取到值但含义变了」——所以缺 key 时必须显式降级成 unknown，
    绝不能让断言退化成永假（那会把真漏洞判成 rejected）。
    """
    global PROFILE, ARTIFACTS
    path = name if (name.endswith(".json") and os.path.exists(name)) \
        else os.path.join(PROFILE_DIR, name + ".json")
    with open(path, encoding="utf-8") as f:
        PROFILE = json.load(f)

    # 凭据隔离（2026-11-02）：profile 里会带真实会话凭证（JWT 内含密码哈希），
    # 一旦外发/进公开仓库就等于泄露。约定：同名 `<profile>.secrets.json` 存在时，
    # 其中 artifacts 覆盖主文件里的同名键，主文件只留占位说明。
    # 缺失时行为与旧版完全一致（向后兼容）。
    sec_path = os.path.join(os.path.dirname(path),
                            os.path.basename(path).replace(".json", ".secrets.json"))
    if os.path.exists(sec_path):
        with open(sec_path, encoding="utf-8") as f:
            sec = json.load(f)
        merged = dict(PROFILE.get("artifacts") or {})
        merged.update(sec.get("artifacts") or {})
        PROFILE["artifacts"] = merged
        PROFILE["_secrets_from"] = os.path.basename(sec_path)

    ARTIFACTS = PROFILE.get("artifacts") or {}
    return PROFILE


def _art(key):
    """取 artifact 真值。返回 (值, 缺失原因)。缺失原因不为 None 时必须转 unknown。"""
    if key not in ARTIFACTS:
        return None, ("artifact `%s` 未在 profile `%s` 中定义 —— 真实目标没有预置真值，"
                      "该判据不可用" % (key, PROFILE.get("name", "?")))
    return ARTIFACTS[key], None


def blind_ua():
    """profile 没定义 blind_ua 时返回 None（= 不过滤 UA）。"""
    return PROFILE.get("blind_ua")


def _need(key, note):
    """构造「需要 artifact 才能判定」的派生结果。缺值时 assert=None → 上层 unknown。"""
    val, miss = _art(key)
    if miss:
        return {"assert": None, "source": "unknown", "note": miss + "；" + note}
    return {"assert": {"type": "body_contains", "value": val}, "source": "artifact",
            "note": note}


try:
    load_profile(os.environ.get("VULN_PROFILE", "lab"))
except OSError:
    pass  # 允许只 import 不加载（测试/单元用），但此时任何 artifact 断言都会转 unknown


def _params(case):
    r = case.get("request") or {}
    return (r.get("params") or {}), (r.get("json") or {})


def payload_text(case):
    """把请求里所有「用户可控值」拼起来 —— 派生器的唯一输入。"""
    r = case.get("request") or {}
    parts = [str(r.get("path", ""))]
    for src in (r.get("params") or {}, r.get("json") or {}):
        for k, v in src.items():
            parts.append("%s=%s" % (k, v))
    return "\n".join(parts)


def _neg(assertion):
    """把断言取反，用于派生 control_assert（对照组必须**不**满足攻击断言）。

    只对「在任意响应上都可求值」的断言做取反。json_path_* 这类需要字段存在的断言
    不取反：control 常常是 401/404（响应体里根本没有该字段），取反后求值得到 None，
    会把一个正确的 confirmed 拖成 unknown（实测踩过 IDOR/DBWRITE）。
    这种情况保留 GT 里的 control_assert —— 它本来就在描述「control 应处于什么状态」。
    """
    if not assertion:
        return None
    t = assertion.get("type")
    if t == "body_contains":
        return {"type": "body_not_contains", "value": assertion["value"]}
    if t == "unescaped":
        return {"type": "body_not_contains", "value": assertion["value"]}
    if t == "error_signal":
        return {"type": "error_absent", "keys": assertion.get("keys"),
                "patterns": assertion.get("patterns")}
    if t == "status":
        return {"type": "status_not", "value": assertion["value"]}
    if t == "body_matches":
        # 正则类断言可以安全取反：任意响应都能求值，不需要字段存在。
        return {"type": "body_not_matches", "value": assertion["value"]}
    return None


# --------------------------------------------------------------- 各类派生器
def d_sql_injection(case):
    q = payload_text(case)
    # (a) payload 自带字面量标记（UNION SELECT ... 'MARKER' ...）
    #     这是最强的形态：证据完全由 payload 决定，不需要任何预置常量。
    m = re.search(r"union[\s\S]{0,120}?select[\s\S]{0,200}?['\"]([A-Za-z0-9_\-]{6,40})['\"]", q, re.I)
    if m:
        marker = m.group(1)
        return {
            "assert": {"type": "body_contains", "value": marker},
            "source": "payload",
            "note": "payload 的 UNION SELECT 里带字面量 `%s` → 判据=该字面量出现在响应中"
                    "（库里不可能自然产生这个串）" % marker,
        }
    if re.search(r"\bunion\b[\s\S]{0,80}?\bselect\b", q, re.I):
        # payload 指名要从库里取列 → 期待的证据是「库里才有的数据」出现在响应中。
        # 注意：判据值来自 artifact，但**该不该找它**是由 payload 的 SELECT 列表决定的。
        return _need("api_key",
                     "payload 含 UNION SELECT 取数 → 判据=库内凭据出现在响应中（benign 查询不返回该列）")
    if re.search(r"['\"]\s*(\)|;|--|#)?\s*$", q) or re.search(r"['\"]\s*\)", q):
        # payload 只破坏了语法 → 只能期待报错，不能期待数据。
        return {
            "assert": {"type": "error_signal",
                       "keys": ["sql_error", "error", "exception"],
                       "patterns": ["syntax error", "unrecognized token", "no such column",
                                    "near \"", "SQL logic error", "sqlite3."]},
            "source": "structure",
            "note": "payload 只破坏语法（无取数语句）→ 判据降级为「出现 SQL 错误特征」，"
                    "这是该 payload 能提供的**唯一**证据形态",
        }
    return {
        "assert": None, "source": "unknown",
        "note": "payload 既无取数语句也无语法破坏 → 无法派生出可判定的断言，应转 unknown 而不是 rejected",
    }


def d_reflected_xss(case):
    p, body = _params(case)
    vals = [str(v) for v in list(p.values()) + list(body.values()) if str(v)]
    if not vals:
        return None
    # 取「最像 HTML」的那个值作为反射标记，避免拿到无关参数
    q = max(vals, key=lambda s: (("<" in s), len(s)))
    return {
        "assert": {"type": "unescaped", "value": q},
        "source": "payload",
        "note": "判据=payload 原文出现且**未被 HTML 转义**（同时检查 entity 形式不存在）",
    }


def d_command_injection(case):
    p, _ = _params(case)
    raw = " ".join(str(v) for v in p.values())
    # 从 payload 里抽出「执行后才会产生」的标记：echo X / printf X / print X
    m = re.search(r"\b(?:echo|printf|print)\s+([A-Za-z0-9_\-{}.]{3,})", raw)
    if not m:
        return {
            "assert": None, "source": "unknown",
            "note": "payload 里没有可观测的执行标记（如 echo X）→ 无法判定，转 unknown",
        }
    marker = m.group(1)
    return {
        "assert": {"type": "json_path_contains", "path": "output", "value": marker},
        "source": "payload",
        "note": "从 payload 抽出 echo 标记 `%s`，断言它出现在 **output 字段**"
                "（不是 cmd 字段 —— 那里是 payload 回显）" % marker,
    }


def d_path_traversal_read(case):
    return _need("canary",
                 "判据=沙箱外 canary 文件内容；这是唯一能证明「读到了界外」的证据（路径回显不算）")


def d_ssrf(case):
    p, _ = _params(case)
    url = str(p.get("url", ""))
    oast_host = os.environ.get("OAST_HOST", "127.0.0.1:8897")
    if oast_host in url or "oast" in url.lower():
        token = url.rstrip("/").rsplit("/", 1)[-1] or "ssrf"
        return {
            "assert": {"type": "oast_hit", "token": token, "ua": blind_ua()},
            "source": "oast",
            "note": "payload 指向 OAST → 判据=带外回连（响应体不回传内容，只能这样判）",
        }
    return _need("ssrf_banner",
                 "payload 指向自家内网服务 → 判据=响应里出现该服务 banner")


def d_idor(case):
    other_uid, miss_o = _art("other_uid")
    self_uid, miss_s = _art("self_uid")
    if not miss_o and not miss_s:
        # 真实应用上的 IDOR：判据必须来自**身份解析**（两个账号各自的对象归属），
        # 而不是预置的 uid 映射。
        return {
            "assert": {"type": "json_path_equals", "path": "data.UserId", "value": other_uid},
            "control_assert": {"type": "json_path_equals", "path": "data.UserId",
                               "value": self_uid},
            "source": "artifact",
            "note": "判据=返回对象的 UserId 等于**另一个账号**的 uid(%r)，而我自己的是 %r；"
                    "对照=请求自己的对象时 UserId 必须等于 %r" % (other_uid, self_uid, self_uid),
        }
    uid, miss = _art("idor_owner_uid")
    if miss:
        return {"assert": None, "source": "unknown",
                "note": miss + "；越权判据需要「这个对象属于谁」的映射，真实目标上必须靠身份解析"
                                "（注册两个账号各取一个对象）在运行时求值"}
    return {
        "assert": {"type": "json_path_equals", "path": "user_id", "value": uid},
        "source": "artifact",
        "note": "TODO(identity): 判据=返回对象的归属 uid 等于他人 uid（预置映射）；"
                "通用化需先做身份解析",
    }


def d_privilege_escalation(case):
    # 提权是二阶的：改角色接口返回 200 **不等于**提权成功，
    # 必须用新权限去访问一个原本 403 的资源。
    if case.get("post"):
        return {
            "assert": {"type": "status", "value": 200},
            "post_is_judgement": True,
            "source": "structure",
            "note": "二阶验证：真正判据是 post 步骤（用新权限访问 /admin）；"
                    "主请求的 200 只说明「接口收了参数」，不构成证据",
        }
    return {"assert": {"type": "status", "value": 200}, "source": "structure",
            "note": "payload 请求本身的成功响应（弱判据，建议补二阶 post 步骤）"}


def d_default_credentials(case):
    return {
        "assert": {"type": "status", "value": 200},
        "post_is_judgement": True,
        "source": "structure",
        "note": "二阶验证：登录 200 只是「口令对」，判据落在 post（用该会话访问 /admin）",
    }


def d_business_logic_tampering(case):
    _, body = _params(case)
    # 判据值从 payload 里取 —— payload 提交多少，就回读多少。
    for key in ("total", "amount", "price", "balance"):
        if key in body:
            return {
                "assert": {"type": "json_path_equals", "path": key, "value": body[key]},
                "source": "payload",
                "note": "判据=回读字段 %s 等于提交值 %r（值直接来自 payload，改 payload 判据自动跟着改）"
                        % (key, body[key]),
            }
    return _need("api_key", "payload 无金额字段 → 退化为凭据泄漏判据")


def d_union_credential_dump(case):
    """UNION 注入「导出用户凭据」。

    和普通 union 的区别：普通 union 只要一个字面量出现就能证明注入存在；
    要证明**凭据泄漏**，证据必须长成凭据的样子（散列）。这就是 payload 决定证据形态：
    payload 里 SELECT 了 password 列，判据就该是「出现了散列形状」，而不是某个固定字符串。
    """
    q = payload_text(case)
    if not re.search(r"union[\s\S]{0,240}?select[\s\S]{0,240}?from\s+users", q, re.I):
        return {"assert": None, "source": "unknown",
                "note": "payload 不是「从 users 取凭据」的形态 → 不能按凭据泄漏判"}
    return {
        "assert": {"type": "body_matches", "value": r"[0-9a-f]{32}"},
        "source": "payload",
        "note": "payload 指名 SELECT password FROM Users → 判据=响应里出现 32 位十六进制散列"
                "（对照请求的普通搜索不应出现该形状）。注意：本规则假设散列为 MD5，"
                "换目标需按实际算法调整——这是已知的通用化边界",
    }


def d_confidential_document(case):
    """越权读取机密文档（文件白名单内、但内容涉密）。"""
    return {
        "assert": {"type": "body_contains", "value": "confidential"},
        "source": "structure",
        "note": "判据=响应正文含文档自身的密级标注文本（实测 /ftp/acquisitions.md 首页即写 "
                "This document is confidential）",
    }


# ------------------------------------------------------------------ 文件泄漏
# 真实应用上这批洞的证据形态**由被请求文件的类型决定**，而不是由漏洞类别决定：
#   .kdbx → 二进制库 magic bytes；.log → 日志行格式；.key → 密钥格式；
#   其余（被后缀白名单拦住的 .bak/.yml/.gg）→ 只能判「200 且不是错误页」。
# 这是「payload 决定断言形态」在文件类洞上的推广：这里的 payload 就是**路径**。
_FILE_EXT_RULES = [
    (".kdbx", {"type": "body_magic", "value": "03d9a29a"},
     "KeePass 库固定头 03 D9 A2 9A（文本断言判不了二进制）"),
    (".log", {"type": "body_matches", "value": r"\d+\.\d+\.\d+\.\d+ - - \["},
     "访问日志行格式 IP - - [时间]"),
    (".key", {"type": "body_matches", "value": r"\d{10,}\.[A-F0-9]{32}"},
     "授权密钥格式 数字.ID"),
]


def d_file_disclosure(case):
    path = ((case.get("request") or {}).get("path") or "")
    low = urllib.parse.unquote(path).lower()
    for ext, assertion, why in _FILE_EXT_RULES:
        if ext in low:
            return {"assert": assertion, "source": "payload",
                    "note": "证据形态由请求路径扩展名决定：%s → %s" % (ext, why)}
    return {
        "assert": {"type": "all_of", "of": [
            {"type": "status", "value": 200},
            {"type": "body_not_contains", "value": "<title>Error"},
        ]},
        "source": "structure",
        "note": "扩展名未知 → 只能判「200 且不是错误页」。这是弱判据：任何 200 都满足，"
                "必须靠 control（同一文件不绕过 → 403 错误页）来归因",
    }


def d_oast(case):
    """通用带外派生：从 payload 里抽出 `http://…/oast/<token>` → 断言该 token 有回连。

    盲打类（blind SSRF / blind CMDI / XXE）的响应体**不含任何证据**，唯一的证据就是
    带外回连。token 由 payload 决定，所以这是纯 payload 派生，天然跟着 payload 走。
    """
    txt = payload_text(case)
    m = re.search(r"https?://[^\s\"'<>]+/oast/([A-Za-z0-9_\-]+)", txt)
    if not m:
        return {"assert": None, "source": "unknown",
                "note": "payload 里没有 OAST 回连地址 → 盲打类无法判定（转 unknown）"}
    token = m.group(1)
    return {
        "assert": {"type": "oast_hit", "token": token, "ua": blind_ua(), "wait": 5},
        "source": "oast",
        "note": "从 payload 抽出回连 token `%s` → 断言带外命中（响应体不含证据，只能这样判）" % token,
    }


def d_unauthorized_data_access(case):
    return _need("api_key", "判据=响应含 users 表的凭据列（该列绝不该出现在无认证响应里）")


def d_exposed_internal_api(case):
    return d_unauthorized_data_access(case)


# ------------------------------------------------- 真实应用专用派生器（2026-10-28）
# 这一组是在 OWASP Juice Shop 实测时补的：真实应用上，「证据形态」比靶场多得多，
# 而且有些证据根本不是「某个常量出现在响应里」。每类都必须单独说明它凭什么算证据。
def d_auth_bypass_sqli(case):
    """登录口 SQL 注入（认证绕过）。

    证据形态很特殊：既不是报错，也不是库里的数据，而是**本该 401 的请求返回了会话**。
    payload 里的 `' --` 是截断口令校验的动作，所以该不该期待 token，由 payload 决定。
    """
    q = payload_text(case)
    if not re.search(r"['\"]\s*(--|#|/\*)", q):
        return {"assert": None, "source": "unknown",
                "note": "payload 未使用注释符截断 → 不构成「绕过口令校验」的假设，无法判定"}
    return {
        "assert": {"type": "json_path_exists", "path": "authentication.token"},
        "control_assert": {"type": "status", "value": 401},
        "source": "structure",
        "note": "判据=响应里出现 authentication.token（口令校验被截断才会有）；"
                "对照=同账号错口令必须是 401",
    }


def d_sensitive_file_disclosure(case):
    """备份/敏感文件读取（如 null byte 绕过后缀校验）。

    证据 = 响应是**结构化文件内容**，而不是首页 HTML。
    用 json_has_keys 而不是 body_contains "juice-shop"：后者会把错误页里的应用名也算成命中。
    """
    keys = ["name", "version"]
    return {
        "assert": {"type": "json_has_keys", "keys": keys},
        "source": "structure",
        "note": "判据=响应体是 JSON 且同时含 %s 键 —— 只有真读到 package.json 才会这样"
                % "/".join(keys),
    }


def d_directory_listing(case):
    """目录列表暴露。证据 = 目标自己吐出了目录索引页。"""
    return {
        "assert": {"type": "body_contains", "value": "listing directory"},
        "source": "structure",
        "note": "判据=响应里出现目标自身的目录索引标题（实测该文本由其 dirlist 处理器生成）",
    }


def d_exposed_metrics(case):
    """指标/监控端点未授权暴露。"""
    return {
        "assert": {"type": "body_contains", "value": "# HELP"},
        "source": "structure",
        "note": "判据=Prometheus 文本格式标志 `# HELP` 出现（首页 HTML 不会含它）",
    }


def d_data_exposure_object(case):
    """单个对象越权读取：返回的是**别人**的记录。"""
    self_email, miss = _art("self_email")
    if miss:
        return {"assert": None, "source": "unknown",
                "note": miss + "；需要「我自己的邮箱」才能判断返回的是不是别人的记录"}
    return {
        "assert": {"type": "json_path_not_equals", "path": "data.email", "value": self_email},
        "source": "artifact",
        "note": "判据=返回对象的 email 不等于我自己的 %r（说明读到了别人）；"
                "该值来自运行时注册，非预置" % self_email,
    }


def d_data_exposure_list(case):
    """列表越权读取：响应里出现了**他人**的邮箱。"""
    other_email, miss = _art("other_email")
    if miss:
        return {"assert": None, "source": "unknown",
                "note": miss + "；需要「另一个账号的邮箱」才能证明列表里混进了他人数据"}
    return {
        "assert": {"type": "body_contains", "value": other_email},
        "source": "artifact",
        "note": "判据=响应中出现另一个账号的邮箱 %r（该账号由我们在运行时注册）" % other_email,
    }


DERIVERS = {
    "sql_injection": d_sql_injection,
    "reflected_xss": d_reflected_xss,
    "command_injection": d_command_injection,
    "path_traversal_read": d_path_traversal_read,
    "ssrf": d_ssrf,
    "idor": d_idor,
    "privilege_escalation": d_privilege_escalation,
    "default_credentials": d_default_credentials,
    "business_logic_tampering": d_business_logic_tampering,
    "unauthorized_data_access": d_unauthorized_data_access,
    "exposed_internal_api": d_exposed_internal_api,
    # 真实应用实测补充（Juice Shop）
    "auth_bypass_sqli": d_auth_bypass_sqli,
    "sensitive_file_disclosure": d_sensitive_file_disclosure,
    "directory_listing": d_directory_listing,
    "exposed_metrics": d_exposed_metrics,
    "data_exposure_object": d_data_exposure_object,
    "data_exposure_list": d_data_exposure_list,
    "file_disclosure": d_file_disclosure,
    "union_credential_dump": d_union_credential_dump,
    "confidential_document": d_confidential_document,
    # 盲打类：判据一律走带外回连
    "blind_ssrf": d_oast,
    "blind_command_injection": d_oast,
    "blind_xxe": d_oast,
}


def derive(case):
    """返回 {assert, control_assert, source, note}；无法派生时 assert=None（上层转 unknown）。"""
    fn = DERIVERS.get(case.get("class"))
    if not fn:
        out = d_oast(case)
        if out.get("assert"):
            out["control_assert"] = case.get("control_assert")
            return out
        # 兜底：没有派生器时沿用 case 自带断言，但**显式标记 manual**。
        # manual 是唯一允许的例外，因为它意味着「没人知道该怎么从 payload 推导」，
        # 这类断言的可信度必须比 payload 派生低一档。
        return {"assert": case.get("assert"),
                "control_assert": case.get("control_assert"),
                "source": "manual",
                "note": "该类无派生器 → 沿用自带断言（未经派生，可信度较低）"}
    out = fn(case) or {"assert": None, "source": "unknown", "note": "派生器返回空"}
    a = out.get("assert")
    # 派生器可以自己给 control_assert（比自动取反更准确）：
    # 例如 auth bypass 的对照是「同账号错口令必须 401」，而攻击断言是「存在 token」，
    # 简单取反得不到这个语义。
    out["control_assert"] = _neg(a) or out.get("control_assert") or case.get("control_assert")
    return out


def apply(case):
    """派生并写回 case 的副本。GT 里手写的 assert 会被覆盖 —— 这正是本层的目的。"""
    d = derive(case)
    c = json.loads(json.dumps(case))
    if d["assert"] is not None:
        c["assert"] = d["assert"]
    else:
        c.pop("assert", None)
    if d.get("control_assert"):
        c["control_assert"] = d["control_assert"]
    c["_derivation"] = {"source": d["source"], "note": d["note"],
                        "post_is_judgement": bool(d.get("post_is_judgement"))}
    return c


# ---------------------------------------------------------------------------
# VHV 变体族谱：只读引用，不参与任何判定
# ---------------------------------------------------------------------------
# 存在的理由：P2 的 held-out 变体验证需要「同一漏洞族还有哪些没测过的打法」这份语料。
# 但 VHV 打的是 npm 库（JS 表达式 + 进程内 marker），本文件判的是 HTTP 响应。
# 证据源不同 → 族谱只能用来枚举与提示覆盖度，绝不能用来生成断言或替代 derive()。
VARIANT_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "vhv", "variant_families.json")
_VARIANTS = None


def _variant_db():
    """族谱缺失/损坏时返回空，保证主流程（判分）永远不受影响。"""
    global _VARIANTS
    if _VARIANTS is None:
        try:
            with open(VARIANT_DB, encoding="utf-8") as f:
                _VARIANTS = json.load(f)
        except (OSError, ValueError):
            _VARIANTS = {"families": {}, "semantic_boundary": "(族谱未生成)"}
    return _VARIANTS


def variant_family(name):
    """只读：返回某族变体清单（id / api / origin / expect / expr_sha256）。
    不含任何漏洞判定结论；cross_version 里的 verdict 明确是 observed_only。"""
    return list(_variant_db().get("families", {}).get(name, {}).get("variants", []))


def held_out_hints(case, used=None):
    """只读：仅当 case **显式声明** `vhv_family` 时，返回未参与本次验证的变体 id。

    刻意不做自动映射：库层 `rce` / `pollution` 与 Web 层 `command_injection` /
    `sql_injection` 名字不同、证据源不同，猜测式映射会让外部语料悄悄进入判分链路，
    这正是「断言必须由 payload 派生」铁律要防的事。
    返回值只写进证据包作覆盖度提示，**不参与判分**。
    """
    fam = case.get("vhv_family")
    if not fam:
        return []
    used = set(used if used is not None else (case.get("vhv_used_variants") or []))
    return [v["id"] for v in variant_family(fam)
            if v.get("id") and v["id"] not in used]


def variant_summary():
    """给人和外部 AI 看的族谱概览。"""
    db = _variant_db()
    return {
        "schema": db.get("schema"),
        "payload_count": db.get("payload_count"),
        "semantic_boundary": db.get("semantic_boundary"),
        "families": {k: {"role": v.get("role"), "variant_count": v.get("variant_count"),
                         "control_count": v.get("control_count"),
                         "guard_control_count": v.get("guard_control_count")}
                     for k, v in db.get("families", {}).items()},
    }


if __name__ == "__main__":
    import sys
    if "--families" in sys.argv:
        print(json.dumps(variant_summary(), ensure_ascii=False, indent=2))
        sys.exit(0)
    gt = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "lab/ground_truth.json",
                       encoding="utf-8"))
    for v in gt["vulns"]:
        d = derive(v)
        print("%-18s %-11s %s" % (v["id"], d["source"], json.dumps(d["assert"], ensure_ascii=False)))
        print("   ", d["note"])
