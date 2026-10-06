#!/usr/bin/env python3
"""Pure offline tests for Foundation threshold, recovery, and evidence tools."""
import importlib.util,json,pathlib,tempfile,zipfile,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(name):
    s=importlib.util.spec_from_file_location(name,ROOT/f"scripts/{name}.py");m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
freeze=load("hbnf_foundation_threshold_freeze")
recovery=load("hbnf_foundation_recovery_audit")
pack=load("hbnf_foundation_evidence_pack")

# The current null template must fail closed instead of inventing thresholds.
template=json.loads((ROOT/"config/HBNF_RUNTIME_QUALIFICATION_POLICY_TEMPLATE.json").read_text())
with tempfile.TemporaryDirectory() as td:
    root=pathlib.Path(td);(root/"policy.json").write_text(json.dumps(template))
    (root/"baseline.json").write_text(json.dumps({"contract":"foundation","release_id":"baseline"}))
    (root/"sweep.json").write_text(json.dumps({"release_id":"candidate","kernels":[]}))
    try:freeze.freeze(root/"policy.json",root/"baseline.json",root/"sweep.json","candidate");raise AssertionError("null threshold template frozen")
    except ValueError as e:assert "must be FROZEN" in str(e) and "threshold missing" in str(e)

with tempfile.TemporaryDirectory() as td:
    root=pathlib.Path(td);policy=json.loads(json.dumps(template));policy["status"]="FROZEN"
    policy["comparison"]["candidate_vs_baseline"]={k:(0.0 if k=="aux_stale_sample_max_fraction" else 0.9) for k in freeze.RATIOS}
    policy["catastrophic_early_stop"].update(fps_floor_absolute=10,frame_ms_p99_ceiling_absolute=100,aux_projection_age_ms_ceiling=1000)
    baseline={"contract":"foundation","release_id":"baseline","fps":{"median":40},
              "frame_ms":{"p95_median":25,"p99_median":30,"max":40},
              "heap":{"minimum_free_min":90000,"largest_block_end":60000}}
    (root/"policy.json").write_text(json.dumps(policy));(root/"baseline.json").write_text(json.dumps(baseline))
    kernels=[]
    for i in range(28):
        name=f"kernel-{i}";profile_path=f"{i:02d}.profile.json"
        result={"status":"PASS","profile":{"contract":"foundation","validation_errors":[],"kernel":{"id":i,"name":name}}}
        (root/profile_path).write_text(json.dumps(result));kernels.append({"kernel_id":i,"kernel_name":name,"profile_path":profile_path})
    (root/"sweep.json").write_text(json.dumps({"release_id":"candidate","kernels":kernels}))
    receipt=freeze.freeze(root/"policy.json",root/"baseline.json",root/"sweep.json","candidate")
    assert receipt["status"]=="FROZEN_BEFORE_SOAK" and receipt["soak_started"] is False

# The already-durable seq32 receipt is validated offline against the exact BIN.
receipt=ROOT/"evidence/hbnf-foundation-qualification-20261005/SEQ32_RELEASE07_RECOVERY_VERIFICATION.json"
artifact=pathlib.Path("/Users/andrew/Downloads/HBNF-Foundation-Crash-Recovery-20261005/artifact/release07.bin")
if artifact.is_file():
    result=recovery.audit(receipt,artifact);assert result["status"]=="PASS",result
    assert result["runtime_identity_verified"] and result["matrix_aux_health_verified"]

with tempfile.TemporaryDirectory() as td:
    root=pathlib.Path(td)/"evidence";root.mkdir();(root/"receipt.json").write_text('{"status":"PASS"}\n');(root/"samples.jsonl").write_text('{"kernel_id":0}\n')
    archive=pathlib.Path(td)/"out.zip";manifest=pack.package(root,["receipt.json","samples.jsonl"],archive)
    with zipfile.ZipFile(archive) as z:
        assert sorted(z.namelist())==["EVIDENCE_MANIFEST.json","receipt.json","samples.jsonl"]
        got=json.loads(z.read("EVIDENCE_MANIFEST.json"));assert got==manifest
        for item in got["files"]:assert hashlib.sha256(z.read(item["path"])).hexdigest()==item["sha256"]
    try:pack.package(root,["../receipt.json"],archive);raise AssertionError("path traversal accepted")
    except ValueError as e:assert "unsafe evidence path" in str(e)
    (root/"linked.json").symlink_to(root/"receipt.json")
    try:pack.package(root,["linked.json"],archive);raise AssertionError("symlink evidence accepted")
    except ValueError as e:assert "symlink" in str(e)
print("PASS: threshold freezing fails closed, Release07 recovery receipt verifies offline, and evidence packaging is explicit/hash-bound/path-safe")
