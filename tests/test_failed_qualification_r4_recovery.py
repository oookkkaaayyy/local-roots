"""Negative and positive host tests for recovery-only rearming after a failed sweep."""
import copy
import hashlib
import importlib.util
import json
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("hbnf_control_r4_recovery", ROOT / "scripts/hbnf_control.py")
CONTROL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONTROL)
CANDIDATE = "hbnf-cart2-phase2-offline-wow-r6-neutral-audio-hue-radial-lazy-20261011"
AUTH_ID = "OWNER-20261011-CART2-NEUTRAL-AUDIO-HUE-RADIAL-LAZY-QUALIFICATION-01"


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, sort_keys=True) + "\n")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fixture(root):
    candidate_bin=root/"evidence/candidate.bin"; rollback_bin=root/"evidence/r4.bin"
    candidate_bin.parent.mkdir(parents=True,exist_ok=True)
    candidate_bin.write_bytes(b"candidate bytes"); rollback_bin.write_bytes(b"exact R4 bytes")
    candidate_sha=hashlib.sha256(candidate_bin.read_bytes()).hexdigest()
    rollback_sha=hashlib.sha256(rollback_bin.read_bytes()).hexdigest()
    binding={"authorization_id":AUTH_ID,"candidate_release_id":CANDIDATE,
        "candidate_bin_sha256":candidate_sha,"rollback_bin_sha256":rollback_sha,
        "matrix_mac":"70:4b:ca:5b:34:5c","candidate_install_limit":1,"recovery_install_limit":1,
        "scope":["Install exact candidate once.","One exact R4 recovery if frozen performance gates fail.",
            "On a passing candidate complete 28-kernel sweep and 5400-second soak."]}
    owner=root/"evidence/OWNER.json"
    write(owner,{"schema":"hbnf-exact-live-owner-authorization-v1","binding":binding})
    attempt=root/"evidence"/CANDIDATE/"live-qualification/continuation-06"
    tx=attempt/"QUALIFICATION_CONTINUATION_RESULT.json"
    tx_sha=write(tx,{"schema":"hbnf-cart2-candidate-qualification-continuation-v1",
        "candidate_release_id":CANDIDATE,"candidate_sha256":candidate_sha,
        "candidate_install_attempts":0,"recovery_attempts":0,"operation_scope":"QUALIFICATION_ONLY",
        "status":"QUALIFICATION_BRIGHTNESS_RESTORE_FAILED",
        "restore_error":"RuntimeError: qualification-baseline-vibe-mismatch",
        "brightness_restore":{"verified":False,"error":"RuntimeError: qualification-baseline-vibe-mismatch"}})
    diag=attempt/"sweep/DIAGNOSTIC_COMPLETE_RESULT.json"
    diag_sha=write(diag,{"schema":"hbnf-foundation-complete-diagnostic-result-v1",
        "candidate_release_id":CANDIDATE,"expected_kernel_count":28,"kernels_completed":28,
        "qualification_eligible":False,"soak_started":False,"combined_feature_check_status":"PASS",
        "gate_failures":[{"failure_class":"PERFORMANCE_COMPARISON"}]})
    write(attempt/"sweep/RESTORE_RECEIPT.json",{"status":"PASS","snapshot_equal":True})
    proof=root/"evidence/recovery-proof.json"
    write(proof,{"schema":"hbnf-cart2-qualification-recovery-prelive-v1","captured_unix":time.time(),
        "pass":True,"read_only":True,"device_mutations":0,"operation_scope":"EXACT_R4_RECOVERY_ONLY",
        "candidate_release_id":CANDIDATE,"candidate_sha256":candidate_sha,
        "candidate_attempts_used":1,"candidate_install_permitted":False,"recovery_attempts_used":0,
        "host_on_ac":True,"cart_lan_interface":"en0",
        "matrix":{"release_id":CANDIDATE,"candidate_sha256":candidate_sha,"mac":"704bca5b345c",
            "on":True,"brightness":44,"diagnostic_off":True,"telemetry_off":True},
        "brightness_baseline":{"runtime":{"matrixBrightness":44,"auxBrightness":245,"vibe":0},
            "persisted":{"matrixBrightness":44,"auxBrightness":245,"vibe":1}},
        "aux":{"live":True,"mode":"DDP","source":"192.168.77.10","led_count":22,"on":True,"lor":0},
        "rollback":{"sha256":rollback_sha,"opal_ledger":f"55 exact-r4 {rollback_sha}"},
        "single_worker":{"pass":True,"worker_count":1,"conflicting_pids":[]}})
    subject={"installed_release_id":CANDIDATE,"installed_sha256":candidate_sha,
        "candidate_artifact_path":str(candidate_bin.relative_to(root)),
        "rollback_artifact_path":str(rollback_bin.relative_to(root)),
        "qualification_result":str(tx.relative_to(root)),"qualification_result_sha256":tx_sha}
    state={"installed_release":CANDIDATE,"installed_firmware_sha256":candidate_sha,
        "live_mutation_authorized":False,"live_authorization_binding":binding,
        "live_mutation_authorization":{"authorization_id":AUTH_ID,"source_evidence":str(owner.relative_to(root)),
            "candidate_release_id":CANDIDATE,"candidate_sha256":candidate_sha,"rollback_sha256":rollback_sha,
            "candidate_install_limit":1,"candidate_attempts_used":1,"candidate_install_permitted":False,
            "recovery_install_limit":1,"recovery_attempts_used":0,"transaction_consumed":True,
            "transaction_result":str(tx.relative_to(root)),"authorized":False,"hardware_writes_permitted_now":False,
            "status":"QUALIFICATION_BRIGHTNESS_RESTORE_FAILED"},
        "execution_cursor":{"current_subject":subject},"current_task":{}}
    return state,proof,diag_sha


