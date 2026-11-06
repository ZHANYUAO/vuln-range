#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Wait for a GitHub login in the debug Edge, then submit both issues unattended.

Flow:
  1. poll https://github.com/ until meta[name=user-login] is populated
  2. for each issue: open the prefilled /issues/new URL
  3. if the body field is empty (prefill dropped), fill it via the native setter
  4. click "Submit new issue", wait for the /issues/<n> redirect, print the URL
"""

import json
import os
import sys
import time

for _v in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"):
    os.environ.pop(_v, None)

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cdp_issue import Page  # noqa: E402

SPEC = json.load(open(os.path.join(HERE, "issues.json"), encoding="utf-8"))
MAX_WAIT = 15 * 60

LOGIN_CHECK = r"""
(() => {
  const m = document.querySelector('meta[name="user-login"]');
  return (m && m.content) ? m.content : "";
})()
"""

FILL = r"""
((title, body) => {
  const setT = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const ti = document.querySelector('input[name="issue[title]"]');
  const bo = document.querySelector('textarea[name="issue[body]"]') ||
             document.querySelector('#issue_body');
  if (ti && !ti.value) setT(ti, title);
  if (bo && !bo.value) setT(bo, body);
  return JSON.stringify({
    title_len: ti ? ti.value.length : -1,
    body_len: bo ? bo.value.length : -1
  });
})(%s, %s)
"""

CLICK = r"""
(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const b = [...document.querySelectorAll('button, input[type=submit]')]
      .find(x => /^submit new issue$/i.test(norm(x.innerText || x.value)));
  if (!b) return JSON.stringify({clicked: false});
  if (b.disabled) return JSON.stringify({clicked: false, reason: 'disabled'});
  b.click();
  return JSON.stringify({clicked: true});
})()
"""


def wait_login(page):
    """Open the login page once, then only *observe* - never re-navigate while the
    user is typing, otherwise the form gets wiped every poll."""
    start = time.time()
    page.goto("https://github.com/login", want="/login", timeout=40)
    print("[wait] login page is open in the Edge window - waiting for sign-in",
          flush=True)
    while time.time() - start < MAX_WAIT:
        time.sleep(7)
        try:
            user = page.js(LOGIN_CHECK)
        except Exception:
            continue
        if user:
            print("[auth] logged in as %s" % user, flush=True)
            return user
        if int(time.time() - start) % 60 < 8:
            where = (page.js("location.pathname") or "?")
            print("[wait] still waiting (%ds, at %s)"
                  % (int(time.time() - start), where), flush=True)
    return ""


def submit_one(page, item):
    body = open(os.path.join(HERE, item["body_file"]), encoding="utf-8").read().strip()
    url = ("https://github.com/%s/issues/new?title=%s&body=%s"
           % (item["repo"],
              __import__("urllib.parse", fromlist=["quote"]).quote(item["title"]),
              __import__("urllib.parse", fromlist=["quote"]).quote(body)))
    href = page.goto(url, want="/issues/new", timeout=60)
    print("[%s] landed: %s" % (item["slug"], href[:80]), flush=True)
    if "/login" in href:
        print("[%s] kicked to login - stopping" % item["slug"], flush=True)
        return None
    filled = page.js(FILL % (json.dumps(item["title"]), json.dumps(body)))
    print("[%s] fields: %s" % (item["slug"], filled), flush=True)
    res = page.js(CLICK)
    print("[%s] click: %s" % (item["slug"], res), flush=True)
    end = time.time() + 45
    while time.time() < end:
        time.sleep(2)
        now = page.js("location.href") or ""
        if "/issues/" in now and "/new" not in now:
            print("[%s] CREATED %s" % (item["slug"], now), flush=True)
            return now
    print("[%s] no redirect; final url %s" % (item["slug"], page.js("location.href")),
          flush=True)
    return None


def main():
    page = Page()
    user = wait_login(page)
    if not user:
        print("[abort] no login within %d minutes" % (MAX_WAIT // 60), flush=True)
        return 1
    out = {}
    for item in SPEC["issues"]:
        out[item["slug"]] = submit_one(page, item)
        time.sleep(3)
    print("\n=== RESULT ===", flush=True)
    print(json.dumps(out, ensure_ascii=False, indent=2), flush=True)
    with open(os.path.join(HERE, "out", "submitted.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
