#!/usr/bin/env python3
"""Offline validation of a Release07 recovery receipt and exact local BIN."""
from __future__ import annotations
import argparse,hashlib,json,pathlib

RELEASE="hbnf-matrix-coordinated-v1-20261002-07"
SHA="8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab"
SIZE=1458624
MATRIX_MAC="704bca5b345c"
AUX_MAC="8c94df55c34c"

def audit(receipt_path,artifact_path,expected_release=RELEASE,expected_sha=SHA,expected_size=SIZE):
    p=pathlib.Path(receipt_path);r=json.loads(p.read_text());b=pathlib.Path(artifact_path).read_bytes()
    sha=hashlib.sha256(b).hexdigest();errors=[]
    if sha!=expected_sha or r.get("recovery_sha256")!=expected_sha:errors.append("Release07 artifact/receipt SHA mismatch")
    if len(b)!=expected_size or r.get("recovery_size_bytes")!=expected_size:errors.append("Release07 artifact/receipt size mismatch")
    if r.get("installed_release_id")!=expected_release or r.get("hbnf_release")!=expected_release or r.get("runtime_candidate")!=expected_release:
        errors.append("runtime release identity mismatch")
    if r.get("ota_http_status")!=200 or r.get("ota_response_contains_update_successful") is not True:
        errors.append("OTA receipt lacks successful HTTP/update acknowledgement")
    if str(r.get("matrix_mac","")).replace(":","").lower()!=MATRIX_MAC:errors.append("Matrix MAC mismatch")
    if str(r.get("aux_mac","")).replace(":","").lower()!=AUX_MAC:errors.append("AUX MAC mismatch")
    for key in ("matrix_on","aux_ddp_live"):
        if r.get(key) is not True:errors.append(f"health flag failed/missing: {key}")
    for key in ("observed_unix","uptime_seconds","free_heap_bytes","aux_fps"):
        if not isinstance(r.get(key),(int,float)):errors.append(f"health telemetry missing: {key}")
    return {"schema":"hbnf-foundation-recovery-audit-v1","status":"PASS" if not errors else "FAIL",
            "errors":errors,"expected_release_id":expected_release,"artifact_sha256":sha,
            "artifact_size_bytes":len(b),"recovery_sequence":r.get("recovery_sequence"),
            "runtime_identity_verified":not any("identity" in e for e in errors),
            "matrix_aux_health_verified":not any("health" in e or "telemetry" in e for e in errors)}

def main():
    p=argparse.ArgumentParser();p.add_argument("--receipt",required=True);p.add_argument("--artifact",required=True)
    p.add_argument("--output");a=p.parse_args();r=audit(a.receipt,a.artifact)
    raw=json.dumps(r,indent=2,sort_keys=True)+"\n"
    if a.output:pathlib.Path(a.output).write_text(raw)
    print(raw,end="");return 0 if r["status"]=="PASS" else 2
if __name__=="__main__":raise SystemExit(main())
