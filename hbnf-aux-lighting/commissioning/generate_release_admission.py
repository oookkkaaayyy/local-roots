#!/usr/bin/env python3
"""Bind an AUX candidate to the exact installed baseline and its recovery image."""
from __future__ import annotations
import argparse, hashlib, json, pathlib, re, tempfile, zipfile

HERE = pathlib.Path(__file__).resolve().parent

INSTALLED_AUX_SHA256 = "c44298bb4b80a0e3d36d094f8270a1959708997571784803592e257ecdef054a"
ROLLBACK_FILE = "HBNF_SP803E_AUX_V7_ROLLBACK.bin"
ROLLBACK_MANIFEST = "AUX_V7_RECOVERY_MANIFEST.json"
BASELINE_RELEASE = "hbnf-wow-aux-r3-2026-10-25-uv-follow-v1"
BASELINE_ENGINE = "aux-r3-wow-1d"
BASELINE_WITNESS = "registry28-tempo-lock-1d-v7-network-no-starve-uv-follow"
BASELINE_SOURCE = "e78fc74c9470b0bafaf43ca6a2823f60f1a4b51e"
BASELINE_RUN_ID = "40276725561"
BASELINE_ARCHIVE_SHA256 = "1dad4eba787a55eba0febd076477ae85cbc9dd339d94e43231182dbae011c86d"
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
    if (prov.get("source_commit")!=BASELINE_SOURCE
        or str(prov.get("workflow_run_id"))!=BASELINE_RUN_ID
        or prov.get("run_url")!=f"https://github.com/oookkkaaayyy/local-roots/actions/runs/{BASELINE_RUN_ID}"):
        raise ValueError("recovery manifest does not identify the owner-confirmed V7 source and run")
    if (manifest.get("firmware_file")!=ROLLBACK_FILE
        or manifest.get("firmware_release")!=BASELINE_RELEASE
        or manifest.get("engine")!=BASELINE_ENGINE
        or manifest.get("build_witness")!=BASELINE_WITNESS):
        raise ValueError("recovery manifest does not identify the owner-confirmed current V7 baseline")
    bundle=manifest.get("recovery_bundle") or {}
    if (bundle.get("sha256")!=BASELINE_ARCHIVE_SHA256
        or bundle.get("member")!="aux-v7-rollback.bin"
        or bundle.get("drive_file_id")!="1-W1pAyyc4aSdOmcDx2dj0siRRc9rHVBD"):
        raise ValueError("recovery manifest is not bound to the retained V7 continuation bundle")
    if any(ver.get(k) is not True for k in (
        "bundle_manifest_matches_v7_image", "rollback_image_hash_matches_bundle_manifest",
        "durable_bundle_readback_matches", "owner_confirmed_v7_current")):
        raise ValueError("V7 rollback evidence is incomplete")
    if archive is not None:
        if sha256(archive)!=bundle["sha256"]:
            raise ValueError("retained V7 recovery bundle hash mismatch")
        with zipfile.ZipFile(archive) as z:
            if z.testzip() is not None: raise ValueError("retained V7 recovery bundle is corrupt")
            image=z.read(bundle["member"])
            continuation=json.loads(z.read("CONTINUATION_MANIFEST.json"))
        baseline=continuation.get("current_installed_baseline") or {}
        if hashlib.sha256(image).hexdigest()!=digest or len(image)!=size:
            raise ValueError("retained V7 recovery bundle does not contain the exact rollback bytes")
        if (baseline.get("sha256")!=digest or baseline.get("source_commit")!=BASELINE_SOURCE
            or str(baseline.get("actions_run"))!=BASELINE_RUN_ID or baseline.get("release")!="V7"):
            raise ValueError("retained continuation manifest does not establish the same V7 baseline")
    return manifest

def verify_packaged_rollback(root: pathlib.Path, artifact: dict) -> bool:
    if artifact.get("file")!=ROLLBACK_FILE or artifact.get("manifest_file")!=ROLLBACK_MANIFEST:
        return False
    image=root/ROLLBACK_FILE; manifest_path=root/ROLLBACK_MANIFEST
    if not image.is_file() or not manifest_path.is_file(): return False
    try:
        manifest=json.loads(manifest_path.read_text());prov=manifest.get("provenance") or {}
        bundle=manifest.get("recovery_bundle") or {}
        return (sha256(image)==artifact.get("sha256")==INSTALLED_AUX_SHA256
            and image.stat().st_size==artifact.get("bytes")==manifest.get("firmware_bytes")
            and sha256(manifest_path)==artifact.get("manifest_sha256")
            and manifest.get("firmware_sha256")==artifact.get("sha256")
            and manifest.get("firmware_release")==BASELINE_RELEASE
            and manifest.get("engine")==BASELINE_ENGINE
            and manifest.get("build_witness")==BASELINE_WITNESS
            and prov.get("source_commit")==artifact.get("source_commit")
            and str(prov.get("workflow_run_id"))==str(artifact.get("workflow_run_id"))
            and bundle.get("sha256")==artifact.get("artifact_zip_sha256"))
    except Exception: return False

