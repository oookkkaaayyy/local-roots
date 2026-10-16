#!/usr/bin/env python3
"""Offline admission/sequence tests for the exact Owner Control backend/Opal transaction."""
import copy, hashlib, json, pathlib, re, subprocess, sys, tempfile, time

ROOT=pathlib.Path(__file__).resolve().parents[1]
CONTROL=ROOT/"scripts/hbnf_control.py"
GUARD=ROOT/"scripts/hbnf_guarded_run.py"
MODEL=ROOT/"config/HBNF_CONTROL_MODEL.json"
BASE=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,check=True,capture_output=True,text=True).stdout.strip()
STEPS=["apply_migration","deploy_edge_function","install_writer_stopped","bootstrap_current_state",
       "activate_writer","one_owner_control_test","restore_and_verify"]
SCOPE=STEPS+["rollback_if_required"]
FUNCTION_FILES=[
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
]
def sha(path): return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
def digest(m):
    return hashlib.sha256(json.dumps({k:v for k,v in m.items() if k!="admission_sha256"},sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()
def run(cmd): return subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True)
def write_json(path,obj): pathlib.Path(path).write_text(json.dumps(obj,sort_keys=True,indent=2)+"\n")

with tempfile.TemporaryDirectory(prefix="hbnf_backend_opal_gate_",dir=ROOT/"evidence") as td:
    temp=pathlib.Path(td)
    state= json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text())
    state["lifecycle_state"]="PHASE2_INTEGRATING"
    state["phase2_implementation_authorized"]=True
    state["live_mutation_authorized"]=False
    now=time.time()
    prior_id="OWNER-20261015-OWNER-CONTROL-RELEASE"
    prior_digest="d"*64
    old_owner={"transaction_id":prior_id,"authorization_id":"OWNER-OLD-EXPIRED","source_message_ref":"prior owner request",
        "deployable_source_commit":"b7eda237ba6bf51eb7266a6d4eeb7846f38d0a5e","scope":SCOPE,"nonce":"old-nonce-not-reusable",
        "issued_unix":now-7200,"expires_unix":now-3600}
    state["execution_cursor"]["backend_opal_transaction"]={"schema":"hbnf-backend-opal-transaction-state-v1",
        "transaction_id":prior_id,"owner_authorization":old_owner,"admission_sha256":prior_digest,"status":"IN_PROGRESS",
        "attempts_used":1,"completed_steps":[],"active_step":None,"rollback_attempts_used":0}
    expected_prior=copy.deepcopy(state["execution_cursor"]["backend_opal_transaction"])
    prior_history_len=len(state["execution_cursor"].get("backend_opal_transaction_history",[]))
    preflight={
        "schema":"hbnf-owner-control-live-readonly-preflight-v1","pass":True,"captured_unix":now,
        "matrix_mac":"704bca5b345c","aux_mac":"8c94df55c34c",
        "matrix_release_id":"hbnf-cart2-phase2-r6-skins-readable-20261014",
        "matrix_recorded_firmware_sha256":"de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d",
        "matrix_brightness":255,"matrix_logical_brightness":46,"matrix_aux_target_brightness":46,
        "aux_brightness":255,"vibe":3,"opal_model":"GL-SFT1200","opal_ip":"192.168.77.1",
    }
    prepath=temp/"fresh-readonly.json"; write_json(prepath,preflight)
    canonical={"schema":"hbnf-owner-control-canonical-readonly-preflight-v1","pass":True,"captured_unix":now,
        "desired_revision":123,"fence_epoch":9,"fence_release_id":"r6","fence_active":False}
    canonical_path=temp/"canonical-readonly.json"; write_json(canonical_path,canonical)
    artifacts={
        "migration":"staging/coordinated-backend/migrations/20261011235000_hbnf_matrix_relay_incremental_controls_pin.sql",
        "corrective_migration":"staging/coordinated-backend/migrations/20261016192522_hbnf_matrix_relay_confirm_status_constraint_compat.sql",
        "compensating_migration":"staging/coordinated-backend/rollback/20261011235000_hbnf_matrix_relay_incremental_controls_pin.sql",
        "opal_writer":"staging/coordinated-backend/opal/hbnf-matrix-relay",
        "opal_transaction_helper":"staging/coordinated-backend/opal/hbnf-matrix-relay-transaction.sh",
        "opal_service":"staging/coordinated-backend/opal/hbnf-matrix-relay.init",
        "opal_config_template":"staging/coordinated-backend/opal/hbnf-matrix-relay.conf.example",
    }
    migration_path=ROOT/artifacts["migration"]; rollback_path=ROOT/artifacts["compensating_migration"]
    artifact_items={"migration":{"path":artifacts["migration"],"sha256":sha(migration_path)},
        "corrective_migration":{"path":artifacts["corrective_migration"],"sha256":sha(ROOT/artifacts["corrective_migration"])},
        "edge_function_files":[{"path":p,"sha256":sha(ROOT/p)} for p in FUNCTION_FILES],
        "opal_writer":{"path":artifacts["opal_writer"],"sha256":sha(ROOT/artifacts["opal_writer"])},
        "opal_transaction_helper":{"path":artifacts["opal_transaction_helper"],"sha256":sha(ROOT/artifacts["opal_transaction_helper"])},
        "opal_service":{"path":artifacts["opal_service"],"sha256":sha(ROOT/artifacts["opal_service"])},
        "opal_config_template":{"path":artifacts["opal_config_template"],"sha256":sha(ROOT/artifacts["opal_config_template"])}}
    rollback={"function_version":25,"compensating_migration":{"path":artifacts["compensating_migration"],"sha256":sha(rollback_path)},
        "opal_writer_prestate":"ABSENT","scoreboard_relay_preserved":True,"sql_restore_test":"PASS","opal_uninstall_restore_test":"PASS"}
    artifact_bindings={item["path"]:item["sha256"] for key,item in artifact_items.items() if key!="edge_function_files"}
    artifact_bindings.update({item["path"]:item["sha256"] for item in artifact_items["edge_function_files"]})
    artifact_bindings[rollback["compensating_migration"]["path"]]=rollback["compensating_migration"]["sha256"]
    owner={"transaction_id":"OWNER-20261016-BACKEND-OPAL-REISSUE-TEST","authorization_id":"OWNER-DIRECT-TEST-FIXTURE-2",
        "source_message_ref":"TEST FIXTURE ONLY; current owner authorization, not production authority",
        "deployable_source_commit":BASE,"scope":SCOPE,"nonce":"test-nonce-fresh-unique-0123456789abcdef",
        "issued_unix":now-1,"expires_unix":now+1200,"artifact_sha256_bindings":artifact_bindings}
    precondition={"schema":"hbnf-backend-opal-reissue-precondition-v1","pass":True,"captured_unix":now,
        "prior_transaction_id":prior_id,"prior_admission_sha256":prior_digest,"production_function_version":25,
        "verify_jwt":False,"migration_applied":False,"bootstrap_rpc_present":False,"opal_writer_present":False,"scoreboard_relay_present":True}
    checks={}
    for key in ("offline_admission_tests","rollback_tests","production_v25_snapshot","migration_pending","edge_handler_contract"):
        p=temp/(key+".json"); write_json(p,{"schema":"test-proof-v1","check":key,"pass":True})
        checks[key]={"pass":True,"path":p.relative_to(ROOT).as_posix(),"sha256":sha(p)}
    p=temp/"reissue_precondition.json"; write_json(p,precondition)
    checks["reissue_precondition"]={"pass":True,"path":p.relative_to(ROOT).as_posix(),"sha256":sha(p)}
    manifest={
        "schema":"hbnf-backend-opal-release-admission-v1","stage":"BACKEND_OPAL_LIVE_APPROVED","outcome":"PASS",
        "deployable_source_commit":BASE,"transaction_id":owner["transaction_id"],"owner_authorization":owner,"authorized_steps":STEPS,
        "identities":{"project_ref":"phcpbvuqibyarpfrftgx","edge_function":"hbnf-cart-control","verify_jwt":False,
            "expected_function_version":25,"matrix_mac":"704bca5b345c","matrix_release_id":"hbnf-cart2-phase2-r6-skins-readable-20261014",
            "matrix_recorded_firmware_sha256":"de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d",
            "matrix_runtime_sha_verified":False,"aux_mac":"8c94df55c34c","opal_model":"GL-SFT1200","opal_ip":"192.168.77.1",
            "matrix_brightness":255,"matrix_logical_brightness":46,"matrix_aux_target_brightness":46,"aux_brightness":255,"vibe":3,
            "desired_revision":123,"fence_epoch":9,"fence_release_id":"r6","fence_active":False,
            "recorded_installed_release":"hbnf-cart2-phase2-r6-skins-readable-20261014",
            "recorded_installed_firmware_sha256":"de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d"},
        "artifacts":artifact_items,"rollback":rollback,
        "fresh_readonly_preflight":{"path":prepath.relative_to(ROOT).as_posix(),"sha256":sha(prepath)},
        "canonical_readonly_preflight":{"path":canonical_path.relative_to(ROOT).as_posix(),"sha256":sha(canonical_path)},"checks":checks,
    }
    auth_path=temp/"owner-authorization-receipt.json"
    write_json(auth_path,{"schema":"hbnf-backend-opal-admission-authorization-v1","owner_authorization":owner})
    statepath=temp/"state.json"; write_json(statepath,state)
    admission=temp/"admission.json"; write_json(admission,manifest)

    # The production migration and function steps are already complete. A
    # continuation must carry their immutable PASS receipts forward, bind to
    # the exact deployed v27 bundle, and authorize only the remaining steps.
    continuation_state=copy.deepcopy(state)
    continuation_tx=continuation_state["execution_cursor"]["backend_opal_transaction"]
    continuation_receipts=[]
    for step in STEPS[:2]:
        evidence={"project":"phcpbvuqibyarpfrftgx"}
        if step=="apply_migration":
            evidence.update({"migration":"20261011235000_hbnf_matrix_relay_incremental_controls_pin",
                "required_rpcs":["hbnf_cart_matrix_relay_bootstrap","hbnf_cart_matrix_relay_issue","hbnf_cart_matrix_relay_confirm"],
                "execute_acl":{"anon":False,"authenticated":False,"service_role":True},"data_mutated":False})
        else:
            evidence.update({"function":"hbnf-cart-control","version":26,"verify_jwt":False,
                "deploy_bundle_sha256":"d02a3cead7bdb5028ddca158ed4fc2fb0e2a28248923073c3da60e61e572c98a",
                "v25_rollback_snapshot_sha256":"0d75b62870cdcb56abfd1340f35532c24dbb5df974b902277a40e6745f0fab24",
                "cart_status":{"http":200},"live_status":{"http":200},"unpaired_command":{"http":401},
                "scoring_data_modified":False,"matrix_device_mutated":False})
        receipt={"schema":"hbnf-backend-opal-release-step-v1","transaction_id":prior_id,
            "step":step,"status":"PASS","side_effects_verified":True,"evidence":evidence}
        receipt_path=temp/(step+"-immutable-receipt.json"); write_json(receipt_path,receipt)
        continuation_receipts.append({"step":step,"path":receipt_path.relative_to(ROOT).as_posix(),"sha256":sha(receipt_path)})
    continuation_tx.update({"status":"IN_PROGRESS","attempts_used":1,"completed_steps":STEPS[:2],
        "active_step":None,"last_reserved_step":"deploy_edge_function","step_receipts":continuation_receipts})
    continuation_proof={"schema":"hbnf-backend-opal-continuation-precondition-v1","pass":True,
        "captured_unix":now,"prior_transaction_id":prior_id,"prior_admission_sha256":prior_digest,
        "completed_steps":STEPS[:2],"completed_step_receipts":continuation_receipts,
        "production_function_version":27,"function_bundle_sha256":"d02a3cead7bdb5028ddca158ed4fc2fb0e2a28248923073c3da60e61e572c98a",
        "verify_jwt":False,"migration_applied":True,"bootstrap_rpc_present":True,
        "migration_sha256":artifact_items["migration"]["sha256"],"source_commit":BASE,
        "migration_required_rpcs":["hbnf_cart_matrix_relay_bootstrap","hbnf_cart_matrix_relay_issue","hbnf_cart_matrix_relay_confirm"],
        "migration_execute_acl":{"anon":False,"authenticated":False,"service_role":True},
        "v25_rollback_snapshot_sha256":"0d75b62870cdcb56abfd1340f35532c24dbb5df974b902277a40e6745f0fab24",
        "production_source_match":True,
        "production_source_files":["deno.json","index.ts","guest-command.ts","live.ts","skins_scoring.ts","runtime-vibe.ts","matrix-relay.ts","matrix-relay-auth.ts","matrix-relay-projection.ts"],
        "deployment_origin_bound_to_step_receipt":True,
        "opal_writer_prestate":"ABSENT","scoreboard_relay_present":True,"fence_active":False,
        "matrix_preflight_sha256":sha(prepath),"canonical_preflight_sha256":sha(canonical_path),
        "matrix_mac":"704bca5b345c","matrix_logical_brightness":46,"matrix_brightness":255,
        "matrix_aux_target_brightness":46,"aux_mac":"8c94df55c34c","aux_brightness":255,"vibe":3,
        "matrix_release_id":"hbnf-cart2-phase2-r6-skins-readable-20261014",
        "matrix_recorded_firmware_sha256":"de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d",
        "aux_ddp_healthy":True,"skins_relay_healthy":True}
    continuation_proof_path=temp/"continuation-precondition.json"; write_json(continuation_proof_path,continuation_proof)
    continuation_manifest=copy.deepcopy(manifest)
    continuation_manifest["identities"]["expected_function_version"]=27
    continuation_manifest["checks"]["reissue_precondition"]={"pass":True,
        "path":continuation_proof_path.relative_to(ROOT).as_posix(),"sha256":sha(continuation_proof_path)}
    continuation_owner=copy.deepcopy(owner)
    continuation_owner.update({"transaction_id":"OWNER-20261016-CART-RELAY-CONTINUATION-TEST",
        "authorization_id":"DIRECT-OWNER-CONTINUATION-TEST","source_message_ref":"TEST FIXTURE ONLY; current owner authorization",
        "nonce":"new-continuation-nonce-0123456789abcdef","scope":[*STEPS[2:],"rollback_if_required"]})
    continuation_auth=temp/"continuation-authorization.json"
    write_json(continuation_auth,{"schema":"hbnf-backend-opal-admission-authorization-v1",
        "owner_authorization":continuation_owner})
    continuation_state_path=temp/"continuation-state.json"; write_json(continuation_state_path,continuation_state)
    continuation_admission=temp/"continuation-admission.json"; write_json(continuation_admission,continuation_manifest)
    issue_continuation=[sys.executable,str(CONTROL),"--state",str(continuation_state_path),
        "reissue-backend-opal-admission","--admission",str(continuation_admission),
        "--authorization-receipt",str(continuation_auth)]
    p=run(issue_continuation); assert p.returncode==0,(p.stdout,p.stderr)
    continued_state=json.loads(continuation_state_path.read_text())
    continued_manifest=json.loads(continuation_admission.read_text())
    continued_tx=continued_state["execution_cursor"]["backend_opal_transaction"]
    assert continued_manifest["transaction_id"]==continuation_owner["transaction_id"]
    assert continued_tx["status"]=="IN_PROGRESS" and continued_tx["attempts_used"]==1
    assert continued_tx["completed_steps"]==STEPS[:2] and continued_tx["step_receipts"]==continuation_receipts
    assert continued_tx["continuation_from"]==prior_id
    assert continued_state["live_mutation_authorized"] is False
    assert continued_manifest["identities"]["expected_function_version"]==27
    check_continuation=[sys.executable,str(CONTROL),"--state",str(continuation_state_path),
        "check-backend-opal-admission","--admission",str(continuation_admission)]
    p=run(check_continuation); assert p.returncode==0,(p.stdout,p.stderr)
    # Refreshing operational preflights must not rewrite the immutable
    # issuance-time readback binding in the continuation proof.
    refresh_now=time.time()
    continuation_refresh_pre=dict(preflight,captured_unix=refresh_now)
    continuation_refresh_canonical=dict(canonical,captured_unix=refresh_now)
    continuation_refresh_pre_path=temp/"continuation-refresh-matrix.json"; write_json(continuation_refresh_pre_path,continuation_refresh_pre)
    continuation_refresh_canonical_path=temp/"continuation-refresh-canonical.json"; write_json(continuation_refresh_canonical_path,continuation_refresh_canonical)
    continuation_refresh_receipt=temp/"continuation-refresh.json"
    write_json(continuation_refresh_receipt,{"schema":"hbnf-backend-opal-preflight-refresh-v1",
        "matrix_preflight_path":continuation_refresh_pre_path.relative_to(ROOT).as_posix(),
        "canonical_preflight_path":continuation_refresh_canonical_path.relative_to(ROOT).as_posix()})
    refresh_cmd=[sys.executable,str(CONTROL),"--state",str(continuation_state_path),"refresh-backend-opal-preflight",
        "--admission",str(continuation_admission),"--evidence",str(continuation_refresh_receipt),"--next-step","install_writer_stopped"]
    p=run(refresh_cmd); assert p.returncode==0,(p.stdout,p.stderr)
    refreshed_continuation=json.loads(continuation_admission.read_text())
    continuation_binding=refreshed_continuation["continuation_preflight_binding"]
    assert continuation_binding=={"matrix_preflight_sha256":continuation_proof["matrix_preflight_sha256"],
        "canonical_preflight_sha256":continuation_proof["canonical_preflight_sha256"]}
    assert refreshed_continuation["fresh_readonly_preflight"]["sha256"]==sha(continuation_refresh_pre_path)
    assert run(check_continuation).returncode==0,"fresh operational readback must validate against the immutable continuation proof"
    second_refresh_now=time.time()
    second_pre=dict(preflight,captured_unix=second_refresh_now)
    second_canonical=dict(canonical,captured_unix=second_refresh_now)
    second_pre_path=temp/"continuation-refresh-matrix-second.json"; write_json(second_pre_path,second_pre)
    second_canonical_path=temp/"continuation-refresh-canonical-second.json"; write_json(second_canonical_path,second_canonical)
    second_receipt=temp/"continuation-refresh-second.json"
    write_json(second_receipt,{"schema":"hbnf-backend-opal-preflight-refresh-v1",
        "matrix_preflight_path":second_pre_path.relative_to(ROOT).as_posix(),
        "canonical_preflight_path":second_canonical_path.relative_to(ROOT).as_posix()})
    p=run([sys.executable,str(CONTROL),"--state",str(continuation_state_path),"refresh-backend-opal-preflight",
        "--admission",str(continuation_admission),"--evidence",str(second_receipt),"--next-step","install_writer_stopped"])
    assert p.returncode==0,(p.stdout,p.stderr)
    refreshed_twice=json.loads(continuation_admission.read_text())
    assert refreshed_twice["continuation_preflight_binding"]==continuation_binding
    assert refreshed_twice["fresh_readonly_preflight"]["sha256"]==sha(second_pre_path)
    assert run(check_continuation).returncode==0
    continuation_guard=[sys.executable,str(GUARD),"--model",str(MODEL),"--state",str(continuation_state_path),
        "--require-state","PHASE2_INTEGRATING","--backend-opal-admission",str(continuation_admission),
        "--backend-opal-action","reserve","--backend-opal-step","install_writer_stopped"]
    p=run(continuation_guard); assert p.returncode==0,(p.stdout,p.stderr)
    reserved_cont=json.loads(continuation_state_path.read_text())
    assert reserved_cont["execution_cursor"]["backend_opal_transaction"]["active_step"]=="install_writer_stopped"

    # An invalid continuation version is rejected without changing control
    # state or invoking any child command.
    bad_cont_state=copy.deepcopy(continuation_state)
    bad_cont_manifest=copy.deepcopy(continuation_manifest)
    bad_cont_manifest["checks"]["reissue_precondition"]["path"]=continuation_proof_path.relative_to(ROOT).as_posix()
    bad_cont_manifest["checks"]["reissue_precondition"]["sha256"]=sha(continuation_proof_path)
    bad_cont_auth=copy.deepcopy(continuation_owner)
    bad_cont_auth.update({"transaction_id":"OWNER-20261016-CART-RELAY-WRONG-VERSION-TEST",
        "authorization_id":"DIRECT-OWNER-WRONG-VERSION-TEST","nonce":"wrong-version-nonce-0123456789abcdef"})
    bad_cont_proof=dict(continuation_proof,production_function_version=26)
    bad_cont_proof_path=temp/"wrong-version-precondition.json"; write_json(bad_cont_proof_path,bad_cont_proof)
    bad_cont_manifest["checks"]["reissue_precondition"].update({"path":bad_cont_proof_path.relative_to(ROOT).as_posix(),
        "sha256":sha(bad_cont_proof_path)})
    bad_cont_state_path=temp/"wrong-version-state.json"; write_json(bad_cont_state_path,bad_cont_state)
    bad_cont_admission=temp/"wrong-version-admission.json"; write_json(bad_cont_admission,bad_cont_manifest)
    bad_cont_auth_path=temp/"wrong-version-auth.json"; write_json(bad_cont_auth_path,
        {"schema":"hbnf-backend-opal-admission-authorization-v1","owner_authorization":bad_cont_auth})
    before_bad=bad_cont_state_path.read_bytes()
    p=run([sys.executable,str(CONTROL),"--state",str(bad_cont_state_path),"reissue-backend-opal-admission",
        "--admission",str(bad_cont_admission),"--authorization-receipt",str(bad_cont_auth_path)])
    assert p.returncode!=0 and "exact v27" in (p.stdout+p.stderr),(p.stdout,p.stderr)
    assert bad_cont_state_path.read_bytes()==before_bad,"rejected v26 continuation changed control state"

    issue=[sys.executable,str(CONTROL),"--state",str(statepath),"reissue-backend-opal-admission","--admission",str(admission),"--authorization-receipt",str(auth_path)]
    p=run(issue); assert p.returncode==0,(p.stdout,p.stderr)
    issued_state=json.loads(statepath.read_text()); issued_manifest=json.loads(admission.read_text())
    tx=issued_state["execution_cursor"]["backend_opal_transaction"]
    assert tx["status"]=="AUTHORIZED" and tx["attempts_used"]==0 and issued_state["live_mutation_authorized"] is False
    assert len(issued_state["execution_cursor"]["backend_opal_transaction_history"])==prior_history_len+1
    assert issued_state["execution_cursor"]["backend_opal_transaction_history"][-1]["prior_transaction"]==expected_prior
    assert issued_state["execution_cursor"]["backend_opal_transaction_audit"][-1]["event"]=="OWNER_AUTHORIZED_ADMISSION_REISSUED"
    state=issued_state; manifest=issued_manifest
    check=[sys.executable,str(CONTROL),"--state",str(statepath),"check-backend-opal-admission","--admission",str(admission)]
    p=run(check); assert p.returncode==0,(p.stdout,p.stderr)

    guardbase=[sys.executable,str(GUARD),"--model",str(MODEL),"--state",str(statepath),"--require-state","PHASE2_INTEGRATING",
        "--backend-opal-admission",str(admission)]
    reserve=guardbase+["--backend-opal-action","reserve","--backend-opal-step","apply_migration"]
    p=run(reserve); assert p.returncode==0,(p.stdout,p.stderr)
    import importlib.util
    spec=importlib.util.spec_from_file_location("hbnf_control_test",CONTROL); ctl=importlib.util.module_from_spec(spec); spec.loader.exec_module(ctl)
    reserved_state=json.loads(statepath.read_text()); reserved_manifest=json.loads(admission.read_text())
    completion_errors=ctl._backend_opal_step_errors(reserved_state,reserved_manifest,"apply_migration",now=now+301,require_active=True)
    assert completion_errors==[],("reserved-step completion incorrectly expired during execution",completion_errors)
    after=statepath.read_bytes()
    p=run(reserve); assert p.returncode!=0 and "reserved" in (p.stdout+p.stderr)
    assert statepath.read_bytes()==after,"replayed step changed control state"
    marker=temp/"must-not-run"
    p=run(guardbase+["--backend-opal-action","reserve","--backend-opal-step","deploy_edge_function","--",sys.executable,"-c",f"open({str(marker)!r},'w').write('ran')"])
    assert p.returncode!=0 and not marker.exists(),"arbitrary command passed scoped launcher"
    p=run(guardbase+["--backend-opal-action","reserve","--backend-opal-step","apply_migration","--mutation","--",sys.executable,"-c","pass"])
    assert p.returncode!=0 and not marker.exists(),"firmware mutation mode mixed into backend/Opal path"

    # Complete the valid sequence using local PASS receipts; no external command is executed.
    complete_base=[sys.executable,str(CONTROL),"--state",str(statepath),"complete-backend-opal-step","--admission",str(admission)]
    next_guard_step=guardbase+["--backend-opal-action","reserve"]
    for index,step in enumerate(STEPS):
        if index:
            p=run(next_guard_step+["--backend-opal-step",step]); assert p.returncode==0,(step,p.stdout,p.stderr)
        evidence=temp/(step+"-pass.json"); write_json(evidence,{"schema":"hbnf-backend-opal-release-step-v1","transaction_id":owner["transaction_id"],"step":step,"status":"PASS","side_effects_verified":True})
        p=run(complete_base+["--step",step,"--evidence",str(evidence)]); assert p.returncode==0,(step,p.stdout,p.stderr)
        if step=="apply_migration":
            # A deployed transaction can outlive the initial five-minute
            # observation window. Refresh only read-only evidence, preserving
            # the same consumed authorization and completed-step prefix.
            refresh_now=time.time()
            refreshed_pre=dict(preflight,captured_unix=refresh_now)
            refreshed_canonical=dict(canonical,captured_unix=refresh_now)
            refreshed_pre_path=temp/"fresh-readonly-after-migration.json"; write_json(refreshed_pre_path,refreshed_pre)
            refreshed_can_path=temp/"canonical-readonly-after-migration.json"; write_json(refreshed_can_path,refreshed_canonical)
            refresh_receipt=temp/"preflight-refresh.json"
            write_json(refresh_receipt,{"schema":"hbnf-backend-opal-preflight-refresh-v1",
                "matrix_preflight_path":refreshed_pre_path.relative_to(ROOT).as_posix(),
                "canonical_preflight_path":refreshed_can_path.relative_to(ROOT).as_posix()})
            p=run(guardbase+["--backend-opal-action","refresh","--backend-opal-step","deploy_edge_function",
                "--backend-opal-evidence",str(refresh_receipt)])
            assert p.returncode==0,(p.stdout,p.stderr)
            refreshed_state=json.loads(statepath.read_text()); refreshed_manifest=json.loads(admission.read_text())
            refreshed_tx=refreshed_state["execution_cursor"]["backend_opal_transaction"]
            assert refreshed_tx["attempts_used"]==1 and refreshed_tx["completed_steps"]==["apply_migration"]
            assert refreshed_tx["owner_authorization"]==owner and refreshed_state["live_mutation_authorized"] is False
            assert refreshed_tx["admission_sha256"]==refreshed_manifest["admission_sha256"]==digest(refreshed_manifest)
            assert refreshed_state["execution_cursor"]["backend_opal_transaction_audit"][-1]["authorization_reset"] is False
    completed=json.loads(statepath.read_text())
    assert completed["lifecycle_state"]=="PHASE2_INTEGRATING"
    assert completed["live_mutation_authorized"] is False
    assert completed["execution_cursor"]["backend_opal_transaction"]["status"]=="COMPLETE"
    p=run(check); assert p.returncode!=0 and "consumed" in p.stdout
    state=refreshed_state; manifest=refreshed_manifest

    # Each changed authorization/evidence binding fails closed before state write or child execution.
    def rejection(mutator,needle):
        s=copy.deepcopy(state); m=copy.deepcopy(manifest); mutator(s,m); m["admission_sha256"]=digest(m)
        s["execution_cursor"]["backend_opal_transaction"]["admission_sha256"]=m["admission_sha256"]
        slug=re.sub(r"[^A-Za-z0-9-]+","-",needle.replace(" ","-"))
        sp=temp/(slug+"-state.json"); mp=temp/(slug+"-admission.json")
        write_json(sp,s); write_json(mp,m); before=sp.read_bytes()
        p=run([sys.executable,str(CONTROL),"--state",str(sp),"check-backend-opal-admission","--admission",str(mp)])
        assert p.returncode!=0 and needle in p.stdout,(needle,p.stdout,p.stderr)
        assert sp.read_bytes()==before,"rejected admission changed local control state"
        p=run([sys.executable,str(GUARD),"--model",str(MODEL),"--state",str(sp),"--require-state","PHASE2_INTEGRATING",
            "--backend-opal-admission",str(mp),"--backend-opal-action","reserve","--backend-opal-step","apply_migration"])
        assert p.returncode!=0 and not marker.exists(),"rejected admission reached a child/external action"
        assert sp.read_bytes()==before,"rejected launcher action changed local state"
    rejection(lambda s,m:(m["owner_authorization"].update({"deployable_source_commit":"0"*40}),s["execution_cursor"]["backend_opal_transaction"]["owner_authorization"].update({"deployable_source_commit":"0"*40})),"exact owner-authorized deployable source commit")
    rejection(lambda s,m:(m["owner_authorization"]["scope"].append("install_firmware"),s["execution_cursor"]["backend_opal_transaction"]["owner_authorization"]["scope"].append("install_firmware")),"exact remaining backend/Opal transaction")
    rejection(lambda s,m:m["identities"].update({"aux_mac":"000000000000"}),"wrong or missing transaction identity: aux_mac")
    rejection(lambda s,m:m["artifacts"]["migration"].update({"sha256":"0"*64}),"migration missing or SHA mismatch")
    rejection(lambda s,m:m["checks"].pop("production_v25_snapshot"),"production_v25_snapshot")
    rejection(lambda s,m:(m["owner_authorization"].update({"expires_unix":time.time()-1}),s["execution_cursor"]["backend_opal_transaction"]["owner_authorization"].update({"expires_unix":time.time()-1})),"owner authorization expired")
    rejection(lambda s,m:(m.update({"owner_authorization":None}),s["execution_cursor"]["backend_opal_transaction"].update({"owner_authorization":None})),"owner authorization missing")

    # Failure path records one rollback; no forward action or second rollback is accepted.
    failure_state=copy.deepcopy(state)
    failure_tx=failure_state["execution_cursor"]["backend_opal_transaction"]
    failure_tx.update({"status":"AUTHORIZED","attempts_used":0,"completed_steps":[],"active_step":None,
        "admission_sha256":manifest["admission_sha256"],"rollback_attempts_used":0})
    failstate=temp/"failure-state.json"; write_json(failstate,failure_state)
    p=run([sys.executable,str(CONTROL),"--state",str(failstate),"reserve-backend-opal-step","--admission",str(admission),"--step","apply_migration"])
    assert p.returncode==0,(p.stdout,p.stderr)
    failreceipt=temp/"apply-failed.json"; write_json(failreceipt,{"schema":"hbnf-backend-opal-release-step-v1","transaction_id":owner["transaction_id"],"step":"apply_migration","status":"FAIL"})
    p=run([sys.executable,str(CONTROL),"--state",str(failstate),"fail-backend-opal-step","--admission",str(admission),"--step","apply_migration","--evidence",str(failreceipt)])
    assert p.returncode==0,(p.stdout,p.stderr)
    p=run([sys.executable,str(GUARD),"--model",str(MODEL),"--state",str(failstate),"--require-state","PHASE2_INTEGRATING",
        "--backend-opal-admission",str(admission),"--backend-opal-action","reserve","--backend-opal-step","rollback"])
    assert p.returncode==0,(p.stdout,p.stderr)
    rollback=temp/"rollback-pass.json"; write_json(rollback,{"schema":"hbnf-backend-opal-release-step-v1","transaction_id":owner["transaction_id"],"step":"rollback","status":"PASS","side_effects_verified":True})
    p=run([sys.executable,str(CONTROL),"--state",str(failstate),"complete-backend-opal-step","--admission",str(admission),"--step","rollback","--evidence",str(rollback)])
    assert p.returncode==0,(p.stdout,p.stderr)
    p=run([sys.executable,str(CONTROL),"--state",str(failstate),"reserve-backend-opal-step","--admission",str(admission),"--step","rollback"])
    assert p.returncode!=0,"rollback replay passed"

    # A recorded, authorized rollback must remain available after the short
    # device-preflight window expires: it removes only the exact Opal package.
    stale_manifest=copy.deepcopy(manifest)
    for field in ("fresh_readonly_preflight","canonical_readonly_preflight"):
        original=ROOT/stale_manifest[field]["path"]
        stale_data=json.loads(original.read_text()); stale_data["captured_unix"]=time.time()-301
        stale_path=temp/("stale-"+field+".json"); write_json(stale_path,stale_data)
        stale_manifest[field]={"path":stale_path.relative_to(ROOT).as_posix(),"sha256":sha(stale_path)}
    stale_manifest["admission_sha256"]=digest(stale_manifest)
    stale_admission=temp/"stale-rollback-admission.json"; write_json(stale_admission,stale_manifest)
    forward_state=copy.deepcopy(state); forward_tx=forward_state["execution_cursor"]["backend_opal_transaction"]
    forward_tx.update({"status":"IN_PROGRESS","attempts_used":1,"completed_steps":STEPS[:4],
        "active_step":None,"last_reserved_step":"bootstrap_current_state","rollback_attempts_used":0,
        "admission_sha256":stale_manifest["admission_sha256"],"step_receipts":forward_tx.get("step_receipts",[])[:4]})
    forward_state_path=temp/"stale-forward-state.json"; write_json(forward_state_path,forward_state); before=forward_state_path.read_bytes()
    stale_guard=[sys.executable,str(GUARD),"--model",str(MODEL),"--state",str(forward_state_path),
        "--require-state","PHASE2_INTEGRATING","--backend-opal-admission",str(stale_admission),
        "--backend-opal-action","reserve","--backend-opal-step","activate_writer"]
    p=run(stale_guard)
    assert p.returncode!=0 and "stale" in p.stdout and forward_state_path.read_bytes()==before, \
        "stale preflight incorrectly allowed a forward device action"
    failed_state=copy.deepcopy(forward_state); failed_tx=failed_state["execution_cursor"]["backend_opal_transaction"]
    failed_tx.update({"active_step":"activate_writer","last_reserved_step":"activate_writer"})
    failed_state_path=temp/"stale-failed-state.json"; write_json(failed_state_path,failed_state)
    stale_failure=temp/"activate-failed.json"; write_json(stale_failure,{"schema":"hbnf-backend-opal-release-step-v1",
        "transaction_id":owner["transaction_id"],"step":"activate_writer","status":"FAIL"})
    p=run([sys.executable,str(CONTROL),"--state",str(failed_state_path),"fail-backend-opal-step",
        "--admission",str(stale_admission),"--step","activate_writer","--evidence",str(stale_failure)])
    assert p.returncode==0,(p.stdout,p.stderr)
    stale_rollback=stale_guard[:-1]+["rollback"]
    stale_rollback[stale_rollback.index("--state")+1]=str(failed_state_path)
    p=run(stale_rollback); assert p.returncode==0,(p.stdout,p.stderr)
    stale_tx=json.loads(failed_state_path.read_text())["execution_cursor"]["backend_opal_transaction"]
    assert stale_tx["status"]=="ROLLBACK_REQUIRED" and stale_tx["rollback_attempts_used"]==1

    # A fresh authorization may continue only after an exact activation
    # failure plus verified rollback, carrying the immutable four-step prefix.
    retry_state=copy.deepcopy(continued_state)
    retry_tx=retry_state["execution_cursor"]["backend_opal_transaction"]
    retry_old_id=retry_tx["transaction_id"]
    retry_tx["owner_authorization"]["expires_unix"]=time.time()-1
    retry_tx.update({"status":"ROLLED_BACK","completed_steps":STEPS[:4],"active_step":None,
        "failed_step":"activate_writer","last_reserved_step":"rollback","rollback_attempts_used":1})
    writer_receipt={"schema":"hbnf-backend-opal-release-step-v1","transaction_id":retry_old_id,
        "step":"install_writer_stopped","status":"PASS","side_effects_verified":True,
        "evidence":{"source_commit":BASE,"writer_sha256":artifact_items["opal_writer"]["sha256"],
            "transaction_helper_sha256":artifact_items["opal_transaction_helper"]["sha256"],
            "service_enabled":False,"service_started":False,"skins_relay_preserved":True,
            "matrix_device_mutated":False,"aux_device_mutated":False}}
    bootstrap_receipt={"schema":"hbnf-backend-opal-release-step-v1","transaction_id":retry_old_id,
        "step":"bootstrap_current_state","status":"PASS","side_effects_verified":True,
        "evidence":{"function_version":27,"physical_settings_changed":False,"deviceCommandsIssued":False,
            "firmware_mutation_authority":"CLOSED","canonical_readback":{"matrixLogicalBrightness":46,
                "matrixAuxTargetBrightness":46,"auxReceiverBrightness":255}}}
    for receipt in (writer_receipt,bootstrap_receipt):
        rp=temp/(receipt["step"]+"-retry-immutable.json");write_json(rp,receipt)
        retry_tx.setdefault("step_receipts",[]).append({"step":receipt["step"],"path":rp.relative_to(ROOT).as_posix(),"sha256":sha(rp)})
    failure_receipt={"schema":"hbnf-backend-opal-release-step-v1","transaction_id":retry_old_id,
        "step":"activate_writer","status":"FAIL","side_effects_verified":True,
        "failure":{"authorization_state":"not consumed; no command sent","device_readback":"46/255 exact"}}
    failure_path=temp/"activation-failure.json";write_json(failure_path,failure_receipt)
    rollback_receipt={"schema":"hbnf-backend-opal-release-step-v1","transaction_id":retry_old_id,
        "step":"rollback","status":"PASS","side_effects_verified":True,
        "evidence":{"opal_writer":{"exact_prestate_restored":True},"devices":{"settings_changed":False}}}
    rollback_path=temp/"activation-rollback.json";write_json(rollback_path,rollback_receipt)
    retry_tx.update({"failure_receipt":failure_path.relative_to(ROOT).as_posix(),"failure_receipt_sha256":sha(failure_path),
        "rollback_receipt":rollback_path.relative_to(ROOT).as_posix(),"rollback_receipt_sha256":sha(rollback_path)})
    retry_proof={"schema":"hbnf-backend-opal-activation-retry-precondition-v1","pass":True,"captured_unix":time.time(),
        "prior_transaction_id":retry_old_id,"prior_admission_sha256":retry_tx["admission_sha256"],
        "completed_steps":STEPS[:2],"completed_step_receipts":copy.deepcopy(retry_tx["step_receipts"][:2]),
        "prior_completed_steps":STEPS[:4],"prior_step_receipts":copy.deepcopy(retry_tx["step_receipts"]),
        "production_function_version":27,"function_bundle_sha256":"d02a3cead7bdb5028ddca158ed4fc2fb0e2a28248923073c3da60e61e572c98a",
        "verify_jwt":False,"migration_applied":True,"bootstrap_rpc_present":True,
        "migration_sha256":artifact_items["migration"]["sha256"],"source_commit":BASE,
        "migration_required_rpcs":["hbnf_cart_matrix_relay_bootstrap","hbnf_cart_matrix_relay_issue","hbnf_cart_matrix_relay_confirm"],
        "migration_execute_acl":{"anon":False,"authenticated":False,"service_role":True},
        "v25_rollback_snapshot_sha256":"0d75b62870cdcb56abfd1340f35532c24dbb5df974b902277a40e6745f0fab24",
        "production_source_match":True,
        "production_source_files":[pathlib.Path(x).name for x in FUNCTION_FILES if pathlib.Path(x).name!="deno.lock"],
        "deployment_origin_bound_to_step_receipt":True,"opal_writer_prestate":"ABSENT","scoreboard_relay_present":True,
        "fence_active":False,"matrix_preflight_sha256":sha(prepath),"canonical_preflight_sha256":sha(canonical_path),
        "matrix_mac":"704bca5b345c","matrix_logical_brightness":46,"matrix_brightness":255,
        "matrix_aux_target_brightness":46,"aux_mac":"8c94df55c34c","aux_brightness":255,"vibe":3,
        "matrix_release_id":"hbnf-cart2-phase2-r6-skins-readable-20261014",
        "matrix_recorded_firmware_sha256":"de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d",
        "aux_ddp_healthy":True,"skins_relay_healthy":True,
        "applied_migration_name":"20261016200518_hbnf_matrix_relay_confirm_status_constraint_compat",
        "corrective_migration_sha256":artifact_items["corrective_migration"]["sha256"],
        "corrective_migration_source_commit":BASE,
        "prior_failure_receipt_sha256":retry_tx["failure_receipt_sha256"],
        "prior_rollback_receipt_sha256":retry_tx["rollback_receipt_sha256"]}
    retry_proof_path=temp/"activation-retry-precondition.json";write_json(retry_proof_path,retry_proof)
    retry_manifest=copy.deepcopy(continued_manifest);retry_manifest["artifacts"]["corrective_migration"]=artifact_items["corrective_migration"]
    retry_manifest["identities"]["expected_function_version"]=27
    retry_owner=copy.deepcopy(continuation_owner);retry_owner.update({"transaction_id":"OWNER-ACTIVATION-RETRY-TEST",
        "authorization_id":"DIRECT-OWNER-ACTIVATION-RETRY-TEST","source_message_ref":"TEST FIXTURE ONLY; explicit fresh retry authorization",
        "nonce":"unique-activation-retry-nonce-0123456789","scope":[*STEPS[2:],"rollback_if_required"]})
    retry_owner["artifact_sha256_bindings"]=ctl._backend_opal_artifact_sha_bindings(retry_manifest)
    retry_manifest.update({"transaction_id":retry_owner["transaction_id"],"owner_authorization":retry_owner})
    retry_manifest["checks"]["reissue_precondition"]={"pass":True,"path":retry_proof_path.relative_to(ROOT).as_posix(),"sha256":sha(retry_proof_path)}
    retry_auth=temp/"activation-retry-authorization.json";write_json(retry_auth,
        {"schema":"hbnf-backend-opal-admission-authorization-v1","owner_authorization":retry_owner})
    retry_state_path=temp/"activation-retry-state.json";write_json(retry_state_path,retry_state)
    retry_admission=temp/"activation-retry-admission.json";write_json(retry_admission,retry_manifest)
    before_retry=retry_state_path.read_bytes()
    p=run([sys.executable,str(CONTROL),"--state",str(retry_state_path),"reissue-backend-opal-admission",
        "--admission",str(retry_admission),"--authorization-receipt",str(retry_auth)])
    assert p.returncode==0,(p.stdout,p.stderr)
    issued_retry=json.loads(retry_state_path.read_text())["execution_cursor"]["backend_opal_transaction"]
    assert issued_retry["status"]=="IN_PROGRESS" and issued_retry["completed_steps"]==STEPS[:2]
    assert issued_retry["authorization_start_index"]==2 and issued_retry["rollback_attempts_used"]==0
    assert issued_retry["last_reserved_step"]=="deploy_edge_function"
    assert issued_retry["continuation_kind"]=="verified_activation_rollback"
    assert json.loads(retry_state_path.read_text())["live_mutation_authorized"] is False
    # Corrupting the corrective migration identity cannot issue or consume a retry.
    bad_retry_state=copy.deepcopy(retry_state);bad_retry_state_path=temp/"bad-activation-retry-state.json";write_json(bad_retry_state_path,bad_retry_state)
    bad_retry_manifest=copy.deepcopy(retry_manifest);bad_retry_manifest["checks"]["reissue_precondition"]={
        "pass":True,"path":retry_proof_path.relative_to(ROOT).as_posix(),"sha256":sha(retry_proof_path)}
    bad_retry_proof=dict(retry_proof,applied_migration_name="wrong-migration")
    bad_retry_proof_path=temp/"bad-activation-retry-proof.json";write_json(bad_retry_proof_path,bad_retry_proof)
    bad_retry_manifest["checks"]["reissue_precondition"]["path"]=bad_retry_proof_path.relative_to(ROOT).as_posix()
    bad_retry_manifest["checks"]["reissue_precondition"]["sha256"]=sha(bad_retry_proof_path)
    bad_retry_admission=temp/"bad-activation-retry-admission.json";write_json(bad_retry_admission,bad_retry_manifest)
    before_bad_retry=bad_retry_state_path.read_bytes()
    p=run([sys.executable,str(CONTROL),"--state",str(bad_retry_state_path),"reissue-backend-opal-admission",
        "--admission",str(bad_retry_admission),"--authorization-receipt",str(retry_auth)])
    assert p.returncode!=0 and bad_retry_state_path.read_bytes()==before_bad_retry,(p.stdout,p.stderr)

print("PASS: exact backend/Opal admission, one-use ordered steps, scope/device/hash/evidence/expiry failures, zero child execution on rejection, rollback-only failure path, verified activation rollback continuation, and PHASE2/firmware gate preservation")
