#!/usr/bin/env python3
"""Host-only negative/admission tests; never calls network, WLED, or firmware."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import pathlib
import tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("hbnf_control",ROOT/"scripts/hbnf_control.py")
mod=importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)
model=mod.load(ROOT/"config/HBNF_CONTROL_MODEL.json")
state=mod.load(ROOT/"config/HBNF_CONTROL_STATE.json")
assert not mod.validate_model(model), mod.validate_model(model)
required=(
    "device_and_source_authority_reconciled",
    "fully_local_pinned_build_toolchain",
    "known_good_compiler_entry_smoke",
    "exact_source_dependency_generated_input_closure",
    "compiled_embedded_candidate_id_and_sha",
    "flash_and_ram_headroom",
    "committed_feature_scope_preserved",
    "all_historical_host_failures_replayed",
    "entire_release_transaction_dryrun",
    "frozen_performance_soak_and_restore_procedure",
    "rollback_artifact_hash_verified")
with tempfile.TemporaryDirectory(prefix="hbnf_admission_test_") as td:
    t=pathlib.Path(td)
    binary=t/"candidate.bin"; binary.write_bytes(b"test-only-candidate")
    rollback=t/"rollback.bin"; rollback.write_bytes(b"test-only-rollback")
    digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    evidence_by_check={}
    for key in required:
        evidence=t/(key+".json")
        evidence.write_text(json.dumps({"schema":"hbnf-host-test-evidence-v1","check":key,"result":"PASS"})+"\n")
        evidence_by_check[key]=evidence
    receipt={
       "schema":"hbnf-cart2-release-admission-v1",
       "stage":"OFFLINE_COMPILED",
       "outcome":"PASS",
       "identities":{
           "candidate_release_id":"test-only-not-firmware",
           "source_commit":"0123456789abcdef"*3,
           "candidate_bin_path":str(binary),
           "candidate_bin_sha256":digest(binary),
           "rollback_bin_path":str(rollback),
           "rollback_bin_sha256":digest(rollback)
       },
       "checks":{k:{"pass":True,"evidence_file":str(evidence_by_check[k]),"sha256":digest(evidence_by_check[k])} for k in required}
    }
    assert mod.release_admission_errors(model,state,receipt,"OFFLINE_COMPILED")==[]
    def must_reject(message,value,stage="OFFLINE_COMPILED"):
        failures=mod.release_admission_errors(model,state,value,stage)
        assert failures, "incorrectly accepted: "+message
        print("REJECT",message,":",failures[0])
    bad=json.loads(json.dumps(receipt));bad["checks"]["all_historical_host_failures_replayed"]["pass"]=False
    must_reject("historical replay failed",bad)
    bad=json.loads(json.dumps(receipt));bad["checks"]["entire_release_transaction_dryrun"]["sha256"]="0"*64
    must_reject("fabricated dry-run evidence digest",bad)
    bad=json.loads(json.dumps(receipt));bad["identities"]["candidate_bin_sha256"]="0"*64
    must_reject("binary sha mismatch",bad)
    generic=t/"generic.json"; generic.write_text('{"schema":"host-only-proof-fixture"}\n')
    bad=json.loads(json.dumps(receipt))
    bad["checks"][required[0]]={"pass":True,"evidence_file":str(generic),"sha256":digest(generic)}
    must_reject("generic test fixture used as release proof",bad)
    bad=json.loads(json.dumps(receipt))
    bad["checks"]={k:{"pass":True,"evidence_file":str(evidence_by_check[required[0]]),"sha256":digest(evidence_by_check[required[0]])} for k in required}
    must_reject("one generic artifact reused for unrelated checks",bad)
    bad=json.loads(json.dumps(receipt));bad["stage"]="LIVE_APPROVED"
    must_reject("no live authorization",bad,"LIVE_APPROVED")
    for evidence in evidence_by_check.values(): evidence.unlink()
    must_reject("missing evidence files",receipt)
print("PASS: offline checker accepts complete host fixture and fails closed for invalid proofs; no hardware invoked")
