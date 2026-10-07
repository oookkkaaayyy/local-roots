#!/usr/bin/env python3
"""HBNF architecture fitness function.

Fails when the release/control architecture drifts back toward multiple authorities,
branching/cyclic lifecycle logic, nested receipts, or legacy gate files acting as
parallel control planes.
"""
from __future__ import annotations

import json, pathlib, re, sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
MODEL_PATH=ROOT/"config/HBNF_CONTROL_MODEL.json"
STATE_PATH=ROOT/"config/HBNF_CONTROL_STATE.json"
AGENTS=ROOT/"AGENTS.md"

errors=[]

def fail(msg): errors.append(msg)

if not MODEL_PATH.is_file(): fail("missing HBNF_CONTROL_MODEL.json")
if not STATE_PATH.is_file(): fail("missing HBNF_CONTROL_STATE.json")
if not AGENTS.is_file(): fail("missing root AGENTS.md")

if not errors:
    model=json.loads(MODEL_PATH.read_text())
    state=json.loads(STATE_PATH.read_text())

    if model.get("authority")!="PRIMARY_OPERATIONAL_DECISION_MODEL":
        fail("control model is not PRIMARY_OPERATIONAL_DECISION_MODEL")
    if model.get("design")!="linear_stage_receipts":
        fail("control model design drifted from linear_stage_receipts")

    states=model.get("states",[])
    transitions=model.get("transitions",[])
    if len(states)>6: fail(f"complexity budget exceeded: {len(states)} states > 6")
    if len(transitions)>5: fail(f"complexity budget exceeded: {len(transitions)} transitions > 5")

    for s in states:
        outgoing=[t for t in transitions if t.get("from")==s]
        if s=="ACCEPTED":
            if outgoing: fail("ACCEPTED must remain terminal")
        elif len(outgoing)!=1:
            fail(f"{s}: expected exactly one outgoing transition, got {len(outgoing)}")

    # Prove the transition graph is one acyclic linear chain from first state to ACCEPTED.
    if states:
        cur=states[0]; seen=[]
        while cur!="ACCEPTED":
            if cur in seen:
                fail("cycle detected in lifecycle")
                break
            seen.append(cur)
            outgoing=[t for t in transitions if t.get("from")==cur]
            if len(outgoing)!=1: break
            cur=outgoing[0].get("to")
            if cur not in states:
                fail("transition points to unknown state")
                break
        if cur=="ACCEPTED" and len(seen)!=len(states)-1:
            fail("lifecycle does not form one complete linear chain")

    contract=model.get("receipt_contract",{})
    forbidden=set(contract.get("forbidden_evidence_name_patterns",[]))
    required_forbidden={"receipt","control_model","control_state","read_first","postmortem","runbook","aks"}
    if not required_forbidden.issubset(forbidden):
        fail("receipt anti-recursion guard weakened")

    if state.get("model_schema")!=model.get("schema"):
        fail("state/model schema mismatch")

# Exactly one primary operational authority declaration anywhere under config/work/scripts.
authority_hits=[]
for base in [ROOT/"config",ROOT/"work",ROOT/"scripts"]:
    if not base.exists(): continue
    for p in base.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in {".json",".md",".py"}: continue
        # The validator contains the marker in its own scan predicate; do not
        # count that implementation detail as a second authority declaration.
        if p.resolve() == pathlib.Path(__file__).resolve(): continue
        try: txt=p.read_text(errors="replace")
        except Exception: continue
        if '"PRIMARY_OPERATIONAL_DECISION_MODEL"' in txt:
            authority_hits.append(str(p.relative_to(ROOT)))
if authority_hits!=["config/HBNF_CONTROL_MODEL.json"]:
    fail("primary authority duplicated or moved: "+repr(authority_hits))

legacy=[
  ROOT/"config/HBNF_CART2_STAGING_GATES.json",
  ROOT/"config/HBNF_RELEASE_STATUS_TEMPLATE.json",
  ROOT/"config/HBNF_PR46_POSTMORTEM_ACTIONS.json",
]
for p in legacy:
    if not p.is_file():
        fail("missing legacy-reference marker file: "+str(p.relative_to(ROOT)))
        continue
    try: data=json.loads(p.read_text())
    except Exception as e:
        fail(f"{p.name}: invalid JSON: {e}")
        continue
    if data.get("operational_authority")!="REFERENCE_ONLY__USE_HBNF_CONTROL_MODEL_STATE":
        fail(p.name+": legacy gate file regained operational authority")

if AGENTS.is_file():
    txt=AGENTS.read_text()
    for needle in [
      "python3 scripts/hbnf_control.py status",
      "python3 scripts/hbnf_control.py check-change --change <record-or-manifest.json>",
      "python3 scripts/hbnf_architecture_fitness.py",
      "Do not add free-floating governance rules",
    ]:
        if needle not in txt: fail("AGENTS.md missing persistent instruction: "+needle)

if errors:
    print("HBNF_ARCHITECTURE_FITNESS=FAIL")
    for e in errors: print(" - "+e)
    raise SystemExit(2)

print("HBNF_ARCHITECTURE_FITNESS=PASS")
print("states<=6 transitions<=5 linear_chain=true single_authority=true receipts_nonrecursive=true")
