#!/usr/bin/env python3
import argparse, hashlib, json, sys
from pathlib import Path

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("handoff")
    ap.add_argument("token_file")
    a=ap.parse_args()
    p=json.loads(Path(a.handoff).read_text())
    token=Path(a.token_file).read_text().strip()
    if len(token)<32:
        print("HBNF_PHASE2_BRIDGE_TOKEN=BLOCKED: token too short",file=sys.stderr)
        return 2
    actual=hashlib.sha256(token.encode()).hexdigest()
    s=p.get("bridge_device_session") or {}
    if actual!=s.get("token_sha256"):
        print("HBNF_PHASE2_BRIDGE_TOKEN=BLOCKED: token hash mismatch",file=sys.stderr)
        return 3
    if s.get("ready") is not True:
        print("HBNF_PHASE2_BRIDGE_TOKEN=BLOCKED: session not ready",file=sys.stderr)
        return 4
    print("HBNF_PHASE2_BRIDGE_TOKEN=PASS")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
