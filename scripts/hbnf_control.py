#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, pathlib, re, time, subprocess, copy

ROOT=pathlib.Path(__file__).resolve().parents[1]
DEFAULT_MODEL=ROOT/"config/HBNF_CONTROL_MODEL.json"
DEFAULT_STATE=ROOT/"config/HBNF_CONTROL_STATE.json"
QUALIFICATION_BASELINE_BRIGHTNESS=52
FROZEN_MATRIX_BRIGHTNESS=44
R4_RELEASE="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"

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
            legacy_auth=successor.get("conditional_authority",{}) if isinstance(successor,dict) else {}
            # The existing top-level transaction record is the common authority
            # for successor candidates. Fall back to the legacy R6 receipt only
            # when it is explicitly bound to the same candidate identity.
            generic_bound=(current.get("candidate_release_id")==identities.get("candidate_release_id")
                and current.get("candidate_sha256")==identities.get("candidate_bin_sha256")
                and current.get("rollback_sha256")==identities.get("rollback_bin_sha256"))
            auth=current if generic_bound else legacy_auth
            auth_status=(current.get("candidate_status") or current.get("status")) if generic_bound else legacy_auth.get("status")
            if current.get("operation_scope")!="QUALIFICATION_ONLY" or current.get("candidate_install_permitted") is not False:
                errors.append("qualification admission is not scoped to qualification-only")
            if identities.get("expected_installed_release")!=identities.get("candidate_release_id") or identities.get("expected_installed_bin_sha256")!=identities.get("candidate_bin_sha256"):
                errors.append("qualification admission must target the exact installed candidate")
            if auth.get("candidate_attempts_used")!=1 or auth.get("candidate_install_limit")!=1:
                errors.append("qualification requires the single exact candidate install to be consumed")
            if auth.get("recovery_attempts_used",0)>=auth.get("recovery_install_limit",0):
                errors.append("no exact recovery attempt remains for qualification")
            if auth_status!="CANDIDATE_INSTALLED_QUALIFICATION_PENDING":
                errors.append("candidate is not recorded as qualification-pending")
            continuation_id=current.get("continuation_authorization_id")
            if continuation_id:
                try:
                    root=DEFAULT_STATE.parent.parent.resolve()
                    receipt_path=(root/current.get("continuation_authorization_receipt","")).resolve()
                    receipt_path.relative_to((root/"evidence").resolve())
                    receipt=load(receipt_path)
                    continuation=receipt.get("continuation_authorization",{})
                    if (sha256_file(receipt_path)!=current.get("continuation_authorization_sha256")
                        or receipt.get("binding")!=state_binding
                        or continuation.get("authorization_id")!=continuation_id
                        or continuation.get("candidate_sha256")!=identities.get("candidate_bin_sha256")
                        or continuation.get("rollback_sha256")!=identities.get("rollback_bin_sha256")
                        or continuation.get("candidate_install_permitted") is not False
                        or continuation.get("soak_seconds")!=5400
                        or continuation.get("exact_r4_recovery_attempts")!=1
                        or continuation.get("owner_settings_baseline")!=current.get("owner_brightness_baseline")):
                        errors.append("current qualification continuation authorization receipt is invalid or stale")
                except (OSError,ValueError,TypeError,AttributeError):
                    errors.append("current qualification continuation authorization receipt is missing or invalid")
            scope=binding.get("scope",[]) if isinstance(binding,dict) else []
            if not any("28" in str(x) and "kernel" in str(x).lower() for x in scope):
                errors.append("owner authorization does not include the frozen 28-kernel qualification")
            if not any("5400" in str(x) or "90-minute" in str(x) for x in scope):
                errors.append("owner authorization does not include the uninterrupted 90-minute soak")
    return errors

BACKEND_OPAL_TRANSACTION_SCHEMA = "hbnf-backend-opal-release-admission-v1"
BACKEND_OPAL_STEPS = (
    "apply_migration",
    "deploy_edge_function",
    "install_writer_stopped",
    "bootstrap_current_state",
    "activate_writer",
    "one_owner_control_test",
    "restore_and_verify",
)
BACKEND_OPAL_FUNCTION_FILES=(
    "staging/coordinated-backend/hbnf-cart-control/deno.json",
    "staging/coordinated-backend/hbnf-cart-control/deno.lock",
    "staging/coordinated-backend/hbnf-cart-control/index.ts",
    "staging/coordinated-backend/hbnf-cart-control/guest-command.ts",
    "staging/coordinated-backend/hbnf-cart-control/live.ts",
    "staging/coordinated-backend/hbnf-cart-control/skins_scoring.ts",
    "staging/coordinated-backend/hbnf-cart-control/runtime-vibe.ts",
    "staging/coordinated-backend/hbnf-cart-control/matrix-relay.ts",
    "staging/coordinated-backend/hbnf-cart-control/matrix-relay-auth.ts",
    "staging/coordinated-backend/hbnf-cart-control/matrix-relay-projection.ts",
)

