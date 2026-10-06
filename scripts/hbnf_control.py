#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, pathlib, re

ROOT=pathlib.Path(__file__).resolve().parents[1]
DEFAULT_MODEL=ROOT/"config/HBNF_CONTROL_MODEL.json"
DEFAULT_STATE=ROOT/"config/HBNF_CONTROL_STATE.json"

def load(path):
    return json.loads(pathlib.Path(path).read_text())

def save(path,obj):
    pathlib.Path(path).write_text(json.dumps(obj,indent=2,sort_keys=True)+"\n")

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
    es=model.get("execution_system")
    if not isinstance(es,dict): return errors+["execution_system missing"]
    for key in ("authority_contract","evidence_inheritance","failure_domains","change_impact","prelive_offline_first","learning_loop","parallelism","phase2_dag","release_scope"):
        if key not in es: errors.append("execution_system."+key+" missing")
    auth=es.get("authority_contract",{})
    operational=auth.get("operational_lifecycle",[])
    if operational!=["config/HBNF_CONTROL_MODEL.json","config/HBNF_CONTROL_STATE.json"]:
        errors.append("operational authority must be exactly control model + control state")
    return errors

def parallelism_status(model,state):
    pe=model.get("execution_system",{}).get("parallelism",{})
    core=pe.get("core_lanes",[])
    lifecycle=state.get("lifecycle_state")
    required=lifecycle in set(pe.get("required_when",[]))
    lane_root=state.get("lane_execution",{})
    lane_state=lane_root.get("lanes",{}) if isinstance(lane_root,dict) else {}
    allowed=set(pe.get("allowed_lane_status",[]))
    violations=[]
    if required:
        for lane in core:
            item=lane_state.get(lane)
            if not isinstance(item,dict):
                violations.append(lane+": missing lane state")
                continue
            st=item.get("status")
            if st not in allowed:
                violations.append(lane+": invalid/non-active status "+str(st))
            if st=="BLOCKED_WITH_EXACT_DEPENDENCY":
                if not str(item.get("blocker") or "").strip() or not str(item.get("dependency") or "").strip():
                    violations.append(lane+": blocked state missing blocker/dependency")
    return {
      "required":required,
      "core_lanes":core,
      "tracked":sorted(lane_state.keys()),
      "violations":violations,
      "pass":not violations
    }

def validate_state(model,state):
    errors=validate_model(model)
    if state.get("model_schema")!=model.get("schema"): errors.append("state/model schema mismatch")
    if state.get("lifecycle_state") not in model.get("states",[]): errors.append("unknown lifecycle state")
    for item in state.get("completed_receipts",[]):
        if set(item)!={"transition_id","receipt_sha256","subject"}: errors.append("completed receipt has unexpected fields")
    cursor=state.get("execution_cursor")
    if not isinstance(cursor,dict):
        errors.append("execution_cursor missing")
    else:
        if cursor.get("current_lifecycle_state")!=state.get("lifecycle_state"):
            errors.append("execution_cursor lifecycle does not match state")
        nt=next_transition(model,state)
        expected=nt.get("id") if nt else None
        if cursor.get("current_transition")!=expected:
            errors.append("execution_cursor transition does not match model")
    inherited=state.get("inherited_evidence")
    if not isinstance(inherited,list):
        errors.append("inherited_evidence missing")
    else:
        ids=[]
        for item in inherited:
            if not isinstance(item,dict):
                errors.append("inherited evidence item must be object"); continue
            eid=item.get("id")
            if not isinstance(eid,str) or not eid.strip(): errors.append("inherited evidence id missing")
            else: ids.append(eid)
            if item.get("status")!="REUSABLE": errors.append(str(eid)+": inherited evidence must be REUSABLE")
            if not isinstance(item.get("proves"),list) or not item.get("proves"): errors.append(str(eid)+": proves missing")
            if not isinstance(item.get("invalidators"),list) or not item.get("invalidators"): errors.append(str(eid)+": invalidators missing")
        if len(ids)!=len(set(ids)): errors.append("duplicate inherited evidence ids")
    metrics=state.get("process_metrics")
    domains=set(model.get("execution_system",{}).get("failure_domains",{}))
    if not isinstance(metrics,dict):
        errors.append("process_metrics missing")
    else:
        counts=metrics.get("live_attempt_failures_by_domain")
        if not isinstance(counts,dict) or set(counts)!=domains:
            errors.append("process_metrics domain counters must exactly match failure domains")
        else:
            for k,v in counts.items():
                if not isinstance(v,int) or v<0: errors.append("process_metrics invalid counter "+k)
        for key in ("host_process_wasted_live_attempts","device_runtime_failed_live_attempts"):
            if not isinstance(metrics.get(key),int) or metrics.get(key)<0:
                errors.append("process_metrics invalid "+key)
        if not isinstance(metrics.get("events"),list): errors.append("process_metrics events missing")
    p=parallelism_status(model,state)
    if p["required"] and not p["pass"]:
        errors.extend(["parallelism: "+x for x in p["violations"]])
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
        if identity_type not in allowed: errors.append("subject.source_identity_type is not allowed")
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
            if forbidden_evidence_name(model,name): errors.append("forbidden recursive/policy evidence reference: "+name)
            if not re.fullmatch(r"[0-9a-fA-F]{64}",str(item["sha256"])):
                errors.append("invalid evidence artifact sha256: "+name)
    if t.get("human_approval_required"):
        ap=receipt.get("approval")
        if not isinstance(ap,dict) or set(ap)!={"approved_by_user","reference"}:
            errors.append("approval must contain exactly approved_by_user + reference")
        elif ap.get("approved_by_user") is not True or not str(ap.get("reference") or "").strip():
            errors.append("explicit user approval required")
    return errors

