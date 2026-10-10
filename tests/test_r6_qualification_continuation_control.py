#!/usr/bin/env python3
"""Fail-closed tests for continuing qualification after a late OTA reboot."""
import copy
import importlib.util
import json
import pathlib
import tempfile
import hashlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("hbnf_control",ROOT/"scripts/hbnf_control.py")
control=importlib.util.module_from_spec(spec); spec.loader.exec_module(control)

def base():
    state=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text())
    manifest=json.loads((ROOT/"evidence/cart2-r6-audio-cache-20261010/R6_LIVE_APPROVED_ADMISSION.json").read_text())
    receipt="evidence/cart2-r6-audio-cache-20261010/live-qualification/INSTALLED_RUNTIME_RECONCILIATION.json"
    receipt_sha=control.sha256_file(ROOT/receipt)
    manifest["stage"]="LIVE_QUALIFICATION"
    manifest["identities"]["expected_installed_release"]=manifest["identities"]["candidate_release_id"]
    manifest["identities"]["expected_installed_bin_sha256"]=manifest["identities"]["candidate_bin_sha256"]
    manifest["checks"]["preflight_read_only_hardware_state_and_identity"]={"pass":True,"evidence_file":receipt,"sha256":receipt_sha}
    for key in ("consumed_exact_candidate_install_receipt","fresh_installed_candidate_runtime_identity"):
        manifest["checks"][key]={"pass":True,"evidence_file":receipt,"sha256":receipt_sha}
    rb="evidence/cart2-r7-performance-repair-20261009/artifact/hbnf-matrix-foundation-r4-exact.bin"
    manifest["checks"]["exact_recovery_bytes_available"]={"pass":True,"evidence_file":rb,"sha256":control.sha256_file(ROOT/rb)}
    dry="evidence/cart2-r6-audio-cache-20261010/offline-dryrun/R6_TRANSACTION_DRYRUN.json"
    dry_sha=control.sha256_file(ROOT/dry)
    for key in ("all_historical_host_failures_replayed","entire_release_transaction_dryrun","launcher_rejects_invalid_manifest_before_device_access"):
        manifest["checks"][key]={"pass":True,"evidence_file":dry,"sha256":dry_sha}
    return state,manifest

