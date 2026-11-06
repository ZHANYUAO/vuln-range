#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Submit the 2026-11-05 disclosure issues to GitHub.

Modes
-----
  dry    no network write. Renders every issue (title + body), writes the final
         payload to out/, and prints a GitHub "new issue" URL with the title and
         body already filled in -- one click to submit, no token needed.
  check  read-only. Queries the GitHub search API for likely duplicates first.
  api    creates the issues through REST. Needs a token with `public_repo`.

Token lookup order: $GH_TOKEN, $GITHUB_TOKEN, <workspace>/vuln-range/.github_token

Network goes through curl.exe (this machine's Python stack is unreliable for
outbound HTTPS); Python only does the parsing.
"""

import json
import os
import pathlib
import subprocess
import sys
import tempfile
import urllib.parse

HERE = pathlib.Path(__file__).resolve().parent
SPEC = HERE / "issues.json"
OUT = HERE / "out"
CURL = r"C:\Windows\System32\curl.exe"
TOKEN_FILE = HERE.parent.parent / "vuln-range" / ".github_token"

API = "https://api.github.com"


# --------------------------------------------------------------------------- net
def curl(args, timeout=60):
    cmd = [CURL, "-sS", "--noproxy", "*", "--max-time", str(timeout)] + args
    p = subprocess.run(cmd, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return p.returncode, p.stdout, p.stderr


def api(method, path, token=None, payload=None, timeout=60):
    """Returns (status:int, parsed:dict|list|str)."""
    args = ["-X", method, API + path,
            "-H", "Accept: application/vnd.github+json",
            "-H", "X-GitHub-Api-Version: 2022-11-28",
            "-H", "User-Agent: disclosure-submit/1.0",
            "-w", "\n%{http_code}"]
    if token:
        args += ["-H", "Authorization: Bearer " + token]
    tmp = None
    if payload is not None:
        fd, tmp = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        args += ["-H", "Content-Type: application/json", "--data-binary", "@" + tmp]
    try:
        rc, out, err = curl(args, timeout=timeout)
    finally:
        if tmp and os.path.exists(tmp):
            os.remove(tmp)
    if rc != 0 and not out:
        return 0, {"error": err.strip() or "curl failed rc=%d" % rc}
    body, _, code = out.rpartition("\n")
    try:
        parsed = json.loads(body) if body.strip() else {}
    except ValueError:
        parsed = body.strip()
    try:
        status = int(code.strip())
    except ValueError:
        status = 0
    return status, parsed


# -------------------------------------------------------------------------- spec
def load_spec():
    data = json.loads(SPEC.read_text(encoding="utf-8"))
    for item in data["issues"]:
        body_path = HERE / item["body_file"]
        if not body_path.exists():
            sys.exit("missing body file: %s" % body_path)
        item["body"] = body_path.read_text(encoding="utf-8").strip()
    return data


def token():
    for env in ("GH_TOKEN", "GITHUB_TOKEN"):
        v = os.environ.get(env)
        if v and v.strip():
            return v.strip()
    if TOKEN_FILE.exists():
        v = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if v:
            return v
    return None


def prefill_url(item):
    q = urllib.parse.urlencode(
        {"title": item["title"], "body": item["body"]},
        quote_via=urllib.parse.quote)
    return "https://github.com/%s/issues/new?%s" % (item["repo"], q)


# ------------------------------------------------------------------------ modes
def mode_dry(spec):
    OUT.mkdir(exist_ok=True)
    print("=" * 78)
    print("DRY RUN - nothing is sent. Payloads written to %s" % OUT)
    print("=" * 78)
    for item in spec["issues"]:
        slug = item["slug"]
        doc = "# %s\n\n`%s` %s\n\n---\n\n%s\n" % (
            item["title"], item["package"], item["version"], item["body"])
        (OUT / ("issue-%s.md" % slug)).write_text(doc, encoding="utf-8")
        url = prefill_url(item)
        url_file = OUT / ("url-%s.txt" % slug)
        url_file.write_text(url, encoding="utf-8")
        print("\n### %s  (%s)" % (slug, item["repo"]))
        print("    title  : %s" % item["title"])
        print("    body   : %d chars  -> out/issue-%s.md" % (len(item["body"]), slug))
        print("    url    : out/url-%s.txt  (%d chars%s)"
              % (slug, len(url), "" if len(url) < 7500 else ", LONG - may truncate"))
        print("    head   : %s..." % url[:96])
    print("\nNext: `submit.py open` fires the prefilled links in the default browser,")
    print("      or `submit.py api` posts them headlessly once a token exists.")


def mode_open(spec):
    """Open the prefilled 'new issue' URLs in the default browser (Edge)."""
    OUT.mkdir(exist_ok=True)
    for item in spec["issues"]:
        url = prefill_url(item)
        (OUT / ("url-%s.txt" % item["slug"])).write_text(url, encoding="utf-8")
        try:
            os.startfile(url)          # hands the URL straight to the default browser
        except OSError:
            subprocess.run('cmd /c start "" "%s"' % url, shell=True)
        print("[opened] %s -> %s" % (item["slug"], item["repo"]))
    print("Confirm the title and body arrived intact, then press 'Submit new issue'.")


def mode_check(spec):
    print("=" * 78)
    print("DUPLICATE CHECK (unauthenticated search API, ~10 req/min)")
    print("=" * 78)
    ok = True
    for item in spec["issues"]:
        print("\n### %s" % item["repo"])
        for term in item["dup_probe"]:
            q = "repo:%s %s in:title,body" % (item["repo"], term)
            path = "/search/issues?per_page=4&q=" + urllib.parse.quote(q)
            status, data = api("GET", path)
            if status != 200 or not isinstance(data, dict):
                print("    %-26s HTTP %s -> search unavailable" % (term, status))
                if status in (403, 429):
                    print("    rate limited; wait a minute and retry")
                    return False
                ok = False
                continue
            total = data.get("total_count", 0)
            print("    %-26s total %s" % (term, total))
            for hit in data.get("items", [])[:4]:
                print("        #%-5s [%-6s] %s" % (hit["number"], hit["state"],
                                                   hit["title"][:66]))
        print("    -> if none of the titles above describe this report, it is new")
    return ok


def mode_api(spec):
    tok = token()
    if not tok:
        sys.exit(
            "no token found.\n"
            "  1) create one: https://github.com/settings/tokens/new"
            "?scopes=public_repo&description=disclosure\n"
            "  2) save it to %s\n"
            "     or export GH_TOKEN=...\n"
            "  (no token? use `dry` and click the prefilled link instead)" % TOKEN_FILE)
    status, me = api("GET", "/user", tok)
    if status != 200:
        sys.exit("token rejected (HTTP %s): %s" % (status, str(me)[:200]))
    print("authenticated as %s" % me.get("login"))

    for item in spec["issues"]:
        payload = {"title": item["title"], "body": item["body"]}
        status, data = api("POST", "/repos/%s/issues" % item["repo"], tok, payload)
        if status == 201:
            print("[ok]   %s -> %s" % (item["slug"], data.get("html_url")))
        elif status == 410:
            print("[skip] %s issues are disabled" % item["slug"])
        else:
            msg = data.get("message") if isinstance(data, dict) else str(data)[:200]
            print("[fail] %s HTTP %s: %s" % (item["slug"], status, msg))


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "dry"
    spec = load_spec()
    if mode == "dry":
        mode_dry(spec)
    elif mode == "check":
        mode_check(spec)
    elif mode == "api":
        mode_api(spec)
    elif mode == "open":
        mode_open(spec)
    else:
        sys.exit("usage: submit.py [dry|check|api|open]")


if __name__ == "__main__":
    main()
