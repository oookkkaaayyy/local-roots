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
        "attempts_used":1,"completed_steps":[],"active_step":"apply_migration","rollback_attempts_used":0}
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
            manifest=refreshed_manifest
    completed=json.loads(statepath.read_text())
    assert completed["lifecycle_state"]=="PHASE2_INTEGRATING"
    assert completed["live_mutation_authorized"] is False
    assert completed["execution_cursor"]["backend_opal_transaction"]["status"]=="COMPLETE"
    p=run(check); assert p.returncode!=0 and "consumed" in p.stdout

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
    rejection(lambda s,m:(m["owner_authorization"]["scope"].append("install_firmware"),s["execution_cursor"]["backend_opal_transaction"]["owner_authorization"]["scope"].append("install_firmware")),"exact backend/Opal transaction")
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