def generate(firmware: pathlib.Path, metrics: pathlib.Path, rollback: pathlib.Path|None=None,
             rollback_manifest: pathlib.Path|None=None, rollback_archive: pathlib.Path|None=None,
             drive_ids: dict|None=None) -> dict:
    values=parse_metrics(metrics); source=values.get("github_sha","")
    if not HEX40.fullmatch(source): raise ValueError("build metrics must identify the exact 40-character source commit")
    firmware_sha=sha256(firmware)
    if values.get("firmware_sha256")!=firmware_sha: raise ValueError("firmware bytes do not match the exact build metrics")
    if (rollback is None)!=(rollback_manifest is None): raise ValueError("rollback image and recovery manifest must be supplied together")
    artifact=None
    if rollback is not None:
        manifest=validate_recovery_source(rollback,rollback_manifest,rollback_archive)
        prov=manifest["provenance"]
        bundle=manifest["recovery_bundle"]
        artifact={"file":ROLLBACK_FILE,"bytes":rollback.stat().st_size,"sha256":sha256(rollback),
          "manifest_file":ROLLBACK_MANIFEST,"manifest_sha256":sha256(rollback_manifest),
          "source_commit":prov["source_commit"],"workflow_run_id":str(prov["workflow_run_id"]),
          "run_url":prov["run_url"],"artifact_id":"drive:"+bundle["drive_file_id"],
          "artifact_name":bundle["file"],"artifact_zip_sha256":bundle["sha256"],
          "drive_file_ids":drive_ids or {}}
    fresh_gate="FRESH_CURRENT_DEVICE_PREFLIGHT_REQUIRED" if artifact else "EXACT_INSTALLED_FIRMWARE_ROLLBACK_MISSING"
    resume=("Immediately before any installation, re-read AUX identity and confirm the installed firmware still matches this exact rollback, then use a new candidate-specific admission. Keep UV disabled until electrical and physical acceptance passes." if artifact else
      "Retain and verify the exact installed AUX firmware image, then create a source-bound package containing that image as rollback.")
    return {"schema":"hbnf-aux-release-admission-v1","status":"REVIEW_ONLY",
      "candidate_source_commit":source,"candidate_firmware_sha256":firmware_sha,
      "installed_firmware_sha256":INSTALLED_AUX_SHA256,
      "installed_baseline_evidence":"Exact V7 image, source/run identity, continuation bundle hash, and owner-confirmed current baseline are recorded; fresh target preflight remains required.",
      "rollback_artifact":artifact,"blocker_code":fresh_gate,"resumption_condition":resume}

def selftest():
    validate_recovery_source(HERE/ROLLBACK_FILE,HERE/ROLLBACK_MANIFEST)
    with tempfile.TemporaryDirectory() as td:
        root=pathlib.Path(td);fw=root/"candidate.bin";fw.write_bytes(b"candidate")
        sha=hashlib.sha256(fw.read_bytes()).hexdigest();commit="a"*40
        mt=root/"FINAL_METRICS.txt";mt.write_text(f"github_sha={commit}\nfirmware_sha256={sha}\n")
        out=generate(fw,mt)
        assert out["status"]=="REVIEW_ONLY" and out["candidate_source_commit"]==commit
        assert out["candidate_firmware_sha256"]==sha and out["rollback_artifact"] is None
        assert out["blocker_code"]=="EXACT_INSTALLED_FIRMWARE_ROLLBACK_MISSING"
        # A candidate image cannot substitute for the exact current V7 image.
        unverified_manifest=root/"unverified-v7-rollback.json"
        unverified_manifest.write_text(json.dumps({"artifact_type":"exact installed AUX firmware recovery image"})+"\n")
        try:
            validate_recovery_source(fw,unverified_manifest)
            raise AssertionError("candidate firmware was accepted as installed rollback")
        except ValueError as e:
            assert "does not match the recorded installed AUX firmware" in str(e)
        mt.write_text(f"github_sha={commit}\nfirmware_sha256={'0'*64}\n")
        try: generate(fw,mt);raise AssertionError("mismatched firmware accepted")
        except ValueError as e: assert "do not match" in str(e)
        candidate_metrics=root/"candidate-metrics.txt"
        candidate_metrics.write_text(f"github_sha={commit}\nfirmware_sha256={sha}\n")
        result=generate(fw,candidate_metrics,HERE/ROLLBACK_FILE,HERE/ROLLBACK_MANIFEST)
        assert result["blocker_code"]=="FRESH_CURRENT_DEVICE_PREFLIGHT_REQUIRED"
        assert result["rollback_artifact"]["sha256"]==INSTALLED_AUX_SHA256
        (root/ROLLBACK_FILE).write_bytes((HERE/ROLLBACK_FILE).read_bytes())
        (root/ROLLBACK_MANIFEST).write_bytes((HERE/ROLLBACK_MANIFEST).read_bytes())
        assert verify_packaged_rollback(root,result["rollback_artifact"]) is True
        (root/ROLLBACK_FILE).write_bytes(b"tampered")
        assert verify_packaged_rollback(root,result["rollback_artifact"]) is False
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
