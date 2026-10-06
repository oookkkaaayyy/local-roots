#!/usr/bin/env python3
"""Regression for comparable settled resource baselines and exact seq47 replay."""
import importlib.util, json, pathlib
import hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("settled_baseline",ROOT/"scripts/hbnf_foundation_settled_baseline.py")
mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
baseline=mod.derive(
    str(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json"),
    str(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/foundation-sweep/PRE_SOAK_SWEEP_MANIFEST.json"),
    str(ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_SEQ39_20261006.json"))
assert baseline["resource_comparability"]["settle_seconds"]==5
frozen=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq47/live/retry-20261006T2027Z/FOUNDATION_SOAK_AUDIT.json"
assert hashlib.sha256(frozen.read_bytes()).hexdigest()=="c9849ed0459e34e423d91b6d9c266ea639b5cc716c805e25fe51c8b21e391224"
for kid in range(28):
    resources=baseline["kernels"][str(kid)]["comparable_settled_resources"]
    assert resources["sample_count"]>=8
    assert resources["current_free_heap_min"] > baseline["kernels"][str(kid)]["minimum_free_heap"]
    assert resources["raw_profile_sha256"]==baseline["kernels"][str(kid)]["samples_sha256"]

audit_spec=importlib.util.spec_from_file_location("soak_audit",ROOT/"scripts/hbnf_foundation_soak_audit.py")
audit=importlib.util.module_from_spec(audit_spec); audit_spec.loader.exec_module(audit)
raw=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq47/live/retry-20261006T2027Z/FOUNDATION_SOAK.jsonl"
events=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq47/live/retry-20261006T2027Z/FOUNDATION_STATE_CHANGES.jsonl"
inv=json.loads((ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json").read_text())
policy=json.loads((ROOT/"config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json").read_text())
release=baseline["release_id"]
result=audit.audit(audit.read_jsonl(str(raw)),inv,release,baseline=baseline,policy=policy,state_changes=audit.read_jsonl(str(events)))
assert result["duration_seconds"]==5439.94933625
assert result["status"]=="INCOMPLETE",result["errors"]
assert result["errors"]==[]
assert result["sustained_performance"]["errors"]==[]
assert result["sustained_performance"]["status"]=="INCOMPLETE"
assert result["sustained_performance"]["incomplete_reasons"]==[
    "kernel 5: only 1 settled resource/AUX samples; require 2",
    "kernel 27: only 0 settled resource/AUX samples; require 2"]
assert all(all(x["checks"].values()) for x in result["foundation_qualification"]["per_kernel"].values())
print("PASS: seq39 current-free-heap baseline is raw/profile/hash bound; exact seq47 replay has no settled resource/AUX failures and is INCOMPLETE only for kernels 5 and 27 sample counts")
