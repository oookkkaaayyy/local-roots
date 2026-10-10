#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, pathlib, re, time, subprocess

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
    for key in ("authority_contract","evidence_inheritance","failure_domains","change_impact","prelive_offline_first","learning_loop","parallelism","phase2_dag","release_scope","engineering_change_governance"):
        if key not in es: errors.append("execution_system."+key+" missing")
    auth=es.get("authority_contract",{})
    operational=auth.get("operational_lifecycle",[])
    if operational!=["config/HBNF_CONTROL_MODEL.json","config/HBNF_CONTROL_STATE.json"]:
        errors.append("operational authority must be exactly control model + control state")
    governance=es.get("engineering_change_governance",{})
    if governance.get("schema")!="hbnf-engineering-change-governance-v1":
        errors.append("engineering change governance schema mismatch")
    if not isinstance(governance.get("classes"),dict) or set(governance.get("classes",{}))!={
        "TRIVIAL_BOUNDED","APPROVED_ARCHITECTURE_IMPLEMENTATION","ARCHITECTURAL_DECISION",
        "SUBJECTIVE_DESIGN","BESPOKE_REPLACEMENT","UNKNOWN_IMPACT"
    }:
        errors.append("engineering change applicability classes incomplete")
    if set(governance.get("full_evidence_fields",[]))!={
        "expert_basis","native_capability_check","mature_external_component_check",
        "decision_rationale","reproducibility","rollback_or_exit_path"
    }:
        errors.append("full engineering evidence contract incomplete")
    if not _has_text(governance.get("t4_manifest_path")):
        errors.append("T4 engineering governance manifest path missing")
    if governance.get("policy_only_invalidates_foundation") is not False:
        errors.append("governance-only changes must preserve Foundation evidence")
    t4=next((t for t in model.get("transitions",[]) if t.get("id")=="T4_PHASE2_INTEGRATION"),None)
    if t4 and governance.get("t4_receipt_check") not in t4.get("required_checks",[]):
        errors.append("T4 receipt must require engineering governance completion")
    rail=es.get("delivery_rail",{})
    if rail.get("schema")!="hbnf-cart2-delivery-rail-v1":
        errors.append("owner-mandated delivery rail missing or incorrect")
    if rail.get("owner_authorization_binding_schema")!="hbnf-exact-live-owner-authorization-v1":
        errors.append("exact live owner-authorization binding contract missing")
    if rail.get("live_authority_starts_closed") is not True or rail.get("admission_entrypoints_must_fail_closed") is not True:
        errors.append("release admission must fail closed and cannot authorize hardware")
    if rail.get("active_release_candidate_limit")!=1 or rail.get("live_lane_limit")!=1:
        errors.append("one-candidate/one-live-lane release limits violated")
    return errors

