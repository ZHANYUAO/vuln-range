"""下载 Docker Desktop Installer（带长度校验，吸取之前 tgz Range 追加损坏的教训）。

用法: python dl_docker_desktop.py
产物: ../_dl/DockerDesktopInstaller.exe + .sha256
"""
import hashlib
import os
import sys
import time
import urllib.request

URL = ("https://desktop.docker.com/win/main/amd64/"
       "Docker%20Desktop%20Installer.exe")
ROOT = os.path.dirname(os.getcwd())
DEST_DIR = os.path.join(ROOT, "_dl")
DEST = os.path.join(DEST_DIR, "DockerDesktopInstaller.exe")

OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def head_len(url):
    try:
        r = OP.open(urllib.request.Request(url, method="HEAD"), timeout=60)
        return int(r.headers.get("Content-Length") or 0), r.getcode()
    except Exception as e:
        print("HEAD ERR %r" % (e,), flush=True)
        return 0, -1


def download(url, dest, total, attempts=10):
    """每次尝试都从零重下到临时文件，下完校验长度/md5 通过才替换。"""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for a in range(attempts):
        tmp = dest + ".part%d" % (a + 1)
        if os.path.exists(tmp):
            os.remove(tmp)
        try:
            r = OP.open(urllib.request.Request(url), timeout=180)
            h = hashlib.sha256()
            n = 0
            t0 = time.time()
            last = t0
            with open(tmp, "wb") as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
                    h.update(chunk)
                    n += len(chunk)
                    now = time.time()
                    if now - last >= 15:
                        pct = (n * 100.0 / total) if total else 0
                        print("  %.1f%%  %d/%d bytes  %.0fs  %.1f MB/s"
                              % (pct, n, total, now - t0,
                                 n / 1e6 / max(now - t0, 1)), flush=True)
                        last = now
            el = time.time() - t0
            print("attempt %d -> %d bytes in %.0fs" % (a + 1, n, el), flush=True)
            if total and n != total:
                print("  长度不符（期望 %d），丢弃重来" % total, flush=True)
                continue
            os.replace(tmp, dest)
            with open(dest + ".sha256", "w") as f:
                f.write(h.hexdigest() + "\n")
            print("OK  sha256=%s" % h.hexdigest(), flush=True)
            return True
        except Exception as e:
            print("attempt %d ERR %r" % (a + 1, e), flush=True)
            time.sleep(5)
    return False


def main():
    total, code = head_len(URL)
    print("Content-Length=%d (HTTP %s)" % (total, code), flush=True)
    if os.path.exists(DEST) and total and os.path.getsize(DEST) == total:
        print("已存在且长度一致，跳过下载", flush=True)
        return 0
    ok = download(URL, DEST, total)
    print("RESULT=%s" % ("OK" if ok else "FAIL"), flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