def impact_for_change(model,change_type):
    ci=model["execution_system"]["change_impact"]
    if change_type not in ci:
        raise ValueError("unknown change type; use one of: "+", ".join(sorted(ci)))
    item=ci[change_type]
    return {
      "schema":"hbnf-change-impact-v1",
      "change_type":change_type,
      "invalidates":item.get("invalidates"),
      "required_verification":item.get("required_verification",[]),
      "foundation_requalification":item.get("foundation_requalification"),
      "rule":"Run only impact-required verification unless dependency impact is unknown; unknown impact broadens conservatively."
    }

def failure_policy(model,domain):
    fd=model["execution_system"]["failure_domains"]
    if domain not in fd:
        raise ValueError("unknown failure domain; use one of: "+", ".join(sorted(fd)))
    item=fd[domain]
    return {
      "schema":"hbnf-failure-policy-v1",
      "domain":domain,
      "invalidates":item.get("invalidates",[]),
      "default_action":item.get("default_action"),
      "rule":"Invalidate only the affected evidence/lane; do not move unrelated lifecycle work backward."
    }

def record_failure(model,state,domain,reference,live_attempt=False):
    policy=failure_policy(model,domain)
    metrics=state.get("process_metrics")
    if not isinstance(metrics,dict): raise ValueError("process_metrics missing")
    events=metrics.setdefault("events",[])
    if any(str(e.get("reference"))==reference for e in events if isinstance(e,dict)):
        raise ValueError("failure reference already recorded")
    counts=metrics.setdefault("live_attempt_failures_by_domain",{})
    counts.setdefault(domain,0)
    if live_attempt:
        counts[domain]+=1
        if domain in {"HOST_HARNESS","RELEASE_DEPLOYMENT"}:
            metrics["host_process_wasted_live_attempts"]=metrics.get("host_process_wasted_live_attempts",0)+1
        if domain=="DEVICE_RUNTIME":
            metrics["device_runtime_failed_live_attempts"]=metrics.get("device_runtime_failed_live_attempts",0)+1
    events.append({
      "event_id":len(events)+1,
      "domain":domain,
      "reference":reference,
      "live_attempt":bool(live_attempt),
      "invalidates":policy["invalidates"]
    })
    return policy

def external_parallel_launch_status(model,state):
    pe=model.get("execution_system",{}).get("parallelism",{})
    orch=pe.get("orchestration",{})
    lane_root=state.get("lane_execution",{})
    state_orch=lane_root.get("orchestration",{}) if isinstance(lane_root,dict) else {}
    return {
      "worker_can_spawn_workers": False,
      "launch_owner": state_orch.get("owner","COORDINATOR_EXTERNAL_TO_LIVE_WORKER"),
      "activation_event": state_orch.get("activation_event","FOUNDATION_SOAK_RUNNING"),
      "required_live_worker_signal": state_orch.get("required_live_worker_signal","PARALLEL_LANES_READY"),
      "launch_status": state_orch.get("launch_status"),
      "failure_ownership": orch.get("failure_ownership")
    }

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
      "phase2_implementation_authorized":state.get("phase2_implementation_authorized") is True,
      "execution_cursor":state.get("execution_cursor"),
      "inherited_evidence_ids":[x.get("id") for x in state.get("inherited_evidence",[]) if isinstance(x,dict)],
      "parallelism":parallelism_status(model,state),
      "external_parallel_launch":external_parallel_launch_status(model,state)
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
    cursor=state.get("execution_cursor")
    if isinstance(cursor,dict):
        cursor["current_lifecycle_state"]=state["lifecycle_state"]
        nt=next_transition(model,state)
        cursor["current_transition"]=nt["id"] if nt else None
    return state

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--model",default=str(DEFAULT_MODEL))
    ap.add_argument("--state",default=str(DEFAULT_STATE))
    sub=ap.add_subparsers(dest="cmd",required=True)
    sub.add_parser("status")
    a=sub.add_parser("advance"); a.add_argument("--receipt",required=True)
    i=sub.add_parser("impact"); i.add_argument("--change-type",required=True)
    fp=sub.add_parser("failure"); fp.add_argument("--domain",required=True)
    rf=sub.add_parser("record-failure")
    rf.add_argument("--domain",required=True)
    rf.add_argument("--reference",required=True)
    rf.add_argument("--live-attempt",action="store_true")
    args=ap.parse_args()
    model=load(args.model); state=load(args.state)
    if args.cmd=="status":
        print(json.dumps(status(model,state),indent=2,sort_keys=True))
        return 0 if not validate_state(model,state) else 2
    if args.cmd=="impact":
        if validate_model(model): raise SystemExit("invalid model")
        print(json.dumps(impact_for_change(model,args.change_type),indent=2,sort_keys=True)); return 0
    if args.cmd=="failure":
        if validate_model(model): raise SystemExit("invalid model")
        print(json.dumps(failure_policy(model,args.domain),indent=2,sort_keys=True)); return 0
    if args.cmd=="record-failure":
        if validate_model(model): raise SystemExit("invalid model")
        policy=record_failure(model,state,args.domain,args.reference,args.live_attempt)
        errs=validate_state(model,state)
        if errs: raise SystemExit("refusing to save invalid state: "+"; ".join(errs))
        save(args.state,state)
        print(json.dumps({"recorded":True,"policy":policy,"process_metrics":state["process_metrics"]},indent=2,sort_keys=True))
        return 0
    if args.cmd=="advance":
        advance(model,state,args.receipt)
        errs=validate_state(model,state)
        if errs: raise SystemExit("refusing to save invalid state: "+"; ".join(errs))
        save(args.state,state)
        print(json.dumps(status(model,state),indent=2,sort_keys=True))
        return 0
    return 2

if __name__=="__main__":
    raise SystemExit(main())
