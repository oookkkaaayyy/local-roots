#!/usr/bin/env python3
"""Bind an AUX candidate to the exact installed baseline and its recovery image."""
from __future__ import annotations
import argparse, hashlib, json, pathlib, re, tempfile, zipfile

INSTALLED_AUX_SHA256 = "152a795c6dcc5ea396687aee29d15a3e569dd15becfa6537b347e51a09e54e95"
ROLLBACK_FILE = "HBNF_SP803E_AUX_V6_ROLLBACK.bin"
ROLLBACK_MANIFEST = "AUX_V6_RECOVERY_MANIFEST.json"
HEX64 = re.compile(r"^[0-9a-f]{64}$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")

def sha256(path: pathlib.Path) -> str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def parse_metrics(path: pathlib.Path) -> dict[str,str]:
    out={}
    for line in path.read_text().splitlines():
        if "=" in line:
            k,v=line.split("=",1);out[k.strip()]=v.strip()
    return out

def validate_recovery_source(rollback: pathlib.Path, manifest_path: pathlib.Path,
                             archive: pathlib.Path|None=None) -> dict:
    manifest=json.loads(manifest_path.read_text())
    prov=manifest.get("provenance") or {}; ver=manifest.get("verification") or {}
    digest=sha256(rollback); size=rollback.stat().st_size
    if manifest.get("artifact_type")!="exact installed AUX firmware recovery image":
        raise ValueError("recovery manifest does not identify an exact installed AUX image")
    if manifest.get("firmware_sha256")!=INSTALLED_AUX_SHA256 or digest!=INSTALLED_AUX_SHA256:
        raise ValueError("rollback image does not match the recorded installed AUX firmware")
    if int(manifest.get("firmware_bytes",-1))!=size:
        raise ValueError("rollback byte count does not match its manifest")
    if not HEX40.fullmatch(str(prov.get("source_commit",""))):
        raise ValueError("recovery manifest source commit is invalid")
    if not str(prov.get("workflow_run_id","" )).isdigit() or prov.get("run_result")!="success":
        raise ValueError("recovery manifest does not identify a successful workflow run")
    if not str(prov.get("run_url","")).startswith("https://") or not HEX64.fullmatch(str(prov.get("github_artifact_zip_sha256",""))):
        raise ValueError("recovery workflow or artifact identity is invalid")
    if manifest.get("firmware_file")!="HBNF_SP803E_AUX_V6_INSTALLED.bin":
        raise ValueError("recovery manifest firmware filename mismatch")
    if any(ver.get(k) is not True for k in (
        "downloaded_github_artifact_sha256_matches_github_digest", "zip_integrity_passed",
        "embedded_firmware_hash_matches_recorded_installed_hash",
        "embedded_source_commit_matches_workflow_run_head",
        "embedded_build_witness_matches_recorded_installed_witness")):
        raise ValueError("recovery provenance verification is incomplete")
    if prov.get("artifact_embedded_metrics_match_installed_identity") is not True:
        raise ValueError("recovery artifact metrics do not establish installed-image identity")
    if archive is not None:
        if sha256(archive)!=prov["github_artifact_zip_sha256"]:
            raise ValueError("original recovery workflow ZIP hash mismatch")
        with zipfile.ZipFile(archive) as z:
            if z.testzip() is not None: raise ValueError("original recovery workflow ZIP is corrupt")
            image=z.read("HBNF_SP803E_AUX_R3.bin")
            metrics={}
            for line in z.read("FINAL_METRICS.txt").decode("utf-8").splitlines():
                if "=" in line:
                    k,v=line.split("=",1);metrics[k.strip()]=v.strip()
        if hashlib.sha256(image).hexdigest()!=digest or len(image)!=size:
            raise ValueError("original recovery workflow ZIP does not contain the exact rollback bytes")
        if metrics.get("github_sha")!=prov["source_commit"] or metrics.get("github_run_id")!=str(prov["workflow_run_id"]):
            raise ValueError("embedded workflow provenance differs from recovery manifest")
        if metrics.get("firmware_sha256")!=digest or metrics.get("build_witness")!=manifest.get("build_witness"):
            raise ValueError("embedded firmware identity differs from recovery manifest")
    return manifest

