#!/usr/bin/env python3
"""Build deterministic Mac commissioning ZIP with executable launcher mode preserved."""
from __future__ import annotations
import argparse, hashlib, pathlib, zipfile

FILES=[
 "START_HERE.txt","COMMISSION_HBNF_AUX.command","commission_guard.py","commission_operator.py",
 "generate_aux_hardware_plan.py","local_commission.py","HBNF_SP803E_AUX_R3.bin","FINAL_METRICS.txt",
 "firmware-sha256.txt","contract.json","WOW_SCENES_V2.json","README.md","CODEX_RUNBOOK.md","RELEASE_ADMISSION.json"
]
STAMP=(2026,9,22,0,0,0)

def sha256(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def build(src,out):
    missing=[n for n in FILES if not (src/n).is_file()]
    if missing: raise FileNotFoundError("missing distribution files: "+", ".join(missing))
    import json,re
    admission=json.loads((src/"RELEASE_ADMISSION.json").read_text())
    metrics={}
    for line in (src/"FINAL_METRICS.txt").read_text().splitlines():
        if "=" in line:
            k,v=line.split("=",1);metrics[k.strip()]=v.strip()
    firmware_sha=sha256(src/"HBNF_SP803E_AUX_R3.bin")
    source_sha=metrics.get("github_sha","")
    if not (admission.get("schema")=="hbnf-aux-release-admission-v1"
            and admission.get("status")=="REVIEW_ONLY"
            and re.fullmatch(r"[0-9a-f]{40}",source_sha)
            and admission.get("candidate_source_commit")==source_sha
            and admission.get("candidate_firmware_sha256")==firmware_sha==metrics.get("firmware_sha256")
            and admission.get("rollback_artifact") is None
            and admission.get("blocker_code")=="EXACT_INSTALLED_FIRMWARE_ROLLBACK_MISSING"
            and bool(str(admission.get("resumption_condition","")).strip())):
        raise ValueError("distribution is not source/hash-bound REVIEW_ONLY with the exact rollback blocker")
    out.parent.mkdir(parents=True,exist_ok=True)
    if out.exists(): out.unlink()
    with zipfile.ZipFile(out,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name in FILES:
            p=src/name;zi=zipfile.ZipInfo(name,STAMP);zi.create_system=3
            zi.external_attr=(0o100755 if name.endswith(".command") else 0o100644)<<16
            zi.compress_type=zipfile.ZIP_DEFLATED;z.writestr(zi,p.read_bytes())
    with zipfile.ZipFile(out) as z:
        assert z.namelist()==FILES
        assert ((z.getinfo("COMMISSION_HBNF_AUX.command").external_attr>>16)&0o777)==0o755
    return {"sha256":sha256(out),"bytes":out.stat().st_size,"files":len(FILES),"launcherMode":"0755"}

def selftest():
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        root=pathlib.Path(td);src=root/"src";src.mkdir()
        for n in FILES:(src/n).write_text(n+"\n")
        import json,hashlib
        fw=src/"HBNF_SP803E_AUX_R3.bin";fw.write_bytes(b"fixture firmware")
        fw_sha=hashlib.sha256(fw.read_bytes()).hexdigest()
        (src/"FINAL_METRICS.txt").write_text(f"github_sha={'a'*40}\nfirmware_sha256={fw_sha}\n")
        (src/"RELEASE_ADMISSION.json").write_text(json.dumps({"schema":"hbnf-aux-release-admission-v1",
            "status":"REVIEW_ONLY","candidate_source_commit":"a"*40,"candidate_firmware_sha256":fw_sha,
            "installed_firmware_sha256":"1"*64,"rollback_artifact":None,
            "blocker_code":"EXACT_INSTALLED_FIRMWARE_ROLLBACK_MISSING","resumption_condition":"fixture"}))
        m=build(src,root/"x.zip");assert m["files"]==len(FILES) and m["launcherMode"]=="0755"
    print("HBNF_AUX_DISTRIBUTION_SELFTEST_PASS")

def main():
    ap=argparse.ArgumentParser();ap.add_argument("src",nargs="?",default=".");ap.add_argument("out",nargs="?",default="HBNF_SP803E_AUX_R3_COMMISSIONING.zip");ap.add_argument("--selftest",action="store_true");a=ap.parse_args()
    if a.selftest:selftest();return 0
    m=build(pathlib.Path(a.src).resolve(),pathlib.Path(a.out).resolve())
    print(f"HBNF_AUX_DISTRIBUTION_PASS sha256={m['sha256']} bytes={m['bytes']} files={m['files']} launcherMode={m['launcherMode']}")
    return 0

if __name__=="__main__":raise SystemExit(main())
