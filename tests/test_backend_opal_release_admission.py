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
        "compensating_migration":"staging/coordinated-backend/rollback/20261011235000_hbnf_matrix_relay_incremental_controls_pin.sql",
        "opal_writer":"staging/coordinated-backend/opal/hbnf-matrix-relay",
        "opal_transaction_helper":"staging/coordinated-backend/opal/hbnf-matrix-relay-transaction.sh",
        "opal_service":"staging/coordinated-backend/opal/hbnf-matrix-relay.init",
        "opal_config_template":"staging/coordinated-backend/opal/hbnf-matrix-relay.conf.example",
    }
    migration_path=ROOT/artifacts["migration"]; rollback_path=ROOT/artifacts["compensating_migration"]
    artifact_items={"migration":{"path":artifacts["migration"],"sha256":sha(migration_path)},
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

print("PASS: exact backend/Opal admission, one-use ordered steps, scope/device/hash/evidence/expiry failures, zero child execution on rejection, rollback-only failure path, and PHASE2/firmware gate preservation")