def main():
    with tempfile.TemporaryDirectory(prefix="r4-recovery-rearm-") as td:
        old_root=CONTROL.ROOT; CONTROL.ROOT=Path(td)
        try:
            state,proof,diag_sha=fixture(Path(td))
            result=CONTROL.reconcile_failed_qualification_for_r4_recovery(state,proof)
            auth=result["live_mutation_authorization"]
            assert result["live_mutation_authorized"] is True
            assert auth["qualification_recovery_subscope"]=="EXACT_R4_RECOVERY_ONLY"
            assert auth["candidate_install_permitted"] is False
            assert auth["candidate_attempts_used"]==1 and auth["recovery_attempts_used"]==0
            assert auth["qualification_recovery_diagnostic_sha256"]==diag_sha
        finally:
            CONTROL.ROOT=old_root

    # Immediate AUX/runtime-integrity stop uses the bounded abort receipt and
    # verified renderer restoration; no full sweep is required after a stop gate.
    with tempfile.TemporaryDirectory(prefix="r4-recovery-aux-stop-") as td:
        old_root=CONTROL.ROOT; CONTROL.ROOT=Path(td)
        try:
            state,proof,_=fixture(Path(td))
            auth=state["live_mutation_authorization"]
            auth["owner_brightness_baseline"]={"matrixBrightness":147,"auxBrightness":255}
            proof_data=json.loads(proof.read_text())
            proof_data["matrix"]["brightness"]=147
            proof_data["brightness_baseline"]={"runtime":{"matrixBrightness":147,"auxBrightness":255,"vibe":0},
                "persisted":{"matrixBrightness":147,"auxBrightness":255,"vibe":1}}
            proof.write_text(json.dumps(proof_data)+"\n")
            tx_path=Path(td)/auth["transaction_result"]
            tx=json.loads(tx_path.read_text())
            tx.update({"schema":"hbnf-cart2-candidate-qualification-transaction-v1",
                "status":"QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED",
                "candidate_install_attempts":1,"qualification":{"passed":False,"abort":{"status":"FAIL",
                    "run_error":"diagnostic-continuation-aux-projection-inactive"}}})
            tx_sha=write(tx_path,tx)
            subject=state["execution_cursor"]["current_subject"]
            subject["qualification_result_sha256"]=tx_sha
            diag_path=tx_path.parent/"sweep/SWEEP_ABORT.json"
            write(diag_path,{"status":"FAIL","run_error":"diagnostic-continuation-aux-projection-inactive",
                "restore_error":None,"profiles_completed":8})
            write(tx_path.parent/"sweep/POST_RESTORE_STATE.json",{"restoreVerified":True,"packet20Same":True})
            complete=tx_path.parent/"sweep/DIAGNOSTIC_COMPLETE_RESULT.json"
            complete_doc=json.loads(complete.read_text()); complete_doc["kernels_completed"]=8; write(complete,complete_doc)
            result=CONTROL.reconcile_failed_qualification_for_r4_recovery(state,proof)
            assert result["live_mutation_authorized"] is True
            assert result["live_mutation_authorization"]["qualification_recovery_subscope"]=="EXACT_R4_RECOVERY_ONLY"
            assert result["live_mutation_authorization"]["owner_brightness_baseline"]=={"matrixBrightness":147,"auxBrightness":255}
        finally:
            CONTROL.ROOT=old_root

    for mutate in (
        lambda proof,diag: proof.update(captured_unix=time.time()-301),
        lambda proof,diag: proof["matrix"].update(brightness=52),
        lambda proof,diag: proof["brightness_baseline"]["persisted"].update(auxBrightness=246),
        lambda proof,diag: proof["single_worker"].update(worker_count=2),
        lambda proof,diag: diag.update(kernels_completed=27),
        lambda proof,diag: diag.update(soak_started=True),
        lambda proof,diag: diag.update(gate_failures=[]),
    ):
        with tempfile.TemporaryDirectory(prefix="r4-recovery-reject-") as td:
            old_root=CONTROL.ROOT; CONTROL.ROOT=Path(td)
            try:
                state,proof_path,_=fixture(Path(td))
                proof=json.loads(proof_path.read_text())
                tx_path=Path(td)/state["live_mutation_authorization"]["transaction_result"]
                diag_path=tx_path.parent/"sweep/DIAGNOSTIC_COMPLETE_RESULT.json"
                diag=json.loads(diag_path.read_text())
                mutate(proof,diag)
                proof_path.write_text(json.dumps(proof)+"\n")
                diag_path.write_text(json.dumps(diag)+"\n")
                before=copy.deepcopy(state)
                try:
                    CONTROL.reconcile_failed_qualification_for_r4_recovery(state,proof_path)
                except ValueError:
                    pass
                else:
                    raise AssertionError("unsafe recovery rearm was accepted")
                assert state==before,"failed recovery rearm must not mutate authority"
            finally:
                CONTROL.ROOT=old_root
    print("PASS: exact failed-sweep evidence rearms only one R4 recovery; stale, changed, incomplete, or unsafe evidence fails closed")


if __name__=="__main__":
    main()
