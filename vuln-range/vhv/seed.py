#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""VHV 回路第 0 阶：把一条公开漏洞公告，变成机器可读的「种子」。

为什么需要这一层（2026-11-02 设计）
----------------------------------
领域现状是两条路：**定位型**（DNA / strix：找到可疑位置，交给人判断）与
**自判型**（Big Sleep：模型自己写测试自己下结论）。缺的是**裁决型**：
候选必须转成机器可执行的判据，由独立于模型的闸门判。

裁决的前提是「有反事实」——要知道修之前和修之后差在哪。所以种子必须是
**patch diff**，而不是漏洞描述文本：
    - 描述文本说「存在原型链污染」，不告诉你修的是哪一行、修的是什么不变量
    - patch diff 直接给出「去掉了哪个 sink、加了哪个 guard」

取种链路（2026-11-02 本机实测，全部直连，不挂代理）：
    GitHub Advisory API  → 仓库定位 + 版本区间 + CWE
    OSV API              → 跨生态补全（OSV 只给版本号，不给 commit）
    GitHub compare API   → 两个 tag 之间的 files[].patch
    GitHub 单 commit API → compare 拿不到时的兜底

三个实测结论（别再试别的路）：
1. `github.com` 主站超时、`raw.githubusercontent.com` 返回 000；
   但 `api.github.com` 与 `codeload.github.com` 正常。
2. `repos/{r}/commits` 列表接口**不返回** files/patch；只有单 commit 接口返回。
3. OSV 的 `events[].fixed` 是**版本号**不是 commit（如 "4.17.21"），
   中间必须自己接一层 tag→compare。

用法：
    python vhv/seed.py GHSA-f23m-r3pf-42rh
    python vhv/seed.py CVE-2026-2950 --out vhv/seeds
