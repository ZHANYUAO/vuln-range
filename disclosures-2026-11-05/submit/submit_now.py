#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Submit the prepared issues through the debug Edge instance.

GitHub's current new-issue form is a React component WITHOUT
input[name="issue[title]"] / textarea[name="issue[body]"], and the button label
is now "Create" (not "Submit new issue"). This module targets the real DOM.

  python submit_now.py current          submit whatever is pre-filled in the active tab
  python submit_now.py url <issue_url>  navigate, verify prefill, submit
"""

import json
import os
import sys
import time
import pathlib

for _v in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"):
    os.environ.pop(_v, None)
os.environ["no_proxy"] = "*"
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from cdp_issue import Page  # noqa: E402

STATE = r"""
JSON.stringify((function(){
  var t = document.querySelector('input[placeholder="Title"]');
  var ta = [...document.querySelectorAll('textarea')]
             .filter(function(e){ return (e.value||'').length > 200; })[0];
  var btns = [...document.querySelectorAll('button')];
  var create = btns.find(function(b){
      return /^\s*Create\b/i.test((b.innerText||b.value||'').replace(/\s+/g,' ').trim());
  });
  return {
    href: location.href,
    path: location.pathname,
    user: (document.querySelector('meta[name="user-login"]')||{}).content || null,
    title_len: t ? (t.value||'').length : -1,
    title_val: t ? (t.value||'').slice(0,120) : null,
    body_len: ta ? (ta.value||'').length : -1,
    has_create: !!create,
    create_label: create ? (create.innerText||'').replace(/\s+/g,' ').trim() : null,
    create_disabled: create ? !!create.disabled : null
  };
})())
"""

CLICK = r"""
JSON.stringify((function(){
  var btns = [...document.querySelectorAll('button')];
  var create = btns.find(function(b){
      return /^\s*Create\b/i.test((b.innerText||b.value||'').replace(/\s+/g,' ').trim());
  });
  if (!create) return {clicked:false, reason:'no create button'};
  if (create.disabled) return {clicked:false, reason:'disabled'};
  create.click();
  return {clicked:true};
})())
"""


def wait_issue(page, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        time.sleep(2)
        href = page.js("location.href") or ""
        if "/issues/" in href and "/new" not in href:
            return href
    return None


def submit(page, want_body_len, label):
    st = json.loads(page.js(STATE) or "{}")
    print("[%s] path=%s user=%s title_len=%s body_len=%s create=%s"
          % (label, st.get("path"), st.get("user"), st.get("title_len"),
             st.get("body_len"), st.get("create_label")))
    if not st.get("user"):
        print("[%s] NOT LOGGED IN" % label)
        return None
    if st.get("title_len", 0) <= 0:
        print("[%s] title empty -> abort" % label)
        return None
    if st.get("body_len", 0) != want_body_len:
        print("[%s] body length mismatch (page=%s expected=%s) -> abort"
              % (label, st.get("body_len"), want_body_len))
        return None
    res = json.loads(page.js(CLICK) or "{}")
    print("[%s] click=%s" % (label, res))
    if not res.get("clicked"):
        return None
    url = wait_issue(page)
    print("[%s] created=%s" % (label, url))
    return url


def body_of(it):
    return pathlib.Path(it["body_file"]).read_text(encoding="utf-8").strip()


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "current"
    out = pathlib.Path("out")
    spec = json.loads(pathlib.Path("issues.json").read_text(encoding="utf-8"))
    by_slug = {i["slug"]: i for i in spec["issues"]}
    page = Page()
    results = {}

    if mode in ("current", "url"):
        slug = sys.argv[2]
        it = by_slug[slug]
        if mode == "url":
            url = (out / ("url-%s.txt" % slug)).read_text(encoding="utf-8").strip()
            page.goto(url, want="/issues/new", timeout=60)
            time.sleep(2)
        results[slug] = submit(page, len(body_of(it)), slug)
    else:
        sys.exit(__doc__)

    f = out / "submitted.json"
    prev = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    prev.update({k: v for k, v in results.items() if v})
    f.write_text(json.dumps(prev, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nRESULTS:", json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