def verify_packaged_rollback(root: pathlib.Path, artifact: dict) -> bool:
    if artifact.get("file")!=ROLLBACK_FILE or artifact.get("manifest_file")!=ROLLBACK_MANIFEST:
        return False
    image=root/ROLLBACK_FILE; manifest_path=root/ROLLBACK_MANIFEST
    if not image.is_file() or not manifest_path.is_file(): return False
    try:
        manifest=json.loads(manifest_path.read_text());prov=manifest.get("provenance") or {}
        return (sha256(image)==artifact.get("sha256")==INSTALLED_AUX_SHA256
            and image.stat().st_size==artifact.get("bytes")==manifest.get("firmware_bytes")
            and sha256(manifest_path)==artifact.get("manifest_sha256")
            and manifest.get("firmware_sha256")==artifact.get("sha256")
            and prov.get("source_commit")==artifact.get("source_commit")
            and str(prov.get("workflow_run_id"))==str(artifact.get("workflow_run_id"))
            and prov.get("github_artifact_zip_sha256")==artifact.get("artifact_zip_sha256"))
    except Exception: return False

def generate(firmware: pathlib.Path, metrics: pathlib.Path, rollback: pathlib.Path|None=None,
             rollback_manifest: pathlib.Path|None=None, rollback_archive: pathlib.Path|None=None,
             drive_ids: dict|None=None) -> dict:
    values=parse_metrics(metrics); source=values.get("github_sha","")
    if not HEX40.fullmatch(source): raise ValueError("build metrics must identify the exact 40-character source commit")
    firmware_sha=sha256(firmware)
    if values.get("firmware_sha256")!=firmware_sha: raise ValueError("firmware bytes do not match the exact build metrics")
    if (rollback is None)!=(rollback_manifest is None): raise ValueError("rollback image and recovery manifest must be supplied together")
    if rollback is not None and rollback_archive is None: raise ValueError("the original successful workflow artifact ZIP is required to verify rollback provenance")
    artifact=None
    if rollback is not None:
        manifest=validate_recovery_source(rollback,rollback_manifest,rollback_archive)
        prov=manifest["provenance"]
        artifact={"file":ROLLBACK_FILE,"bytes":rollback.stat().st_size,"sha256":sha256(rollback),
          "manifest_file":ROLLBACK_MANIFEST,"manifest_sha256":sha256(rollback_manifest),
          "source_commit":prov["source_commit"],"workflow_run_id":str(prov["workflow_run_id"]),
          "run_url":prov["run_url"],"artifact_id":str(prov["artifact_id"]),
          "artifact_name":prov["artifact_name"],"artifact_zip_sha256":prov["github_artifact_zip_sha256"],
          "drive_file_ids":drive_ids or {}}
    fresh_gate="FRESH_CURRENT_DEVICE_PREFLIGHT_REQUIRED" if artifact else "EXACT_INSTALLED_FIRMWARE_ROLLBACK_MISSING"
    resume=("Immediately before any installation, re-read AUX identity and confirm the installed firmware still matches this exact rollback, then use a new candidate-specific admission. Keep UV disabled until electrical and physical acceptance passes." if artifact else
      "Retain and verify the exact installed AUX firmware image, then create a source-bound package containing that image as rollback.")
    return {"schema":"hbnf-aux-release-admission-v1","status":"REVIEW_ONLY",
      "candidate_source_commit":source,"candidate_firmware_sha256":firmware_sha,
      "installed_firmware_sha256":INSTALLED_AUX_SHA256,
      "installed_baseline_evidence":"Recovered exact image is provenance-bound to the installed V6 readback; a fresh device preflight is still required.",
      "rollback_artifact":artifact,"blocker_code":fresh_gate,"resumption_condition":resume}