"""
import argparse
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, "seeds")
GH_API = "https://api.github.com"
OSV_API = "https://api.osv.dev/v1"

# 网络约束（本机实测）：必须直连。系统代理 127.0.0.1:6516 对 api.github.com
# 时通时不通，且并发一高就 502。这里串行 + 直连，宁可慢。
CURL_BASE = ["curl", "-s", "--max-time", "25", "--noproxy", "*",
             "-H", "Accept: application/vnd.github+json",
             "-H", "User-Agent: vhv-seed/1.0"]

# 非源码文件：diff 里出现它们只会污染「改了什么」的判断。
# 实测 lodash 4.17.20→4.17.21 的 10 个文件里有 4 个是 dist/doc，
# 若不剔除，会把「打包产物重新生成」误读成「逻辑被改动」。
NON_SOURCE_RE = re.compile(
    r"(^|/)(dist|build|out|node_modules|vendor|third_party|docs?|tests?|spec|"
    r"__tests__|fixtures?|examples?)/|"
    r"\.(min|bundle|map|lock|md|txt|png|jpg|svg|ico|gif|woff2?|ttf)$",
    re.I)


def curl_json(url, timeout_note=""):
    """取 JSON。失败返回 (None, 原因)，绝不抛异常污染上层。"""
    try:
        p = subprocess.run(CURL_BASE + [url], capture_output=True, timeout=40)
    except subprocess.TimeoutExpired:
        return None, "curl 超时 %s" % url
    raw = p.stdout.decode("utf-8", "replace").strip()
    if not raw:
        return None, "空响应（可能 404 或网络禁用）: %s" % url
    try:
        d = json.loads(raw)
    except json.JSONDecodeError:
        return None, "非 JSON 响应: %s" % raw[:120]
    if isinstance(d, dict) and d.get("message"):
        return None, "API 报错: %s" % d["message"]
    return d, None


def normalize_ghsa(vuln_id):
    """把用户输入统一成 GitHub Advisory 能吃的形式。CVE 得先反查 GHSA。"""
    vid = vuln_id.strip().upper()
    if vid.startswith("GHSA-"):
        return vid, None
    if vid.startswith("CVE-"):
        # GitHub Advisory 列表接口支持 cve_id 过滤（实测可用）
        d, err = curl_json("%s/advisories?cve_id=%s" % (GH_API, vid))
        if err:
            return None, err
        if not d:
            return None, "%s 没有对应的 GitHub Advisory（可能不是 GitHub 托管项目）" % vid
        return d[0]["ghsa_id"], None
    return None, "无法识别的编号格式: %s（要 GHSA-xxxx 或 CVE-xxxx-nnnnn）" % vuln_id


def fetch_advisory(ghsa_id):
    d, err = curl_json("%s/advisories/%s" % (GH_API, ghsa_id))
    if err:
        return None, err
    return d, None


def resolve_repo(adv):
    """从 advisory 拿 owner/repo。source_code_location 是官方字段，优先用。"""
    loc = (adv.get("source_code_location") or "").rstrip("/")
    m = re.match(r"https?://github\.com/([^/]+)/([^/]+)$", loc, re.I)
    if m:
        return m.group(1), m.group(2), None
    # 兜底：references 里的 commit / security advisory 链接
    for r in adv.get("references") or []:
        m = re.search(r"github\.com/([^/]+)/([^/]+)/(?:commit|security|blob)/", r or "", re.I)
        if m:
            return m.group(1), m.group(2), "从 references 推断（source_code_location 缺失）"
    return None, None, "无法确定源码仓库：%s" % (loc or "字段为空")


def parse_range(range_str):
    """把 "<= 4.17.23" / ">= 4.0.0, < 4.18.0" 解析成 (下界, 上界)。

    注意：这里只求「修复版本」，不求完整语义。区间表达式的歧义（如
    "<= 4.17.23" 到底修在 4.17.24 还是 4.18.0）留给后面的 tag 探测解决，
    不在这里猜。
    """
    s = (range_str or "").strip()
    out = {"lt": None, "lte": None, "gt": None, "gte": None, "raw": s}
    for op, key in (("<=", "lte"), ("<", "lt"), (">=", "gte"), (">", "gt")):
        m = re.search(re.escape(op) + r"\s*v?([0-9][0-9A-Za-z.\-+]*)", s)
        if m:
            out[key] = m.group(1)
            s = s.replace(m.group(0), "")   # 只取第一个匹配，避免 <= 被 < 抢
    return out


def list_tags(owner, repo, limit=100):
    d, err = curl_json("%s/repos/%s/%s/tags?per_page=%d" % (GH_API, owner, repo, limit))
    if err:
        return [], err
    return [t["name"] for t in (d or [])], None


def pick_tag(tags, version):
    """版本号 → tag 名。真实项目里 tag 前缀五花八门，必须容错。"""
    if not version:
        return None
    cands = ["v%s" % version, version, "release-%s" % version,
             "%s-release" % version, "v%s.0" % version]
    low = {t.lower(): t for t in tags}
    for c in cands:
        if c.lower() in low:
            return low[c.lower()]
    # 宽松匹配：tag 里含该版本号且没别的版本号
    pat = re.compile(r"(^|[^0-9])%s([^0-9]|$)" % re.escape(version))
    hit = [t for t in tags if pat.search(t)]
    return hit[0] if len(hit) == 1 else None


def vkey(tag):
    """tag → 可比较的版本元组。取不出数字就返回 None（该 tag 不参与排序）。

    只做「谁比谁新」的判断，不追求 semver 完备——预发布标识（rc/beta）
    统一当负权重处理，因为修复版几乎不会是预发布。
    """
    m = re.search(r"(\d+(?:\.\d+){0,3})", (tag or "").lstrip("vV"))
    if not m:
        return None
    nums = [int(x) for x in m.group(1).split(".")]
    while len(nums) < 4:
        nums.append(0)
    pre = -1 if re.search(r"(rc|alpha|beta|pre|dev)", tag or "", re.I) else 0
    return tuple(nums) + (pre,)


def next_release_after(tags, version):
    """比给定版本大的**最小** tag。

    为什么必须有这个（2026-11-02 修）：advisory 常写 `<= 4.17.23`，
    意思是「到 4.17.23 为止都受影响」。修复版不是 4.17.23 —— 那是最后
    一个还带洞的版本。拿它当 head，compare 出来的是 4.17.22→4.17.23，
    根本不是修复 diff，而下游会把它当「补丁」去提不变量，提出来的全是噪声。
    """
    k0 = vkey(version)
    if k0 is None:
        return None
    pool = [(vkey(t), t) for t in tags]
    pool = [(k, t) for k, t in pool if k is not None and k > k0]
    pool.sort(key=lambda x: x[0])
    return pool[0][1] if pool else None


def prev_release_before(tags, version):
    """比给定版本小的**最大** tag，用作 compare 的 base。"""
    k0 = vkey(version)
    if k0 is None:
        return None
    pool = [(vkey(t), t) for t in tags]
    pool = [(k, t) for k, t in pool if k is not None and k < k0]
    pool.sort(key=lambda x: x[0], reverse=True)
    return pool[0][1] if pool else None


def fetch_compare(owner, repo, base, head):
    d, err = curl_json("%s/repos/%s/%s/compare/%s...%s" % (GH_API, owner, repo, base, head))
    if err:
        return None, err
    return d, None


def split_source(files):
    """把 compare 的 files 分成「源码」和「产物」。返回 (src, skipped)。"""
    src, skipped = [], []
    for f in files or []:
        name = f.get("filename") or ""
        rec = {"file": name, "additions": f.get("additions"),
               "deletions": f.get("deletions"),
               "patch": f.get("patch"),
               "patch_truncated": "patch" not in f}
        (skipped if NON_SOURCE_RE.search(name) else src).append(rec)
    return src, skipped


def build_seed(vuln_id, out_dir=DEFAULT_OUT):
    log = []

    def step(msg):
        log.append(msg)
        print("  " + msg)

    print("[1/5] 解析编号 %s" % vuln_id)
    ghsa, err = normalize_ghsa(vuln_id)
    if err:
        return None, err
    step("GHSA = %s" % ghsa)

    print("[2/5] 取 advisory")
    adv, err = fetch_advisory(ghsa)
    if err:
        return None, err
    owner, repo, note = resolve_repo(adv)
    if not owner:
        return None, note
    step("repo = %s/%s%s" % (owner, repo, ("（%s）" % note) if note else ""))
    step("CWE = %s" % ", ".join(c.get("cwe_id", "?") for c in adv.get("cwes") or []) or "?")

    vulns = adv.get("vulnerabilities") or []
    if not vulns:
        return None, "advisory 没有 vulnerabilities 条目"
    pkg = (vulns[0].get("package") or {})
    rng = parse_range(vulns[0].get("vulnerable_version_range"))
    step("包 = %s/%s" % (pkg.get("ecosystem"), pkg.get("name")))
    step("受影响区间 = %s" % (rng["raw"] or "未给出"))

    print("[3/5] 定位修复版本与 base tag")
    tags, terr = list_tags(owner, repo)
    if terr:
        step("tag 列表取不到：%s" % terr)
        tags = []
    step("仓库 tag 数 = %d（取回前 %d 个）" % (len(tags), len(tags)))

    # 修复版本的两种写法，语义不同，不能混：
    #   "< 4.18.0"   → 4.18.0 本身就是修复版，直接当 head
    #   "<= 4.17.23" → 4.17.23 是**最后受影响版**，修复版是它之后的下一个 tag
    head_tag, head_note = None, ""
    if rng["lt"]:
        head_tag = pick_tag(tags, rng["lt"])
        head_note = "'<%s' → 直接用该版本" % rng["lt"]
    elif rng["lte"]:
        head_tag = next_release_after(tags, rng["lte"])
        head_note = "'<=%s' → 取其后下一个 tag（%s 本身仍有洞）" % (
            rng["lte"], rng["lte"])
    if not head_tag:
        return None, "无法定位修复版本对应的 tag（区间=%s，tag 数=%d）" % (
            rng["raw"] or "空", len(tags))
    step("head tag = %s（%s）" % (head_tag, head_note))

    base_tag = pick_tag(tags, rng["gt"] or rng["gte"]) if (rng["gt"] or rng["gte"]) else None
    if not base_tag:
        base_tag = prev_release_before(tags, head_tag)
        step("base tag = %s（取 head 的前一个发布版）" % base_tag)
    else:
        step("base tag = %s（来自区间下界）" % base_tag)
    if not base_tag:
        return None, "无法确定 base tag"

    print("[4/5] 取 diff")
    cmp_d, err = fetch_compare(owner, repo, base_tag, head_tag)
    if err:
        return None, "compare %s...%s 失败：%s" % (base_tag, head_tag, err)
    src, skipped = split_source(cmp_d.get("files"))
    step("compare %s...%s → 改 %d 文件，源码 %d / 产物 %d" %
         (base_tag, head_tag, len(cmp_d.get("files") or []), len(src), len(skipped)))
    if not src:
        return None, "diff 里没有源码文件（可能只改了 dist/ 或其他产物）"
    chosen = {"base": base_tag, "head": head_tag, "src": src,
              "skipped": skipped, "raw": cmp_d}

    print("[5/5] 落盘")
    seed = {
        "schema": "vhv-seed/1",
        "vuln_id": ghsa,
        "cve_id": adv.get("cve_id"),
        "aliases": [a for a in (adv.get("identifiers") or []) if isinstance(a, dict)],
        "summary": adv.get("summary"),
        "severity": adv.get("severity"),
        "cwes": [c.get("cwe_id") for c in adv.get("cwes") or []],
        "package": {"ecosystem": pkg.get("ecosystem"), "name": pkg.get("name")},
        "repo": {"owner": owner, "repo": repo, "url": "https://github.com/%s/%s" % (owner, repo)},
        "affected_range": rng,
        "all_vulnerable_packages": [
            {"ecosystem": (v.get("package") or {}).get("ecosystem"),
             "name": (v.get("package") or {}).get("name"),
             "range": v.get("vulnerable_version_range")}
            for v in vulns],
        "patch": {"base_tag": chosen["base"], "fixed_tag": chosen["head"],
                  "source_files": chosen["src"], "skipped_files": chosen["skipped"]},
        "published_at": adv.get("published_at"),
        "references": adv.get("references"),
        "fetch_log": log,
        # 下一阶要填的东西，先留空位，避免后面偷偷改 schema
        "invariant": None,
        "candidates": [],
    }

    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "%s.json" % ghsa)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=2)
    print("  -> %s (%d 字节)" % (path, os.path.getsize(path)))
    return seed, None


def main():
    ap = argparse.ArgumentParser(description="VHV 种子生成：漏洞公告 → patch diff")
    ap.add_argument("vuln_id", help="GHSA-xxxx-xxxx-xxxx 或 CVE-YYYY-NNNNN")
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    seed, err = build_seed(args.vuln_id, args.out)
    if err:
        print("\n[FAIL] %s" % err)
        return 1

    print("\n种子摘要")
    print("  漏洞    : %s (%s)" % (seed["vuln_id"], seed.get("cve_id")))
    print("  仓库    : %s" % seed["repo"]["url"])
    print("  判据类  : %s" % ", ".join(seed["cwes"]))
    print("  diff    : %s...%s，源码 %d 个文件" %
          (seed["patch"]["base_tag"], seed["patch"]["fixed_tag"],
           len(seed["patch"]["source_files"])))
    for f in seed["patch"]["source_files"][:6]:
        print("    %-46s +%-4s -%-4s%s" %
              (f["file"], f["additions"], f["deletions"],
               "  [patch 被截断]" if f["patch_truncated"] else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