def release_admission_errors(model,state,manifest,stage):
    """Pure offline release-evidence admission; never calls a device or grants permission."""
    errors=[]
    if not isinstance(manifest,dict) or manifest.get("schema")!="hbnf-cart2-release-admission-v1":
        return ["wrong admission schema"]
    if stage not in ("OFFLINE_COMPILED","LIVE_APPROVED","LIVE_QUALIFICATION") or manifest.get("stage")!=stage:
        errors.append("wrong admission stage")
    if manifest.get("outcome")!="PASS": errors.append("manifest outcome is not PASS")
    identities=manifest.get("identities",{})
    if not isinstance(identities,dict):
        identities={}; errors.append("identities missing")
    for key in ("candidate_release_id","source_commit","candidate_bin_sha256","rollback_bin_sha256"):
        if not isinstance(identities.get(key),str) or not identities[key].strip(): errors.append("missing "+key)
    for key in ("candidate_bin_sha256","rollback_bin_sha256"):
        if identities.get(key) and not re.fullmatch(r"[a-f0-9]{64}",str(identities[key])):
            errors.append("invalid "+key)
    checks=manifest.get("checks",{})
    if not isinstance(checks,dict): checks={}; errors.append("checks missing")
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
        "rollback_artifact_hash_verified"
    )
    if stage in ("LIVE_APPROVED","LIVE_QUALIFICATION"):
        required+=("launcher_rejects_invalid_manifest_before_device_access",
                   "matched_tails_off_test_plan",
                   "preflight_read_only_hardware_state_and_identity")
    if stage=="LIVE_QUALIFICATION":
        required+=("consumed_exact_candidate_install_receipt",
                   "fresh_installed_candidate_runtime_identity",
                   "exact_recovery_bytes_available")
    evidence_hash_uses={}
    for key in required:
        item=checks.get(key)
        if not isinstance(item,dict) or item.get("pass") is not True:
            errors.append("failed/missing check: "+key); continue
        path=item.get("evidence_file"); sha=item.get("sha256")
        if not isinstance(path,str) or not path.strip() or not isinstance(sha,str) or not re.fullmatch(r"[a-f0-9]{64}",sha):
            errors.append("missing evidence SHA/path: "+key); continue
        path=pathlib.Path(path).expanduser()
        try:
            if not path.is_file() or sha256_file(path)!=sha:
                errors.append("missing/hash-mismatch evidence: "+key)
            else:
                evidence_hash_uses[sha]=evidence_hash_uses.get(sha,0)+1
                # Reject the former test anti-pattern where one generic JSON
                # blob was reused as proof for every unrelated release check.
                # A small amount of reuse remains valid (e.g. a candidate
                # manifest proves identity, compiler smoke, and resource use).
                try:
                    proof=json.loads(path.read_text())
                except (UnicodeDecodeError, json.JSONDecodeError):
                    proof=None
                if isinstance(proof,dict) and proof.get("schema")=="host-only-proof-fixture":
                    errors.append("test-only generic evidence is not release proof: "+key)
        except OSError:
            errors.append("unreadable evidence: "+key)
    if any(count>3 for count in evidence_hash_uses.values()):
        errors.append("one evidence artifact is reused for more than three independent checks")
    for prefix in ("candidate","rollback"):
        path=identities.get(prefix+"_bin_path")
        expected=identities.get(prefix+"_bin_sha256")
        if not isinstance(path,str) or not path.strip():
            errors.append("missing "+prefix+" binary path"); continue
        try:
            if sha256_file(pathlib.Path(path).expanduser())!=expected:
                errors.append(prefix+" binary SHA mismatch")
        except OSError:
            errors.append(prefix+" binary unreadable")
    if stage in ("LIVE_APPROVED","LIVE_QUALIFICATION"):
        if state.get("live_mutation_authorized") is not True:
            errors.append("primary control state has NO live mutation authorization")
        # A free-form string can accidentally carry approval from a different
        # artifact or scope. Require the state and admission to carry the same
        # exact, structured owner-authorized transaction binding.
        binding=manifest.get("fresh_owner_authorization")
        state_binding=state.get("live_authorization_binding")
        required_binding=("authorization_id","source_message_ref","candidate_release_id",
                          "candidate_bin_sha256","rollback_bin_sha256","matrix_mac",
                          "scope","candidate_install_limit","recovery_install_limit")
        if not isinstance(binding,dict):
            errors.append("fresh exact owner authorization binding missing")
        else:
            for key in required_binding:
                if key not in binding or binding.get(key) in (None,"",[],{}):
                    errors.append("owner authorization binding missing "+key)
            if binding.get("candidate_bin_sha256") and not re.fullmatch(r"[a-f0-9]{64}",str(binding["candidate_bin_sha256"])):
                errors.append("owner authorization candidate SHA invalid")
            if binding.get("rollback_bin_sha256") and not re.fullmatch(r"[a-f0-9]{64}",str(binding["rollback_bin_sha256"])):
                errors.append("owner authorization rollback SHA invalid")
            if not re.fullmatch(r"[0-9a-f]{12}",str(binding.get("matrix_mac","" )).replace(":","" ).lower()):
                errors.append("owner authorization Matrix MAC invalid")
            if not isinstance(binding.get("scope"),list) or not binding.get("scope"):
                errors.append("owner authorization scope must be a nonempty list")
            for key in ("candidate_install_limit","recovery_install_limit"):
                if not isinstance(binding.get(key),int) or binding[key] < 0:
                    errors.append("owner authorization "+key+" invalid")
            if isinstance(state_binding,dict) and binding!=state_binding:
                errors.append("manifest owner authorization differs from primary control-state binding")
            elif not isinstance(state_binding,dict):
                errors.append("primary control-state exact authorization binding missing")
            if binding.get("candidate_release_id")!=identities.get("candidate_release_id"):
                errors.append("owner authorization candidate release differs from admission")
            if binding.get("candidate_bin_sha256")!=identities.get("candidate_bin_sha256"):
                errors.append("owner authorization candidate SHA differs from admission")
            if binding.get("rollback_bin_sha256")!=identities.get("rollback_bin_sha256"):
                errors.append("owner authorization rollback SHA differs from admission")
            if str(binding.get("matrix_mac","" )).replace(":","" ).lower()!=str(identities.get("matrix_mac","" )).replace(":","" ).lower():
                errors.append("owner authorization Matrix target differs from admission")
        if identities.get("expected_installed_release")!=state.get("installed_release"):
            errors.append("installed release differs from primary state")
        if identities.get("expected_installed_bin_sha256")!=state.get("installed_firmware_sha256"):
            errors.append("installed BIN differs from primary state")
        if stage=="LIVE_QUALIFICATION":
            current=state.get("live_mutation_authorization",{})
            successor=state.get("r6_audio_cache_successor",{})
            auth=successor.get("conditional_authority",{}) if isinstance(successor,dict) else {}
            if current.get("operation_scope")!="QUALIFICATION_ONLY" or current.get("candidate_install_permitted") is not False:
                errors.append("qualification admission is not scoped to qualification-only")
            if identities.get("expected_installed_release")!=identities.get("candidate_release_id") or identities.get("expected_installed_bin_sha256")!=identities.get("candidate_bin_sha256"):
                errors.append("qualification admission must target the exact installed candidate")
            if auth.get("candidate_attempts_used")!=1 or auth.get("candidate_install_limit")!=1:
                errors.append("qualification requires the single exact candidate install to be consumed")
            if auth.get("recovery_attempts_used",0)>=auth.get("recovery_install_limit",0):
                errors.append("no exact recovery attempt remains for qualification")
            if auth.get("status")!="CANDIDATE_INSTALLED_QUALIFICATION_PENDING":
                errors.append("candidate is not recorded as qualification-pending")
            scope=binding.get("scope",[]) if isinstance(binding,dict) else []
            if not any("28" in str(x) and "kernel" in str(x).lower() for x in scope):
                errors.append("owner authorization does not include the frozen 28-kernel qualification")
            if not any("5400" in str(x) or "90-minute" in str(x) for x in scope):
                errors.append("owner authorization does not include the uninterrupted 90-minute soak")
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

def validate_receipt(model,state,receipt,evidence_root=ROOT):
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
    governance=model.get("execution_system",{}).get("engineering_change_governance",{})
    if t.get("id")=="T4_PHASE2_INTEGRATION":
        if receipt.get("checks",{}).get(governance.get("t4_receipt_check")) is not True:
            errors.append("T4 requires validated engineering change governance")
        manifest_path=governance.get("t4_manifest_path")
        manifests=[x for x in artifacts if isinstance(x,dict) and x.get("name")==manifest_path] if isinstance(artifacts,list) else []
        if len(manifests)!=1:
            errors.append("T4 evidence_artifacts must include exactly one engineering governance manifest")
        else:
            path=(pathlib.Path(evidence_root)/manifest_path).resolve()
            try: path.relative_to(pathlib.Path(evidence_root).resolve())
            except ValueError: errors.append("T4 governance manifest path escapes evidence root")
            else:
                if not path.is_file(): errors.append("T4 engineering governance manifest is missing")
                else:
                    if sha256_file(path)!=manifests[0].get("sha256"):
                        errors.append("T4 engineering governance manifest hash mismatch")
                    try: manifest=load(path)
                    except Exception as exc: errors.append("T4 engineering governance manifest is invalid JSON: "+str(exc))
                    else: errors.extend(validate_governance_manifest(model,manifest))
    return errors

