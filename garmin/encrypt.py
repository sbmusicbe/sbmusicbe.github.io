#!/usr/bin/env python3
"""Versleutelt data.json -> data.enc.json (AES-256-GCM, sleutel via PBKDF2-SHA256).
Gebruik: GARMIN_PASSWORD='...' python3 garmin/encrypt.py [invoer.json] [uitvoer.json]
De pagina ontsleutelt dit in de browser; zonder wachtwoord is de data onleesbaar."""
import base64, json, os, sys
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITER = 600_000
src = sys.argv[1] if len(sys.argv) > 1 else "garmin/data.json"
dst = sys.argv[2] if len(sys.argv) > 2 else "garmin/data.enc.json"
pw = os.environ.get("GARMIN_PASSWORD", "")
if len(pw) < 12:
    sys.exit("Zet GARMIN_PASSWORD (minstens 12 tekens)")
raw = json.dumps(json.load(open(src)), separators=(",", ":")).encode()
salt, iv = os.urandom(16), os.urandom(12)
key = PBKDF2HMAC(hashes.SHA256(), 32, salt, ITER).derive(pw.encode())
ct = AESGCM(key).encrypt(iv, raw, None)
b = lambda x: base64.b64encode(x).decode()
json.dump({"v": 1, "iter": ITER, "salt": b(salt), "iv": b(iv), "ct": b(ct)}, open(dst, "w"))
print("OK", dst)