def selftest():
    global INSTALLED_AUX_SHA256
    with tempfile.TemporaryDirectory() as td:
        root=pathlib.Path(td);fw=root/"candidate.bin";fw.write_bytes(b"candidate")
        sha=hashlib.sha256(fw.read_bytes()).hexdigest();commit="a"*40
        mt=root/"FINAL_METRICS.txt";mt.write_text(f"github_sha={commit}\nfirmware_sha256={sha}\n")
        out=generate(fw,mt)
        assert out["status"]=="REVIEW_ONLY" and out["candidate_source_commit"]==commit
        assert out["candidate_firmware_sha256"]==sha and out["rollback_artifact"] is None
        mt.write_text(f"github_sha={commit}\nfirmware_sha256={'0'*64}\n")
        try: generate(fw,mt);raise AssertionError("mismatched firmware accepted")
        except ValueError as e: assert "do not match" in str(e)
        import sys
        old=INSTALLED_AUX_SHA256
        try:
            rb=root/"rollback.bin";rb.write_bytes(b"rollback fixture");rbsha=sha256(rb)
            INSTALLED_AUX_SHA256=rbsha
            run=root/"artifact.zip";manifest=root/"recovery.json"
            prov={"source_commit":"b"*40,"workflow_run_id":36354143870,"run_url":"https://github.com/example/repo/actions/runs/36354143870","run_result":"success","artifact_id":123,"artifact_name":"HBNF-SP803E-AUX-R3","github_artifact_zip_sha256":"0"*64,"artifact_embedded_metrics_match_installed_identity":True}
            body={"artifact_type":"exact installed AUX firmware recovery image","firmware_file":"HBNF_SP803E_AUX_V6_INSTALLED.bin","firmware_bytes":len(rb.read_bytes()),"firmware_sha256":rbsha,"build_witness":"witness-v6","provenance":prov,"verification":{"downloaded_github_artifact_sha256_matches_github_digest":True,"zip_integrity_passed":True,"embedded_firmware_hash_matches_recorded_installed_hash":True,"embedded_source_commit_matches_workflow_run_head":True,"embedded_build_witness_matches_recorded_installed_witness":True}}
            import io
            bio=io.BytesIO()
            with zipfile.ZipFile(bio,"w") as z:
                z.writestr("HBNF_SP803E_AUX_R3.bin",rb.read_bytes())
                z.writestr("FINAL_METRICS.txt",f"github_sha={'b'*40}\ngithub_run_id=36354143870\nfirmware_sha256={rbsha}\nbuild_witness=witness-v6\n")
            run.write_bytes(bio.getvalue());body["provenance"]["github_artifact_zip_sha256"]=sha256(run)
            manifest.write_text(json.dumps(body,sort_keys=True)+"\n")
            candidate_metrics=root/"candidate-metrics.txt";candidate_metrics.write_text(f"github_sha={commit}\nfirmware_sha256={sha}\n")
            result=generate(fw,candidate_metrics,rb,manifest,run,{"image":"id-image","archive":"id-zip","manifest":"id-manifest"})
            assert result["blocker_code"]=="FRESH_CURRENT_DEVICE_PREFLIGHT_REQUIRED" and result["rollback_artifact"]["sha256"]==rbsha
            (root/ROLLBACK_FILE).write_bytes(rb.read_bytes())
            (root/ROLLBACK_MANIFEST).write_bytes(manifest.read_bytes())
            assert verify_packaged_rollback(root,result["rollback_artifact"]) is True
            (root/ROLLBACK_FILE).write_bytes(b"tampered")
            assert verify_packaged_rollback(root,result["rollback_artifact"]) is False
        finally: INSTALLED_AUX_SHA256=old
    print("AUX_RELEASE_ADMISSION_SELFTEST_PASS")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--firmware",type=pathlib.Path);ap.add_argument("--metrics",type=pathlib.Path);ap.add_argument("--out",type=pathlib.Path)
    ap.add_argument("--rollback",type=pathlib.Path);ap.add_argument("--rollback-manifest",type=pathlib.Path);ap.add_argument("--rollback-archive",type=pathlib.Path)
    ap.add_argument("--rollback-image-drive-id");ap.add_argument("--rollback-manifest-drive-id");ap.add_argument("--rollback-archive-drive-id")
    ap.add_argument("--selftest",action="store_true");a=ap.parse_args()
    if a.selftest:selftest();return
    if not a.firmware or not a.metrics or not a.out: ap.error("--firmware, --metrics, and --out are required")
    ids={"image":a.rollback_image_drive_id,"manifest":a.rollback_manifest_drive_id,"archive":a.rollback_archive_drive_id} if a.rollback else None
    result=generate(a.firmware,a.metrics,a.rollback,a.rollback_manifest,a.rollback_archive,ids)
    a.out.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    print(f"AUX_RELEASE_REVIEW_ONLY source={result['candidate_source_commit']} firmware={result['candidate_firmware_sha256']} blocker={result['blocker_code']}")

if __name__=="__main__": main()