def _has_text(value):
    return isinstance(value,str) and bool(value.strip())

def _text_list(value):
    return isinstance(value,list) and bool(value) and all(_has_text(x) for x in value)

def _require_text_fields(obj,fields,label,errors):
    if not isinstance(obj,dict):
        errors.append(label+" must be an object"); return
    for field in fields:
        if not _has_text(obj.get(field)):
            errors.append(label+"."+field+" must be nonempty")

def validate_change_governance(model,record):
    """Validate one classified engineering decision using the primary control model."""
    cfg=model.get("execution_system",{}).get("engineering_change_governance",{})
    errors=[]
    required={"schema","change_id","summary","change_class","impact","evidence"}
    if not isinstance(record,dict): return ["change record must be an object"]
    if set(record)!=required: errors.append("change record fields must exactly match the governance contract")
    if record.get("schema")!=cfg.get("change_record_schema"): errors.append("change record schema mismatch")
    for key in ("change_id","summary"):
        if not _has_text(record.get(key)): errors.append(key+" must be nonempty")

    classes=cfg.get("classes",{})
    cls=record.get("change_class")
    if cls not in classes:
        errors.append("unknown change class; classify before progression")
        return errors
    if classes[cls]=="reject": errors.append("unknown or ambiguous impact fails closed")

    impact=record.get("impact")
    flag_names=set(cfg.get("impact_flags",[]))
    if not isinstance(impact,dict) or set(impact)!=flag_names or any(type(impact.get(k)) is not bool for k in flag_names):
        errors.append("impact must contain exactly the declared boolean classification flags")
        impact={k:True for k in flag_names}

    evidence=record.get("evidence")
    if not isinstance(evidence,dict):
        errors.append("evidence must be an object"); evidence={}
    if impact.get("unknown"):
        errors.append("unknown impact must be classified before progression")
    if impact.get("bespoke") and (cls!="BESPOKE_REPLACEMENT" or not impact.get("architecture")):
        errors.append("bespoke work must be classified as an architectural bespoke replacement")
    if cls=="TRIVIAL_BOUNDED" and any(impact.get(k) for k in flag_names):
        errors.append("trivial bounded changes cannot claim material impact flags")
    if cls=="APPROVED_ARCHITECTURE_IMPLEMENTATION" and any(impact.get(k) for k in flag_names):
        errors.append("approved-architecture implementation cannot introduce architecture, dependency, design, or bespoke impact")
    if cls=="ARCHITECTURAL_DECISION" and (not impact.get("architecture") or impact.get("bespoke") or impact.get("subjective_design")):
        errors.append("architectural decision classification conflicts with impact flags")
    if cls=="SUBJECTIVE_DESIGN" and not impact.get("subjective_design"):
        errors.append("subjective design classification requires subjective_design impact")
    if cls=="BESPOKE_REPLACEMENT" and not impact.get("bespoke"):
        errors.append("bespoke replacement classification requires bespoke impact")

    level=classes[cls]
    full=(level=="full" or impact.get("architecture") or impact.get("new_dependency"))
    scoped=(level in {"scoped","scoped_or_full"} and not full) or (cls=="SUBJECTIVE_DESIGN" and not full)
    if full:
        for field in cfg.get("full_evidence_fields",[]):
            if field not in evidence: errors.append("missing full governance evidence: "+field)
    elif scoped:
        scoped_evidence=evidence.get("scoped_evidence")
        _require_text_fields(scoped_evidence,["approved_architecture_reference","affected_subsystem","rollback_reference"],"scoped_evidence",errors)
        if isinstance(scoped_evidence,dict) and not _text_list(scoped_evidence.get("evidence_sources")):
            errors.append("scoped_evidence.evidence_sources must be a nonempty string list")
        if isinstance(scoped_evidence,dict) and not _text_list(scoped_evidence.get("tests")):
            errors.append("scoped_evidence.tests must be a nonempty string list")

    sources=[]; source_refs=set()
    if full:
        expert=evidence.get("expert_basis")
        if not isinstance(expert,dict):
            errors.append("expert_basis must be an object")
        else:
            sources=expert.get("sources",[])
            if not isinstance(sources,list) or not sources:
                errors.append("expert_basis.sources must be nonempty")
                sources=[]
            else:
                for i,source in enumerate(sources):
                    _require_text_fields(source,["title","authority_type","locator","relevance"],f"expert_basis.sources[{i}]",errors)
                    if isinstance(source,dict):
                        if _has_text(source.get("title")): source_refs.add(source["title"])
                        if _has_text(source.get("locator")): source_refs.add(source["locator"])
                        if source.get("authority_type") not in {"PROJECT_SOURCE_AUTHORITY","OFFICIAL_PRIMARY_DOCUMENTATION","UPSTREAM_MAINTAINER_GUIDANCE","RECOGNIZED_STANDARD","EXPERT_ENGINEERING_GUIDANCE","FIELD_EVIDENCE"}:
                            errors.append(f"expert_basis.sources[{i}].authority_type is not a recognized evidence class")
                if not any(isinstance(source,dict) and source.get("authority_type") in {"OFFICIAL_PRIMARY_DOCUMENTATION","UPSTREAM_MAINTAINER_GUIDANCE","RECOGNIZED_STANDARD","EXPERT_ENGINEERING_GUIDANCE"} for source in sources):
                    errors.append("expert_basis requires primary, upstream, standards, or expert guidance")
            findings=expert.get("findings",[])
            allowed={"ESTABLISHED_FACT","FIELD_EVIDENCE","INFERENCE"}
            if not isinstance(findings,list) or not findings:
                errors.append("expert_basis.findings must distinguish facts, field evidence, or inference")
            else:
                for i,item in enumerate(findings):
                    _require_text_fields(item,["kind","statement","source_ref"],f"expert_basis.findings[{i}]",errors)
                    if isinstance(item,dict) and item.get("kind") not in allowed:
                        errors.append(f"expert_basis.findings[{i}].kind is invalid")
                    if isinstance(item,dict) and item.get("source_ref") not in source_refs:
                        errors.append(f"expert_basis.findings[{i}].source_ref must identify a consulted source")

        native=evidence.get("native_capability_check")
        if not isinstance(native,dict): errors.append("native_capability_check must be an object")
        else:
            if native.get("evaluated") is not True: errors.append("native capability must be evaluated")
            _require_text_fields(native,["capability","result","rationale"],"native_capability_check",errors)
            if native.get("result") not in {"SUFFICIENT","INSUFFICIENT"}: errors.append("native capability result must be SUFFICIENT or INSUFFICIENT")
            if not _text_list(native.get("source_refs")): errors.append("native_capability_check.source_refs must be nonempty")
            elif any(ref not in source_refs for ref in native["source_refs"]): errors.append("native capability source_refs must identify consulted sources")

        mature=evidence.get("mature_external_component_check")
        if not isinstance(mature,dict): errors.append("mature_external_component_check must be an object")
        elif mature.get("relevant") is True:
            alternatives=mature.get("alternatives")
            if not isinstance(alternatives,list) or not alternatives: errors.append("relevant mature alternatives must be evaluated")
            else:
                fields=["name","maturity","maintenance","compatibility","provenance","license","documentation_support","dependency_burden","disposition","rationale"]
                for i,alternative in enumerate(alternatives):
                    _require_text_fields(alternative,fields,f"mature_external_component_check.alternatives[{i}]",errors)
                    if isinstance(alternative,dict):
                        if alternative.get("disposition") not in {"SELECTED","REJECTED"}:
                            errors.append(f"mature_external_component_check.alternatives[{i}].disposition must be SELECTED or REJECTED")
                        if alternative.get("provenance") not in source_refs:
                            errors.append(f"mature_external_component_check.alternatives[{i}].provenance must identify a consulted source")
        elif mature.get("relevant") is False:
            if not _has_text(mature.get("not_relevant_reason")):
                errors.append("irrelevant mature alternatives require a reason")
            if mature.get("alternatives") not in (None,[]): errors.append("irrelevant mature alternatives must not contain unevaluated entries")
        else: errors.append("mature_external_component_check.relevant must be boolean")
        if impact.get("bespoke") and (not isinstance(mature,dict) or mature.get("relevant") is not True or not mature.get("alternatives")):
            errors.append("bespoke replacement requires evaluated mature external alternatives")

        rationale=evidence.get("decision_rationale")
        _require_text_fields(rationale,["selected_path","challenger_analysis","tradeoffs","simplest_robust_solution","critical_path_reason"],"decision_rationale",errors)
        if isinstance(rationale,dict) and not _text_list(rationale.get("alternatives_considered")):
            errors.append("decision_rationale.alternatives_considered must be nonempty")

        reproducibility=evidence.get("reproducibility")
        repro_fields=["source_inputs","version_pins","configuration_inputs","build_inputs","tooling_identity"]
        if not isinstance(reproducibility,dict): errors.append("reproducibility must be an object")
        else:
            for field in repro_fields:
                if not _text_list(reproducibility.get(field)):
                    errors.append("reproducibility."+field+" must be a nonempty string list")

        rollback=evidence.get("rollback_or_exit_path")
        _require_text_fields(rollback,["rollback_path","uninstall_or_removal_path","replacement_path","recovery_method","prior_known_good_state"],"rollback_or_exit_path",errors)

    if impact.get("new_dependency"):
        identity=evidence.get("dependency_identity")
        entries=identity.get("dependencies") if isinstance(identity,dict) else None
        if not isinstance(entries,list) or not entries: errors.append("new dependencies require exact dependency identity")
        else:
            selected_alternatives=[]
            mature=evidence.get("mature_external_component_check",{})
            if isinstance(mature,dict) and isinstance(mature.get("alternatives"),list):
                selected_alternatives=[item.get("name") for item in mature["alternatives"] if isinstance(item,dict) and item.get("disposition")=="SELECTED"]
            if len(selected_alternatives)!=1:
                errors.append("new dependency decisions must select exactly one mature alternative")
            for i,item in enumerate(entries):
                _require_text_fields(item,["name","upstream_project","version_or_commit","source_identity","provenance","license","compatibility"],f"dependency_identity.dependencies[{i}]",errors)
                if isinstance(item,dict) and item.get("provenance") not in source_refs:
                    errors.append(f"dependency_identity.dependencies[{i}].provenance must identify a consulted source")
                if isinstance(item,dict) and selected_alternatives and item.get("name") not in selected_alternatives:
                    errors.append(f"dependency_identity.dependencies[{i}] must match the selected mature alternative")
                if isinstance(item,dict) and _has_text(item.get("source_identity")):
                    identity=item["source_identity"]
                    exact=(re.fullmatch(r"[0-9a-fA-F]{40}",identity) or
                           re.fullmatch(r"[0-9a-fA-F]{64}",identity) or
                           re.fullmatch(r"git:[0-9a-fA-F]{40}",identity) or
                           re.fullmatch(r"sha256:[0-9a-fA-F]{64}",identity) or
                           re.fullmatch(r"tag:[A-Za-z0-9][A-Za-z0-9._+-]*",identity) or
                           re.fullmatch(r"release:[A-Za-z0-9][A-Za-z0-9._+-]*",identity))
                    if not exact: errors.append(f"dependency_identity.dependencies[{i}].source_identity must be an exact commit, hash, tag, or release identity")
                    if identity.startswith(("tag:","release:")) and identity.split(":",1)[1]!=item.get("version_or_commit"):
                        errors.append(f"dependency_identity.dependencies[{i}] version_or_commit must match its tag/release source identity")

    if impact.get("subjective_design"):
        gate=evidence.get("owner_design_gate")
        if not isinstance(gate,dict): errors.append("subjective design requires owner_design_gate")
        elif gate.get("decision_status")=="APPROVED":
            _require_text_fields(gate,["selected_option","approval_reference"],"owner_design_gate",errors)
            if gate.get("approved_by_owner") is not True: errors.append("subjective design approval must be explicit")
        elif gate.get("decision_status")=="OPTIONS_ONLY":
            if gate.get("approved_by_owner") is not False or _has_text(gate.get("selected_option")):
                errors.append("OPTIONS_ONLY cannot freeze a selected subjective treatment")
        else: errors.append("owner_design_gate must be APPROVED or OPTIONS_ONLY")

    if impact.get("bespoke"):
        exception=evidence.get("bespoke_exception")
        fields=["unmet_requirement","why_minimal_glue_is_insufficient","required_custom_scope","maintenance_burden","dependency_burden","technical_debt_implications","test_plan","rollback_exit_path","owner_approval_reference"]
        _require_text_fields(exception,fields,"bespoke_exception",errors)
        if isinstance(exception,dict):
            if exception.get("native_option_evaluated") is not True: errors.append("bespoke exception must evaluate native capability")
            if exception.get("external_alternatives_evaluated") is not True: errors.append("bespoke exception must evaluate mature external alternatives")
            if exception.get("owner_approved") is not True: errors.append("architecturally significant bespoke work requires explicit owner approval")
    elif "bespoke_exception" in evidence:
        errors.append("bespoke_exception is only valid for bespoke replacement")
    return errors

