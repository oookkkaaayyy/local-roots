#!/usr/bin/env python3
"""Regression tests for sustained Foundation gates and diagnostic max outliers."""
import importlib.util
import json
import pathlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("foundation_soak_audit",ROOT/"scripts/hbnf_foundation_soak_audit.py")
audit_mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit_mod)
policy=json.loads((ROOT/"config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json").read_text())
release="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
inventory={"entries":[{"runtime_kernel_index_expected":i} for i in range(28)]}
baseline={"schema":"hbnf-foundation-28-kernel-baseline-v1","release_id":release,"kernel_count":28,"kernels":{}}
for i in range(28):
    baseline["kernels"][str(i)]={"kernel_name":f"kernel-{i}","fps_median":40.0,
      "frame_p95_median":25.0,"frame_p99_median":35.0,"frame_max":40.0,
      "minimum_free_heap":90000.0,"largest_free_block_min":60000.0,
      "comparable_settled_resources":{"current_free_heap_min":90000.0,
        "largest_free_block_min":60000.0,"aux_stale_fraction":0.0}}

def make_samples():
    rows=[]
    for i in range(541):
        kid=(i//2)%28
        rows.append({"sample_time":float(i*10),"release_id":release,"uptime_seconds":float(i*10+700),
          "fps":40.0,"frame_ms_p50":20.0,"frame_ms_p95":24.0,"frame_ms_p99":35.0,"frame_ms_max":40.0,
          "kernel_id":kid,"kernel_name":f"kernel-{kid}","variant_id":f"variant-{kid}",
          "free_heap_bytes":95000,"minimum_free_heap_bytes":85000,"largest_free_block_bytes":55000,
          "websocket_clients":0,"aux_projection_active":True,"aux_projection_age_ms":10,
          "aux_render_fps":40.0,"wifi_rssi_dbm":-55,"restart_count":0})
    return rows

def run(rows):
    events=[]
    select_index=0
    for i,row in enumerate(rows):
        if i%2: continue
        sample_time=float(row["sample_time"])
        events.append({"select_index":select_index,"kernel_id":row["kernel_id"],"started_at_monotonic":sample_time-5.2,
                       "completed_at_monotonic":sample_time-5.1,"status":"PASS"});select_index+=1
    return audit_mod.audit(rows,inventory,release,baseline=baseline,policy=policy,state_changes=events)

# A: A single high frame maximum stays visible in the report but cannot fail
# the sustained-performance gate when percentiles/resources remain healthy.
isolated=make_samples();isolated[1]["frame_ms_max"]=250.0
result=run(isolated)
assert result["status"]=="PASS",result["errors"]
assert result["sustained_performance"]["status"]=="PASS",result["sustained_performance"]["errors"]
assert result["sustained_performance"]["relative_frame_max"]=="DIAGNOSTIC_ONLY"
assert any(x["over_legacy_relative_limit"] for x in result["sustained_performance"]["frame_max_diagnostics"])

# B: Repeated p99 regression fails the frozen sustained p99 gate while remaining
# below the independent 75ms absolute catastrophic threshold.
repeated_p99=make_samples()
for row in repeated_p99:
    if row["kernel_id"]==0: row["frame_ms_p99"]=52.0
result=run(repeated_p99)
assert result["sustained_performance"]["status"]=="FAIL",result["sustained_performance"]
assert any("frame_p99_median" in e for e in result["sustained_performance"]["errors"])

# C: Three consecutive absolute catastrophic samples still fail immediately.
catastrophic=make_samples()
for row in catastrophic[100:103]: row["frame_ms_p99"]=76.0
result=run(catastrophic)
assert any("catastrophic threshold" in e for e in result["sustained_performance"]["errors"])

# D: Restart-count change fails continuity.
restarted=make_samples();restarted[500]["restart_count"]=1
result=run(restarted)
assert result["status"]=="FAIL" and any("restart count changed" in e for e in result["errors"])

# E: Boot-lifetime minimum-free-heap watermark is ignored for per-kernel
# sustained comparison; settled current free heap and fragmentation remain gated.
resources=make_samples()
for row in resources:
    if row["kernel_id"]==0:
        row["minimum_free_heap_bytes"]=1000
result=run(resources)
assert not any("settled_current_free_heap_min" in e for e in result["sustained_performance"]["errors"])
resources=make_samples()
for row in resources:
    if row["kernel_id"]==0:
        row["free_heap_bytes"]=70000
        row["largest_free_block_bytes"]=40000
result=run(resources)
assert any("settled_current_free_heap_min" in e for e in result["sustained_performance"]["errors"])
assert any("largest_free_block_min" in e for e in result["sustained_performance"]["errors"])

# F: AUX health/staleness remains a hard gate.
aux_bad=make_samples()
for row in aux_bad:
    if row["kernel_id"]==0: row["aux_projection_active"]=False
result=run(aux_bad)
assert result["sustained_performance"]["status"]=="FAIL"
assert any("aux_stale_fraction" in e or "catastrophic threshold" in e for e in result["sustained_performance"]["errors"])

# G: Exact identity and sample continuity remain fail-closed.
wrong_identity=make_samples();wrong_identity[10]["release_id"]="other-build"
result=run(wrong_identity)
assert result["status"]=="FAIL" and any("identity mismatch" in e for e in result["errors"])
gapped=make_samples()
for row in gapped[400:]: row["sample_time"]+=20.0
result=run(gapped)
assert result["status"]=="FAIL" and any("gap exceeded" in e for e in result["errors"])

# A false AUX sample inside the 5-second selector settle window is excluded;
# repeated settled false samples remain a sustained failure.
settle_rows=make_samples(); settle_events=[]
select_index=0
for i,row in enumerate(settle_rows):
    if i%2: continue
    ts=float(row["sample_time"])
    settle_events.append({"select_index":select_index,"kernel_id":row["kernel_id"],"started_at_monotonic":ts-5.2,
                          "completed_at_monotonic":ts-5.1,"status":"PASS"});select_index+=1
    if row["kernel_id"]==0:
        row["aux_projection_active"]=False
        if i % 56 == 0:
            settle_events[-1]["completed_at_monotonic"]=ts-1.0
result=audit_mod.audit(settle_rows,inventory,release,baseline=baseline,policy=policy,state_changes=settle_events)
assert result["sustained_performance"]["status"]=="PASS",result["sustained_performance"]

settled_aux=make_samples()
for row in settled_aux:
    if row["kernel_id"]==0: row["aux_projection_active"]=False
result=run(settled_aux)
assert any("settled_aux_stale_fraction" in e for e in result["sustained_performance"]["errors"])

# Replay the preserved seq45 run: it is too short for sustained ratio decisions.
# Its max excursions remain diagnostic; early catastrophic and structural gates
# stay active, while provisional resource/p99 deviations remain visible.
seq45=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq45/live/foundation-soak/FOUNDATION_SOAK.jsonl"
if seq45.is_file():
    raw=audit_mod.read_jsonl(str(seq45))
    exact_inventory=audit_mod.read_json(str(ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"))
    exact_baseline=audit_mod.read_json(str(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json"))
    for kid in range(28): exact_baseline["kernels"][str(kid)]["comparable_settled_resources"]=baseline["kernels"][str(kid)]["comparable_settled_resources"]
    replay=audit_mod.audit(raw,exact_inventory,release,baseline=exact_baseline,policy=policy,state_changes=[])
    assert replay["status"]=="INCOMPLETE",replay["errors"]
    assert replay["foundation_qualification"]["status"]=="INCOMPLETE"
    assert replay["sustained_performance"]["status"]=="INCOMPLETE"
    assert replay["sustained_performance"]["errors"]==[]
    assert replay["duration_seconds"]<5400
    assert len([x for x in replay["sustained_performance"]["frame_max_diagnostics"] if x["over_legacy_relative_limit"]])==3

print("PASS: isolated max diagnostic; sustained p99, catastrophic streak, restart, heap/fragmentation, AUX, identity, and sampling continuity gates all enforced")