def main():
    state,manifest=base()
    if state.get("r6_audio_cache_successor",{}).get("conditional_authority",{}).get("status")=="QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED":
        assert control.release_admission_errors(control.load(control.DEFAULT_MODEL),state,manifest,"LIVE_QUALIFICATION")
        root=ROOT
        result_path=root/state["r6_audio_cache_successor"]["qualification_result"]
        with tempfile.TemporaryDirectory(prefix="r6-host-failure-proof-",dir=ROOT) as td:
            d=pathlib.Path(td)
            test_result=d/"test-result.json"
            test_result.write_text(json.dumps({"status":"PASS","slow_nominal_boundary_retry":"PASS"}))
            def digest(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
            evidence={}
            for name,path in {
                "restore_receipt":"evidence/cart2-r6-audio-cache-20261010/live-qualification/sweep/RESTORE_RECEIPT.json",
                "post_restore_state":"evidence/cart2-r6-audio-cache-20261010/live-qualification/sweep/POST_RESTORE_STATE.json",
                "adapter_source":"scripts/hbnf_foundation_live_adapter.py",
                "regression_test":"tests/hbnf_foundation_live_adapter.py",
            }.items():evidence[name]={"path":path,"sha256":digest(root/path)}
            evidence["test_result"]={"path":str(test_result.relative_to(root)),"sha256":digest(test_result)}
            proof={"schema":"hbnf-r6-qualification-host-failure-retry-proof-v1","status":"PASS",
                "candidate_release_id":"hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010",
                "candidate_sha256":"f89a55fbc85b8ffda90390c18eb9b09e934e9e73db96884d712c033d4684a35b",
                "rollback_sha256":"338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743a2f3d8c",
                "failure_class":"HOST_OBSERVER_REQUEST_DEADLINE","profiles_completed":0,
                "firmware_changed":False,"frozen_thresholds_changed":False,
                "qualification_result_path":state["r6_audio_cache_successor"]["qualification_result"],
                "qualification_result_sha256":digest(result_path),"evidence":evidence}
            pp=d/"retry-proof.json";pp.write_text(json.dumps(proof))
            resumed=control.reconcile_installed_r6(state,"evidence/cart2-r6-audio-cache-20261010/live-qualification/INSTALLED_RUNTIME_RECONCILIATION.json",pp)
            assert resumed["live_mutation_authorized"] is True
            assert resumed["live_mutation_authorization"]["operation_scope"]=="QUALIFICATION_ONLY"
            assert resumed["live_mutation_authorization"]["candidate_install_permitted"] is False
            assert control.release_admission_errors(control.load(control.DEFAULT_MODEL),resumed,manifest,"LIVE_QUALIFICATION")==[]
            bad=copy.deepcopy(resumed);bad["r6_audio_cache_successor"]["conditional_authority"]["status"]="QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED"
            tampered=copy.deepcopy(proof);tampered["profiles_completed"]=1;pp.write_text(json.dumps(tampered))
            try:control.reconcile_installed_r6(bad,"evidence/cart2-r6-audio-cache-20261010/live-qualification/INSTALLED_RUNTIME_RECONCILIATION.json",pp)
            except ValueError:pass
            else:raise AssertionError("host-only resume must reject completed kernel profiles or tampered proof")
    elif state.get("r6_audio_cache_successor",{}).get("qualification_result") and (
            state.get("r6_audio_cache_successor",{}).get("conditional_authority",{}).get("status")=="QUALIFICATION_BLOCKED_OR_FAILED"
            or (ROOT/state["r6_audio_cache_successor"]["qualification_result"]).is_file()):
        # A transient one-worker preflight failure closes the exact qualification gate,
        # but it must not consume install/recovery authority or force a new firmware install.
        result_rel=state["r6_audio_cache_successor"]["qualification_result"]
        result_path=ROOT/result_rel
        preflight_rel="evidence/cart2-r6-audio-cache-20261010/live-qualification/preflight-after-guard-block-20261010/QUALIFICATION_PRELIVE_READONLY.json"
        preflight_path=ROOT/preflight_rel
        assert result_path.is_file() and preflight_path.is_file()
        def digest(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
        source_commit="48bdf20dcdecaf0a4ebb7f1af4068864f4b10b32"
        source_bytes=__import__("subprocess").check_output(["git","show",source_commit+":scripts/hbnf_r6_audio_cache_live_transaction.py"],cwd=ROOT)
        proof={"schema":"hbnf-r6-qualification-preflight-retry-proof-v1","status":"PASS",
            "candidate_release_id":"hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010",
            "candidate_sha256":"f89a55fbc85b8ffda90390c18eb9b09e934e9e73db96884d712c033d4684a35b",
            "rollback_sha256":"338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c",
            "failure_class":"SINGLE_WORKER_PREFLIGHT_CONTENTION","firmware_changed":False,
            "setting_write_started":False,"profiles_completed":False,"frozen_thresholds_changed":False,
            "qualification_result_path":result_rel,"qualification_result_sha256":digest(result_path),
            "qualification_source_commit":source_commit,"qualification_source_sha256":hashlib.sha256(source_bytes).hexdigest(),
            "post_failure_readonly_preflight":{"path":preflight_rel,"sha256":digest(preflight_path)}}
        with tempfile.TemporaryDirectory(prefix="r6-preflight-retry-proof-",dir=ROOT) as td:
            pp=pathlib.Path(td)/"retry-proof.json";pp.write_text(json.dumps(proof))
            closed_state=copy.deepcopy(state)
            closed_state["live_mutation_authorized"]=False
            closed_state["live_mutation_authorization"].update({"authorized":False,"hardware_writes_permitted_now":False})
            closed_state["r6_audio_cache_successor"]["conditional_authority"].update({
                "status":"QUALIFICATION_BLOCKED_OR_FAILED","live_mutation_authorized":False})
            resumed=control.reconcile_installed_r6(copy.deepcopy(closed_state),"evidence/cart2-r6-audio-cache-20261010/live-qualification/INSTALLED_RUNTIME_RECONCILIATION.json",pp)
            assert resumed["live_mutation_authorized"] is True
            assert resumed["live_mutation_authorization"]["operation_scope"]=="QUALIFICATION_ONLY"
            assert resumed["live_mutation_authorization"]["candidate_install_permitted"] is False
            assert resumed["r6_audio_cache_successor"]["conditional_authority"]["candidate_attempts_used"]==1
            assert resumed["r6_audio_cache_successor"]["conditional_authority"]["recovery_attempts_used"]==0
            assert resumed["r6_audio_cache_successor"]["preflight_retry_reconciliation"]["proof_sha256"]==digest(pp)
            assert control.release_admission_errors(control.load(control.DEFAULT_MODEL),resumed,manifest,"LIVE_QUALIFICATION")==[]
            for field,value in (("firmware_changed",True),("setting_write_started",True),("profiles_completed",True),
                    ("frozen_thresholds_changed",True),("qualification_source_sha256","0"*64)):
                bad=copy.deepcopy(proof);bad[field]=value;pp.write_text(json.dumps(bad))
                try:control.reconcile_installed_r6(copy.deepcopy(closed_state),"evidence/cart2-r6-audio-cache-20261010/live-qualification/INSTALLED_RUNTIME_RECONCILIATION.json",pp)
                except ValueError:pass
                else:raise AssertionError("preflight-only resume must reject mutated/tampered proof: "+field)
    else:
        assert control.release_admission_errors(control.load(control.DEFAULT_MODEL),state,manifest,"LIVE_QUALIFICATION")==[]
    stale=copy.deepcopy(state)
    stale["installed_release"]="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
    stale["installed_firmware_sha256"]="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
    stale["r6_audio_cache_successor"]["conditional_authority"]["status"]="OTA_NOT_INSTALLED_R4_REMAINS_NO_RETRY"
    reconciled=control.reconcile_installed_r6(stale,"evidence/cart2-r6-audio-cache-20261010/live-qualification/INSTALLED_RUNTIME_RECONCILIATION.json")
    assert reconciled["installed_release"]==manifest["identities"]["candidate_release_id"]
    assert reconciled["live_mutation_authorization"]["operation_scope"]=="QUALIFICATION_ONLY"
    bad=copy.deepcopy(stale); badrec=json.loads((ROOT/"evidence/cart2-r6-audio-cache-20261010/live-qualification/INSTALLED_RUNTIME_RECONCILIATION.json").read_text()); badrec["candidate"]["release_id"]="R4"
    original_installed=bad["installed_release"]
    with tempfile.TemporaryDirectory(prefix="r6-bad-reconcile-") as tmp:
        rp=pathlib.Path(tmp)/"bad.json";rp.write_text(json.dumps(badrec))
        try: control.reconcile_installed_r6(bad,rp)
        except ValueError: pass
        else: raise AssertionError("mismatched runtime identity must fail closed")
    assert bad["installed_release"]==original_installed
    failures=[]
    for mutate in (
        lambda s,m:s["live_mutation_authorization"].update(operation_scope="INSTALL"),
        lambda s,m:s["r6_audio_cache_successor"]["conditional_authority"].update(candidate_attempts_used=0),
        lambda s,m:m["identities"].update(expected_installed_bin_sha256="0"*64),
        lambda s,m:s["r6_audio_cache_successor"]["conditional_authority"].update(status="CLOSED"),
    ):
        s,m=copy.deepcopy(state),copy.deepcopy(manifest); mutate(s,m)
        errors=control.release_admission_errors(control.load(control.DEFAULT_MODEL),s,m,"LIVE_QUALIFICATION")
        assert errors, (mutate,errors); failures.append(errors)
    print("PASS: qualification continuation admission accepts only the consumed exact candidate with remaining recovery; host deadline and preflight-only contention resumes remain proof-bound and cannot reopen install scope")

if __name__=="__main__": main()
