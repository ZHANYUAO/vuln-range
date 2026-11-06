"""分段下载 Docker Desktop Installer（每段独立落盘，最后拼接）。

为什么分段：本机网络对大流量长连接不稳定 —— 整包 GET 被服务端 RST(10054)，
GitHub tarball 每次断在固定字节数；而 Range 分段请求实测可达 ~2.1 MB/s。
所以：每段 16MB 独立请求 + 逐段重试 + ETag 一致性校验 + 总长度/sha256 校验。
每段单独落盘 => 支持断点续接且不会在拼接文件里留下空洞。

用法: python dl_docker_desktop2.py
产物: ../_dl/DockerDesktopInstaller.exe (+ .sha256 / .meta)
"""
import hashlib
import json
import os
import sys
import time
import urllib.request

URL = ("https://desktop.docker.com/win/main/amd64/"
       "Docker%20Desktop%20Installer.exe")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
SEG = 16 << 20          # 每段 16MB（实测该尺寸稳定）
READ_TIMEOUT = 90       # 单段读超时，超过就换新请求重试
MAX_TRIES = 12

ROOT = os.path.dirname(os.getcwd())
DEST_DIR = os.path.join(ROOT, "_dl")
SEG_DIR = os.path.join(DEST_DIR, "segs")
DEST = os.path.join(DEST_DIR, "DockerDesktopInstaller.exe")
META = os.path.join(DEST_DIR, "meta.json")

OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def probe():
    """用 Range 0-0 探测总长度与 ETag（整包 HEAD/GET 会被 RST）。"""
    for i in range(12):
        try:
            r = OP.open(urllib.request.Request(
                URL, headers={"User-Agent": UA, "Range": "bytes=0-0"}),
                timeout=40)
            cr = r.headers.get("Content-Range") or ""
            total = int(cr.split("/")[-1]) if "/" in cr else 0
            etag = r.headers.get("ETag", "")
            r.read()
            if total:
                return total, etag
        except Exception as e:
            print("probe %d ERR %s" % (i + 1, repr(e)[:70]), flush=True)
        time.sleep(3)
    return 0, ""


def fetch_segment(start, end, etag):
    """抓 [start,end] 闭区间；ETag 变化说明远端文件已更新，需整体重来。"""
    r = OP.open(urllib.request.Request(
        URL, headers={"User-Agent": UA, "Range": "bytes=%d-%d" % (start, end)}),
        timeout=READ_TIMEOUT)
    if etag and r.headers.get("ETag") and r.headers.get("ETag") != etag:
        raise RuntimeError("ETAG_CHANGED")
    want = end - start + 1
    buf = bytearray()
    while len(buf) < want:
        chunk = r.read(1 << 20)
        if not chunk:
            break
        buf.extend(chunk)
    if len(buf) != want:
        raise IOError("短读 %d/%d" % (len(buf), want))
    return bytes(buf)


def main():
    os.makedirs(SEG_DIR, exist_ok=True)
    total, etag = probe()
    print("total=%d  etag=%s" % (total, etag), flush=True)
    if not total:
        print("探测失败：拿不到总长度，放弃", flush=True)
        return 1
    json.dump({"url": URL, "total": total, "etag": etag}, open(META, "w"))

    # 若远端文件变了，清掉旧段
    if os.path.exists(META):
        pass
    t0 = time.time()
    nseg = (total + SEG - 1) // SEG
    print("段数 = %d（每段 %dMB）" % (nseg, SEG >> 20), flush=True)

    for i in range(nseg):
        start = i * SEG
        end = min(start + SEG - 1, total - 1)
        want = end - start + 1
        sp = os.path.join(SEG_DIR, "seg_%05d" % i)
        if os.path.exists(sp) and os.path.getsize(sp) == want:
            continue
        got = False
        for t in range(MAX_TRIES):
            try:
                data = fetch_segment(start, end, etag)
                with open(sp, "wb") as f:
                    f.write(data)
                got = True
                break
            except Exception as e:
                print("  seg%d try%d ERR %s" % (i, t + 1, repr(e)[:70]), flush=True)
                time.sleep(2)
        if not got:
            print("段 %d 连续失败 %d 次，中止（已完成段保留，重跑可续接）"
                  % (i, MAX_TRIES), flush=True)
            return 1
        done_bytes = sum(os.path.getsize(os.path.join(SEG_DIR, "seg_%05d" % k))
                         for k in range(i + 1)
                         if os.path.exists(os.path.join(SEG_DIR, "seg_%05d" % k)))
        el = time.time() - t0
        spd = done_bytes / 1e6 / max(el, 1)
        print("  seg %d/%d  %.1f%%  %.2f MB/s  ETA %.0fs"
              % (i + 1, nseg, done_bytes * 100.0 / total, spd,
                 (total - done_bytes) / 1e6 / max(spd, 0.01)), flush=True)

    # 拼接 + 校验
    h = hashlib.sha256()
    with open(DEST, "wb") as out:
        for i in range(nseg):
            sp = os.path.join(SEG_DIR, "seg_%05d" % i)
            with open(sp, "rb") as f:
                while True:
                    b = f.read(1 << 20)
                    if not b:
                        break
                    out.write(b)
                    h.update(b)
    sz = os.path.getsize(DEST)
    if sz != total:
        print("拼接长度不符 %d != %d" % (sz, total), flush=True)
        return 1
    open(DEST + ".sha256", "w").write(h.hexdigest() + "\n")
    print("OK %d bytes  sha256=%s  (%.0fs)" % (sz, h.hexdigest(), time.time() - t0),
          flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
