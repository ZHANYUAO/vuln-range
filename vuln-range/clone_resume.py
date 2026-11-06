import io, json, os, shutil, tarfile, time, urllib.request

OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
ROOT = os.path.dirname(os.getcwd())


def head_size(url):
    req = urllib.request.Request(url, method="HEAD")
    try:
        r = OP.open(req, timeout=60)
        return int(r.headers.get("Content-Length") or 0), dict(r.headers)
    except Exception as e:
        return 0, {"err": repr(e)[:80]}


def valid_tgz(path):
    """下载完先整包校验：能从头到尾遍历且成员数 > 0 才算数。
    2026-10-24 教训：无 Content-Length 时盲目用 Range 续传，服务端忽略 Range 会从头重下，
    追加进去就成了坏 gzip —— 前几个成员能读，之后 zlib.error: invalid code lengths set。"""
    try:
        import tarfile
        with tarfile.open(path, "r:gz") as tf:
            n = 0
            for _ in tf:
                n += 1
                if n > 20000:
                    break
        return n > 0, n
    except Exception as e:
        return False, repr(e)[:80]


def download_resumable(url, dest, attempts=6):
    total, _ = head_size(url)
    print("total bytes = %s (0 = 上游未给长度，此时不能盲信续传)" % total, flush=True)
    for a in range(attempts):
        # 每次都从零下到临时文件；只有完整且校验通过才替换 dest。
        # 不用 Range 续传：实测服务端在未知总长时对 Range 的处理不可靠。
        tmp = dest + ".part%d" % a
        req = urllib.request.Request(url)
        try:
            r = OP.open(req, timeout=180)
            t0 = time.time()
            n = 0
            with open(tmp, "wb") as f:
                while True:
                    chunk = r.read(262144)
                    if not chunk:
                        break
                    f.write(chunk)
                    n += len(chunk)
            print("attempt %d -> %d bytes (%.1fs)" % (a + 1, n, time.time() - t0), flush=True)
            if total and n < total:
                print("  长度不足 %d/%d，丢弃" % (n, total), flush=True)
                os.remove(tmp)
                continue
            ok, info = valid_tgz(tmp)
            if ok:
                os.replace(tmp, dest)
                print("  校验通过，成员数 = %s" % info, flush=True)
                return dest
            print("  整包校验失败：%s，丢弃" % info, flush=True)
            os.remove(tmp)
        except Exception as e:
            print("attempt %d ERR %s" % (a + 1, repr(e)[:90]), flush=True)
            if os.path.exists(tmp):
                os.remove(tmp)
            time.sleep(3)
    return None


def one(repo):
    name = repo.split("/")[1]
    dest = os.path.join(ROOT, name)
    if os.path.isdir(dest) and os.listdir(dest):
        print("skip", name, flush=True)
        return
    br = json.loads(OP.open(urllib.request.Request(
        "https://api.github.com/repos/" + repo), timeout=60).read().decode()).get("default_branch", "main")
    url = "https://codeload.github.com/%s/tar.gz/refs/heads/%s" % (repo, br)
    tgz = os.path.join(ROOT, "_dl_%s.tgz" % name)
    got = download_resumable(url, tgz)
    if not got:
        print("FAIL download", name, flush=True)
        return
    tmp = os.path.join(ROOT, "_tmp_" + name)
    with tarfile.open(tgz, mode="r:gz") as tf:
        tf.extractall(tmp)
    inner = os.path.join(tmp, os.listdir(tmp)[0])
    if os.path.isdir(dest):
        shutil.rmtree(dest, ignore_errors=True)
    os.rename(inner, dest)
    shutil.rmtree(tmp, ignore_errors=True)
    os.remove(tgz)
    print("%s -> %d 项" % (name, len(os.listdir(dest))), flush=True)


for r in ["KeygraphHQ/shannon", "vxcontrol/pentagi"]:
    print("=== " + r + " ===", flush=True)
    one(r)
print("ALL DONE", flush=True)
