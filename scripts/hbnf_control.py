#!/usr/bin/env python3
"""HBNF deterministic control plane.

One model + one current-state file decide promotion status.
Natural-language docs are evidence/reference only.

Stdlib only.
"""
from __future__ import annotations

import argparse, json, pathlib, sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
DEFAULT_MODEL=ROOT/"config/HBNF_CONTROL_MODEL.json"
DEFAULT_STATE=ROOT/"config/HBNF_CONTROL_STATE.json"

def load(path):
    return json.loads(pathlib.Path(path).read_text())

def save(path,obj):
    pathlib.Path(path).write_text(json.dumps(obj,indent=2,sort_keys=True)+"\n")

def transition_map(model):
    return {(t["from"],t["to"]):t for t in model["transitions"]}

def validate(model,state):
    errors=[]
    states=set(model.get("states",[]))
    if state.get("model_schema")!=model.get("schema"):
        errors.append("state/model schema mismatch")
    if state.get("lifecycle_state") not in states:
        errors.append("unknown lifecycle_state")
    catalog=model.get("evidence_catalog",{})
    evidence=state.get("evidence",{})
    unknown=sorted(set(evidence)-set(catalog))
    missing=sorted(set(catalog)-set(evidence))
    if unknown: errors.append("unknown evidence keys: "+", ".join(unknown))
    if missing: errors.append("missing evidence keys: "+", ".join(missing))
    for k,v in evidence.items():
        if k in catalog and catalog[k].get("type")=="boolean" and not isinstance(v,bool):
            errors.append(f"{k}: expected boolean")
    for k,spec in catalog.items():
        if spec.get("human_approval_required") and evidence.get(k):
            ap=(state.get("approvals") or {}).get(k) or {}
            if ap.get("approved_by_user") is not True or not str(ap.get("reference") or "").strip():
                errors.append(f"{k}: human approval evidence lacks explicit approval/reference")
    return errors

def next_transition(model,state):
    cur=state["lifecycle_state"]
    matches=[t for t in model["transitions"] if t["from"]==cur]
    if len(matches)>1:
        raise ValueError("model has ambiguous outgoing transitions from "+cur)
    return matches[0] if matches else None

def blockers(model,state,transition):
    if not transition: return []
    return [k for k in transition.get("requires",[]) if state.get("evidence",{}).get(k) is not True]

def status(model,state):
    errs=validate(model,state)
    t=next_transition(model,state) if not errs else None
    b=blockers(model,state,t) if t else []
    return {
      "schema":"hbnf-control-status-v1",
      "model_valid":not errs,
      "validation_errors":errs,
      "current_state":state.get("lifecycle_state"),
      "next_transition":t["id"] if t else None,
      "next_state":t["to"] if t else None,
      "blockers":b,
      "transition_ready":bool(t) and not b and not errs,
      "live_mutation_authorized":state.get("live_mutation_authorized") is True,
      "phase2_implementation_authorized":state.get("phase2_implementation_authorized") is True
    }

def record(model,state,key,value,reference=None,approved_by_user=False):
    catalog=model["evidence_catalog"]
    if key not in catalog:
        raise ValueError("unknown evidence key: "+key)
    if value not in ("true","false"):
        raise ValueError("value must be true or false")
    val=(value=="true")
    if val and not reference:
        raise ValueError("true evidence requires a reference")
    state["evidence"][key]=val
    if reference:
        state.setdefault("evidence_refs",{})[key]=reference
    if catalog[key].get("human_approval_required") and val:
        if not approved_by_user:
            raise ValueError(key+" requires --approved-by-user")
        state.setdefault("approvals",{})[key]={"approved_by_user":True,"reference":reference}
    return state

def advance(model,state):
    s=status(model,state)
    if not s["model_valid"]:
        raise ValueError("invalid control state: "+"; ".join(s["validation_errors"]))
    if not s["next_transition"]:
        raise ValueError("no forward transition from current state")
    if s["blockers"]:
        raise ValueError("blocked by: "+", ".join(s["blockers"]))
    t=next_transition(model,state)
    state["last_transition"]={"id":t["id"],"from":t["from"],"to":t["to"]}
    state["lifecycle_state"]=t["to"]
    if t["to"]=="PHASE2_INTEGRATING":
        state["phase2_implementation_authorized"]=True
    return state

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--model",default=str(DEFAULT_MODEL))
    ap.add_argument("--state",default=str(DEFAULT_STATE))
    sub=ap.add_subparsers(dest="cmd",required=True)
    sub.add_parser("status")
    r=sub.add_parser("record")
    r.add_argument("key")
    r.add_argument("value",choices=["true","false"])
    r.add_argument("--reference")
    r.add_argument("--approved-by-user",action="store_true")
    sub.add_parser("advance")
    args=ap.parse_args()

    model=load(args.model); state=load(args.state)

    if args.cmd=="status":
        print(json.dumps(status(model,state),indent=2,sort_keys=True))
        return 0 if not validate(model,state) else 2
    if args.cmd=="record":
        record(model,state,args.key,args.value,args.reference,args.approved_by_user)
        if validate(model,state):
            raise SystemExit("refusing to save invalid state: "+"; ".join(validate(model,state)))
        save(args.state,state)
        print(json.dumps(status(model,state),indent=2,sort_keys=True))
        return 0
    if args.cmd=="advance":
        advance(model,state)
        if validate(model,state):
            raise SystemExit("refusing to save invalid state: "+"; ".join(validate(model,state)))
        save(args.state,state)
        print(json.dumps(status(model,state),indent=2,sort_keys=True))
        return 0

if __name__=="__main__":
    raise SystemExit(main())
