#!/usr/bin/env python3
import copy, importlib.util, json, pathlib, tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("ctrl",ROOT/"scripts/hbnf_control.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
model=json.loads((ROOT/"config/HBNF_CONTROL_MODEL.json").read_text())
state=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text())

# Initial state is valid and cannot advance with no evidence.
assert not m.validate(model,state)
s=m.status(model,state)
assert s["current_state"]=="DIAGNOSTIC_ACTIVE"
assert s["next_state"]=="ROOT_CAUSE_PROVEN"
assert set(s["blockers"])=={
  "diagnostic_artifact_identity","timing_attribution_complete",
  "root_cause_evidence","instrumentation_overhead_characterized"
}

# Unknown evidence is rejected.
bad=copy.deepcopy(state); bad["evidence"]["random_new_rule"]=True
assert any("unknown evidence" in x for x in m.validate(model,bad))

# Human approval cannot be silently inferred.
approval=copy.deepcopy(state)
approval["evidence"]["scope_contract_locked"]=True
assert any("human approval" in x for x in m.validate(model,approval))

# Completing exactly the T1 evidence permits exactly one transition.
ready=copy.deepcopy(state)
for k in m.next_transition(model,ready)["requires"]:
    ready["evidence"][k]=True
    ready["evidence_refs"][k]="test-evidence"
assert m.status(model,ready)["transition_ready"] is True
m.advance(model,ready)
assert ready["lifecycle_state"]=="ROOT_CAUSE_PROVEN"
assert ready["phase2_implementation_authorized"] is False

# Cannot skip directly to Phase 2 merely by toggling unrelated downstream gates.
skip=copy.deepcopy(state)
for k in skip["evidence"]: skip["evidence"][k]=True
for k,spec2 in model["evidence_catalog"].items():
    if spec2.get("human_approval_required"):
        skip["approvals"][k]={"approved_by_user":True,"reference":"test-user-approval"}
        skip["evidence_refs"][k]="test-user-approval"
    else:
        skip["evidence_refs"][k]="test"
assert m.next_transition(model,skip)["to"]=="ROOT_CAUSE_PROVEN"
m.advance(model,skip)
assert skip["lifecycle_state"]=="ROOT_CAUSE_PROVEN"

# Every state except ACCEPTED has at most one forward transition.
for st in model["states"]:
    out=[t for t in model["transitions"] if t["from"]==st]
    assert len(out)<=1, (st,out)

print("PASS: HBNF control plane is explicit, non-chaining, fail-closed, approval-aware, and non-skippable")
