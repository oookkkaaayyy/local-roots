#!/usr/bin/env python3
"""Build deterministic AUX commissioning ZIP, optionally with verified exact rollback."""
from __future__ import annotations
import argparse, hashlib, pathlib, zipfile

FILES=[
 "START_HERE.txt","COMMISSION_HBNF_AUX.command","commission_guard.py","commission_operator.py",
 "generate_aux_hardware_plan.py","generate_release_admission.py","local_commission.py",
 "HBNF_SP803E_AUX_R3.bin","FINAL_METRICS.txt","firmware-sha256.txt","contract.json",
 "WOW_SCENES_V2.json","README.md","CODEX_RUNBOOK.md","RELEASE_ADMISSION.json",
 "RELEASE_RECEIPT.schema.json","RELEASE_RECEIPT.template.json","RELEASE_RECEIPT.json",
 "validate_release_receipt.py","generate_release_receipt.py","test_release_receipt.py"
]
ROLLBACK_FILES=["HBNF_SP803E_AUX_V6_ROLLBACK.bin","AUX_V6_RECOVERY_MANIFEST.json"]
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
    base_valid=(admission.get("schema")=="hbnf-aux-release-admission-v1"
        and admission.get("status")=="REVIEW_ONLY"
        and re.fullmatch(r"[0-9a-f]{40}",source_sha)
        and admission.get("candidate_source_commit")==source_sha
        and admission.get("candidate_firmware_sha256")==firmware_sha==metrics.get("firmware_sha256")
        and bool(str(admission.get("resumption_condition","")).strip()))
    if not base_valid: raise ValueError("distribution admission is not bound to this exact source and firmware")
    rollback_artifact=admission.get("rollback_artifact")
    names=list(FILES)
    if rollback_artifact is None:
        if admission.get("blocker_code")!="EXACT_INSTALLED_FIRMWARE_ROLLBACK_MISSING":
            raise ValueError("rollback-free review package must identify the missing exact recovery image")
    else:
        from generate_release_admission import verify_packaged_rollback
        if admission.get("blocker_code")!="FRESH_CURRENT_DEVICE_PREFLIGHT_REQUIRED":
            raise ValueError("a package with exact rollback must remain blocked on fresh device preflight")
        if not verify_packaged_rollback(src,rollback_artifact):
            raise ValueError("packaged rollback bytes/manifest do not match the verified installed baseline")
        names.extend(ROLLBACK_FILES)
    receipt=json.loads((src/"RELEASE_RECEIPT.json").read_text())
    from validate_release_receipt import validate_template
    errors=validate_template(receipt,metrics,src/"HBNF_SP803E_AUX_R3.bin")
    if errors: raise ValueError("release receipt template is not source/hash-bound: "+"; ".join(errors))
    if receipt.get("status")!="INCOMPLETE": raise ValueError("package receipt must remain INCOMPLETE until installation and durable evidence are verified")
    out.parent.mkdir(parents=True,exist_ok=True)
    if out.exists(): out.unlink()
    with zipfile.ZipFile(out,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name in names:
            p=src/name;zi=zipfile.ZipInfo(name,STAMP);zi.create_system=3
            zi.external_attr=(0o100755 if name.endswith(".command") else 0o100644)<<16
            zi.compress_type=zipfile.ZIP_DEFLATED;z.writestr(zi,p.read_bytes())
    with zipfile.ZipFile(out) as z:
        assert z.namelist()==names
        assert ((z.getinfo("COMMISSION_HBNF_AUX.command").external_attr>>16)&0o777)==0o755
    return {"sha256":sha256(out),"bytes":out.stat().st_size,"files":len(names),
      "rollbackIncluded":rollback_artifact is not None,"launcherMode":"0755"}

def selftest():
    import tempfile, shutil, sys, json, hashlib
    with tempfile.TemporaryDirectory() as td:
        root=pathlib.Path(td);src=root/"src";src.mkdir()
        for n in FILES:(src/n).write_text(n+"\n")
        fw=src/"HBNF_SP803E_AUX_R3.bin";fw.write_bytes(b"fixture firmware")
        fw_sha=hashlib.sha256(fw.read_bytes()).hexdigest()
        metrics=(f"github_sha={'a'*40}\ngithub_run_id=123\ngithub_run_url=https://github.com/example/repo/actions/runs/123\ngithub_ref=refs/heads/test\nworkflow_path=.github/workflows/build.yml\nfirmware_sha256={fw_sha}\nfirmware_bytes={fw.stat().st_size}\ntoolchain_python=3.12\ntoolchain_platformio=6.1.17\ntoolchain_node=20\ntoolchain_pip=pip-24\ninput_wled_commit={'b'*40}\ninput_source_bundle_sha256={'c'*64}\ninput_wled_requirements_sha256={'d'*64}\ninput_aux_patch_sha256={'e'*64}\n")
        (src/"FINAL_METRICS.txt").write_text(metrics)
        here=pathlib.Path(__file__).resolve().parent
        for n in ("RELEASE_RECEIPT.schema.json","RELEASE_RECEIPT.template.json","validate_release_receipt.py","generate_release_receipt.py","generate_release_admission.py","test_release_receipt.py"):
            shutil.copy2(here/n,src/n)
        sys.path.insert(0,str(here))
        from generate_release_receipt import generate
        generate(fw,src/"FINAL_METRICS.txt",src/"RELEASE_RECEIPT.template.json",src/"RELEASE_RECEIPT.json")
        admission={"schema":"hbnf-aux-release-admission-v1","status":"REVIEW_ONLY","candidate_source_commit":"a"*40,"candidate_firmware_sha256":fw_sha,"installed_firmware_sha256":"1"*64,"rollback_artifact":None,"blocker_code":"EXACT_INSTALLED_FIRMWARE_ROLLBACK_MISSING","resumption_condition":"fixture"}
        (src/"RELEASE_ADMISSION.json").write_text(json.dumps(admission))
        m=build(src,root/"x.zip");assert m["files"]==len(FILES) and m["launcherMode"]=="0755" and not m["rollbackIncluded"]
        # A rollback-bearing bundle is accepted only when exact image and manifest agree.
        import generate_release_admission as ga
        old=ga.INSTALLED_AUX_SHA256
        try:
            rb=src/ga.ROLLBACK_FILE;rb.write_bytes(b"exact rollback fixture");rbsha=ga.sha256(rb);ga.INSTALLED_AUX_SHA256=rbsha
            rm={"firmware_sha256":rbsha,"firmware_bytes":rb.stat().st_size,"provenance":{"source_commit":"b"*40,"workflow_run_id":9,"github_artifact_zip_sha256":"c"*64}}
            (src/ga.ROLLBACK_MANIFEST).write_text(json.dumps(rm))
            artifact={"file":ga.ROLLBACK_FILE,"bytes":rb.stat().st_size,"sha256":rbsha,"manifest_file":ga.ROLLBACK_MANIFEST,"manifest_sha256":ga.sha256(src/ga.ROLLBACK_MANIFEST),"source_commit":"b"*40,"workflow_run_id":"9","artifact_zip_sha256":"c"*64}
            admission.update({"installed_firmware_sha256":rbsha,"rollback_artifact":artifact,"blocker_code":"FRESH_CURRENT_DEVICE_PREFLIGHT_REQUIRED"})
            (src/"RELEASE_ADMISSION.json").write_text(json.dumps(admission))
            m=build(src,root/"with-rollback.zip");assert m["rollbackIncluded"] and m["files"]==len(FILES)+len(ROLLBACK_FILES)
            rb.write_bytes(b"tampered")
            try:build(src,root/"must-fail.zip");raise AssertionError("tampered rollback was packaged")
            except ValueError as e:assert "rollback bytes/manifest" in str(e)
        finally:ga.INSTALLED_AUX_SHA256=old
    print("HBNF_AUX_DISTRIBUTION_SELFTEST_PASS")

def main():
    ap=argparse.ArgumentParser();ap.add_argument("src",nargs="?",default=".");ap.add_argument("out",nargs="?",default="HBNF_SP803E_AUX_R3_COMMISSIONING.zip");ap.add_argument("--selftest",action="store_true");a=ap.parse_args()
    if a.selftest:selftest();return 0
    m=build(pathlib.Path(a.src).resolve(),pathlib.Path(a.out).resolve())
    print(f"HBNF_AUX_DISTRIBUTION_PASS sha256={m['sha256']} bytes={m['bytes']} files={m['files']} rollbackIncluded={m['rollbackIncluded']} launcherMode={m['launcherMode']}")
    return 0

if __name__=="__main__":raise SystemExit(main())
