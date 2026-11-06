#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""后台下载 shannon / pentagi 源码（较大，前台易被超时杀）。"""
import io
import json
import os
import shutil
import tarfile
import time
import urllib.request

OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def one(repo):
    name = repo.split("/")[1]
    dest = os.path.join(ROOT, name)
    if os.path.isdir(dest) and os.listdir(dest):
        print("skip %s" % name, flush=True)
        return
    m = json.loads(OP.open(urllib.request.Request(
        "https://api.github.com/repos/" + repo), timeout=30).read().decode())
    br = m.get("default_branch", "main")
    t0 = time.time()
    raw = OP.open(urllib.request.Request(
        "https://codeload.github.com/%s/tar.gz/refs/heads/%s" % (repo, br)), timeout=600).read()
    print("%s tarball %.1fMB %.1fs" % (name, len(raw) / 1e6, time.time() - t0), flush=True)
    tmp = os.path.join(ROOT, "_tmp_" + name)
    os.makedirs(tmp, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tf:
        members = tf.getmembers()
        print("%s members=%d, extracting..." % (name, len(members)), flush=True)
        for i, mem in enumerate(members):
            try:
                tf.extract(mem, tmp)
            except Exception as e:
                print("  skip member %s: %r" % (mem.name[:60], e), flush=True)
    inner = os.path.join(tmp, os.listdir(tmp)[0])
    if os.path.isdir(dest):
        shutil.rmtree(dest, ignore_errors=True)
    os.rename(inner, dest)
    shutil.rmtree(tmp, ignore_errors=True)
    print("%s DONE %d 项" % (name, len(os.listdir(dest))), flush=True)


for r in ["vxcontrol/pentagi", "KeygraphHQ/shannon"]:
    try:
        one(r)
    except Exception as e:
        print("FAIL %s %r" % (r, e), flush=True)
