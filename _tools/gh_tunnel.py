#!/usr/bin/env python3
"""本地 CONNECT 隧道：把 github.com 的 443 强制指向可达的 GitHub 边缘 IP。

为什么需要它：本机 DNS 把 github.com 解析到 20.205.243.166，该 IP 被网络阻断（TCP 超时）；
而 20.200.245.247 可达且确实承载 github.com 的 git 智能协议。
git 不支持 --resolve，但它支持 http.proxy —— 走 CONNECT 时 TLS 仍是端到端的，
SNI 与证书校验都保持完好，不需要 http.sslVerify=false。

用法：
    python gh_tunnel.py 8899
    git -c http.proxy=http://127.0.0.1:8899 push
"""
import socket
import sys
import threading

LISTEN_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
PIN = {
    "github.com": "20.200.245.247",
    "api.github.com": "20.205.243.168",
    "codeload.github.com": "20.200.245.247",
}
LOG = sys.argv[2] if len(sys.argv) > 2 else None


def log(msg):
    line = msg + "\n"
    sys.stderr.write(line)
    sys.stderr.flush()
    if LOG:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line)


def pipe(src, dst, tag):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass
    finally:
        try:
            dst.shutdown(socket.SHUT_WR)
        except Exception:
            pass


def handle(client):
    upstream = None
    try:
        client.settimeout(30)
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = client.recv(4096)
            if not chunk:
                return
            buf += chunk
            if len(buf) > 65536:
                return
        head = buf.split(b"\r\n\r\n")[0].decode("latin-1")
        lines = head.split("\r\n")
        parts = lines[0].split()
        if len(parts) < 2 or parts[0].upper() != "CONNECT":
            client.sendall(b"HTTP/1.1 405 Method Not Allowed\r\n\r\n")
            log("REJECT %s" % lines[0])
            return
        host, _, port = parts[1].partition(":")
        port = int(port or 443)
        target = PIN.get(host, host)
        upstream = socket.create_connection((target, port), timeout=15)
        upstream.settimeout(None)
        client.settimeout(None)
        client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        log("CONNECT %s:%d -> %s:%d" % (host, port, target, port))
        t = threading.Thread(target=pipe, args=(client, upstream, "c->s"), daemon=True)
        t.start()
        pipe(upstream, client, "s->c")
        t.join(timeout=5)
    except Exception as e:
        log("ERR %s: %s" % (type(e).__name__, e))
        try:
            client.sendall(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
        except Exception:
            pass
    finally:
        for s in (client, upstream):
            try:
                if s:
                    s.close()
            except Exception:
                pass


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", LISTEN_PORT))
    srv.listen(50)
    log("listening on 127.0.0.1:%d, pin=%s" % (LISTEN_PORT, PIN))
    while True:
        c, _ = srv.accept()
        threading.Thread(target=handle, args=(c,), daemon=True).start()


if __name__ == "__main__":
    main()
