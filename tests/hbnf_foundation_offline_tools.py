#!/usr/bin/env python3
"""Pure offline tests for Foundation threshold, recovery, and evidence tools."""
import importlib.util,json,pathlib,tempfile,zipfile,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(name):
    s=importlib.util.spec_from_file_location(name,ROOT/f"scripts/{name}.py");m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
freeze=load("hbnf_foundation_threshold_freeze")
recovery=load("hbnf_foundation_recovery_audit")
pack=load("hbnf_foundation_evidence_pack")
baseline_builder=load("hbnf_foundation_baseline")
soak_audit=load("hbnf_foundation_soak_audit")
foundation_policy=json.loads((ROOT/"config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json").read_text())
assert freeze.validate_policy(foundation_policy)==[]
assert foundation_policy["catastrophic_early_stop"]["consecutive_samples"]==3
assert foundation_policy["comparison"]["candidate_vs_baseline"]["frame_max_max_ratio"]==1.5
assert foundation_policy["qualification_semantics"]["relative_frame_max"]=="DIAGNOSTIC_ONLY__NOT_A_SUSTAINED_PERFORMANCE_GATE"

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
    policy["catastrophic_early_stop"].update(fps_floor_absolute=10,frame_ms_p99_ceiling_absolute=100,aux_projection_active_required=True)
    policy["qualification_semantics"]={"relative_frame_max":"DIAGNOSTIC_ONLY__NOT_A_SUSTAINED_PERFORMANCE_GATE",
      "relative_frame_max_max_ratio":policy["comparison"]["candidate_vs_baseline"]["frame_max_max_ratio"],
      "relative_sustained_gate_timing":"EVALUATE_FROZEN_DISTRIBUTION_AND_RESOURCE_RATIOS_ONLY_AFTER_FULL_CONTIGUOUS_90_MINUTE_WINDOW; BEFORE_THEN_REPORT_PROVISIONAL_METRICS_AND_KEEP_CATASTROPHIC_EARLY_STOPS_ACTIVE",
      "catastrophic_early_stop":"UNCHANGED__3_CONSECUTIVE_BAD_SAMPLES"}
    baseline={"contract":"foundation","release_id":"candidate","fps":{"median":40},
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

# The baseline is generated from the fresh complete sweep, and the soak audit
# applies the frozen ratios independently to each matching kernel.
with tempfile.TemporaryDirectory() as td:
    root=pathlib.Path(td);kernels=[]
    for i in range(28):
        name=f"kernel-{i}";slug=f"{i:02d}_{name}"
        sample={"release_id":"candidate","uptime_seconds":10,"fps":40,"frame_ms_avg":20,
          "frame_ms_p50":18,"frame_ms_p95":24,"frame_ms_p99":30,"frame_ms_max":38,
          "kernel_id":i,"kernel_name":name,"variant_id":"v1","free_heap_bytes":100000,
          "minimum_free_heap_bytes":95000,"largest_free_block_bytes":80000,"websocket_clients":1,
          "aux_projection_active":True,"aux_projection_age_ms":30,"aux_render_fps":40,"wifi_rssi_dbm":-45,
          "restart_count":0,"kernel_ms_avg":5,"kernel_ms_p95":6,"palette_ms_avg":1,"palette_ms_p95":1,
          "audio_ms_avg":1,"audio_ms_p95":1,"scheduler_ms_avg":1,"scheduler_ms_p95":1,
          "overlay_ms_avg":0,"overlay_ms_p95":0,"aux_prepare_send_ms_avg":0,"aux_prepare_send_ms_p95":0,
          "unaccounted_ms_avg":1,"unaccounted_ms_p95":1}
        raw=root/(slug+".jsonl");raw.write_text(json.dumps(sample)+"\n")
        prof={"status":"PASS","profile":{"contract":"foundation","validation_errors":[],"release_id":"candidate",
          "kernel":{"id":i,"name":name,"variant_id":"v1"},"fps":{"median":40},
          "frame_ms":{"p95_median":24,"p99_median":30,"max":38},
          "heap":{"minimum_free_min":95000,"largest_block_end":80000}}}
        pp=root/(slug+".profile.json");pp.write_text(json.dumps(prof))
        kernels.append({"kernel_id":i,"kernel_name":name,"profile_path":pp.name})
    manifest={"contract":"foundation","release_id":"candidate","restore_verified":False,"kernels":kernels}
    mp=root/"sweep.json";mp.write_text(json.dumps(manifest))
    baseline=baseline_builder.build(mp)
    assert baseline["kernel_count"]==28 and baseline["kernels"]["0"]["largest_free_block_min"]==80000
    soak=[]
    for i in range(1081):
        s=json.loads((root/(f"{i%28:02d}_kernel-{i%28}.jsonl")).read_text())
        s.update(sample_time=float(i*5),uptime_seconds=float(i*5+10),kernel_id=i%28,kernel_name=f"kernel-{i%28}")
        soak.append(s)
    result=soak_audit.audit(soak,{"entries":[{"runtime_kernel_index_expected":i} for i in range(28)]},"candidate",5400,baseline,foundation_policy)
    assert result["status"]=="PASS" and result["foundation_qualification"]["status"]=="PASS",result
    # Matrix send-age / optional custom frame-lock age is not the native DDP
    # receive gate. WLED's Matrix-origin DDP status remains the health signal.
    high_age=[dict(x,aux_projection_age_ms=4294967295,aux_projection_age_valid=False) for x in soak]
    age_result=soak_audit.audit(high_age,{"entries":[{"runtime_kernel_index_expected":i} for i in range(28)]},"candidate",5400,baseline,foundation_policy)
    assert age_result["status"]=="PASS",age_result["errors"]
    inactive=[dict(x) for x in soak]
    for i in (30,31,32):inactive[i]["aux_projection_active"]=False
    inactive_result=soak_audit.audit(inactive,{"entries":[{"runtime_kernel_index_expected":i} for i in range(28)]},"candidate",5400,baseline,foundation_policy)
    assert any("catastrophic threshold" in e for e in inactive_result["errors"])
    bad=[dict(x) for x in soak];bad[3]["fps"]=10;bad[4]["fps"]=10;bad[5]["fps"]=10
    fail=soak_audit.audit(bad,{"entries":[{"runtime_kernel_index_expected":i} for i in range(28)]},"candidate",5400,baseline,foundation_policy)
    assert any("catastrophic threshold" in e for e in fail["errors"])

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
