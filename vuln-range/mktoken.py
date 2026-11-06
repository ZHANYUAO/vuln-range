#!/usr/bin/env python3
"""自签 ARTEX JWT。

用途：本机实例自动化建任务，绕开必须点 UI 的限制。
依据 server/auth.go：HS256 / RegisteredClaims{Subject:"ARTEX"} / key = <exe同目录>/jwt.key
verifyJWT 只校验签名与有效期，不查会话表，故可离线签。
"""
import base64, hmac, hashlib, json, sys, time, os

def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

def sign(secret: bytes) -> str:
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": "ARTEX", "exp": now + 7 * 86400, "iat": now}
    h = b64u(json.dumps(header, separators=(",", ":")).encode())
    p = b64u(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{h}.{p}".encode()
    sig = hmac.new(secret, signing_input, hashlib.sha256).digest()
    return f"{h}.{p}.{b64u(sig)}"

if __name__ == "__main__":
    key_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ARTEX", "jwt.key")
    key_path = os.path.normpath(key_path)
    secret = open(key_path, "rb").read().strip()
    if len(secret) < 32:
        sys.exit("key 长度不足 32")
    print(sign(secret))
