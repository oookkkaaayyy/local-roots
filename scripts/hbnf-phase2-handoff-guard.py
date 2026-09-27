#!/usr/bin/env python3
import argparse, json, sys
from pathlib import Path

REQUIRED_CRITERIA = [
    "core_cart_still_accepted",
    "permanent_https_phone_url",
    "normal_use_requires_no_email_login",
    "one_time_pairing_verified",
    "persistent_access_verified",
    "unpaired_device_rejected",
    "no_auth_tokens_left_in_url",
    "home_screen_install_verified",
    "source_frozen_and_matches_production",
    "local_bridge_device_session_supported",
    "stale_test_pair_tokens_cleaned_or_expired",
    "ipad_compatibility_decided",
]
REQUIRED_BACKEND = [
    "hbnf-cart-control",
    "hbnf-cart-reconcile",
    "hbnf-matrix-adapter",
    "hbnf-aux-adapter",
]

def validate(p):
    errors=[]
    if p.get("schema")!="hbnf-cart-phase1-handoff-v1":
        errors.append("wrong schema")
    if p.get("phase1_finalized") is not True:
        errors.append("Phase 1 is not marked finalized")
    release=p.get("canonical_release") or {}
    if release.get("release_id")!="hbnf-cart-foundation-v1-20260925":
        errors.append("unexpected canonical release_id")
    criteria=p.get("required_exit_criteria") or {}
    for key in REQUIRED_CRITERIA:
        if criteria.get(key) is not True:
            errors.append("exit criterion not satisfied: "+key)
    days=criteria.get("persistent_access_target_days")
    if not isinstance(days,(int,float)) or days < 150:
        errors.append("persistent access target is below 150 days")
    phone=p.get("phone_controller") or {}
    url=phone.get("production_url")
    if not isinstance(url,str) or not url.startswith("https://hbnightflyers.com/"):
        errors.append("permanent phone controller URL is missing or not on hbnightflyers.com HTTPS")
    backend=p.get("final_backend") or {}
    for name in REQUIRED_BACKEND:
        row=backend.get(name) or {}
        if not isinstance(row.get("version"),int) or row["version"] < 1:
            errors.append("missing final backend version: "+name)
        sha=row.get("sha256")
        if not isinstance(sha,str) or len(sha)!=64 or any(c not in "0123456789abcdef" for c in sha):
            errors.append("missing/invalid final backend sha256: "+name)
    return errors

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("--expect-reject",action="store_true")
    args=ap.parse_args()
    p=json.loads(Path(args.manifest).read_text())
    errors=validate(p)
    if args.expect_reject:
        if not errors:
            print("ERROR: placeholder unexpectedly passed")
            return 3
        print("HBNF_PHASE2_HANDOFF_REJECTION=PASS")
        for e in errors: print("BLOCKED:",e)
        return 0
    if errors:
        for e in errors: print("BLOCKED:",e,file=sys.stderr)
        print("HBNF_PHASE2_HANDOFF=BLOCKED",file=sys.stderr)
        return 2
    print("HBNF_PHASE2_HANDOFF=PASS")
    print("PHASE1_PHONE_URL="+p["phone_controller"]["production_url"])
    print("IPAD_COMPATIBLE="+str(bool(p["phone_controller"]["ipad_compatible"])).lower())
    return 0

if __name__=="__main__":
    raise SystemExit(main())
