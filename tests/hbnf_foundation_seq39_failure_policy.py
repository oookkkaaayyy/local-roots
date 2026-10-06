#!/usr/bin/env python3
"""Offline tests for seq39 host-failure preservation versus real recovery."""
import importlib.util,pathlib
import re
import json
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("seq39_failure_policy",ROOT/"scripts/hbnf_foundation_seq39_failure_policy.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

assert m.classify_run_error("TimeoutError: evidence writer deadline expired")=="HOST_OR_EXTERNAL"
assert m.classify_run_error("foundation-steady-state-frame-interval-stop: frame_ms_max=1000ms")=="DEVICE_OR_FOUNDATION_GATE"
assert m.classify_run_error("release identity changed during sweep")=="DEVICE_OR_FOUNDATION_GATE"
assert m.classify_run_error("foundation-sweep-report-failed: missing metrics")=="DEVICE_OR_FOUNDATION_GATE"
assert m.classify_run_error("foundation soak sample gap invalid: 16s") == "HOST_OR_EXTERNAL"
assert m.classify_run_error("foundation soak missed exact kernel coverage") == "HOST_OR_EXTERNAL"
assert m.classify_run_error("OSError: disk full while writing report")=="HOST_OR_EXTERNAL"

snapshot={"snapshotId":7,"snapshotHash":1234}
restored={"HBNF":{"packet20Diagnostic":{"restoreVerified":True,"packet20Same":True,"snapshotId":7,"snapshotHash":1234}}}
assert m.restore_is_proven(snapshot,restored,{"snapshot_equal":True,"snapshotId":7,"snapshotHash":1234})
assert not m.restore_is_proven(snapshot,{"HBNF":{"packet20Diagnostic":{**restored["HBNF"]["packet20Diagnostic"],"packet20Same":False}}})
assert not m.restore_is_proven(snapshot,restored,{"snapshot_equal":False,"snapshotId":7,"snapshotHash":1234})

# Exact Foundation firmware omits packet20Same from JSON but assigns
# restoreVerified from packet20Same(saved, verify); accept only the artifact- and
# source-bound receipt, while preserving the raw firmware response unchanged.
source=(ROOT/m.RESTORE_SOURCE_PATH).read_text()
assert re.search(r"const bool verified\s*=\s*packet20Same\(packet20Saved,packet20Verify\);",source)
provenance=json.loads((ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/BUILD_PROVENANCE.json").read_text())
assert provenance["candidate"]==m.RESTORE_CANDIDATE
assert provenance["firmware_sha256"]==m.RESTORE_CANDIDATE_SHA256
assert provenance["source_authority"]["candidate_source_path"]==m.RESTORE_SOURCE_PATH
assert provenance["source_authority"]["candidate_source_sha256"]==m.RESTORE_SOURCE_SHA256
wire_without_alias={"HBNF":{"packet20Diagnostic":{"restoreVerified":True,"snapshotId":7,"snapshotHash":1234}}}
contract={"schema":"hbnf-packet20-restore-semantic-binding-v1","candidate_release":m.RESTORE_CANDIDATE,
          "candidate_sha256":m.RESTORE_CANDIDATE_SHA256,"source_path":m.RESTORE_SOURCE_PATH,
          "source_sha256":m.RESTORE_SOURCE_SHA256}
receipt={"snapshot_equal":True,"packet20Same":True,"snapshotId":7,"snapshotHash":1234,"packet20_same_contract":contract}
assert m.restore_is_proven(snapshot,wire_without_alias,receipt)
assert not m.restore_is_proven(snapshot,wire_without_alias,{**receipt,"packet20Same":False})
assert not m.restore_is_proven(snapshot,wire_without_alias,{**receipt,"packet20_same_contract":{**contract,"candidate_sha256":"wrong"}})

safe=m.recovery_decision("TimeoutError: host evidence write failed",True,True,True,True)
assert safe=={"action":"PRESERVE_SEQ39_AND_FIX_HOST","reason":"host_or_external_failure_with_all_device_safety_proofs","safe_candidate_retry":True}
for params in ((False,True,True,True),(True,False,True,True),(True,True,False,True),(True,True,True,False)):
    assert m.recovery_decision("TimeoutError: host failure",*params)["action"]=="RECOVER_RELEASE07"
assert m.recovery_decision("foundation-steady-state-frame-interval-stop",True,True,True,True)["action"]=="RECOVER_RELEASE07"
print("PASS: seq39 host/external failures preserve only a fully healthy candidate with exact renderer restore; genuine runtime or missing safety proof selects exact Release07 recovery")
