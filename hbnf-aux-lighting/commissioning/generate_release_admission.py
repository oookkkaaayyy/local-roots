#!/usr/bin/env python3
"""Bind a read-only AUX review disposition to one build's source and firmware."""
from __future__ import annotations
import argparse, hashlib, json, pathlib, re, tempfile

INSTALLED_AUX_SHA256 = "152a795c6dcc5ea396687aee29d15a3e569dd15becfa6537b347e51a09e54e95"

def generate(firmware: pathlib.Path, metrics: pathlib.Path) -> dict:
    values={}
    for line in metrics.read_text().splitlines():
        if "=" in line:
            key,value=line.split("=",1);values[key.strip()]=value.strip()
    source=values.get("github_sha","")
    if not re.fullmatch(r"[0-9a-f]{40}",source):
        raise ValueError("build metrics must identify the exact 40-character source commit")
    firmware_sha=hashlib.sha256(firmware.read_bytes()).hexdigest()
    if values.get("firmware_sha256")!=firmware_sha:
        raise ValueError("firmware bytes do not match the exact build metrics")
    return {
      "schema":"hbnf-aux-release-admission-v1",
      "status":"REVIEW_ONLY",
      "candidate_source_commit":source,
      "candidate_firmware_sha256":firmware_sha,
      "installed_firmware_sha256":INSTALLED_AUX_SHA256,
      "installed_baseline_evidence":"historical reported baseline; fresh device confirmation required",
      "rollback_artifact":None,
      "blocker_code":"EXACT_INSTALLED_FIRMWARE_ROLLBACK_MISSING",
      "resumption_condition":"Freshly confirm the installed AUX baseline, capture the complete installed firmware image, verify its hash, retain and rehearse restoration of those exact bytes, then issue a new candidate-specific release admission."
    }

def selftest():
    with tempfile.TemporaryDirectory() as td:
        root=pathlib.Path(td);fw=root/"candidate.bin";fw.write_bytes(b"candidate")
        sha=hashlib.sha256(fw.read_bytes()).hexdigest();commit="a"*40
        mt=root/"FINAL_METRICS.txt";mt.write_text(f"github_sha={commit}\nfirmware_sha256={sha}\n")
        out=generate(fw,mt)
        assert out["status"]=="REVIEW_ONLY" and out["candidate_source_commit"]==commit
        assert out["candidate_firmware_sha256"]==sha and out["rollback_artifact"] is None
        mt.write_text(f"github_sha={commit}\nfirmware_sha256={'0'*64}\n")
        try: generate(fw,mt);raise AssertionError("mismatched firmware metrics passed")
        except ValueError as e: assert "do not match" in str(e)
    print("AUX_RELEASE_ADMISSION_SELFTEST_PASS")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--firmware",type=pathlib.Path)
    ap.add_argument("--metrics",type=pathlib.Path)
    ap.add_argument("--out",type=pathlib.Path)
    ap.add_argument("--selftest",action="store_true")
    a=ap.parse_args()
    if a.selftest: selftest();return
    if not a.firmware or not a.metrics or not a.out: ap.error("--firmware, --metrics, and --out are required")
    result=generate(a.firmware,a.metrics)
    a.out.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    print(f"AUX_RELEASE_REVIEW_ONLY source={result['candidate_source_commit']} firmware={result['candidate_firmware_sha256']} blocker={result['blocker_code']}")

if __name__=="__main__": main()
