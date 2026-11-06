#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Drive the Edge instance that was started with --remote-debugging-port=9222.

  python cdp_issue.py probe  <issue_url>    report auth state + form contents
  python cdp_issue.py submit <issue_url>    fill if needed, click submit, report URL

The browser session comes from a *copy* of the Edge profile, so Edge itself does
the cookie decryption - no key extraction, no token.
"""

import json
import os
import sys
import time
import urllib.request

for _v in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"):
    os.environ.pop(_v, None)
os.environ["no_proxy"] = "*"

import websocket  # noqa: E402

DEBUG = "http://127.0.0.1:9222"


def http_json(path):
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with op.open(DEBUG + path, timeout=5) as r:
        return json.loads(r.read().decode())


class Page:
    def __init__(self):
        targets = [t for t in http_json("/json/list") if t.get("type") == "page"]
        if not targets:
            raise SystemExit("no page target; is the debug Edge running?")
        self.ws_url = targets[0]["webSocketDebuggerUrl"]
        self.ws = websocket.create_connection(self.ws_url, timeout=30)
        self.id = 0
        self.send("Page.enable")
        self.send("Runtime.enable")

    def send(self, method, **params):
        self.id += 1
        self.ws.send(json.dumps({"id": self.id, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.id:
                if "error" in msg:
                    raise RuntimeError("%s -> %s" % (method, msg["error"]))
                return msg.get("result", {})

    def js(self, expr, timeout=15):
        r = self.send("Runtime.evaluate", expression=expr, returnByValue=True,
                      awaitPromise=True, timeout=timeout * 1000)
        if r.get("exceptionDetails"):
            return None
        return r.get("result", {}).get("value")

    def goto(self, url, want=None, timeout=45):
        self.send("Page.navigate", url=url)
        end = time.time() + timeout
        while time.time() < end:
            time.sleep(1)
            try:
                state = self.js("document.readyState")
            except Exception:
                state = None
            if state == "complete":
                href = self.js("location.href") or ""
                if want is None or want in href:
                    return href
        return self.js("location.href") or ""


PROBE = r"""
(() => {
  const out = {
    href: location.href,
    title: document.title,
    logged_in: !!document.querySelector('meta[name="user-login"]'),
    login: (document.querySelector('meta[name="user-login"]')||{}).content || null,
    has_form: !!document.querySelector('form'),
    fields: {}
  };
  for (const [k, sel] of [
      ['title', 'input[name="issue[title]"]'],
      ['body',  'textarea[name="issue[body]"]'],
      ['comment_body', '#new_issue textarea'],
      ['md_body', 'textarea[name="issue[body]"], .js-comment-body textarea']]) {
    const el = document.querySelector(sel);
    if (el) out.fields[k] = (el.value || '').length;
  }
  const btns = [...document.querySelectorAll('button')]
      .map(b => (b.innerText || '').trim())
      .filter(t => /submit|comment|create/i.test(t));
  out.buttons = btns.slice(0, 8);
  return JSON.stringify(out);
})()
"""

SUBMIT = r"""
(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const btns = [...document.querySelectorAll('button, input[type=submit]')];
  const target = btns.find(b => /^Submit new issue$/i.test(norm(b.innerText || b.value)))
              || btns.find(b => /submit new issue/i.test(norm(b.innerText || b.value)));
  if (!target) return JSON.stringify({clicked: false,
      seen: btns.map(b => norm(b.innerText || b.value)).slice(0, 12)});
  if (target.disabled) return JSON.stringify({clicked: false, reason: 'disabled'});
  target.click();
  return JSON.stringify({clicked: true, label: norm(target.innerText || target.value)});
})()
"""


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    mode, url = sys.argv[1], sys.argv[2]
    page = Page()
    print("attached:", page.ws_url.split("/")[-1][:12])
    href = page.goto(url, want="/issues/new", timeout=60)
    print("landed  :", href[:110])
    state = json.loads(page.js(PROBE) or "{}")
    print("state   :", json.dumps(state, ensure_ascii=False)[:600])

    if not state.get("logged_in"):
        print("\nNOT AUTHENTICATED in this profile - cookie did not survive the copy.")
        return 2

    if mode == "probe":
        print("\nprobe only, nothing clicked")
        return 0

    if mode == "submit":
        if not state.get("fields", {}).get("body"):
            print("\nbody field is empty - prefill did not survive, aborting")
            return 3
        res = json.loads(page.js(SUBMIT) or "{}")
        print("click   :", res)
        if not res.get("clicked"):
            return 4
        end = time.time() + 40
        while time.time() < end:
            time.sleep(2)
            now = page.js("location.href") or ""
            if "/issues/" in now and "/new" not in now:
                print("created :", now)
                return 0
        print("timeout : still at", page.js("location.href"))
        return 5
    return 0


if __name__ == "__main__":
    sys.exit(main())