def validate_governance_manifest(model,manifest):
    cfg=model.get("execution_system",{}).get("engineering_change_governance",{})
    if not isinstance(manifest,dict) or set(manifest)!={"schema","records"}:
        return ["engineering governance manifest must contain exactly schema + records"]
    if manifest.get("schema")!=cfg.get("manifest_schema"):
        return ["engineering governance manifest schema mismatch"]
    records=manifest.get("records")
    if not isinstance(records,list) or not records:
        return ["engineering governance manifest records must be nonempty"]
    errors=[]; ids=[]
    for index,record in enumerate(records):
        if isinstance(record,dict) and _has_text(record.get("change_id")):
            ids.append(record["change_id"])
        errors.extend([f"records[{index}]: {e}" for e in validate_change_governance(model,record)])
    if len(ids)!=len(set(ids)): errors.append("engineering governance manifest has duplicate change_id")
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
      "external_parallel_launch":external_parallel_launch_status(model,state),
      "observability":state.get("observability")
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

def _validate_r6_qualification_host_failure(state, proof_path):
    """Require durable, exact evidence before reopening qualification-only authority."""
    proof_path=pathlib.Path(proof_path)
    proof=load(proof_path)
    expected_candidate="hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010"
    expected_sha="f89a55fbc85b8ffda90390c18eb9b09e934e9e73db96884d712c033d4684a35b"
    expected_rollback="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743a2f3d8c"
    if proof.get("schema")!="hbnf-r6-qualification-host-failure-retry-proof-v1" or proof.get("status")!="PASS":
        raise ValueError("qualification retry proof is missing or not PASS")
    if (proof.get("candidate_release_id")!=expected_candidate or proof.get("candidate_sha256")!=expected_sha
        or proof.get("rollback_sha256")!=expected_rollback):
        raise ValueError("qualification retry proof identity mismatch")
    if proof.get("failure_class")!="HOST_OBSERVER_REQUEST_DEADLINE" or proof.get("profiles_completed")!=0:
        raise ValueError("only the evidenced pre-profile host observer failure can be resumed")
    if proof.get("firmware_changed") is not False or proof.get("frozen_thresholds_changed") is not False:
        raise ValueError("qualification retry proof must preserve firmware and frozen thresholds")
    successor=state.get("r6_audio_cache_successor",{})
    result_path=successor.get("qualification_result")
    if proof.get("qualification_result_path")!=result_path or not isinstance(result_path,str):
        raise ValueError("qualification retry proof does not bind current failure receipt")
    result_file=DEFAULT_STATE.parent.parent/result_path
    if not result_file.is_file() or sha256_file(result_file)!=proof.get("qualification_result_sha256"):
        raise ValueError("qualification failure receipt hash mismatch")
    result=load(result_file)
    abort=result.get("qualification",{}).get("abort",{})
    run_error=str(abort.get("run_error", ""))
    if (result.get("status")!="QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED"
        or result.get("candidate_release_id")!=expected_candidate or result.get("candidate_sha256")!=expected_sha
        or result.get("operation_scope")!="QUALIFICATION_ONLY" or result.get("candidate_install_attempts")!=0
        or result.get("recovery_attempts")!=0 or abort.get("status")!="FAIL"
        or abort.get("profiles_completed")!=0 or abort.get("restore_error") is not None
        or "deadline leaves" not in run_error or "no request started" not in run_error):
        raise ValueError("current qualification result is not the recorded host-only pre-profile failure")
    checks=proof.get("evidence",{})
    root=DEFAULT_STATE.parent.parent
    qualification_root=root/"evidence/cart2-r6-audio-cache-20261010/live-qualification"
    try: result_dir=result_file.parent.resolve(); result_dir.relative_to(qualification_root.resolve())
    except ValueError: raise ValueError("qualification failure receipt is outside the R6 qualification evidence root")
    required={
        "restore_receipt":(str((result_dir/"sweep/RESTORE_RECEIPT.json").relative_to(root)),("restoreVerified",True)),
        "post_restore_state":(str((result_dir/"sweep/POST_RESTORE_STATE.json").relative_to(root)),("restoreVerified",True)),
        "adapter_source":("scripts/hbnf_foundation_live_adapter.py",None),
        "regression_test":("tests/hbnf_foundation_live_adapter.py",None),
        "test_result":(None,None),
    }
    for name,(expected_path,_) in required.items():
        entry=checks.get(name,{})
        path=entry.get("path")
        if not isinstance(path,str) or (expected_path and path!=expected_path):
            raise ValueError("qualification retry proof has invalid "+name+" path")
        full=root/path
        if not full.is_file() or sha256_file(full)!=entry.get("sha256"):
            raise ValueError("qualification retry proof hash mismatch: "+name)
        if name in ("restore_receipt","post_restore_state"):
            evidence=load(full)
            if evidence.get("restoreVerified") is not True or evidence.get("packet20Same") is not True:
                raise ValueError("renderer snapshot restore is not verified")
        elif name=="test_result":
            test=load(full)
            if test.get("status")!="PASS" or test.get("slow_nominal_boundary_retry")!="PASS":
                raise ValueError("observer deadline regression tests are not PASS")
    if result.get("candidate_install_attempts")!=0 or result.get("recovery_attempts")!=0:
        raise ValueError("host failure incorrectly consumed candidate or recovery attempt")
    return proof

