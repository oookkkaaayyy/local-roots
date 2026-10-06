#!/usr/bin/env python3
"""Offline tests for seq37 host-failure preservation versus real recovery."""
import importlib.util,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("seq37_failure_policy",ROOT/"scripts/hbnf_foundation_seq37_failure_policy.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

assert m.classify_run_error("TimeoutError: evidence writer deadline expired")=="HOST_OR_EXTERNAL"
assert m.classify_run_error("foundation-steady-state-frame-interval-stop: frame_ms_max=1000ms")=="DEVICE_OR_FOUNDATION_GATE"
assert m.classify_run_error("release identity changed during sweep")=="DEVICE_OR_FOUNDATION_GATE"
assert m.classify_run_error("OSError: disk full while writing report")=="HOST_OR_EXTERNAL"

snapshot={"snapshotId":7,"snapshotHash":1234}
restored={"HBNF":{"packet20Diagnostic":{"restoreVerified":True,"packet20Same":True,"snapshotId":7,"snapshotHash":1234}}}
assert m.restore_is_proven(snapshot,restored,{"snapshot_equal":True,"snapshotId":7,"snapshotHash":1234})
assert not m.restore_is_proven(snapshot,{"HBNF":{"packet20Diagnostic":{**restored["HBNF"]["packet20Diagnostic"],"packet20Same":False}}})
assert not m.restore_is_proven(snapshot,restored,{"snapshot_equal":False,"snapshotId":7,"snapshotHash":1234})

safe=m.recovery_decision("TimeoutError: host evidence write failed",True,True,True,True)
assert safe=={"action":"PRESERVE_SEQ37_AND_FIX_HOST","reason":"host_or_external_failure_with_all_device_safety_proofs","safe_candidate_retry":True}
for params in ((False,True,True,True),(True,False,True,True),(True,True,False,True),(True,True,True,False)):
    assert m.recovery_decision("TimeoutError: host failure",*params)["action"]=="RECOVER_RELEASE07"
assert m.recovery_decision("foundation-steady-state-frame-interval-stop",True,True,True,True)["action"]=="RECOVER_RELEASE07"
print("PASS: seq37 host/external failures preserve only a fully healthy candidate with exact renderer restore; genuine runtime or missing safety proof selects exact Release07 recovery")
