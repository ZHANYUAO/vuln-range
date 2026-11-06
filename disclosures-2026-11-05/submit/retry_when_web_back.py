#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Keep retrying the json-logic-js submission while github.com is unreachable.

api.github.com answers fine, but the web host times out from this network.
So: poll github.com, and the moment it answers, drive the already-prepared
Edge tab and submit.
"""

import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.request

for _v in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"):
    os.environ.pop(_v, None)
os.environ["no_proxy"] = "*"
HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))

MAX_MINUTES = 35
POLL_SECONDS = 45


def web_up(timeout=10):
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    t0 = time.time()
    try:
        with op.open("https://github.com/", timeout=timeout) as r:
            return r.status == 200, time.time() - t0
    except Exception as e:
        return False, "%s" % type(e).__name__


def already_done():
    f = HERE / "out" / "submitted.json"
    if not f.exists():
        return None
    d = json.loads(f.read_text(encoding="utf-8"))
    return d.get("json-logic-js")


def main():
    if already_done():
        print("[skip] already submitted: %s" % already_done(), flush=True)
        return 0

    deadline = time.time() + MAX_MINUTES * 60
    while time.time() < deadline:
        ok, info = web_up()
        left = int((deadline - time.time()) / 60)
        if ok:
            print("[net] github.com back in %.2fs - submitting" % info, flush=True)
            r = subprocess.run([sys.executable, "submit_now.py", "url", "json-logic-js"],
                               cwd=str(HERE), capture_output=True, text=True, timeout=600)
            print(r.stdout[-2000:], flush=True)
            if already_done():
                print("[done] %s" % already_done(), flush=True)
                return 0
            print("[retry] not created yet, keep polling", flush=True)
        else:
            print("[net] github.com down (%s), %dm left" % (info, left), flush=True)
        time.sleep(POLL_SECONDS)
    print("[give-up] github.com still unreachable after %dm" % MAX_MINUTES, flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())