def _validate_r6_qualification_preflight_failure(state, proof_path):
    """Allow only a read-only preflight contention failure to resume the same R6 qualification."""
    proof=load(proof_path)
    expected_candidate="hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010"
    expected_sha="f89a55fbc85b8ffda90390c18eb9b09e934e9e73db96884d712c033d4684a35b"
    expected_rollback="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
    if proof.get("schema")!="hbnf-r6-qualification-preflight-retry-proof-v1" or proof.get("status")!="PASS":
        raise ValueError("qualification preflight retry proof missing or not PASS")
    if (proof.get("candidate_release_id")!=expected_candidate or proof.get("candidate_sha256")!=expected_sha
        or proof.get("rollback_sha256")!=expected_rollback):
        raise ValueError("qualification preflight retry identity mismatch")
    if proof.get("failure_class")!="SINGLE_WORKER_PREFLIGHT_CONTENTION":
        raise ValueError("only the exact preflight worker-contention failure can resume")
    if any(proof.get(key) is not False for key in ("firmware_changed","setting_write_started","profiles_completed","frozen_thresholds_changed")):
        raise ValueError("preflight retry must prove no firmware, setting, profile, or threshold mutation")
    successor=state.get("r6_audio_cache_successor",{})
    result_path=successor.get("qualification_result")
    if proof.get("qualification_result_path")!=result_path or not isinstance(result_path,str):
        raise ValueError("preflight retry proof does not bind the current result")
    root=DEFAULT_STATE.parent.parent
    qualification_root=root/"evidence/cart2-r6-audio-cache-20261010/live-qualification"
    result_file=root/result_path
    try: result_file.resolve().relative_to(qualification_root.resolve())
    except ValueError: raise ValueError("preflight retry result is outside the exact R6 qualification evidence root")
    if not result_file.is_file() or sha256_file(result_file)!=proof.get("qualification_result_sha256"):
        raise ValueError("preflight retry result hash mismatch")
    result=load(result_file)
    if (result.get("schema")!="hbnf-r6-audio-cache-qualification-continuation-v1"
        or result.get("status")!="QUALIFICATION_BLOCKED_OR_FAILED"
        or result.get("candidate_release_id")!=expected_candidate or result.get("candidate_sha256")!=expected_sha
        or result.get("operation_scope")!="QUALIFICATION_ONLY"
        or result.get("candidate_install_attempts")!=0 or result.get("recovery_attempts")!=0
        or result.get("error")!="RuntimeError: another-live-cart-worker-is-running"
        or result.get("device_requests")!=8
        or any(key in result for key in ("preflight","brightness_setup","qualification","recovery"))):
        raise ValueError("result is not the exact pre-setup read-only worker-contention failure")
    source_commit=proof.get("qualification_source_commit")
    source_sha=proof.get("qualification_source_sha256")
    if (source_commit!="48bdf20dcdecaf0a4ebb7f1af4068864f4b10b32"
        or not isinstance(source_sha,str) or not re.fullmatch(r"[a-f0-9]{64}",source_sha)):
        raise ValueError("qualification failure source binding missing or unexpected")
    source=subprocess.run(["git","show",source_commit+":scripts/hbnf_r6_audio_cache_live_transaction.py"],
        cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5,check=False)
    if source.returncode or hashlib.sha256(source.stdout).hexdigest()!=source_sha:
        raise ValueError("qualification failure source hash mismatch")
    source_text=source.stdout.decode(errors="replace")
    ordered=(source_text.find("preflight = port.preflight_candidate()"),
        source_text.find("setup_started = True"),source_text.find("port.apply_qualification_brightness("))
    if min(ordered)<0 or not (ordered[0]<ordered[1]<ordered[2]):
        raise ValueError("bound source does not prove worker preflight precedes brightness setup")
    pre=proof.get("post_failure_readonly_preflight",{})
    pre_path=pre.get("path")
    if not isinstance(pre_path,str) or not pre_path.strip():
        raise ValueError("post-failure read-only preflight evidence missing")
    pre_file=root/pre_path
    try: pre_file.resolve().relative_to(qualification_root.resolve())
    except ValueError: raise ValueError("post-failure preflight is outside qualification evidence root")
    if not pre_file.is_file() or sha256_file(pre_file)!=pre.get("sha256"):
        raise ValueError("post-failure preflight hash mismatch")
    sample=load(pre_file)
    captured=sample.get("captured_unix")
    if (sample.get("schema")!="hbnf-r6-qualification-prelive-v1" or sample.get("pass") is not True
        or sample.get("operation_scope")!="QUALIFICATION_ONLY" or not isinstance(captured,(int,float))
        or captured>time.time()+5 or time.time()-captured>900):
        raise ValueError("post-failure preflight is not fresh and passing")
    matrix=sample.get("matrix",{}); baseline=sample.get("brightness_baseline",{}); aux=sample.get("aux",{}); rb=sample.get("rollback",{}); worker=sample.get("single_worker",{})
    persisted=baseline.get("persisted",{}); runtime=baseline.get("runtime",{})
    if (matrix.get("release_id")!=expected_candidate or matrix.get("candidate_sha256")!=expected_sha
        or matrix.get("mac","").replace(":","").lower()!="704bca5b345c"
        or matrix.get("brightness")!=52 or matrix.get("diagnostic_off") is not True or matrix.get("telemetry_off") is not True
        or persisted.get("matrixBrightness")!=52 or runtime.get("matrixBrightness")!=52
        or persisted.get("auxBrightness")!=245 or runtime.get("auxBrightness")!=245
        or persisted.get("vibe")!=2 or runtime.get("vibe")!=2
        or aux.get("live") is not True or aux.get("mode")!="DDP" or aux.get("source")!="192.168.77.10"
        or aux.get("led_count")!=22 or aux.get("on") is not True
        or rb.get("sha256")!=expected_rollback or worker.get("pass") is not True
        or worker.get("worker_count")!=1 or worker.get("conflicting_pids")!=[]):
        raise ValueError("post-failure preflight did not prove exact R6, unchanged baseline, AUX, recovery, and single worker")
    return proof

