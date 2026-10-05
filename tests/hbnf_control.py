#!/usr/bin/env python3
import copy, importlib.util, json, pathlib, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("ctrl",ROOT/"scripts/hbnf_control.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
model=json.loads((ROOT/"config/HBNF_CONTROL_MODEL.json").read_text())
state=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text())
state["lifecycle_state"]="DIAGNOSTIC_ACTIVE"
state["completed_receipts"]=[]

assert not m.validate_state(model,state)
s=m.status(model,state)
assert s["current_state"]=="DIAGNOSTIC_ACTIVE"
assert s["next_state"]=="FIX_CANDIDATE"

t=m.next_transition(model,state)
receipt={
 "schema":"hbnf-stage-receipt-v1",
 "receipt_type":t["receipt_type"],
 "transition_id":t["id"],
 "subject":{"release_id":"test","source_identity_type":"source_tree_sha256","source_identity":"c"*64,"artifact_sha256":"a"*64},
 "checks":{k:True for k in t["required_checks"]},
 "outcome":"PASS",
 "evidence_artifacts":[{"name":"timing-report.json","sha256":"b"*64}]
}
assert m.validate_receipt(model,state,receipt)==[]

git_receipt=copy.deepcopy(receipt)
git_receipt["subject"]["source_identity_type"]="git_commit"
git_receipt["subject"]["source_identity"]="d"*40
assert m.validate_receipt(model,state,git_receipt)==[]

bad_identity=copy.deepcopy(receipt)
bad_identity["subject"]["source_identity"]="not-a-hash"
assert any("source_identity" in x for x in m.validate_receipt(model,state,bad_identity))

bad=copy.deepcopy(receipt); bad["checks"]["random_rule"]=True
assert m.validate_receipt(model,state,bad)

recursive=copy.deepcopy(receipt)
recursive["evidence_artifacts"]=[{"name":"PR46_POSTMORTEM.md","sha256":"b"*64}]
assert any("forbidden" in x for x in m.validate_receipt(model,state,recursive))

with tempfile.TemporaryDirectory() as d:
    p=pathlib.Path(d)/"stage.json"; p.write_text(json.dumps(receipt))
    st=copy.deepcopy(state); m.advance(model,st,p)
    assert st["lifecycle_state"]=="FIX_CANDIDATE"
    saved=pathlib.Path(d)/"saved.json"; m.save(saved,st)
    assert json.loads(saved.read_text())["lifecycle_state"]=="FIX_CANDIDATE"
    assert len(st["completed_receipts"])==1
    assert st["phase2_implementation_authorized"] is False

seen=set(); cur=model["states"][0]
while cur!="ACCEPTED":
    assert cur not in seen
    seen.add(cur)
    outs=[t for t in model["transitions"] if t["from"]==cur]
    assert len(outs)==1
    cur=outs[0]["to"]
assert cur=="ACCEPTED"

print("PASS: linear receipt control plane is acyclic, nonrecursive, exact-input, and fail-closed")
