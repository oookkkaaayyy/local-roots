#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, pathlib, re

ROOT=pathlib.Path(__file__).resolve().parents[1]
DEFAULT_MODEL=ROOT/"config/HBNF_CONTROL_MODEL.json"
DEFAULT_STATE=ROOT/"config/HBNF_CONTROL_STATE.json"

def load(path):
    return json.loads(pathlib.Path(path).read_text())

def save(path,obj):
    pathlib.Path(path).write_text(json.dumps(obj,indent=2,sort_keys=True)+"\\n")

def sha256_file(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def next_transition(model,state):
    out=[t for t in model["transitions"] if t["from"]==state["lifecycle_state"]]
    if len(out)>1: raise ValueError("ambiguous control model: multiple outgoing transitions")
    return out[0] if out else None

def validate_model(model):
    errors=[]
    states=model.get("states",[])
    if len(states)!=len(set(states)): errors.append("duplicate states")
    ids=[t["id"] for t in model.get("transitions",[])]
    if len(ids)!=len(set(ids)): errors.append("duplicate transition ids")
    for s in states:
        out=[t for t in model.get("transitions",[]) if t["from"]==s]
        if s!="ACCEPTED" and len(out)!=1: errors.append(f"{s}: expected exactly one outgoing transition, got {len(out)}")
        if s=="ACCEPTED" and out: errors.append("ACCEPTED must be terminal")
    for t in model.get("transitions",[]):
        if t["from"] not in states or t["to"] not in states: errors.append(t["id"]+": unknown state")
        req=t.get("required_checks",[])
        if not req or len(req)!=len(set(req)): errors.append(t["id"]+": required_checks empty or duplicate")
    return errors

def validate_state(model,state):
    errors=validate_model(model)
    if state.get("model_schema")!=model.get("schema"): errors.append("state/model schema mismatch")
    if state.get("lifecycle_state") not in model.get("states",[]): errors.append("unknown lifecycle state")
    for item in state.get("completed_receipts",[]):
        if set(item)!={"transition_id","receipt_sha256","subject"}: errors.append("completed receipt has unexpected fields")
    return errors

def forbidden_evidence_name(model,name):
    low=name.lower()
    return any(p in low for p in model["receipt_contract"]["forbidden_evidence_name_patterns"])

def validate_receipt(model,state,receipt):
    t=next_transition(model,state)
    if not t: return ["no next transition"]
    c=model["receipt_contract"]
    required=set(c["required_top_level"])
    if t.get("human_approval_required"): required.add("approval")
    errors=[]
    if set(receipt)!=required: errors.append("receipt top-level fields must exactly match transition contract")
    if receipt.get("schema")!=c["schema"]: errors.append("receipt schema mismatch")
    if receipt.get("receipt_type")!=t["receipt_type"]: errors.append("receipt_type does not match next transition")
    if receipt.get("transition_id")!=t["id"]: errors.append("transition_id does not match next transition")
    if receipt.get("outcome")!=c["outcome_required"]: errors.append("receipt outcome must be PASS")
    subject=receipt.get("subject")
    if not isinstance(subject,dict) or set(subject)!=set(c["subject_required"]):
        errors.append("subject fields must exactly match contract")
    else:
        if not all(isinstance(subject[k],str) and subject[k].strip() for k in c["subject_required"]):
            errors.append("subject values must be nonempty strings")
        if not re.fullmatch(r"[0-9a-fA-F]{64}",subject.get("artifact_sha256","")):
            errors.append("subject.artifact_sha256 must be SHA-256 hex")
        identity_type=subject.get("source_identity_type")
        allowed=set(c.get("source_identity_types",[]))
        if identity_type not in allowed:
            errors.append("subject.source_identity_type is not allowed")
        identity=str(subject.get("source_identity",""))
        if identity_type=="git_commit" and not re.fullmatch(r"[0-9a-fA-F]{40}",identity):
            errors.append("git source_identity must be 40-hex commit SHA")
        if identity_type in {"source_tree_sha256","source_archive_sha256"} and not re.fullmatch(r"[0-9a-fA-F]{64}",identity):
            errors.append("content-addressed source_identity must be SHA-256 hex")
    checks=receipt.get("checks")
    expected=set(t["required_checks"])
    if not isinstance(checks,dict) or set(checks)!=expected:
        errors.append("receipt checks must exactly match transition requirements")
    else:
        errors += [k+" must be true" for k,v in checks.items() if v is not True]
    artifacts=receipt.get("evidence_artifacts")
    if not isinstance(artifacts,list) or not artifacts:
        errors.append("evidence_artifacts must be a nonempty list")
    else:
        for item in artifacts:
            if not isinstance(item,dict) or set(item)!={"name","sha256"}:
                errors.append("evidence artifact must contain exactly name + sha256"); continue
            name=str(item["name"])
            if forbidden_evidence_name(model,name):
                errors.append("forbidden recursive/policy evidence reference: "+name)
            if not re.fullmatch(r"[0-9a-fA-F]{64}",str(item["sha256"])):
                errors.append("invalid evidence artifact sha256: "+name)
    if t.get("human_approval_required"):
        ap=receipt.get("approval")
        if not isinstance(ap,dict) or set(ap)!={"approved_by_user","reference"}:
            errors.append("approval must contain exactly approved_by_user + reference")
        elif ap.get("approved_by_user") is not True or not str(ap.get("reference") or "").strip():
            errors.append("explicit user approval required")
    return errors

def status(model,state):
    errs=validate_state(model,state)
    t=next_transition(model,state) if not errs else None
    return {
      "schema":"hbnf-control-status-v2",
      "model_valid":not errs,
      "validation_errors":errs,
      "current_state":state.get("lifecycle_state"),
      "next_transition":t["id"] if t else None,
      "next_state":t["to"] if t else None,
      "required_receipt_type":t["receipt_type"] if t else None,
      "live_mutation_authorized":state.get("live_mutation_authorized") is True,
      "phase2_implementation_authorized":state.get("phase2_implementation_authorized") is True
    }

def advance(model,state,receipt_path):
    receipt=load(receipt_path)
    errors=validate_receipt(model,state,receipt)
    if errors: raise ValueError("receipt rejected: "+"; ".join(errors))
    t=next_transition(model,state)
    state["completed_receipts"].append({
      "transition_id":t["id"],
      "receipt_sha256":sha256_file(receipt_path),
      "subject":receipt["subject"]
    })
    state["lifecycle_state"]=t["to"]
    state["phase2_implementation_authorized"]=(t["to"]=="PHASE2_INTEGRATING")
    return state

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--model",default=str(DEFAULT_MODEL))
    ap.add_argument("--state",default=str(DEFAULT_STATE))
    sub=ap.add_subparsers(dest="cmd",required=True)
    sub.add_parser("status")
    a=sub.add_parser("advance"); a.add_argument("--receipt",required=True)
    args=ap.parse_args()
    model=load(args.model); state=load(args.state)
    if args.cmd=="status":
        print(json.dumps(status(model,state),indent=2,sort_keys=True))
        return 0 if not validate_state(model,state) else 2
    if args.cmd=="advance":
        advance(model,state,args.receipt)
        if validate_state(model,state): raise SystemExit("refusing to save invalid state")
        save(args.state,state)
        print(json.dumps(status(model,state),indent=2,sort_keys=True))
        return 0
    return 2

if __name__=="__main__":
    raise SystemExit(main())