def reconcile_installed_r6(state, receipt_path, host_failure_proof_path=None):
    """Correct the post-OTA reboot-window misclassification, qualification only."""
    root=ROOT; receipt=load(receipt_path)
    candidate="hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010"
    candidate_sha="f89a55fbc85b8ffda90390c18eb9b09e934e9e73db96884d712c033d4684a35b"
    rollback_sha="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
    matrix_mac="704bca5b345c"; errors=[]
    if receipt.get("schema")!="hbnf-r6-installed-runtime-reconciliation-v1": errors.append("wrong receipt schema")
    binding=state.get("live_authorization_binding",{})
    if (binding.get("candidate_release_id")!=candidate or binding.get("candidate_bin_sha256")!=candidate_sha
        or binding.get("rollback_bin_sha256")!=rollback_sha or str(binding.get("matrix_mac","")).replace(":","").lower()!=matrix_mac):
        errors.append("existing authorization is not bound to this exact R6/R4/Matrix")
    auth=state.get("r6_audio_cache_successor",{}).get("conditional_authority",{})
    stale_readback=(auth.get("status")=="OTA_NOT_INSTALLED_R4_REMAINS_NO_RETRY"
        and state.get("installed_release")=="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1")
    already_reconciled=(auth.get("status")=="CANDIDATE_INSTALLED_QUALIFICATION_PENDING"
        and state.get("installed_release")==candidate and state.get("installed_firmware_sha256")==candidate_sha)
    host_failure_resumable=False
    host_failure_proof=None
    if auth.get("status")=="QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED" and host_failure_proof_path:
        try:
            host_failure_proof=_validate_r6_qualification_host_failure(state,host_failure_proof_path)
            host_failure_resumable=(state.get("installed_release")==candidate and state.get("installed_firmware_sha256")==candidate_sha)
        except (ValueError,OSError,KeyError,TypeError) as exc:
            errors.append(str(exc))
    preflight_retry_resumable=False
    if host_failure_proof_path and auth.get("status") in ("QUALIFICATION_BLOCKED_OR_FAILED","CANDIDATE_INSTALLED_QUALIFICATION_PENDING"):
        try:
            retry_proof=load(host_failure_proof_path)
            if retry_proof.get("schema")=="hbnf-r6-qualification-preflight-retry-proof-v1":
                _validate_r6_qualification_preflight_failure(state,host_failure_proof_path)
                preflight_retry_resumable=(state.get("installed_release")==candidate and state.get("installed_firmware_sha256")==candidate_sha)
        except (ValueError,OSError,KeyError,TypeError) as exc:
            errors.append(str(exc))
    if not (stale_readback or already_reconciled or host_failure_resumable or preflight_retry_resumable): errors.append("reconciliation only accepts stale R4 readback, pending exact-R6 state, or proof-backed pre-profile host failure")
    if auth.get("candidate_attempts_used")!=1 or auth.get("candidate_install_limit")!=1: errors.append("single exact install is not consumed")
    if auth.get("recovery_attempts_used",0)!=0 or auth.get("recovery_install_limit")!=1: errors.append("exact R4 recovery is unavailable or consumed")
    c=receipt.get("candidate",{}); a=receipt.get("aux",{}); host=receipt.get("host",{}); rb=receipt.get("rollback",{}); ota=receipt.get("ota_receipt",{})
    if c.get("release_id")!=candidate or c.get("runtime_candidate_label")!=candidate or c.get("matrix_mac","").replace(":","").lower()!=matrix_mac: errors.append("runtime candidate or Matrix identity mismatch")
    if c.get("sha256")!=candidate_sha or c.get("diagnostic_enabled") is not False or c.get("telemetry_enabled") is not False or c.get("on") is not True or c.get("brightness")!=44: errors.append("candidate/runtime safety evidence mismatch")
    if rb.get("sha256")!=rollback_sha or not (root/"evidence/cart2-r7-performance-repair-20261009/artifact/hbnf-matrix-foundation-r4-exact.bin").is_file(): errors.append("exact R4 recovery bytes unavailable")
    if not host.get("on_ac") or host.get("cart_lan_interface")!="en0": errors.append("host AC/LAN preflight missing")
    if not (a.get("live") is True and a.get("mode")=="DDP" and a.get("source")=="192.168.77.10" and a.get("led_count")==22 and a.get("on") is True and a.get("lor")==0): errors.append("AUX DDP/output preflight failed")
    result_path=root/"evidence/cart2-r6-audio-cache-20261010/live-qualification/TRANSACTION_RESULT.json"
    ota_path=root/"evidence/cart2-r6-audio-cache-20261010/live-qualification/candidate-ota-response.txt"
    if not result_path.is_file() or sha256_file(result_path)!=receipt.get("prior_transaction_result_sha256"): errors.append("prior transaction result identity mismatch")
    else:
        prior=load(result_path)
        if prior.get("candidate_install_attempts")!=1 or prior.get("candidate_sha256")!=candidate_sha or prior.get("upload",{}).get("confirmed") is not True or prior.get("upload",{}).get("http_status")!="200": errors.append("prior exact OTA success evidence missing")
        if prior.get("status")!="OTA_NOT_INSTALLED_R4_REMAINS_NO_RETRY": errors.append("prior transaction is not the observed reboot-window false negative")
        if prior.get("preflight",{}).get("single_worker",{}).get("pass") is not True: errors.append("single-worker preflight missing")
        if rollback_sha not in prior.get("preflight",{}).get("opal",{}).get("stdout",""): errors.append("Opal R4 recovery ledger was not verified")
    if not ota_path.is_file() or sha256_file(ota_path)!=ota.get("sha256") or ota.get("confirmed") is not True or ota.get("http_status")!="200": errors.append("exact OTA response receipt mismatch")
    candidate_path=root/"evidence/cart2-r6-audio-cache-20261010/artifact/hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010.bin"
    rollback_path=root/"evidence/cart2-r7-performance-repair-20261009/artifact/hbnf-matrix-foundation-r4-exact.bin"
    if not candidate_path.is_file() or sha256_file(candidate_path)!=candidate_sha: errors.append("exact candidate bytes unavailable")
    if not rollback_path.is_file() or sha256_file(rollback_path)!=rollback_sha: errors.append("exact rollback bytes unavailable")
    if errors: raise ValueError("installed R6 reconciliation rejected: "+"; ".join(errors))
    state["installed_release"]=candidate; state["installed_firmware_sha256"]=candidate_sha
    state["status"]="R6_INSTALLED_QUALIFICATION_PENDING"
    state["live_mutation_authorized"]=True
    state.setdefault("live_mutation_authorization",{}).update({
        "authorized":True,"hardware_writes_permitted_now":True,"operation_scope":"QUALIFICATION_ONLY",
        "candidate_install_permitted":False,"candidate_attempts_used":1,"recovery_attempts_used":0,
        "authorization":"Owner-authorized in-scope continuation; only the host observer-deadline failure was corrected.",
        "current_gate":"Exact R6 installed; qualification-only continuation pending after proof-backed host harness correction."})
    auth.update({"live_mutation_authorized":True,"status":"CANDIDATE_INSTALLED_QUALIFICATION_PENDING",
                 "runtime_reconciliation_receipt":str(pathlib.Path(receipt_path).resolve().relative_to(root)),
                 "runtime_reconciliation_sha256":sha256_file(pathlib.Path(receipt_path))})
    if preflight_retry_resumable:
        proof_file=pathlib.Path(host_failure_proof_path).resolve()
        proof=load(proof_file)
        proof_rel=str(proof_file.relative_to(root))
        retry_record={"failure_class":"SINGLE_WORKER_PREFLIGHT_CONTENTION",
            "proof_path":proof_rel,"proof_sha256":sha256_file(proof_file),
            "qualification_result_path":proof["qualification_result_path"],
            "qualification_result_sha256":proof["qualification_result_sha256"],
            "post_failure_preflight_path":proof["post_failure_readonly_preflight"]["path"],
            "post_failure_preflight_sha256":proof["post_failure_readonly_preflight"]["sha256"],
            "setting_write_started":False,"profiles_completed":False,"firmware_changed":False}
        state["r6_audio_cache_successor"]["preflight_retry_reconciliation"]=retry_record
        auth["preflight_retry_reconciliation"]=retry_record
    state["r6_audio_cache_successor"]["conditional_authority"]=auth
    state["r6_audio_cache_successor"].update({"status":"CANDIDATE_INSTALLED_QUALIFICATION_PENDING",
        "runtime_reconciliation_receipt":str(pathlib.Path(receipt_path).resolve().relative_to(root)),
        "runtime_reconciliation_sha256":sha256_file(pathlib.Path(receipt_path))})
    task=state.setdefault("current_task",{})
    task["installed_release"]=candidate; task["installed_firmware_sha256"]=candidate_sha
    task["status"]="R6_INSTALLED__QUALIFICATION_PENDING"; task["live_mutation_authorized"]=True
    from datetime import datetime, timezone
    state["last_updated_utc"]=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return state

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--model",default=str(DEFAULT_MODEL))
    ap.add_argument("--state",default=str(DEFAULT_STATE))
    sub=ap.add_subparsers(dest="cmd",required=True)
    sub.add_parser("status")
    cc=sub.add_parser("check-change"); cc.add_argument("--change",required=True)
    ra=sub.add_parser("check-admission"); ra.add_argument("--admission",required=True)
    ra.add_argument("--stage",default="OFFLINE_COMPILED",choices=["OFFLINE_COMPILED","LIVE_APPROVED","LIVE_QUALIFICATION"])
    a=sub.add_parser("advance"); a.add_argument("--receipt",required=True)
    i=sub.add_parser("impact"); i.add_argument("--change-type",required=True)
    fp=sub.add_parser("failure"); fp.add_argument("--domain",required=True)
    rf=sub.add_parser("record-failure")
    rf.add_argument("--domain",required=True)
    rf.add_argument("--reference",required=True)
    ri=sub.add_parser("reconcile-installed-r6")
    ri.add_argument("--receipt",required=True)
    ri.add_argument("--host-failure-proof",help="Required only to resume qualification after a hash-verified, pre-profile host-only failure")
    rf.add_argument("--live-attempt",action="store_true")
    args=ap.parse_args()
    model=load(args.model); state=load(args.state)
    if args.cmd=="check-admission":
        errors=validate_model(model)+release_admission_errors(model,state,load(args.admission),args.stage)
        print(json.dumps({"schema":"hbnf-cart2-release-admission-result-v1","pass":not errors,"stage":args.stage,"errors":errors},indent=2,sort_keys=True))
        return 0 if not errors else 2
    if args.cmd=="check-change":
        model_errors=validate_model(model)
        change=load(args.change)
        if model_errors: errors=model_errors
        elif isinstance(change,dict) and change.get("schema")==model["execution_system"]["engineering_change_governance"].get("manifest_schema"):
            errors=validate_governance_manifest(model,change)
        else: errors=validate_change_governance(model,change)
        result={"schema":"hbnf-change-governance-result-v1","valid":not errors,"errors":errors}
        print(json.dumps(result,indent=2,sort_keys=True))
        return 0 if not errors else 2
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
    if args.cmd=="reconcile-installed-r6":
        reconcile_installed_r6(state,args.receipt,args.host_failure_proof)
        errs=validate_state(model,state)
        if errs: raise SystemExit("refusing to save invalid state: "+"; ".join(errs))
        save(args.state,state)
        print(json.dumps({"reconciled":True,"installed_release":state["installed_release"],"operation_scope":"QUALIFICATION_ONLY","candidate_attempts_used":state["r6_audio_cache_successor"]["conditional_authority"]["candidate_attempts_used"]},indent=2,sort_keys=True))
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
