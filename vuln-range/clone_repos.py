#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""绕过 github.com 网页直连不通的限制：用 api.github.com 查默认分支 + codeload 下 tarball。
两个域名对本机直连可达（实测 0.8s / 1.9s），github.com:443 直连 21s 超时。"""
import io
import json
import os
import tarfile
import urllib.request

REPOS = ["usestrix/strix", "KeygraphHQ/shannon", "vxcontrol/pentagi"]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def get(url, timeout=60):
    return OP.open(urllib.request.Request(url), timeout=timeout).read()


for repo in REPOS:
    name = repo.split("/")[1]
    dest = os.path.join(ROOT, name)
    if os.path.isdir(dest) and os.listdir(dest):
        print("[skip] %s 已存在" % name)
        continue
    try:
        meta = json.loads(get("https://api.github.com/repos/" + repo).decode())
        br = meta.get("default_branch", "main")
        url = "https://codeload.github.com/%s/tar.gz/refs/heads/%s" % (repo, br)
        raw = get(url, timeout=300)
        print("[get ] %s (%s, %.1f MB, branch=%s)" % (name, repo, len(raw) / 1e6, br))
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tf:
            tmp = os.path.join(ROOT, "_tmp_" + name)
            tf.extractall(tmp)
            inner = os.path.join(tmp, os.listdir(tmp)[0])
            os.replace(inner, dest)
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)
        print("[done] %s -> %s (%d 项)" % (name, dest, len(os.listdir(dest))))
    except Exception as e:
        print("[FAIL] %s : %r" % (name, e))
