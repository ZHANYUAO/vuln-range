#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Keep a headless-ish Edge with --remote-debugging-port=9222 alive.

The sandbox kills child processes when the launching shell exits, so this runs
as a long-lived supervisor: launch, watch, relaunch if it dies.
"""

import json
import os
import subprocess
import sys
import time
import urllib.request

for _v in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"):
    os.environ.pop(_v, None)

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
# Junction to the *real* profile: same data, different path string, so Edge 136+
# does not suppress --remote-debugging-port and app-bound cookies still decrypt.
PROFILE = r"C:\Users\yuao\edgejunc"
FLAGS = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP


def alive():
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with op.open("http://127.0.0.1:9222/json/version", timeout=2) as r:
            return json.loads(r.read().decode()).get("Browser")
    except Exception:
        return None


def spawn():
    subprocess.Popen([EDGE, "--remote-debugging-port=9222",
                      "--user-data-dir=" + PROFILE,
                      "--no-first-run", "--no-default-browser-check",
                      "--proxy-server=direct://", "--proxy-bypass-list=*",
                      "--disable-features=msEdgeSidebarV2",
                      "about:blank"],
                     creationflags=FLAGS, close_fds=True,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


print("[supervisor] starting", flush=True)
spawn()
for i in range(1200):          # ~20 minutes
    time.sleep(5)
    v = alive()
    if not v:
        print("[supervisor] browser gone, relaunching (%d)" % i, flush=True)
        subprocess.run(["taskkill", "/F", "/IM", "msedge.exe"], capture_output=True)
        time.sleep(2)
        spawn()
    elif i % 12 == 0:
        print("[supervisor] alive %s (%d)" % (v, i), flush=True)
print("[supervisor] exit", flush=True)
sys.exit(0)