def backend_opal_admission_digest(manifest):
    payload={k:v for k,v in manifest.items() if k!="admission_sha256"}
    encoded=json.dumps(payload,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()
    return hashlib.sha256(encoded).hexdigest()

def _backend_opal_artifact_sha_bindings(manifest):
    artifacts=manifest.get("artifacts",{}) if isinstance(manifest,dict) else {}
    bindings={}
    for key in ("migration","corrective_migration","opal_writer","opal_transaction_helper","opal_service","opal_config_template","opal_package"):
        item=artifacts.get(key)
        if isinstance(item,dict) and isinstance(item.get("path"),str) and isinstance(item.get("sha256"),str):
            bindings[item["path"]]=item["sha256"]
    for item in artifacts.get("edge_function_files",[]) if isinstance(artifacts.get("edge_function_files"),list) else []:
        if isinstance(item,dict) and isinstance(item.get("path"),str) and isinstance(item.get("sha256"),str):
            bindings[item["path"]]=item["sha256"]
    rb=manifest.get("rollback",{}) if isinstance(manifest,dict) else {}
    item=rb.get("compensating_migration") if isinstance(rb,dict) else None
    if isinstance(item,dict) and isinstance(item.get("path"),str) and isinstance(item.get("sha256"),str):
        bindings[item["path"]]=item["sha256"]
    return bindings

def _git_tree_blob_oids(commit,root):
    """Read the authorized commit's complete blob map in one bounded Git call."""
    proc=subprocess.run(["git","ls-tree","-rz","--full-tree",commit],cwd=root,stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,timeout=20,check=False)
    if proc.returncode: raise ValueError("authorized deployable source commit is unavailable")
    result={}
    for record in proc.stdout.split(b"\0"):
        if not record: continue
        meta,sep,path=record.partition(b"\t")
        if not sep: continue
        parts=meta.split()
        if len(parts)==3 and parts[1]==b"blob": result[path.decode("utf-8")]=parts[2].decode("ascii")
    return result

def _backend_opal_admission_errors(state, manifest, now=None, require_unconsumed=True, allow_expired=False, validate_freshness=True):
    """Validate the narrowly scoped software-only Owner Control transaction.

    This is separate from firmware LIVE_APPROVED: it does not change lifecycle
    state or set the global firmware mutation bit. It only permits the exact
    PHASE2_INTEGRATING migration/function/Opal transaction recorded here.
    """
    errors=[]
    if not isinstance(manifest,dict) or manifest.get("schema")!=BACKEND_OPAL_TRANSACTION_SCHEMA:
        return ["wrong backend/Opal admission schema"]
    if manifest.get("stage")!="BACKEND_OPAL_LIVE_APPROVED" or manifest.get("outcome")!="PASS":
        errors.append("backend/Opal admission is not an approved PASS")
    if state.get("lifecycle_state")!="PHASE2_INTEGRATING":
        errors.append("backend/Opal transaction requires PHASE2_INTEGRATING")
    if state.get("live_mutation_authorized") is not False:
        errors.append("firmware live-mutation authority must remain closed")
    if state.get("phase2_implementation_authorized") is not True:
        errors.append("Phase 2 integration authority is not active")
    cursor=state.get("execution_cursor",{})
    tx=cursor.get("backend_opal_transaction",{}) if isinstance(cursor,dict) else {}
    owner=manifest.get("owner_authorization")
    if not isinstance(tx,dict) or tx.get("schema")!="hbnf-backend-opal-transaction-state-v1":
        errors.append("primary control state has no scoped backend/Opal authorization")
    else:
        if tx.get("transaction_id")!=manifest.get("transaction_id"):
            errors.append("manifest transaction identity differs from primary control state")
        if owner!=tx.get("owner_authorization"):
            errors.append("manifest owner authorization differs from primary control state")
        owner_obj=owner if isinstance(owner,dict) else {}
        for key in ("transaction_id","authorization_id","source_message_ref","deployable_source_commit","scope","nonce","issued_unix","expires_unix"):
            if owner_obj.get(key) in (None,"",[],{}):
                errors.append("owner authorization missing "+key)
        current=time.time() if now is None else now
        if not isinstance(owner,dict) or not isinstance(owner.get("issued_unix"),(int,float)) or not isinstance(owner.get("expires_unix"),(int,float)):
            errors.append("owner authorization expiry is invalid")
        else:
            if owner["issued_unix"]>current+5: errors.append("owner authorization is not yet valid")
            if owner["expires_unix"]<=current and not allow_expired: errors.append("owner authorization expired")
            if owner["expires_unix"]-owner["issued_unix"]>90*60: errors.append("owner authorization exceeds the bounded transaction window")
        if require_unconsumed:
            done=tx.get("completed_steps",[])
            initial=(not tx.get("continuation_from") and tx.get("status")=="AUTHORIZED"
                and tx.get("attempts_used")==0 and done==[])
            continuation=(tx.get("continuation_from") and tx.get("status")=="IN_PROGRESS"
                and tx.get("attempts_used")==1 and done==list(BACKEND_OPAL_STEPS[:2])
                and tx.get("authorization_start_index")==2)
            activation_retry=(tx.get("continuation_from") and tx.get("status")=="IN_PROGRESS"
                and tx.get("attempts_used")==1 and done==list(BACKEND_OPAL_STEPS[:2])
                and tx.get("authorization_start_index")==2
                and tx.get("continuation_kind")=="verified_activation_rollback")
            post_bootstrap=(tx.get("continuation_from") and tx.get("status")=="IN_PROGRESS"
                and tx.get("attempts_used")==1 and done==list(BACKEND_OPAL_STEPS[:4])
                and tx.get("authorization_start_index")==4
                and tx.get("continuation_kind")=="verified_post_bootstrap_checkpoint")
            if not (initial or continuation or activation_retry or post_bootstrap) or tx.get("active_step") is not None:
                errors.append("owner authorization is replayed, consumed, or not the exact approved continuation")
        if tx.get("admission_sha256")!=manifest.get("admission_sha256"):
            errors.append("admission identity differs from the primary control state")
    source_commit=manifest.get("deployable_source_commit")
    if (not isinstance(owner,dict) or not isinstance(source_commit,str) or not re.fullmatch(r"[0-9a-f]{40}",source_commit)
        or owner.get("deployable_source_commit")!=source_commit):
        errors.append("transaction is not bound to the exact owner-authorized deployable source commit")
    if isinstance(owner,dict) and owner.get("artifact_sha256_bindings")!=_backend_opal_artifact_sha_bindings(manifest):
        errors.append("owner authorization does not bind every exact deployable and rollback artifact hash")
    start_index=tx.get("authorization_start_index",0) if isinstance(tx,dict) else 0
    if not isinstance(start_index,int) or start_index<0 or start_index>len(BACKEND_OPAL_STEPS):
        start_index=-1
    expected_scope=[*BACKEND_OPAL_STEPS[start_index:],"rollback_if_required"] if start_index>=0 else []
    if not isinstance(owner,dict) or owner.get("scope")!=expected_scope:
        errors.append("owner authorization scope is not the exact remaining backend/Opal transaction")
    if manifest.get("authorized_steps")!=list(BACKEND_OPAL_STEPS):
        errors.append("admission contains missing or unrelated transaction commands")

    identities=manifest.get("identities",{})
    if not isinstance(identities,dict): identities={}; errors.append("transaction identities missing")
    exact={
        "project_ref":"phcpbvuqibyarpfrftgx",
        "edge_function":"hbnf-cart-control",
        "verify_jwt":False,
        # The original admission is pinned to v25. The only continuation
        # admitted here is the owner-authorized v27 deployment with this exact
        # source bundle; no arbitrary/dynamic function-version relaxation.
        "expected_function_version":27 if (isinstance(tx,dict) and tx.get("continuation_from")) else 25,
        "matrix_mac":"704bca5b345c",
        "matrix_release_id":"hbnf-cart2-phase2-r6-skins-readable-20261014",
        "matrix_recorded_firmware_sha256":"de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d",
        "aux_mac":"8c94df55c34c",
        "opal_model":"GL-SFT1200",
        "opal_ip":"192.168.77.1",
    }
    for key,value in exact.items():
        if identities.get(key)!=value: errors.append("wrong or missing transaction identity: "+key)
    if identities.get("matrix_runtime_sha_verified") is not False:
        errors.append("runtime firmware SHA must not be claimed from release label")
    if str(identities.get("matrix_mac","")).replace(":","").lower()!=str(state.get("live_authorization_binding",{}).get("matrix_mac","")).replace(":","").lower():
        errors.append("Matrix target differs from the primary recorded device identity")
    if identities.get("recorded_installed_release")!=state.get("installed_release") or identities.get("recorded_installed_firmware_sha256")!=state.get("installed_firmware_sha256"):
        errors.append("recorded installed release differs from the primary control state")

    root=DEFAULT_STATE.parent.parent.resolve()
    source_tree_cache={}
    def checked_file(item,label,git_commit=None):
        if not isinstance(item,dict):
            errors.append("missing "+label+" file binding"); return
        rel=item.get("path"); sha=item.get("sha256")
        if not isinstance(rel,str) or not rel or pathlib.Path(rel).is_absolute() or ".." in pathlib.Path(rel).parts:
            errors.append("unsafe "+label+" path"); return
        path=(root/rel).resolve()
        try: path.relative_to(root)
        except ValueError: errors.append("unsafe "+label+" path"); return
        if not path.is_file() or not isinstance(sha,str) or not re.fullmatch(r"[a-f0-9]{64}",sha) or sha256_file(path)!=sha:
            errors.append(label+" missing or SHA mismatch"); return
        if git_commit:
            try:
                tree=source_tree_cache.get(git_commit)
                if tree is None:
                    tree=_git_tree_blob_oids(git_commit,root); source_tree_cache[git_commit]=tree
                content=path.read_bytes()
                git_oid=hashlib.sha1(b"blob "+str(len(content)).encode()+b"\0"+content).hexdigest()
                if tree.get(rel)!=git_oid: errors.append(label+" differs from authorized deployable source commit")
            except (OSError,ValueError,subprocess.TimeoutExpired):
                errors.append(label+" differs from authorized deployable source commit")

    artifacts=manifest.get("artifacts",{})
    if not isinstance(artifacts,dict): artifacts={}; errors.append("deployable artifact bindings missing")
    checked_file(artifacts.get("migration"),"migration",source_commit)
    if isinstance(artifacts.get("corrective_migration"),dict):
        corrective=artifacts["corrective_migration"]
        checked_file(corrective,"corrective migration",corrective.get("source_commit"))
    function_files=artifacts.get("edge_function_files")
    if not isinstance(function_files,list) or [x.get("path") for x in function_files if isinstance(x,dict)]!=list(BACKEND_OPAL_FUNCTION_FILES):
        errors.append("Edge Function source closure is incomplete or contains unrelated files")
    for item in function_files if isinstance(function_files,list) else []:
        checked_file(item,"Edge Function source",source_commit)
    checked_file(artifacts.get("opal_writer"),"Opal writer",source_commit)
    checked_file(artifacts.get("opal_transaction_helper"),"Opal transaction helper",source_commit)
    checked_file(artifacts.get("opal_service"),"Opal service",source_commit)
    checked_file(artifacts.get("opal_config_template"),"Opal config template",source_commit)
    checked_file(manifest.get("rollback",{}).get("compensating_migration"),"compensating migration",source_commit)
    rb=manifest.get("rollback",{})
    if rb.get("function_version")!=25 or rb.get("opal_writer_prestate")!="ABSENT" or rb.get("scoreboard_relay_preserved") is not True:
        errors.append("rollback target is incomplete or changes the existing scoreboard relay")
    if rb.get("sql_restore_test")!="PASS" or rb.get("opal_uninstall_restore_test")!="PASS":
        errors.append("tested Supabase/Opal rollback evidence missing")
    if not re.fullmatch(r"[a-f0-9]{64}",str(manifest.get("admission_sha256",""))) or manifest.get("admission_sha256")!=backend_opal_admission_digest(manifest):
        errors.append("backend/Opal admission digest is missing or incorrect")
    if tx.get("admission_sha256")!=manifest.get("admission_sha256"):
        errors.append("admission identity differs from the primary control state")

    pre=manifest.get("fresh_readonly_preflight",{})
    checked_file(pre,"fresh read-only preflight")
    if isinstance(pre,dict):
        try:
            receipt=load(root/pre["path"]); captured=receipt.get("captured_unix")
            if receipt.get("schema")!="hbnf-owner-control-live-readonly-preflight-v1" or receipt.get("pass") is not True:
                errors.append("fresh read-only preflight did not pass")
            if not isinstance(captured,(int,float)) or captured>(time.time() if now is None else now)+5 or (validate_freshness and (time.time() if now is None else now)-captured>300):
                errors.append("fresh read-only preflight is stale")
            elif receipt.get("matrix_mac")!=identities.get("matrix_mac") or receipt.get("aux_mac")!=identities.get("aux_mac"):
                errors.append("fresh read-only device identities differ from admission")
            elif receipt.get("matrix_release_id")!=identities.get("matrix_release_id") or receipt.get("matrix_recorded_firmware_sha256")!=identities.get("matrix_recorded_firmware_sha256"):
                errors.append("fresh Matrix release identity differs from admission")
            elif any(receipt.get(k)!=identities.get(k) for k in ("matrix_brightness","matrix_logical_brightness","matrix_aux_target_brightness","aux_brightness","vibe")):
                errors.append("fresh owner settings differ from admission")
            elif receipt.get("opal_model")!=identities.get("opal_model") or receipt.get("opal_ip")!=identities.get("opal_ip"):
                errors.append("fresh Opal identity differs from admission")
        except (OSError,KeyError,ValueError,TypeError): errors.append("fresh read-only preflight receipt is missing or malformed")

    canonical=manifest.get("canonical_readonly_preflight",{})
    checked_file(canonical,"canonical desired-state/fence preflight")
    if isinstance(canonical,dict):
        try:
            receipt=load(root/canonical["path"]); captured=receipt.get("captured_unix"); current=time.time() if now is None else now
            if receipt.get("schema")!="hbnf-owner-control-canonical-readonly-preflight-v1" or receipt.get("pass") is not True:
                errors.append("canonical desired-state/fence preflight did not pass")
            if not isinstance(captured,(int,float)) or captured>current+5 or (validate_freshness and current-captured>300):
                errors.append("canonical desired-state/fence preflight is stale")
            for key in ("desired_revision","fence_epoch","fence_release_id","fence_active"):
                if identities.get(key)!=receipt.get(key): errors.append("fresh canonical state differs from admission: "+key)
            if receipt.get("fence_active") is not False: errors.append("bootstrap admission requires the actuator fence to be inactive")
        except (OSError,KeyError,ValueError,TypeError): errors.append("canonical desired-state/fence preflight receipt is missing or malformed")

    checks=manifest.get("checks",{})
    if not isinstance(checks,dict): checks={}; errors.append("transaction checks missing")
    for key in ("offline_admission_tests","rollback_tests","production_v25_snapshot","migration_pending","edge_handler_contract","reissue_precondition"):
        item=checks.get(key,{})
        if item.get("pass") is not True: errors.append("failed/missing backend/Opal check: "+key); continue
        checked_file(item,"check evidence "+key)
        # The pre-deployment baseline is an issuance-time check. Once the
        # exact transaction has started, those expected facts (v25 active,
        # migration absent, writer absent) change by design. Preserve and hash
        # the original evidence, but re-evaluate it only before consuming the
        # one-use authorization.
        if key=="reissue_precondition" and require_unconsumed:
            try:
                proof=load(root/item["path"]); captured=proof.get("captured_unix"); current=time.time() if now is None else now
                if proof.get("pass") is not True or not isinstance(captured,(int,float)) or current-captured>300 or captured>current+5:
                    errors.append("fresh reissuance precondition is missing, failed, or stale")
                elif isinstance(tx,dict) and tx.get("continuation_from"):
                    retry_kind=tx.get("continuation_kind")
                    proof_schema=("hbnf-backend-opal-activation-retry-precondition-v1" if retry_kind=="verified_activation_rollback"
                        else "hbnf-backend-opal-post-bootstrap-continuation-precondition-v1" if retry_kind=="verified_post_bootstrap_checkpoint"
                        else "hbnf-backend-opal-continuation-precondition-v1")
                    if (proof.get("schema")!=proof_schema
                        or proof.get("prior_transaction_id")!=tx.get("continuation_from")
                        or proof.get("prior_admission_sha256")!=tx.get("continuation_admission_sha256")
                        or proof.get("production_function_version")!=27
                        or proof.get("function_bundle_sha256")!="d02a3cead7bdb5028ddca158ed4fc2fb0e2a28248923073c3da60e61e572c98a"
                        or proof.get("verify_jwt") is not False
                        or proof.get("migration_applied") is not True
                        or proof.get("bootstrap_rpc_present") is not True
                        or proof.get("migration_sha256")!=artifacts.get("migration",{}).get("sha256")
                        or proof.get("source_commit")!=source_commit
                        or proof.get("migration_required_rpcs")!=["hbnf_cart_matrix_relay_bootstrap","hbnf_cart_matrix_relay_issue","hbnf_cart_matrix_relay_confirm"]
                        or proof.get("migration_execute_acl")!={"anon":False,"authenticated":False,"service_role":True}
                        or proof.get("v25_rollback_snapshot_sha256")!="0d75b62870cdcb56abfd1340f35532c24dbb5df974b902277a40e6745f0fab24"
                        or proof.get("production_source_match") is not True
                        or proof.get("production_source_files")!=[pathlib.Path(p).name for p in BACKEND_OPAL_FUNCTION_FILES if pathlib.Path(p).name!="deno.lock"]
                        or proof.get("deployment_origin_bound_to_step_receipt") is not True
                        or proof.get("opal_writer_prestate")!=("INSTALLED_STOPPED" if retry_kind=="verified_post_bootstrap_checkpoint" else "ABSENT")
                        or proof.get("scoreboard_relay_present") is not True
                        or proof.get("fence_active") is not False):
                        errors.append("continuation precondition does not prove exact v27, migration, rollback, and no-writer state")
                    if retry_kind=="verified_activation_rollback":
                        corrective=artifacts.get("corrective_migration",{})
                        if (not isinstance(corrective,dict) or proof.get("applied_migration_name")!="20261016200518_hbnf_matrix_relay_confirm_status_constraint_compat"
                            or proof.get("corrective_migration_sha256")!=corrective.get("sha256")
                            or proof.get("corrective_migration_source_commit")!=corrective.get("source_commit")
                            or proof.get("prior_failure_receipt_sha256")!=tx.get("continuation_failure_receipt_sha256")
                            or proof.get("prior_rollback_receipt_sha256")!=tx.get("continuation_rollback_receipt_sha256")):
                            errors.append("activation retry precondition does not bind the deployed compatibility migration and exact rollback evidence")
                    preflight=manifest.get("fresh_readonly_preflight",{}); canonical=manifest.get("canonical_readonly_preflight",{})
                    # Reissue evidence is an immutable snapshot of the device
                    # and canonical state at authorization time. A later
                    # read-only refresh updates the operational preflight, but
                    # must not rewrite the historical proof it attests to.
                    binding=manifest.get("continuation_preflight_binding",{})
                    bound_matrix=binding.get("matrix_preflight_sha256",preflight.get("sha256"))
                    bound_canonical=binding.get("canonical_preflight_sha256",canonical.get("sha256"))
                    if proof.get("matrix_preflight_sha256")!=bound_matrix or proof.get("canonical_preflight_sha256")!=bound_canonical:
                        errors.append("continuation precondition is not bound to the fresh device and canonical readbacks")
                    for key,value in (("matrix_mac","704bca5b345c"),("matrix_logical_brightness",46),("matrix_brightness",255),
                        ("matrix_aux_target_brightness",46),("aux_mac","8c94df55c34c"),("aux_brightness",255),
                        ("matrix_release_id","hbnf-cart2-phase2-r6-skins-readable-20261014"),
                        ("matrix_recorded_firmware_sha256","de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d")):
                        if proof.get(key)!=value: errors.append("continuation precondition device value mismatch: "+key)
                    if proof.get("aux_ddp_healthy") is not True or proof.get("skins_relay_healthy") is not True:
                        errors.append("continuation precondition does not prove AUX DDP and Skins relay health")
                elif (proof.get("schema")!="hbnf-backend-opal-reissue-precondition-v1"
                    or proof.get("production_function_version")!=25 or proof.get("verify_jwt") is not False
                    or proof.get("migration_applied") is not False or proof.get("bootstrap_rpc_present") is not False
                    or proof.get("opal_writer_present") is not False or proof.get("scoreboard_relay_present") is not True):
                    errors.append("fresh reissuance precondition does not prove the unchanged v25/no-mutation baseline")
            except (OSError,KeyError,ValueError,TypeError): errors.append("reissuance precondition evidence is malformed")
    return errors

def issue_backend_opal_admission(state,manifest_path,authorization_receipt_path,now=None):
    """Issue a new one-use transaction admission through the existing control plane."""
    current=time.time() if now is None else now
    root=DEFAULT_STATE.parent.parent.resolve()
    manifest_path=pathlib.Path(manifest_path).resolve(); auth_path=pathlib.Path(authorization_receipt_path).resolve()
    errors=[]
    for path,label in ((manifest_path,"admission"),(auth_path,"owner authorization receipt")):
        try: path.relative_to(root/"evidence")
        except ValueError: errors.append(label+" must be stored inside evidence")
    if errors: raise ValueError("backend/Opal reissuance rejected: "+"; ".join(errors))
    manifest=load(manifest_path); receipt=load(auth_path); owner=receipt.get("owner_authorization") if isinstance(receipt,dict) else None
    source_commit=manifest.get("deployable_source_commit") if isinstance(manifest,dict) else None
    artifacts=manifest.get("artifacts",{}) if isinstance(manifest,dict) else {}
    if not isinstance(receipt,dict) or receipt.get("schema")!="hbnf-backend-opal-admission-authorization-v1" or not isinstance(owner,dict):
        errors.append("fresh direct-owner authorization receipt is missing or malformed")
    cursor=state.get("execution_cursor",{}); old=cursor.get("backend_opal_transaction",{}) if isinstance(cursor,dict) else {}
    old_owner=old.get("owner_authorization",{}) if isinstance(old,dict) else {}
    if old.get("schema")!="hbnf-backend-opal-transaction-state-v1": errors.append("no prior backend/Opal transaction to supersede")
    completed=old.get("completed_steps",[])
    continuation=(completed==list(BACKEND_OPAL_STEPS[:2]) and old.get("status")=="IN_PROGRESS"
        and old.get("attempts_used")==1 and old.get("last_reserved_step")==BACKEND_OPAL_STEPS[1]
        and old.get("rollback_attempts_used")==0)
    post_bootstrap_continuation=(completed==list(BACKEND_OPAL_STEPS[:4]) and old.get("status")=="IN_PROGRESS"
        and old.get("attempts_used")==1 and old.get("last_reserved_step")==BACKEND_OPAL_STEPS[3]
        and old.get("authorization_start_index")==2 and old.get("rollback_attempts_used")==0
        and old.get("failed_step") is None and not old.get("failure_receipt") and not old.get("rollback_receipt"))
    activation_retry=(completed==list(BACKEND_OPAL_STEPS[:4]) and old.get("status")=="ROLLED_BACK"
        and old.get("attempts_used")==1 and old.get("failed_step")=="activate_writer"
        and old.get("rollback_attempts_used")==1 and old.get("last_reserved_step")=="rollback")
    initial=(completed==[] and old.get("status") in ("IN_PROGRESS","AUTHORIZED")
        and old.get("attempts_used") in (0,1))
    if not (continuation or post_bootstrap_continuation or activation_retry or initial):
        errors.append("prior transaction is not the exact untouched baseline or an approved release continuation")
    if old.get("active_step") is not None:
        errors.append("prior transaction has an unresolved active step")
    if not isinstance(old_owner.get("expires_unix"),(int,float)) or old_owner.get("expires_unix")>current:
        errors.append("prior owner authorization is not expired")
    if not isinstance(owner,dict): owner={}
    required=("transaction_id","authorization_id","source_message_ref","deployable_source_commit","scope","nonce","issued_unix","expires_unix","artifact_sha256_bindings")
    for key in required:
        if owner.get(key) in (None,"",[],{}): errors.append("fresh owner authorization missing "+key)
    if owner.get("transaction_id")==old.get("transaction_id") or owner.get("authorization_id")==old_owner.get("authorization_id") or owner.get("nonce")==old_owner.get("nonce"):
        errors.append("reissued authorization must use new transaction, authorization, and nonce identities")
    if owner.get("source_message_ref")==old_owner.get("source_message_ref"):
        errors.append("reissued authorization must cite the current owner instruction")
    start_index=4 if post_bootstrap_continuation else (2 if (activation_retry or continuation) else 0)
    expected_owner_scope=[*BACKEND_OPAL_STEPS[start_index:],"rollback_if_required"]
    if owner.get("scope")!=expected_owner_scope:
        errors.append("fresh owner authorization scope is not the exact remaining backend/Opal transaction")
    if not isinstance(owner.get("issued_unix"),(int,float)) or not isinstance(owner.get("expires_unix"),(int,float)):
        errors.append("fresh owner authorization validity window is malformed")
    elif owner["issued_unix"]>current+5 or owner["issued_unix"]<current-300 or owner["expires_unix"]<=current or owner["expires_unix"]-owner["issued_unix"]>30*60:
        errors.append("fresh owner authorization must be current and expire within 30 minutes")
    manifest["owner_authorization"]=owner; manifest["deployable_source_commit"]=owner.get("deployable_source_commit")
    manifest["transaction_id"]=owner.get("transaction_id")
    manifest["admission_sha256"]=backend_opal_admission_digest(manifest)
    if owner.get("artifact_sha256_bindings")!=_backend_opal_artifact_sha_bindings(manifest):
        errors.append("owner authorization artifact hashes do not exactly bind this candidate and rollback")
    proof=manifest.get("checks",{}).get("reissue_precondition",{}) if isinstance(manifest.get("checks"),dict) else {}
    try:
        proof_data=load(root/proof["path"])
        if proof_data.get("prior_transaction_id")!=old.get("transaction_id") or proof_data.get("prior_admission_sha256")!=old.get("admission_sha256"):
            errors.append("reissue precondition does not bind the expired transaction being superseded")
        if continuation or post_bootstrap_continuation or activation_retry:
            expected_precondition_schema=("hbnf-backend-opal-post-bootstrap-continuation-precondition-v1" if post_bootstrap_continuation
                else "hbnf-backend-opal-activation-retry-precondition-v1" if activation_retry
                else "hbnf-backend-opal-continuation-precondition-v1")
            if (proof_data.get("schema")!=expected_precondition_schema
                or proof_data.get("production_function_version")!=27
                or proof_data.get("function_bundle_sha256")!="d02a3cead7bdb5028ddca158ed4fc2fb0e2a28248923073c3da60e61e572c98a"
                or proof_data.get("verify_jwt") is not False
                or proof_data.get("migration_applied") is not True
                or proof_data.get("bootstrap_rpc_present") is not True
                or proof_data.get("migration_sha256")!=manifest.get("artifacts",{}).get("migration",{}).get("sha256")
                or proof_data.get("source_commit")!=manifest.get("deployable_source_commit")
                or proof_data.get("migration_required_rpcs")!=["hbnf_cart_matrix_relay_bootstrap","hbnf_cart_matrix_relay_issue","hbnf_cart_matrix_relay_confirm"]
                or proof_data.get("migration_execute_acl")!={"anon":False,"authenticated":False,"service_role":True}
                or proof_data.get("v25_rollback_snapshot_sha256")!="0d75b62870cdcb56abfd1340f35532c24dbb5df974b902277a40e6745f0fab24"
                or proof_data.get("production_source_match") is not True
                or proof_data.get("production_source_files")!=[pathlib.Path(p).name for p in BACKEND_OPAL_FUNCTION_FILES if pathlib.Path(p).name!="deno.lock"]
                or proof_data.get("deployment_origin_bound_to_step_receipt") is not True
                or proof_data.get("opal_writer_prestate")!=("INSTALLED_STOPPED" if post_bootstrap_continuation else "ABSENT")
                or proof_data.get("scoreboard_relay_present") is not True
                or proof_data.get("fence_active") is not False):
                errors.append("continuation evidence does not prove exact v27, applied migration, rollback, and no-writer state")
            if activation_retry:
                failure_path=old.get("failure_receipt"); rollback_path=old.get("rollback_receipt")
                def verified_receipt(path, expected_sha, expected_step, expected_status):
                    if (not isinstance(path,str) or pathlib.Path(path).is_absolute() or ".." in pathlib.Path(path).parts
                        or not isinstance(expected_sha,str) or not re.fullmatch(r"[a-f0-9]{64}",expected_sha)):
                        return None
                    receipt_path=(root/path).resolve()
                    try: receipt_path.relative_to(root/"evidence")
                    except ValueError: return None
                    if not receipt_path.is_file() or sha256_file(receipt_path)!=expected_sha: return None
                    receipt=load(receipt_path)
                    return receipt if (receipt.get("schema")=="hbnf-backend-opal-release-step-v1"
                        and receipt.get("transaction_id")==old.get("transaction_id")
                        and receipt.get("step")==expected_step and receipt.get("status")==expected_status
                        and receipt.get("side_effects_verified") is True) else None
                fail_ref=verified_receipt(failure_path,old.get("failure_receipt_sha256"),"activate_writer","FAIL")
                rollback_ref=verified_receipt(rollback_path,old.get("rollback_receipt_sha256"),"rollback","PASS")
                if (not fail_ref or not rollback_ref or fail_ref.get("failure",{}).get("authorization_state") is None
                    or fail_ref.get("failure",{}).get("device_readback") is None
                    or rollback_ref.get("evidence",{}).get("opal_writer",{}).get("exact_prestate_restored") is not True
                    or rollback_ref.get("evidence",{}).get("devices",{}).get("settings_changed") is not False):
                    errors.append("activation retry does not prove the exact failed activation and completed rollback")
                if proof_data.get("prior_failure_receipt_sha256")!=old.get("failure_receipt_sha256") or proof_data.get("prior_rollback_receipt_sha256")!=old.get("rollback_receipt_sha256"):
                    errors.append("activation retry evidence does not bind the exact prior failure and rollback receipts")
            receipt_steps=BACKEND_OPAL_STEPS[:4] if post_bootstrap_continuation else BACKEND_OPAL_STEPS[:2]
            for step in receipt_steps:
                refs=[x for x in old.get("step_receipts",[]) if isinstance(x,dict) and x.get("step")==step]
                if len(refs)!=1:
                    errors.append("completed production step receipt is missing or duplicated: "+step); continue
                ref=refs[0]; rel=ref.get("path"); expected_sha=ref.get("sha256")
                if not isinstance(rel,str) or pathlib.Path(rel).is_absolute() or ".." in pathlib.Path(rel).parts:
                    errors.append("completed production step receipt path is unsafe: "+step); continue
                receipt_path=(root/rel).resolve()
                try: receipt_path.relative_to(root/"evidence")
                except ValueError: errors.append("completed production step receipt must be inside evidence: "+step); continue
                if not receipt_path.is_file() or not re.fullmatch(r"[a-f0-9]{64}",str(expected_sha)) or sha256_file(receipt_path)!=expected_sha:
                    errors.append("completed production step receipt is missing or changed: "+step); continue
                try: step_receipt=load(receipt_path)
                except (OSError,ValueError,TypeError):
                    errors.append("completed production step receipt is malformed: "+step); continue
                valid_transaction_ids={old.get("transaction_id"),old.get("continuation_from")}
                if (step_receipt.get("schema")!="hbnf-backend-opal-release-step-v1"
                    or step_receipt.get("transaction_id") not in valid_transaction_ids
                    or step_receipt.get("step")!=step or step_receipt.get("status")!="PASS"
                    or step_receipt.get("side_effects_verified") is not True):
                    errors.append("completed production step receipt is not a verified PASS: "+step)
                ev=step_receipt.get("evidence",{})
                if step=="apply_migration" and (ev.get("project")!="phcpbvuqibyarpfrftgx"
                    or ev.get("migration")!="20261011235000_hbnf_matrix_relay_incremental_controls_pin"
                    or ev.get("required_rpcs")!=["hbnf_cart_matrix_relay_bootstrap","hbnf_cart_matrix_relay_issue","hbnf_cart_matrix_relay_confirm"]
                    or ev.get("execute_acl")!={"anon":False,"authenticated":False,"service_role":True}
                    or ev.get("data_mutated") is not False):
                    errors.append("completed migration receipt does not prove exact additive migration and restricted RPC permissions")
                if step=="deploy_edge_function" and not activation_retry and (ev.get("project")!="phcpbvuqibyarpfrftgx"
                    or ev.get("function")!="hbnf-cart-control" or ev.get("version")!=26
                    or ev.get("verify_jwt") is not False
                    or ev.get("deploy_bundle_sha256")!="d02a3cead7bdb5028ddca158ed4fc2fb0e2a28248923073c3da60e61e572c98a"
                    or ev.get("v25_rollback_snapshot_sha256")!="0d75b62870cdcb56abfd1340f35532c24dbb5df974b902277a40e6745f0fab24"
                    or ev.get("cart_status",{}).get("http")!=200
                    or ev.get("live_status",{}).get("http")!=200
                    or ev.get("unpaired_command",{}).get("http")!=401
                    or ev.get("scoring_data_modified") is not False
                    or ev.get("matrix_device_mutated") is not False):
                    errors.append("completed deploy receipt does not prove the exact deployed bundle and v25 rollback")
                if post_bootstrap_continuation and step=="install_writer_stopped" and (ev.get("source_commit")!=source_commit
                    or ev.get("writer_sha256")!=artifacts.get("opal_writer",{}).get("sha256")
                    or ev.get("transaction_helper_sha256")!=artifacts.get("opal_transaction_helper",{}).get("sha256")
                    or ev.get("service_enabled") is not False or ev.get("service_started") is not False
                    or ev.get("skins_relay_preserved") is not True or ev.get("matrix_device_mutated") is not False
                    or ev.get("aux_device_mutated") is not False):
                    errors.append("completed writer install receipt does not prove the exact stopped package and preserved state")
                if post_bootstrap_continuation and step=="bootstrap_current_state" and (ev.get("function_version")!=27
                    or ev.get("physical_settings_changed") is not False or ev.get("deviceCommandsIssued") is not False
                    or ev.get("firmware_mutation_authority")!="CLOSED"
                    or ev.get("canonical_readback",{}).get("matrixLogicalBrightness")!=46
                    or ev.get("canonical_readback",{}).get("matrixAuxTargetBrightness")!=46
                    or ev.get("canonical_readback",{}).get("auxReceiverBrightness")!=255):
                    errors.append("completed bootstrap receipt does not prove unchanged authorized device values")
            if post_bootstrap_continuation:
                if (proof_data.get("completed_steps")!=completed
                    or proof_data.get("completed_step_receipts")!=old.get("step_receipts")):
                    errors.append("post-bootstrap continuation proof does not bind the exact four-step receipt prefix")
                matrix_ref=manifest.get("fresh_readonly_preflight",{})
                try:
                    fresh_device=load(root/matrix_ref["path"])
                    comparison_ref=fresh_device.get("projection_comparison_path")
                    comparison_path=(root/comparison_ref).resolve()
                    comparison_path.relative_to(root/"evidence")
                    comparison=load(comparison_path)
                    if (fresh_device.get("writer_installed") is not True
                        or fresh_device.get("writer_process_running") is not False
                        or fresh_device.get("writer_service_enabled") is not False
                        or fresh_device.get("writer_sha256")!=artifacts.get("opal_writer",{}).get("sha256")
                        or fresh_device.get("writer_helper_sha256")!=artifacts.get("opal_transaction_helper",{}).get("sha256")
                        or fresh_device.get("writer_init_sha256")!=artifacts.get("opal_service",{}).get("sha256")
                        or fresh_device.get("config_permission")!="0600 root:root"
                        or fresh_device.get("settings_changed") is not False
                        or fresh_device.get("scoring_data_changed") is not False
                        or fresh_device.get("projection_comparison_sha256")!=sha256_file(comparison_path)
                        or proof_data.get("projection_comparison_sha256")!=sha256_file(comparison_path)
                        or proof_data.get("projection_match") is not True
                        or proof_data.get("selected_vibe")!="psychedelic"
                        or comparison.get("pass") is not True or comparison.get("differences")!=[]
                        or comparison.get("explicitChecks",{}).get("psychedelicVibeMatches") is not True
                        or comparison.get("explicitChecks",{}).get("matrixLogicalBrightness")!=46
                        or comparison.get("explicitChecks",{}).get("matrixWledBrightness")!=255
                        or comparison.get("explicitChecks",{}).get("matrixAuxTarget")!=46
                        or comparison.get("explicitChecks",{}).get("auxReceiverBrightness")!=255):
                        errors.append("fresh post-bootstrap preflight does not prove exact installed/stopped writer and zero-difference projection")
                except (OSError,KeyError,TypeError,ValueError):
                    errors.append("fresh post-bootstrap projection or writer preflight is missing or malformed")
            if activation_retry:
                for step in BACKEND_OPAL_STEPS[2:4]:
                    refs=[x for x in old.get("step_receipts",[]) if isinstance(x,dict) and x.get("step")==step]
                    if len(refs)!=1:
                        errors.append("completed production step receipt is missing or duplicated: "+step); continue
                    ref=refs[0]; rel=ref.get("path"); expected_sha=ref.get("sha256")
                    if not isinstance(rel,str) or pathlib.Path(rel).is_absolute() or ".." in pathlib.Path(rel).parts:
                        errors.append("completed production step receipt path is unsafe: "+step); continue
                    receipt_path=(root/rel).resolve()
                    try: receipt_path.relative_to(root/"evidence")
                    except ValueError: errors.append("completed production step receipt must be inside evidence: "+step); continue
                    if not receipt_path.is_file() or not re.fullmatch(r"[a-f0-9]{64}",str(expected_sha)) or sha256_file(receipt_path)!=expected_sha:
                        errors.append("completed production step receipt is missing or changed: "+step); continue
                    try: step_receipt=load(receipt_path)
                    except (OSError,ValueError,TypeError):
                        errors.append("completed production step receipt is malformed: "+step); continue
                    valid_transaction_ids={old.get("transaction_id"),old.get("continuation_from")}
                    if (step_receipt.get("schema")!="hbnf-backend-opal-release-step-v1"
                        or step_receipt.get("transaction_id") not in valid_transaction_ids
                        or step_receipt.get("step")!=step or step_receipt.get("status")!="PASS"
                        or step_receipt.get("side_effects_verified") is not True):
                        errors.append("completed production step receipt is not a verified PASS: "+step); continue
                    ev=step_receipt.get("evidence",{})
                    if step=="install_writer_stopped" and (ev.get("source_commit")!=source_commit
                        or ev.get("writer_sha256")!=artifacts.get("opal_writer",{}).get("sha256")
                        or ev.get("transaction_helper_sha256")!=artifacts.get("opal_transaction_helper",{}).get("sha256")
                        or ev.get("service_enabled") is not False or ev.get("service_started") is not False
                        or ev.get("skins_relay_preserved") is not True or ev.get("matrix_device_mutated") is not False
                        or ev.get("aux_device_mutated") is not False):
                        errors.append("completed writer install receipt does not bind the exact stopped package and preserved state")
                    if step=="bootstrap_current_state" and (ev.get("function_version")!=27
                        or ev.get("physical_settings_changed") is not False or ev.get("deviceCommandsIssued") is not False
                        or ev.get("firmware_mutation_authority")!="CLOSED"
                        or ev.get("canonical_readback",{}).get("matrixLogicalBrightness")!=46
                        or ev.get("canonical_readback",{}).get("matrixAuxTargetBrightness")!=46
                        or ev.get("canonical_readback",{}).get("auxReceiverBrightness")!=255):
                        errors.append("completed bootstrap receipt does not prove unchanged authorized device values")
            expected_carried_receipts=old.get("step_receipts",[])[:2] if activation_retry else old.get("step_receipts")
            if proof_data.get("completed_step_receipts")!=expected_carried_receipts:
                errors.append("continuation evidence does not bind the immutable completed-step receipts")
            expected_carried_steps=completed[:2] if activation_retry else completed
            if proof_data.get("completed_steps")!=expected_carried_steps:
                errors.append("continuation evidence does not bind the exact completed step prefix")
            if activation_retry and (proof_data.get("prior_completed_steps")!=completed
                or proof_data.get("prior_step_receipts")!=old.get("step_receipts")):
                errors.append("activation retry evidence does not bind the superseded install/bootstrap history")
    except (OSError,KeyError,TypeError,ValueError): errors.append("reissue precondition does not bind the prior transaction")
    carried=continuation or post_bootstrap_continuation or activation_retry
    start_index=4 if post_bootstrap_continuation else 2
    carried_steps=completed[:2] if activation_retry else completed
    carried_receipts=old.get("step_receipts",[])[:2] if activation_retry else old.get("step_receipts",[])
    new_tx={"schema":"hbnf-backend-opal-transaction-state-v1","transaction_id":owner.get("transaction_id"),
        "owner_authorization":owner,"admission_sha256":manifest["admission_sha256"],
        "status":"IN_PROGRESS" if carried else "AUTHORIZED",
        "attempts_used":1 if carried else 0,"completed_steps":list(carried_steps) if carried else [],
        "active_step":None,"rollback_attempts_used":0}
    if carried:
        new_tx.update({"started_unix":current,"continuation_from":old.get("transaction_id"),
            "continuation_admission_sha256":old.get("admission_sha256"),"last_reserved_step":BACKEND_OPAL_STEPS[start_index-1],
            "step_receipts":copy.deepcopy(carried_receipts),"authorization_start_index":start_index})
        if activation_retry:
            new_tx["continuation_kind"]="verified_activation_rollback"
            new_tx["continuation_failure_receipt_sha256"]=old.get("failure_receipt_sha256")
            new_tx["continuation_rollback_receipt_sha256"]=old.get("rollback_receipt_sha256")
        elif post_bootstrap_continuation:
            new_tx["continuation_kind"]="verified_post_bootstrap_checkpoint"
    provisional=copy.deepcopy(state); provisional.setdefault("execution_cursor",{})["backend_opal_transaction"]=new_tx
    errors.extend(_backend_opal_admission_errors(provisional,manifest,current,require_unconsumed=True))
    if errors: raise ValueError("backend/Opal reissuance rejected: "+"; ".join(dict.fromkeys(errors)))
    history=cursor.setdefault("backend_opal_transaction_history",[])
    if any(x.get("transaction_id")==owner.get("transaction_id") for x in history if isinstance(x,dict)):
        raise ValueError("backend/Opal reissuance rejected: transaction identity was already used")
    history.append({"prior_transaction":copy.deepcopy(old),"superseded_by":owner["transaction_id"],"superseded_at_unix":current,
        "reason":"expired one-use admission; fresh evidence proves no prior production step completed" if not continuation and not post_bootstrap_continuation
            else "expired admission resumed from exact four-step checkpoint after fresh source, writer, and device preflight verification" if post_bootstrap_continuation
            else "expired one-use admission continued after immutable migration/deploy receipts and current v27 source were verified",
        "completed_steps_carried_forward":list(carried_steps) if carried else []})
    cursor.setdefault("backend_opal_transaction_audit",[]).append({"event":"OWNER_AUTHORIZED_ADMISSION_REISSUED",
        "transaction_id":owner["transaction_id"],"prior_transaction_id":old["transaction_id"],"authorization_id":owner["authorization_id"],
        "source_message_ref":owner["source_message_ref"],"admission_sha256":manifest["admission_sha256"],
        "authorization_receipt":str(auth_path.relative_to(root)),"authorization_receipt_sha256":sha256_file(auth_path),"issued_unix":current,
        "completed_steps_carried_forward":list(carried_steps) if carried else []})
    cursor["backend_opal_transaction"]=new_tx
    return manifest

def refresh_backend_opal_preflight(state,manifest_path,refresh_evidence_path,next_step,now=None):
    """Refresh read-only admission observations inside the same active transaction.

    This does not issue or reset authorization, alter artifact bindings, or
    change the transaction's consumed state. It only lets the already
    authorized transaction prove current identities/settings before its next
    guarded step.
    """
    current=time.time() if now is None else now
    root=DEFAULT_STATE.parent.parent.resolve()
    manifest_path=pathlib.Path(manifest_path).resolve()
    refresh_path=pathlib.Path(refresh_evidence_path).resolve()
    errors=[]
    for path,label in ((manifest_path,"admission"),(refresh_path,"preflight refresh evidence")):
        try:path.relative_to(root/"evidence")
        except ValueError:errors.append(label+" must be stored inside evidence")
    refresh=load(refresh_path)
    if refresh.get("schema")!="hbnf-backend-opal-preflight-refresh-v1":errors.append("preflight refresh evidence schema is invalid")
    def evidence_path(value,label):
        if not isinstance(value,str) or not value or pathlib.Path(value).is_absolute() or ".." in pathlib.Path(value).parts:
            errors.append(label+" path is unsafe");return root/"evidence"/"__invalid__"
        path=(root/value).resolve()
        try:path.relative_to(root/"evidence")
        except ValueError:errors.append(label+" must be inside evidence")
        return path
    matrix_path=evidence_path(refresh.get("matrix_preflight_path"),"Matrix/AUX preflight")
    canonical_path=evidence_path(refresh.get("canonical_preflight_path"),"canonical preflight")
    for path,label in ((matrix_path,"Matrix/AUX preflight"),(canonical_path,"canonical preflight")):
        try:path.relative_to(root/"evidence")
        except ValueError:errors.append(label+" must be stored inside evidence")
    state_tx=state.get("execution_cursor",{}).get("backend_opal_transaction",{})
    manifest=load(manifest_path)
    owner=manifest.get("owner_authorization",{})
    if state_tx.get("status")!="IN_PROGRESS" or state_tx.get("attempts_used")!=1:
        errors.append("preflight refresh requires the same consumed, active transaction")
    if state_tx.get("active_step") is not None:
        errors.append("preflight refresh is forbidden while a guarded step is reserved")
    if state_tx.get("transaction_id")!=manifest.get("transaction_id") or state_tx.get("owner_authorization")!=owner:
        errors.append("preflight refresh transaction/owner identity mismatch")
    if state_tx.get("admission_sha256")!=manifest.get("admission_sha256") or manifest.get("admission_sha256")!=backend_opal_admission_digest(manifest):
        errors.append("preflight refresh admission digest is stale or invalid")
    if not isinstance(owner.get("expires_unix"),(int,float)) or owner["expires_unix"]<=current:
        errors.append("preflight refresh owner authorization is expired")
    if (not isinstance(owner.get("issued_unix"),(int,float)) or owner.get("issued_unix")>current+5
        or owner.get("expires_unix",0)-owner.get("issued_unix",0)>30*60):
        errors.append("preflight refresh owner authorization window is invalid")
    if owner.get("deployable_source_commit")!=manifest.get("deployable_source_commit"):
        errors.append("preflight refresh source commit differs from owner authorization")
    if owner.get("artifact_sha256_bindings")!=_backend_opal_artifact_sha_bindings(manifest):
        errors.append("preflight refresh artifact bindings differ from owner authorization")
    done=state_tx.get("completed_steps",[])
    if not isinstance(done,list) or done!=list(BACKEND_OPAL_STEPS[:len(done)]):
        errors.append("preflight refresh transaction progress is not a valid step prefix")
    scope_start=state_tx.get("authorization_start_index",0)
    expected_scope=[*BACKEND_OPAL_STEPS[scope_start:],"rollback_if_required"] if isinstance(scope_start,int) and 0<=scope_start<=len(BACKEND_OPAL_STEPS) else []
    if owner.get("scope")!=expected_scope:
        errors.append("preflight refresh owner scope is not the exact remaining transaction")
    expected_step=BACKEND_OPAL_STEPS[len(done)] if isinstance(done,list) and len(done)<len(BACKEND_OPAL_STEPS) else None
    if next_step!=expected_step:errors.append("preflight refresh is not bound to the next allowlisted transaction step")
    try:
        fresh=load(matrix_path); captured=fresh.get("captured_unix")
        if fresh.get("schema")!="hbnf-owner-control-live-readonly-preflight-v1" or fresh.get("pass") is not True:
            errors.append("refreshed Matrix/AUX preflight did not pass")
        if not isinstance(captured,(int,float)) or current-captured>300 or captured>current+5:
            errors.append("refreshed Matrix/AUX preflight is stale")
        expected=manifest.get("identities",{})
        for key in ("matrix_mac","matrix_release_id","matrix_recorded_firmware_sha256","aux_mac","opal_model","opal_ip",
                    "matrix_brightness","matrix_logical_brightness","matrix_aux_target_brightness","aux_brightness","vibe"):
            if fresh.get(key)!=expected.get(key):errors.append("refreshed preflight differs from admitted identity/state: "+key)
    except (OSError,KeyError,ValueError,TypeError):
        errors.append("refreshed Matrix/AUX preflight is malformed")
    try:
        canonical=load(canonical_path); captured=canonical.get("captured_unix"); expected=manifest.get("identities",{})
        if canonical.get("schema")!="hbnf-owner-control-canonical-readonly-preflight-v1" or canonical.get("pass") is not True:
            errors.append("refreshed canonical preflight did not pass")
        if not isinstance(captured,(int,float)) or current-captured>300 or captured>current+5:
            errors.append("refreshed canonical preflight is stale")
        for key in ("desired_revision","fence_epoch","fence_release_id","fence_active"):
            if canonical.get(key)!=expected.get(key):errors.append("refreshed canonical state differs from admitted transaction: "+key)
        if canonical.get("fence_active") is not False:errors.append("preflight refresh requires the actuator fence to remain inactive")
    except (OSError,KeyError,ValueError,TypeError):
        errors.append("refreshed canonical preflight is malformed")
    if errors:raise ValueError("backend/Opal preflight refresh rejected: "+"; ".join(dict.fromkeys(errors)))
    # Preserve the issuance-time continuation readbacks before replacing the
    # current operational refs. Verify them against the immutable reissue
    # receipt so refresh cannot silently rebind the owner authorization.
    tx=state_tx
    if tx.get("continuation_from"):
        checks=manifest.get("checks",{})
        proof_ref=checks.get("reissue_precondition",{}) if isinstance(checks,dict) else {}
        proof_path=evidence_path(proof_ref.get("path"),"continuation precondition")
        if not proof_path.is_file() or sha256_file(proof_path)!=proof_ref.get("sha256"):
            raise ValueError("backend/Opal preflight refresh rejected: immutable continuation proof hash mismatch")
        proof=load(proof_path)
        binding=manifest.get("continuation_preflight_binding")
        original_matrix=(binding.get("matrix_preflight_sha256") if isinstance(binding,dict)
            else manifest.get("fresh_readonly_preflight",{}).get("sha256"))
        original_canonical=(binding.get("canonical_preflight_sha256") if isinstance(binding,dict)
            else manifest.get("canonical_readonly_preflight",{}).get("sha256"))
        if (proof.get("matrix_preflight_sha256")!=original_matrix
            or proof.get("canonical_preflight_sha256")!=original_canonical):
            raise ValueError("backend/Opal preflight refresh rejected: continuation proof does not bind the admission's issuance-time readbacks")
        expected_binding={"matrix_preflight_sha256":original_matrix,
            "canonical_preflight_sha256":original_canonical}
        if binding is not None and binding!=expected_binding:
            raise ValueError("backend/Opal preflight refresh rejected: immutable continuation readback binding changed")
        manifest["continuation_preflight_binding"]=expected_binding
    manifest["fresh_readonly_preflight"]={"path":matrix_path.relative_to(root).as_posix(),"sha256":sha256_file(matrix_path)}
    manifest["canonical_readonly_preflight"]={"path":canonical_path.relative_to(root).as_posix(),"sha256":sha256_file(canonical_path)}
    manifest["admission_sha256"]=backend_opal_admission_digest(manifest)
    state_tx["admission_sha256"]=manifest["admission_sha256"]
    state.get("execution_cursor",{}).setdefault("backend_opal_transaction_audit",[]).append({
        "event":"READONLY_PREFLIGHT_REFRESHED_WITHIN_ACTIVE_TRANSACTION",
        "transaction_id":manifest["transaction_id"],"admission_sha256":manifest["admission_sha256"],
        "matrix_preflight":matrix_path.relative_to(root).as_posix(),"matrix_preflight_sha256":sha256_file(matrix_path),
        "canonical_preflight":canonical_path.relative_to(root).as_posix(),"canonical_preflight_sha256":sha256_file(canonical_path),
        "refresh_evidence":refresh_path.relative_to(root).as_posix(),"refresh_evidence_sha256":sha256_file(refresh_path),
        "captured_unix":current,"completed_steps":list(done),"authorization_reset":False})
    return manifest

def _backend_opal_step_errors(state,manifest,step,now=None,require_active=False):
    # Freshness is enforced when reserving a step, not when recording its
    # verified completion/failure. Long-running deployments must not become
    # unrecordable merely because the preflight window elapsed during the
    # already-reserved operation.
    # Rollback only removes the exact newly installed Opal files and is allowed
    # solely after a recorded failure. It does not issue device commands, so an
    # expired device-state snapshot must not strand the already-authorized
    # rollback. Artifact/source identity, failure state, and single-use checks
    # remain mandatory.
    errors=_backend_opal_admission_errors(state,manifest,now,require_unconsumed=False,
        allow_expired=(step=="rollback"),validate_freshness=(not require_active and step!="rollback"))
    cursor=state.get("execution_cursor",{})
    tx=cursor.get("backend_opal_transaction",{}) if isinstance(cursor,dict) else {}
    if tx.get("status") not in ("IN_PROGRESS","ROLLBACK_REQUIRED"):
        errors.append("backend/Opal authorization is not in an active transaction")
    if tx.get("admission_sha256")!=manifest.get("admission_sha256"):
        errors.append("backend/Opal transaction manifest identity changed")
    if require_active:
        if tx.get("active_step")!=step: errors.append("transaction command is not the currently reserved step")
    elif tx.get("active_step") is not None:
        errors.append("another transaction command is already reserved")
    if step=="rollback":
        expected_rollback_uses=1 if require_active else 0
        if tx.get("status")!="ROLLBACK_REQUIRED" or tx.get("rollback_attempts_used")!=expected_rollback_uses:
            errors.append("rollback is allowed only once after a recorded failure")
    else:
        done=tx.get("completed_steps",[])
        expected=BACKEND_OPAL_STEPS[len(done)] if len(done)<len(BACKEND_OPAL_STEPS) else None
        if step!=expected: errors.append("transaction command is unrelated, out of order, or replayed")
    if not isinstance(tx.get("attempts_used"),int) or tx.get("attempts_used")!=1:
        errors.append("transaction authorization was not consumed exactly once")
    return errors

def reserve_backend_opal_step(state,manifest_path,step,now=None):
    manifest=load(manifest_path); errors=_backend_opal_admission_errors(state,manifest,now,require_unconsumed=(step==BACKEND_OPAL_STEPS[0]),
        allow_expired=(step=="rollback"),validate_freshness=(step!="rollback"))
    cursor=state.setdefault("execution_cursor",{})
    tx=cursor.get("backend_opal_transaction",{})
    if step=="rollback":
        errors.extend(_backend_opal_step_errors(state,manifest,step,now))
    elif tx.get("status")=="AUTHORIZED":
        if step!=BACKEND_OPAL_STEPS[0]: errors.append("first transaction command is not the authorized migration step")
    else:
        errors.extend(_backend_opal_step_errors(state,manifest,step,now))
    if errors: raise ValueError("backend/Opal step rejected: "+"; ".join(dict.fromkeys(errors)))
    if tx.get("status")=="AUTHORIZED":
        tx.update({"status":"IN_PROGRESS","attempts_used":1,"started_unix":time.time() if now is None else now,
                   "completed_steps":[],"active_step":None,"rollback_attempts_used":0})
    if step=="rollback": tx["rollback_attempts_used"]=1
    tx["active_step"]=step
    tx["last_reserved_step"]=step
    cursor["backend_opal_transaction"]=tx
    return state

def complete_backend_opal_step(state,manifest_path,step,evidence_path,now=None):
    manifest=load(manifest_path); errors=_backend_opal_step_errors(state,manifest,step,now,require_active=True)
    root=DEFAULT_STATE.parent.parent.resolve(); p=pathlib.Path(evidence_path).resolve()
    try: p.relative_to(root/"evidence")
    except ValueError: errors.append("step evidence must be inside the evidence directory")
    try:
        receipt=load(p)
        if (receipt.get("schema")!="hbnf-backend-opal-release-step-v1" or receipt.get("transaction_id")!=manifest.get("transaction_id")
            or receipt.get("step")!=step or receipt.get("status")!="PASS" or receipt.get("side_effects_verified") is not True):
            errors.append("step receipt is not a PASS bound to this transaction")
    except (OSError,ValueError,TypeError): errors.append("step receipt is missing or malformed")
    if errors: raise ValueError("backend/Opal step completion rejected: "+"; ".join(dict.fromkeys(errors)))
    tx=state["execution_cursor"]["backend_opal_transaction"]
    if step=="rollback":
        tx.update({"status":"ROLLED_BACK","rollback_receipt":str(p.relative_to(root)),"rollback_receipt_sha256":sha256_file(p),"active_step":None})
    else:
        tx.setdefault("step_receipts",[]).append({"step":step,"path":str(p.relative_to(root)),"sha256":sha256_file(p)})
        tx.setdefault("completed_steps",[]).append(step); tx["active_step"]=None
        if len(tx["completed_steps"])==len(BACKEND_OPAL_STEPS): tx["status"]="COMPLETE"
    return state

def fail_backend_opal_step(state,manifest_path,step,evidence_path,now=None):
    manifest=load(manifest_path); errors=_backend_opal_step_errors(state,manifest,step,now,require_active=True)
    root=DEFAULT_STATE.parent.parent.resolve(); p=pathlib.Path(evidence_path).resolve()
    try: p.relative_to(root/"evidence")
    except ValueError: errors.append("failure evidence must be inside the evidence directory")
    try:
        receipt=load(p)
        if (receipt.get("schema")!="hbnf-backend-opal-release-step-v1" or receipt.get("transaction_id")!=manifest.get("transaction_id")
            or receipt.get("step")!=step or receipt.get("status")!="FAIL"):
            errors.append("failure receipt is not bound to this transaction step")
    except (OSError,ValueError,TypeError): errors.append("failure receipt is missing or malformed")
    if errors: raise ValueError("backend/Opal failure record rejected: "+"; ".join(dict.fromkeys(errors)))
    tx=state["execution_cursor"]["backend_opal_transaction"]
    tx.update({"status":"ROLLBACK_REQUIRED","failed_step":step,"failure_receipt":str(p.relative_to(root)),
               "failure_receipt_sha256":sha256_file(p),"active_step":None})
    return state

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
    allowed_sources={
        "48bdf20dcdecaf0a4ebb7f1af4068864f4b10b32":"9cc5731cf2901b2acb26044b574c4587d42d64fae4b85c425f46eddaa77971a9",
        "3d5a0fdddf3b5c408cd162b67ef8b9e4e6e355c5":"be0ca8d199c078b4a3225e219590f2cf96b89cc349f0182fa71fc360ca5893e1",
    }
    if (source_commit not in allowed_sources or source_sha!=allowed_sources.get(source_commit)
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
    root_cause=proof.get("root_cause_evidence")
    if root_cause is not None:
        cause_path=root_cause.get("path") if isinstance(root_cause,dict) else None
        if not isinstance(cause_path,str) or not isinstance(root_cause.get("sha256"),str):
            raise ValueError("preflight failure root-cause evidence binding malformed")
        cause_file=root/cause_path
        try: cause_file.resolve().relative_to(qualification_root.resolve())
        except ValueError: raise ValueError("preflight root-cause evidence is outside the qualification evidence root")
        if not cause_file.is_file() or sha256_file(cause_file)!=root_cause["sha256"]:
            raise ValueError("preflight root-cause evidence hash mismatch")
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
        if proof.get("root_cause_evidence"):
            retry_record["root_cause_evidence"]=proof["root_cause_evidence"]
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


def reconcile_installed_qualification(state, prelive_path, authorization_receipt_path=None, *, now=None):
    """Reopen only the exact installed candidate after a proved pre-profile failure and valid owner scope."""
    root=pathlib.Path(ROOT).resolve()
    evidence_root=(root/"evidence").resolve()
    def evidence_file(relative):
        if not isinstance(relative,str) or not relative:
            raise ValueError("missing evidence path")
        path=(root/relative).resolve()
        path.relative_to(evidence_root)
        return path
    subject=state.get("execution_cursor",{}).get("current_subject",{})
    auth=state.get("live_mutation_authorization",{})
    binding=state.get("live_authorization_binding",{})
    errors=[]
    direct_continuation=False
    continuation_receipt=None
    if authorization_receipt_path:
        try:
            authorization_path=pathlib.Path(authorization_receipt_path).resolve()
            authorization_path.relative_to(evidence_root)
            continuation_receipt=load(authorization_path)
            continuation=continuation_receipt.get("continuation_authorization",{})
            owner_baseline=auth.get("owner_brightness_baseline",{})
            direct_continuation=(continuation_receipt.get("binding")==binding
                and continuation.get("authorization_id")=="OWNER-20261011-CART2-F89-QUALIFICATION-CONTINUATION-01"
                and continuation.get("source_message_ref")=="Direct user instruction in this conversation, 2026-10-11: CART 2.0 — FINISH QUALIFICATION AND RELEASE FOR FIELD TESTING."
                and continuation.get("scope")=="QUALIFICATION_ONLY_FOR_EXACT_INSTALLED_F89_ONE_SOAK_NO_REINSTALL"
                and continuation.get("candidate_sha256")==auth.get("candidate_sha256")
                and continuation.get("rollback_sha256")==auth.get("rollback_sha256")
                and continuation.get("matrix_mac"," ").replace(":","").lower()=="704bca5b345c"
                and continuation.get("owner_settings_baseline")==owner_baseline
                and owner_baseline=={"matrixBrightness":147,"auxBrightness":255,"vibe":0}
                and continuation.get("candidate_install_permitted") is False
                and continuation.get("soak_seconds") == 5400
                and continuation.get("exact_r4_recovery_attempts") == 1)
            if not direct_continuation:
                errors.append("current direct continuation authorization receipt is malformed or not exact")
        except (OSError,ValueError,TypeError,AttributeError):
            errors.append("current direct continuation authorization receipt is missing or invalid")
    candidate=auth.get("candidate_release_id")
    candidate_sha=auth.get("candidate_sha256")
    rollback_sha=auth.get("rollback_sha256")
    if state.get("live_mutation_authorized") is not False or auth.get("authorized") is not False:
        errors.append("qualification rearm requires the current live gate to be closed")
    if (not candidate or not re.fullmatch(r"[a-f0-9]{64}",str(candidate_sha or ""))
        or not re.fullmatch(r"[a-f0-9]{64}",str(rollback_sha or ""))):
        errors.append("current exact candidate/recovery binding is incomplete")
    if (state.get("installed_release")!=candidate or state.get("installed_firmware_sha256")!=candidate_sha
        or subject.get("installed_release_id")!=candidate or subject.get("installed_sha256")!=candidate_sha):
        errors.append("primary state does not identify the exact installed candidate")
    if (binding.get("candidate_release_id")!=candidate or binding.get("candidate_bin_sha256")!=candidate_sha
        or binding.get("rollback_bin_sha256")!=rollback_sha
        or str(binding.get("matrix_mac","")).replace(":","").lower()!="704bca5b345c"
        or binding.get("authorization_id")!=auth.get("authorization_id")):
        errors.append("current owner authorization is not bound to the exact candidate, R4 recovery, and Matrix")
    scope=binding.get("scope",[])
    if (not isinstance(scope,list) or not any("28" in str(item) and "kernel" in str(item).lower() for item in scope)
        or not any("5400" in str(item) or "90-minute" in str(item) for item in scope)):
        errors.append("exact owner authorization does not include frozen qualification and soak")
    if (auth.get("candidate_attempts_used")!=1 or auth.get("candidate_install_limit")!=1
        or auth.get("recovery_attempts_used")!=0 or auth.get("recovery_install_limit")!=1
        or auth.get("transaction_consumed") is not True
        or (auth.get("candidate_install_permitted") is not False and not direct_continuation)):
        errors.append("one candidate attempt must be consumed, candidate retry disabled, and exact R4 recovery unused")
    evidence_path=auth.get("source_evidence")
    try:
        owner_doc=load(evidence_file(evidence_path))
        owner_binding=owner_doc.get("binding",{})
        if owner_binding!=binding:
            errors.append("owner authorization evidence differs from primary exact binding")
    except (OSError,ValueError,TypeError):
        if not direct_continuation:
            errors.append("exact owner authorization evidence is missing or invalid")
    if direct_continuation:
        if continuation_receipt.get("binding")!=binding:
            errors.append("continuation receipt does not preserve the exact installed candidate and R4 binding")

    tx_rel=auth.get("transaction_result")
    if not isinstance(tx_rel,str) or tx_rel!=subject.get("qualification_result"):
        errors.append("primary state transaction result pointer mismatch")
        tx_path=root/"__missing_transaction_result__"
    else:
        try:
            tx_path=evidence_file(tx_rel)
        except (ValueError,OSError):
            tx_path=root/"__missing_transaction_result__"
            errors.append("transaction result path escapes the evidence root")
    tx_sha=subject.get("qualification_result_sha256")
    interrupted_brightness_restore=False
    try:
        tx=load(tx_path)
        if sha256_file(tx_path)!=tx_sha:
            errors.append("failed qualification transaction hash mismatch")
        original_parser_failure=(tx.get("schema")=="hbnf-cart2-candidate-qualification-transaction-v1"
            and tx.get("candidate_install_attempts")==1
            and tx.get("error")=="RuntimeError: persisted-config-HBNF-settings-partial-or-invalid")
        interrupted_restore_failure=(tx.get("schema")=="hbnf-cart2-candidate-qualification-continuation-v1"
            and tx.get("candidate_install_attempts")==0
            and tx.get("preflight_completed") is True and tx.get("setup_started") is True
            and tx.get("brightness_setup_started") is True
            and tx.get("restore_error")=="RuntimeError: qualification-baseline-matrix-brightness-mismatch")
        authorized_vibe_restore_failure=(direct_continuation
            and tx.get("schema")=="hbnf-cart2-candidate-qualification-transaction-v1"
            and tx.get("candidate_install_attempts")==1
            and tx.get("error")=="RuntimeError: qualification-baseline-vibe-mismatch"
            and tx.get("qualification") is None and tx.get("recovery") is None
            and tx.get("recovery_attempts",0)==0
            and tx.get("brightness_setup",{}).get("verified") is True)
        if (tx.get("candidate_release_id")!=candidate or tx.get("candidate_sha256")!=candidate_sha
            or tx.get("recovery_attempts",0)!=0
            or tx.get("status")!="QUALIFICATION_BRIGHTNESS_RESTORE_FAILED"
            or not (original_parser_failure or interrupted_restore_failure or authorized_vibe_restore_failure)
            or "qualification" in tx or tx.get("recovery") is not None):
            errors.append("current transaction is not the exact pre-profile legacy-Vibe parser failure")
        interrupted_brightness_restore=interrupted_restore_failure or authorized_vibe_restore_failure
    except (OSError,ValueError,TypeError):
        errors.append("failed qualification transaction receipt is missing or invalid")

    runtime_rel=subject.get("runtime_readonly_receipt")
    if direct_continuation and not runtime_rel:
        runtime_path=root/"__missing_runtime_receipt__"
    else:
        try:
            runtime_path=evidence_file(runtime_rel)
        except (ValueError,OSError):
            runtime_path=root/"__missing_runtime_receipt__"
            errors.append("installed-candidate read-only receipt path escapes the evidence root")
    try:
        runtime=load(runtime_path)
        if sha256_file(runtime_path)!=subject.get("runtime_readonly_sha256"):
            errors.append("installed-candidate read-only receipt hash mismatch")
        matrix=runtime.get("matrix",{})
        identity=matrix.get("identity",{})
        h=matrix.get("hbnf",{})
        aux=runtime.get("aux",{})
        if (runtime.get("schema")!="cart2-current-matrix-readonly-snapshot-v1"
            or runtime.get("read_only") is not True or runtime.get("device_mutations")!=0
            or identity.get("release_id")!=candidate or identity.get("candidate")!=candidate
            or identity.get("mac","").replace(":","").lower()!="704bca5b345c"
            or matrix.get("identity",{}).get("on") is not True
            or h.get("matrixBrightness")!=52 or h.get("auxBrightness")!=245
            or h.get("packet20DiagnosticEnabled") is not False
            or h.get("foundationTelemetryEnabled") is not False
            or not (aux.get("live") is True and aux.get("mode")=="DDP" and aux.get("source")=="192.168.77.10"
                and aux.get("led_count")==22 and aux.get("on") is True and aux.get("lor")==0)):
            errors.append("installed-candidate read-only snapshot does not prove exact runtime and AUX safety")
    except (OSError,ValueError,TypeError,AttributeError):
        if not direct_continuation:
            errors.append("installed-candidate read-only receipt is missing or invalid")
    if direct_continuation and (runtime_rel is None or not runtime_path.is_file()):
        # The fresh prelive receipt below contains the same exact runtime and
        # AUX evidence, so a stale duplicated snapshot is not a prerequisite.
        pass

    try:
        candidate_path=evidence_file(subject.get("candidate_artifact_path"))
    except (ValueError,OSError):
        candidate_path=root/"__missing_candidate_artifact__"
        errors.append("installed-candidate artifact path escapes the evidence root")
    try:
        rollback_path=evidence_file(subject.get("rollback_artifact_path"))
    except (ValueError,OSError):
        rollback_path=root/"__missing_rollback_artifact__"
        errors.append("exact R4 recovery artifact path escapes the evidence root")
    if not candidate_path.is_file() or sha256_file(candidate_path)!=candidate_sha:
        errors.append("exact installed-candidate artifact bytes are unavailable")
    if not rollback_path.is_file() or sha256_file(rollback_path)!=rollback_sha:
        errors.append("exact R4 recovery bytes are unavailable")

    proof_path=pathlib.Path(prelive_path)
    try:
        proof_path=proof_path.resolve()
        proof_path.relative_to(evidence_root)
        qualification_root=tx_path.parent.parent.resolve()
        qualification_root.relative_to(evidence_root)
        if qualification_root.name!="live-qualification":
            raise ValueError("wrong qualification evidence directory")
        proof_path.relative_to(qualification_root)
        proof=load(proof_path)
        age=(time.time() if now is None else now)-float(proof.get("captured_unix",0))
        matrix=proof.get("matrix",{})
        baseline=proof.get("brightness_baseline",{})
        runtime_settings=baseline.get("runtime",{})
        stored=baseline.get("persisted",{})
        aux=proof.get("aux",{})
        rollback=proof.get("rollback",{})
        worker=proof.get("single_worker",{})
        expected_brightness=FROZEN_MATRIX_BRIGHTNESS if interrupted_brightness_restore else QUALIFICATION_BASELINE_BRIGHTNESS
        if (proof.get("schema")!="hbnf-cart2-qualification-prelive-v1" or proof.get("pass") is not True
            or proof.get("read_only") is not True or proof.get("device_mutations")!=0
            or proof.get("operation_scope")!="QUALIFICATION_ONLY"
            or proof.get("candidate_release_id")!=candidate or proof.get("candidate_sha256")!=candidate_sha
            or proof.get("candidate_attempts_used")!=1 or proof.get("recovery_attempts_used")!=0
            or proof.get("candidate_install_permitted") is not False
            or age<0 or age>300):
            errors.append("fresh read-only qualification preflight is missing, stale, or incorrectly scoped")
        if direct_continuation:
            owner_baseline=continuation_receipt["continuation_authorization"]["owner_settings_baseline"]
            allowed_matrix=(FROZEN_MATRIX_BRIGHTNESS,owner_baseline["matrixBrightness"])
            vibe_restore_needed=proof.get("owner_settings_restore_required") is True
            prelive_settings_ok=(runtime_settings.get("matrixBrightness") in allowed_matrix
                and stored.get("matrixBrightness")==runtime_settings.get("matrixBrightness")
                and runtime_settings.get("auxBrightness")==owner_baseline["auxBrightness"]
                and stored.get("auxBrightness")==owner_baseline["auxBrightness"]
                and runtime_settings.get("vibe")==owner_baseline["vibe"]
                and (stored.get("vibe")==owner_baseline["vibe"] or
                    (vibe_restore_needed and type(stored.get("vibe")) is int and 0<=stored["vibe"]<=5))
                and proof.get("owner_brightness_baseline")==owner_baseline)
            if (matrix.get("release_id")!=candidate or matrix.get("candidate_sha256")!=candidate_sha or matrix.get("on") is not True
                or matrix.get("mac"," ").replace(":","").lower()!="704bca5b345c"
                or matrix.get("brightness")!=runtime_settings.get("matrixBrightness")
                or matrix.get("diagnostic_off") is not True or matrix.get("telemetry_off") is not True
                or not prelive_settings_ok or not proof.get("host_on_ac")
                or proof.get("cart_lan_interface")!="en0" or rollback.get("sha256")!=rollback_sha):
                errors.append("fresh continuation preflight does not prove exact candidate, authorized owner settings repair, and safe test state")
        elif (matrix.get("release_id")!=candidate or matrix.get("candidate_sha256")!=candidate_sha or matrix.get("on") is not True
            or matrix.get("mac","").replace(":","").lower()!="704bca5b345c"
            or matrix.get("brightness")!=expected_brightness or matrix.get("diagnostic_off") is not True
            or matrix.get("telemetry_off") is not True
            or runtime_settings.get("matrixBrightness")!=expected_brightness or runtime_settings.get("auxBrightness")!=245
            or type(runtime_settings.get("vibe")) is not int or not 0<=runtime_settings["vibe"]<=5
            or stored.get("matrixBrightness")!=expected_brightness or stored.get("auxBrightness")!=245
            or ("vibe" in stored and stored.get("vibe")!=runtime_settings.get("vibe"))
            or not proof.get("host_on_ac") or proof.get("cart_lan_interface")!="en0"
            or proof.get("rollback_sha256") not in (None,rollback_sha)):
            errors.append("fresh qualification preflight does not prove the exact candidate baseline")
        if (not (aux.get("live") is True and aux.get("mode")=="DDP" and aux.get("source")=="192.168.77.10"
                and aux.get("led_count")==22 and aux.get("on") is True and aux.get("lor")==0)
            or rollback.get("sha256")!=rollback_sha or rollback_sha not in str(rollback.get("opal_ledger",""))
            or worker.get("pass") is not True or worker.get("worker_count")!=1
            or worker.get("conflicting_pids")!=[]):
            errors.append("fresh preflight does not prove AUX, exact R4 recovery, and single-worker readiness")
    except (OSError,ValueError,TypeError,AttributeError):
        errors.append("fresh qualification preflight receipt is missing, malformed, or outside the evidence root")
    if errors:
        raise ValueError("installed qualification rearm rejected: "+"; ".join(errors))

    rel=str(proof_path.relative_to(root))
    current=state["live_mutation_authorization"]
    current.update({"authorized":True,"hardware_writes_permitted_now":True,
        "candidate_install_permitted":False,"candidate_attempts_used":1,"recovery_attempts_used":0,
        "operation_scope":"QUALIFICATION_ONLY","status":"CANDIDATE_INSTALLED_QUALIFICATION_PENDING",
        "current_gate":"Fresh exact candidate preflight passed; qualification-only continuation authorized; candidate reinstall prohibited.",
        "qualification_prelive_receipt":rel,"qualification_prelive_sha256":sha256_file(proof_path)})
    if direct_continuation:
        auth_rel=str(authorization_path.relative_to(root))
        current["continuation_authorization_receipt"]=auth_rel
        current["source_evidence"]=auth_rel
        current["continuation_authorization_id"]=continuation_receipt["continuation_authorization"]["authorization_id"]
        current["continuation_authorization_sha256"]=sha256_file(authorization_path)
        current["owner_brightness_baseline"]=dict(continuation_receipt["continuation_authorization"]["owner_settings_baseline"])
        current["candidate_install_permitted"]=False
        current["current_gate"]="Fresh exact f89 preflight passed; one qualification-only continuation is authorized, settings repair is bound to the owner baseline, candidate install remains disabled, and the single R4 recovery limit remains available."
    if interrupted_brightness_restore:
        current["qualification_recovery_subscope"]="RESTORE_INTERRUPTED_BRIGHTNESS_THEN_QUALIFY"
        if not direct_continuation:
            current["current_gate"]="Exact candidate is at the frozen 44 brightness after the prior one-write setup; restore owner brightness 52, verify it, then continue qualification. No candidate reinstall."
    else:
        current.pop("qualification_recovery_subscope",None)
    state["live_mutation_authorized"]=True
    state["status"]="CANDIDATE_INSTALLED_QUALIFICATION_PENDING"
    state["live_mutation_authorization_closed_at_utc"]=None
    task=state.setdefault("current_task",{})
    task.update({"status":"CANDIDATE_INSTALLED_QUALIFICATION_PENDING","live_mutation_authorized":True,
        "live_mutation_authorization":"Qualification-only for the exact already-installed candidate after fresh read-only preflight; no reinstall. One exact R4 recovery remains available.",
        "next_action":"Run exact LIVE_QUALIFICATION admission through the guarded continuation entrypoint; candidate installation remains disabled."})
    state["last_updated_utc"]=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
    return state


def reconcile_failed_qualification_for_r4_recovery(state, prelive_path, *, now=None):
    """Open only the already-authorized exact R4 return after a complete failed sweep."""
    root=pathlib.Path(ROOT).resolve()
    evidence_root=(root/"evidence").resolve()
    def evidence_file(relative):
        if not isinstance(relative,str) or not relative:
            raise ValueError("missing evidence path")
        path=(root/relative).resolve()
        path.relative_to(evidence_root)
        return path
    subject=state.get("execution_cursor",{}).get("current_subject",{})
    auth=state.get("live_mutation_authorization",{})
    binding=state.get("live_authorization_binding",{})
    candidate=auth.get("candidate_release_id")
    candidate_sha=auth.get("candidate_sha256")
    rollback_sha=auth.get("rollback_sha256")
    errors=[]
    if state.get("live_mutation_authorized") is not False or auth.get("authorized") is not False:
        errors.append("R4 recovery rearm requires the current live gate to be closed")
    if (not candidate or not re.fullmatch(r"[a-f0-9]{64}",str(candidate_sha or ""))
        or not re.fullmatch(r"[a-f0-9]{64}",str(rollback_sha or ""))):
        errors.append("exact candidate and owner-bound recovery hashes are required")
    if (state.get("installed_release")!=candidate or state.get("installed_firmware_sha256")!=candidate_sha
        or subject.get("installed_release_id")!=candidate or subject.get("installed_sha256")!=candidate_sha):
        errors.append("primary state does not identify the exact failed candidate as installed")
    if (binding.get("candidate_release_id")!=candidate or binding.get("candidate_bin_sha256")!=candidate_sha
        or binding.get("rollback_bin_sha256")!=rollback_sha
        or str(binding.get("matrix_mac","")).replace(":","").lower()!="704bca5b345c"
        or binding.get("authorization_id")!=auth.get("authorization_id")):
        errors.append("owner authorization is not bound to the exact candidate, R4, and Matrix")
    scope=binding.get("scope",[])
    if (not isinstance(scope,list) or not any("r4 recovery" in str(item).lower() for item in scope)
        or not any("28" in str(item) and "kernel" in str(item).lower() for item in scope)):
        errors.append("owner authorization does not include exact R4 recovery after the frozen kernel gate")
    if (auth.get("candidate_attempts_used")!=1 or auth.get("candidate_install_limit")!=1
        or auth.get("candidate_install_permitted") is not False
        or auth.get("recovery_attempts_used")!=0 or auth.get("recovery_install_limit")!=1
        or auth.get("transaction_consumed") is not True):
        errors.append("candidate attempt must be consumed, retry disabled, and exact R4 recovery unused")
    try:
        owner_doc=load(evidence_file(auth.get("source_evidence")))
        if owner_doc.get("binding")!=binding:
            errors.append("owner authorization evidence differs from primary exact binding")
    except (OSError,ValueError,TypeError):
        errors.append("exact owner authorization evidence is missing or invalid")

    tx_rel=auth.get("transaction_result")
    if not isinstance(tx_rel,str) or tx_rel!=subject.get("qualification_result"):
        errors.append("failed qualification transaction pointer mismatch")
        tx_path=root/"__missing_transaction__"
    else:
        try: tx_path=evidence_file(tx_rel)
        except (OSError,ValueError):
            tx_path=root/"__missing_transaction__"
            errors.append("failed transaction path escapes evidence root")
    try:
        tx=load(tx_path)
        if sha256_file(tx_path)!=subject.get("qualification_result_sha256"):
            errors.append("failed qualification transaction hash mismatch")
        legacy_tx=(tx.get("schema")=="hbnf-cart2-candidate-qualification-continuation-v1"
            and tx.get("status")=="QUALIFICATION_BRIGHTNESS_RESTORE_FAILED"
            and tx.get("candidate_install_attempts")==0 and tx.get("recovery_attempts")==0
            and tx.get("brightness_restore",{}).get("verified") is False)
        installed_tx=(tx.get("schema")=="hbnf-cart2-candidate-qualification-transaction-v1"
            and tx.get("status")=="QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED"
            and tx.get("candidate_install_attempts")==1 and tx.get("recovery_attempts")==0)
        if (tx.get("candidate_release_id")!=candidate or tx.get("candidate_sha256")!=candidate_sha
            or not (legacy_tx or installed_tx)):
            errors.append("current transaction does not bind a recognized exact failed candidate attempt")
        q=tx.get("qualification",{})
        abort=q.get("abort",{}) if isinstance(q,dict) else {}
        diag_path=tx_path.parent/"sweep"/"SWEEP_ABORT.json"
        restore_path=tx_path.parent/"sweep"/"POST_RESTORE_STATE.json"
        diagnostic=load(diag_path) if diag_path.is_file() else {}
        restore=load(restore_path) if restore_path.is_file() else {}
        immediate_aux=(installed_tx and abort.get("status")=="FAIL" and diagnostic.get("status")=="FAIL"
            and diagnostic.get("run_error")=="diagnostic-continuation-aux-projection-inactive"
            and diagnostic.get("restore_error") is None
            and diagnostic.get("profiles_completed",0)>0
            and restore.get("restoreVerified") is True and restore.get("packet20Same") is True)
        legacy_complete=False
        complete_path=tx_path.parent/"sweep"/"DIAGNOSTIC_COMPLETE_RESULT.json"
        complete_restore=tx_path.parent/"sweep"/"RESTORE_RECEIPT.json"
        if complete_path.is_file() and complete_restore.is_file():
            diag=load(complete_path); completed_restore=load(complete_restore)
            legacy_complete=(diag.get("schema")=="hbnf-foundation-complete-diagnostic-result-v1"
                and diag.get("candidate_release_id")==candidate and diag.get("expected_kernel_count")==28
                and diag.get("kernels_completed")==28 and diag.get("qualification_eligible") is False
                and diag.get("soak_started") is False and diag.get("combined_feature_check_status")=="PASS"
                and any(item.get("failure_class")=="PERFORMANCE_COMPARISON" for item in diag.get("gate_failures",[]))
                and completed_restore.get("status")=="PASS" and completed_restore.get("snapshot_equal") is True)
            if legacy_complete:
                diag_path=complete_path
        if not (immediate_aux or legacy_complete):
            errors.append("failed qualification lacks an exact frozen-gate or policy-defined immediate-stop receipt with verified renderer restore")
    except (OSError,ValueError,TypeError,AttributeError):
        errors.append("failed-qualification diagnostic or restore evidence is missing or malformed")

    try:
        candidate_path=evidence_file(subject.get("candidate_artifact_path"))
        rollback_path=evidence_file(subject.get("rollback_artifact_path"))
        if not candidate_path.is_file() or sha256_file(candidate_path)!=candidate_sha:
            errors.append("exact installed candidate bytes are unavailable")
        if not rollback_path.is_file() or sha256_file(rollback_path)!=rollback_sha:
            errors.append("exact Foundation R4 recovery bytes are unavailable")
    except (OSError,ValueError,TypeError):
        errors.append("candidate or R4 recovery artifact path is invalid")

    try:
        proof_path=pathlib.Path(prelive_path).resolve()
        proof_path.relative_to(evidence_root)
        proof=load(proof_path)
        age=(time.time() if now is None else now)-float(proof.get("captured_unix",0))
        matrix=proof.get("matrix",{}); baseline=proof.get("brightness_baseline",{})
        aux=proof.get("aux",{}); rollback=proof.get("rollback",{}); worker=proof.get("single_worker",{})
        if (proof.get("schema")!="hbnf-cart2-qualification-recovery-prelive-v1"
            or proof.get("pass") is not True or proof.get("read_only") is not True
            or proof.get("device_mutations")!=0 or proof.get("operation_scope")!="EXACT_R4_RECOVERY_ONLY"
            or proof.get("candidate_release_id")!=candidate or proof.get("candidate_sha256")!=candidate_sha
            or proof.get("candidate_attempts_used")!=1 or proof.get("candidate_install_permitted") is not False
            or proof.get("recovery_attempts_used")!=0 or age<0 or age>300):
            errors.append("fresh recovery-only read-only proof is missing, stale, or incorrectly scoped")
        owner_baseline=auth.get("owner_brightness_baseline",{})
        if not owner_baseline and legacy_tx:
            owner_baseline={"matrixBrightness":44,"auxBrightness":245}
        if (matrix.get("release_id")!=candidate or matrix.get("candidate_sha256")!=candidate_sha
            or matrix.get("mac"," ").replace(":","").lower()!="704bca5b345c" or matrix.get("on") is not True
            or matrix.get("brightness")!=owner_baseline.get("matrixBrightness")
            or matrix.get("diagnostic_off") is not True or matrix.get("telemetry_off") is not True
            or not isinstance(owner_baseline,dict) or not owner_baseline
            or any(baseline.get("runtime",{}).get(k)!=v for k,v in owner_baseline.items())
            or any(baseline.get("persisted",{}).get(k)!=v for k,v in owner_baseline.items())
            or not proof.get("host_on_ac") or proof.get("cart_lan_interface")!="en0"):
            errors.append("fresh read-only proof differs from the captured exact candidate and owner-brightness state")
        if (not (aux.get("live") is True and aux.get("mode")=="DDP" and aux.get("source")=="192.168.77.10"
                and aux.get("led_count")==22 and aux.get("on") is True and aux.get("lor")==0)
            or rollback.get("sha256")!=rollback_sha or rollback_sha not in str(rollback.get("opal_ledger",""))
            or worker.get("pass") is not True or worker.get("worker_count")!=1 or worker.get("conflicting_pids")!=[]):
            errors.append("fresh recovery preflight does not prove AUX, exact R4 path, and single-worker readiness")
    except (OSError,ValueError,TypeError,AttributeError):
        errors.append("fresh recovery-only read-only proof is malformed or outside evidence root")
    if errors:
        raise ValueError("exact R4 recovery rearm rejected: "+"; ".join(errors))

    current=state["live_mutation_authorization"]
    rel=str(proof_path.relative_to(root))
    diag_rel=str(diag_path.relative_to(root))
    current.update({"authorized":True,"hardware_writes_permitted_now":True,
        "candidate_install_permitted":False,"candidate_attempts_used":1,"recovery_attempts_used":0,
        "operation_scope":"QUALIFICATION_ONLY","qualification_recovery_subscope":"EXACT_R4_RECOVERY_ONLY",
        "status":"CANDIDATE_INSTALLED_QUALIFICATION_PENDING",
        "current_gate":"Frozen 28-kernel performance gate failed; only the owner-authorized exact R4 recovery is open.",
        "qualification_prelive_receipt":rel,"qualification_prelive_sha256":sha256_file(proof_path),
        "qualification_recovery_diagnostic_receipt":diag_rel,
        "qualification_recovery_diagnostic_sha256":sha256_file(diag_path)})
    state["live_mutation_authorized"]=True
    state["status"]="CANDIDATE_INSTALLED_QUALIFICATION_PENDING"
    state["live_mutation_authorization_closed_at_utc"]=None
    state.setdefault("execution_cursor",{})["current_failure_domain"]="R6_FROZEN_PERFORMANCE_GATE_FAILED__EXACT_R4_RECOVERY_ONLY"
    task=state.setdefault("current_task",{})
    task.update({"status":"CANDIDATE_INSTALLED_QUALIFICATION_PENDING","live_mutation_authorized":True,
        "live_mutation_authorization":"Exact R4 recovery only after the completed frozen performance failure; candidate install and qualification rerun disabled.",
        "next_action":"Use the guarded recovery-only runner once, then verify exact R4 identity and health."})
    state["last_updated_utc"]=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
    return state


def reconcile_verified_r4_recovery(state, receipt_path, readonly_path):
    """Reconcile the installed identity and cursor after a completed exact R4 return."""
    root=pathlib.Path(ROOT).resolve(); evidence_root=(root/"evidence").resolve()
    def evidence_file(value):
        path=pathlib.Path(value)
        if not path.is_absolute(): path=root/path
        path=path.resolve(); path.relative_to(evidence_root); return path
    auth=state.get("live_mutation_authorization",{})
    subject=state.get("execution_cursor",{}).get("current_subject",{})
    result_path=evidence_file(receipt_path); readonly=evidence_file(readonly_path)
    result=load(result_path); snap=load(readonly)
    candidate=auth.get("candidate_release_id"); candidate_sha=auth.get("candidate_sha256")
    recovery_sha=auth.get("rollback_sha256")
    errors=[]
    try: recovery_artifact=evidence_file(subject.get("rollback_artifact_path"))
    except (ValueError,TypeError): recovery_artifact=root/"__missing_r4__"; errors.append("exact R4 recovery artifact path is invalid")
    if state.get("live_mutation_authorized") is not False or auth.get("authorized") is not False:
        errors.append("R4 recovery reconciliation requires the live gate closed")
    if (candidate not in (subject.get("release_id"),subject.get("failed_candidate_release_id"),subject.get("candidate_release_id"))
        or candidate_sha not in (subject.get("artifact_sha256"),subject.get("failed_candidate_sha256"),subject.get("candidate_sha256"),state.get("installed_firmware_sha256"))
        or not re.fullmatch(r"[a-f0-9]{64}",str(candidate_sha or ""))
        or auth.get("candidate_attempts_used")!=1 or auth.get("recovery_attempts_used")!=1
        or auth.get("candidate_install_permitted") is not False or auth.get("transaction_consumed") is not True):
        errors.append("exact candidate and one-use recovery counters are inconsistent")
    rel=str(result_path.relative_to(root))
    if (auth.get("transaction_result")!=rel or subject.get("qualification_result")!=rel
        or subject.get("qualification_result_sha256")!=sha256_file(result_path)):
        errors.append("recovery result is not the hash-bound current transaction")
    owner_baseline=auth.get("owner_brightness_baseline",{})
    if not owner_baseline:
        owner_baseline={"matrixBrightness":52,"auxBrightness":245}
    post=result.get("post_recovery_readonly",{})
    if (result.get("schema")!="hbnf-cart2-candidate-qualification-continuation-v1"
        or result.get("candidate_release_id")!=candidate or result.get("candidate_sha256")!=candidate_sha
        or result.get("candidate_install_attempts")!=0 or result.get("recovery_attempts")!=1
        or result.get("status")!="EXACT_R4_RECOVERED_AFTER_FAILED_QUALIFICATION"
        or result.get("owner_settings_restore",{}).get("verified") is not True
        or result.get("recovery",{}).get("status")!="R4_READBACK_VERIFIED"
        or result.get("recovery",{}).get("upload",{}).get("confirmed") is not True
        or result.get("recovery",{}).get("upload",{}).get("http_status")!="200"
        or result.get("recovery",{}).get("upload",{}).get("attempts")!=1
        or result.get("recovery",{}).get("upload",{}).get("retry") is not False
        or post.get("status")!="PASS" or post.get("release_id")!=R4_RELEASE
        or post.get("matrix_brightness")!=owner_baseline.get("matrixBrightness")
        or post.get("aux_brightness")!=owner_baseline.get("auxBrightness")
        or post.get("aux_ddp_live") is not True):
        errors.append("transaction does not prove the exact one-attempt R4 recovery and captured owner settings")
    if not recovery_artifact.is_file() or sha256_file(recovery_artifact)!=recovery_sha:
        errors.append("exact R4 recovery bytes are missing or changed")
    matrix=snap.get("matrix",{}); identity=matrix.get("identity",{}); h=matrix.get("hbnf",{})
    persisted=matrix.get("persistedHbnf",{}); aux=snap.get("aux",{}); auxid=aux.get("identity",{}); ddp=aux.get("ddp",{})
    if (snap.get("schema")!="cart2-current-matrix-readonly-snapshot-v1"
        or snap.get("read_only") is not True or snap.get("device_mutations")!=0
        or identity.get("release_id")!=R4_RELEASE or identity.get("candidate")!=R4_RELEASE
        or identity.get("mac","").replace(":","").lower()!="704bca5b345c"
        or not isinstance(owner_baseline,dict) or not owner_baseline
        or any(h.get(k)!=v for k,v in owner_baseline.items())
        or any(persisted.get(k)!=v for k,v in owner_baseline.items())
        or h.get("vibe")!=0 or persisted.get("vibe")!=0
        or h.get("packet20DiagnosticEnabled") is not False or h.get("foundationTelemetryEnabled") is not False
        or auxid.get("mac","").replace(":","").lower()!="8c94df55c34c"
        or aux.get("runtime",{}).get("on") is not True or aux.get("runtime",{}).get("lor")!=0
        or ddp.get("live") is not True or ddp.get("mode")!="DDP"
        or ddp.get("source")!="192.168.77.10" or ddp.get("led_count")!=22):
        errors.append("fresh post-recovery read-only receipt does not prove exact R4, settings, and AUX health")
    if errors: raise ValueError("R4 recovery reconciliation rejected: "+"; ".join(errors))

    receipt_rel=str(result_path.relative_to(root)); readonly_rel=str(readonly.relative_to(root))
    old_release=state.get("installed_release"); old_sha=state.get("installed_firmware_sha256")
    state["installed_release"]=R4_RELEASE; state["installed_firmware_sha256"]=recovery_sha
    cursor=state.setdefault("execution_cursor",{})
    cursor["current_failure_domain"]="R6_FROZEN_PERFORMANCE_GATE_FAILED__EXACT_R4_RECOVERED__OFFLINE_REPAIR_ONLY"
    cursor["current_lifecycle_state"]="PHASE2_INTEGRATING"
    cursor["current_transition"]="T4_PHASE2_INTEGRATION"
    cursor["exact_next_path"]=[
        "R6 failed the kernel-0 performance gate; the sweep then stopped on an AUX/DDP integrity failure after 8 of 28 profiles. The remaining 20 profiles and 90-minute soak did not run.",
        f"Exact Foundation R4 is installed and read-only verified at the captured Matrix/AUX brightness {owner_baseline['matrixBrightness']}/{owner_baseline['auxBrightness']}, with persisted/runtime Vibe 0 and live Matrix-origin AUX DDP.",
        "The one candidate attempt and one exact R4 recovery are consumed. Continue with offline source analysis and host qualification; any future live candidate requires a new exact owner authorization."]
    cursor["no_repeat"]=["Do not reinstall the failed candidate or repeat its completed 28-kernel diagnostic sweep.",
        "Do not claim qualification, soak completion, or owner acceptance.",
        "Do not perform further live mutation under the consumed exact owner authorization."]
    subject.update({"failed_candidate_release_id":candidate,"failed_candidate_sha256":candidate_sha,
        "release_id":R4_RELEASE,"artifact_sha256":recovery_sha,"installed_release_id":R4_RELEASE,"installed_sha256":recovery_sha,
        "exact_r4_recovery_attempts_used":1,"qualification_result":receipt_rel,
        "qualification_result_sha256":sha256_file(result_path),
        "recovery_result":receipt_rel,"recovery_result_sha256":sha256_file(result_path),
        "runtime_readonly_receipt":readonly_rel,"runtime_readonly_sha256":sha256_file(readonly),
        "matrix_brightness":owner_baseline["matrixBrightness"],
        "aux_brightness":owner_baseline["auxBrightness"],"runtime_vibe":h.get("vibe")})
    auth["qualification_recovery_subscope"]="EXACT_R4_RECOVERY_CONSUMED"
    state["current_task"].update({"installed_release":R4_RELEASE,"installed_firmware_sha256":recovery_sha,
        "status":"R6_PERFORMANCE_FAILED__EXACT_R4_RECOVERED__OFFLINE_REPAIR_ONLY",
        "live_mutation_authorized":False,
        "next_action":"Continue offline analysis of the preserved 28-kernel failure evidence; any new live candidate requires a new exact owner authorization."})
    state["current_task"]["exact_r4_recovery_reconciliation"]={
        "schema":"hbnf-cart2-exact-r4-recovery-reconciliation-v1",
        "status":"PASS__EXACT_R4_RECOVERY_VERIFIED","r4_rollback_sha256":recovery_sha,
        "recovery_result":receipt_rel,"recovery_result_sha256":sha256_file(result_path),
        "readonly_receipt":readonly_rel,"readonly_receipt_sha256":sha256_file(readonly),
        "previous_installed_release":old_release,"previous_installed_sha256":old_sha}
    auth.update({"authorized":False,"hardware_writes_permitted_now":False,
        "operation_scope":"CLOSED_AFTER_QUALIFICATION","status":"EXACT_R4_RECOVERED_AFTER_FAILED_QUALIFICATION",
        "current_gate":"Exact R4 recovery verified; candidate and recovery attempts consumed; live gate closed."})
    state["live_mutation_authorized"]=False
    state["last_updated_utc"]=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
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
    ba=sub.add_parser("check-backend-opal-admission"); ba.add_argument("--admission",required=True)
    brs=sub.add_parser("reissue-backend-opal-admission"); brs.add_argument("--admission",required=True); brs.add_argument("--authorization-receipt",required=True)
    brf=sub.add_parser("refresh-backend-opal-preflight"); brf.add_argument("--admission",required=True); brf.add_argument("--evidence",required=True); brf.add_argument("--next-step",choices=BACKEND_OPAL_STEPS,required=True)
    br=sub.add_parser("reserve-backend-opal-step"); br.add_argument("--admission",required=True); br.add_argument("--step",required=True,choices=[*BACKEND_OPAL_STEPS,"rollback"])
    bc=sub.add_parser("complete-backend-opal-step"); bc.add_argument("--admission",required=True); bc.add_argument("--step",required=True,choices=[*BACKEND_OPAL_STEPS,"rollback"]); bc.add_argument("--evidence",required=True)
    bf=sub.add_parser("fail-backend-opal-step"); bf.add_argument("--admission",required=True); bf.add_argument("--step",required=True,choices=[*BACKEND_OPAL_STEPS]); bf.add_argument("--evidence",required=True)
    a=sub.add_parser("advance"); a.add_argument("--receipt",required=True)
    i=sub.add_parser("impact"); i.add_argument("--change-type",required=True)
    fp=sub.add_parser("failure"); fp.add_argument("--domain",required=True)
    rf=sub.add_parser("record-failure")
    rf.add_argument("--domain",required=True)
    rf.add_argument("--reference",required=True)
    ri=sub.add_parser("reconcile-installed-r6")
    ri.add_argument("--receipt",required=True)
    ri.add_argument("--host-failure-proof",help="Required only to resume qualification after a hash-verified, pre-profile host-only failure")
    rq=sub.add_parser("reconcile-installed-qualification")
    rq.add_argument("--prelive",required=True,help="Fresh exact candidate qualification preflight; this rearms qualification only, never install")
    rq.add_argument("--authorization-receipt",help="Direct owner authorization for an exact installed-candidate qualification continuation")
    rr=sub.add_parser("reconcile-failed-qualification-r4-recovery")
    rr.add_argument("--prelive",required=True,help="Fresh read-only proof for one exact R4 recovery after a complete frozen performance failure")
    rc=sub.add_parser("reconcile-r4-recovery")
    rc.add_argument("--receipt",required=True,help="Hash-bound result from the exact one-use R4 recovery transaction")
    rc.add_argument("--readonly",required=True,help="Post-recovery read-only Matrix/AUX identity and settings receipt")
    rf.add_argument("--live-attempt",action="store_true")
    args=ap.parse_args()
    model=load(args.model); state=load(args.state)
    if args.cmd=="check-admission":
        errors=validate_model(model)+release_admission_errors(model,state,load(args.admission),args.stage)
        print(json.dumps({"schema":"hbnf-cart2-release-admission-result-v1","pass":not errors,"stage":args.stage,"errors":errors},indent=2,sort_keys=True))
        return 0 if not errors else 2
    if args.cmd=="reissue-backend-opal-admission":
        manifest=issue_backend_opal_admission(state,args.admission,args.authorization_receipt)
        errs=validate_state(model,state)
        if errs: raise SystemExit("refusing to save invalid state: "+"; ".join(errs))
        save(args.admission,manifest); save(args.state,state)
        print(json.dumps({"schema":"hbnf-cart2-backend-opal-reissue-result-v1","action":"issued",
            "transaction_id":manifest.get("transaction_id"),"admission_sha256":manifest.get("admission_sha256"),
            "lifecycle_state":state.get("lifecycle_state"),"firmware_live_mutation_authorized":state.get("live_mutation_authorized") is True},indent=2,sort_keys=True))
        return 0
    if args.cmd=="refresh-backend-opal-preflight":
        manifest=refresh_backend_opal_preflight(state,args.admission,args.evidence,args.next_step)
        errs=validate_state(model,state)
        if errs: raise SystemExit("refusing to save invalid state: "+"; ".join(errs))
        save(args.admission,manifest); save(args.state,state)
        print(json.dumps({"schema":"hbnf-cart2-backend-opal-preflight-refresh-result-v1","action":"refreshed",
            "transaction_id":manifest.get("transaction_id"),"admission_sha256":manifest.get("admission_sha256"),
            "next_step":args.next_step,"authorization_reset":False,"firmware_live_mutation_authorized":state.get("live_mutation_authorized") is True},indent=2,sort_keys=True))
        return 0
    if args.cmd=="check-backend-opal-admission":
        manifest=load(args.admission)
        errors=validate_model(model)+_backend_opal_admission_errors(state,manifest)
        print(json.dumps({"schema":"hbnf-cart2-backend-opal-admission-result-v1","pass":not errors,
            "lifecycle_state":state.get("lifecycle_state"),"firmware_live_mutation_authorized":state.get("live_mutation_authorized") is True,
            "errors":errors},indent=2,sort_keys=True))
        return 0 if not errors else 2
    if args.cmd in ("reserve-backend-opal-step","complete-backend-opal-step","fail-backend-opal-step"):
        if args.cmd=="reserve-backend-opal-step":
            reserve_backend_opal_step(state,args.admission,args.step)
            action="reserved"
        elif args.cmd=="complete-backend-opal-step":
            complete_backend_opal_step(state,args.admission,args.step,args.evidence)
            action="completed"
        else:
            fail_backend_opal_step(state,args.admission,args.step,args.evidence)
            action="rollback_required"
        errs=validate_state(model,state)
        if errs: raise SystemExit("refusing to save invalid state: "+"; ".join(errs))
        save(args.state,state)
        tx=state.get("execution_cursor",{}).get("backend_opal_transaction",{})
        print(json.dumps({"schema":"hbnf-cart2-backend-opal-step-result-v1","action":action,
            "step":args.step,"transaction_status":tx.get("status"),"next_step":BACKEND_OPAL_STEPS[len(tx.get("completed_steps",[]))] if len(tx.get("completed_steps",[]))<len(BACKEND_OPAL_STEPS) else None,
            "lifecycle_state":state.get("lifecycle_state"),"firmware_live_mutation_authorized":state.get("live_mutation_authorized") is True},indent=2,sort_keys=True))
        return 0
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
    if args.cmd=="reconcile-installed-qualification":
        reconcile_installed_qualification(state,args.prelive,args.authorization_receipt)
        errs=validate_state(model,state)
        if errs: raise SystemExit("refusing to save invalid state: "+"; ".join(errs))
        save(args.state,state)
        current=state["live_mutation_authorization"]
        print(json.dumps({"reconciled":True,"installed_release":state["installed_release"],
            "operation_scope":current["operation_scope"],"candidate_install_permitted":current["candidate_install_permitted"],
            "candidate_attempts_used":current["candidate_attempts_used"],
            "recovery_attempts_used":current["recovery_attempts_used"],
            "live_mutation_authorized":state["live_mutation_authorized"]},indent=2,sort_keys=True))
        return 0
    if args.cmd=="reconcile-failed-qualification-r4-recovery":
        reconcile_failed_qualification_for_r4_recovery(state,args.prelive)
        errs=validate_state(model,state)
        if errs: raise SystemExit("refusing to save invalid state: "+"; ".join(errs))
        save(args.state,state)
        current=state["live_mutation_authorization"]
        print(json.dumps({"reconciled":True,"operation_scope":current["operation_scope"],
            "qualification_recovery_subscope":current["qualification_recovery_subscope"],
            "candidate_install_permitted":current["candidate_install_permitted"],
            "candidate_attempts_used":current["candidate_attempts_used"],
            "recovery_attempts_used":current["recovery_attempts_used"],
            "live_mutation_authorized":state["live_mutation_authorized"]},indent=2,sort_keys=True))
        return 0
    if args.cmd=="reconcile-r4-recovery":
        reconcile_verified_r4_recovery(state,args.receipt,args.readonly)
        errs=validate_state(model,state)
        if errs: raise SystemExit("refusing to save invalid state: "+"; ".join(errs))
        save(args.state,state)
        print(json.dumps({"reconciled":True,"installed_release":state["installed_release"],
            "installed_firmware_sha256":state["installed_firmware_sha256"],
            "recovery_attempts_used":state["live_mutation_authorization"]["recovery_attempts_used"],
            "live_mutation_authorized":state["live_mutation_authorized"]},indent=2,sort_keys=True))
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
