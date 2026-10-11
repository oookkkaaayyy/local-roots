"""Adversarial offline tests for exact-candidate qualification-only rearming."""
import copy
import hashlib
import importlib.util
import json
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("hbnf_control_rearm", ROOT / "scripts/hbnf_control.py")
CONTROL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONTROL)

CANDIDATE = "hbnf-cart2-phase2-offline-wow-r6-neutral-audio-hue-radial-lazy-20261011"
AUTH_ID = "OWNER-20261011-CART2-NEUTRAL-AUDIO-HUE-RADIAL-LAZY-QUALIFICATION-01"


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, sort_keys=True) + "\n")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fixture(tmp):
    root = Path(tmp)
    candidate_bin = root / "evidence/candidate.bin"
    recovery_bin = root / "evidence/r4.bin"
    candidate_bin.parent.mkdir(parents=True, exist_ok=True)
    candidate_bin.write_bytes(b"exact candidate")
    recovery_bin.write_bytes(b"exact r4")
    candidate_sha = hashlib.sha256(candidate_bin.read_bytes()).hexdigest()
    rollback_sha = hashlib.sha256(recovery_bin.read_bytes()).hexdigest()
    base = root / "evidence" / CANDIDATE / "live-qualification"
    attempt = base / "continuation-01"
    transaction = attempt / "TRANSACTION_RESULT.json"
    tx_sha = write(transaction, {
        "schema": "hbnf-cart2-candidate-qualification-transaction-v1",
        "candidate_release_id": CANDIDATE,
        "candidate_sha256": candidate_sha,
        "candidate_install_attempts": 1,
        "recovery_attempts": 0,
        "status": "QUALIFICATION_BRIGHTNESS_RESTORE_FAILED",
        "error": "RuntimeError: persisted-config-HBNF-settings-partial-or-invalid",
    })
    runtime = attempt / "CURRENT_READONLY_DEVICE_STATE.json"
    runtime_sha = write(runtime, {
        "schema": "cart2-current-matrix-readonly-snapshot-v1",
        "read_only": True,
        "device_mutations": 0,
        "matrix": {
            "identity": {"release_id": CANDIDATE, "candidate": CANDIDATE,
                "mac": "704bca5b345c", "on": True},
            "hbnf": {"matrixBrightness": 52, "auxBrightness": 245,
                "vibe": 0, "packet20DiagnosticEnabled": False,
                "foundationTelemetryEnabled": False},
        },
        "aux": {"live": True, "mode": "DDP", "source": "192.168.77.10",
            "led_count": 22, "on": True, "lor": 0},
    })
    binding = {
        "authorization_id": AUTH_ID,
        "source_message_ref": "direct owner authorization; test fixture",
        "candidate_release_id": CANDIDATE,
        "candidate_bin_sha256": candidate_sha,
        "rollback_bin_sha256": rollback_sha,
        "matrix_mac": "70:4b:ca:5b:34:5c",
        "candidate_install_limit": 1,
        "recovery_install_limit": 1,
        "scope": ["Install exact candidate once.", "One exact R4 recovery if a gate fails.",
            "On candidate pass, unchanged 28-kernel qualification and one uninterrupted 5400-second soak."],
    }
    owner_path = root / "evidence/EXACT_OWNER_AUTHORIZATION_BINDING.json"
    write(owner_path, {"schema": "hbnf-exact-live-owner-authorization-v1", "binding": binding})
    proof_path = base / "continuation-02/QUALIFICATION_PRELIVE_READONLY.json"
    write(proof_path, {
        "schema": "hbnf-cart2-qualification-prelive-v1",
        "captured_unix": time.time(),
        "pass": True,
        "read_only": True,
        "device_mutations": 0,
        "operation_scope": "QUALIFICATION_ONLY",
        "candidate_release_id": CANDIDATE,
        "candidate_sha256": candidate_sha,
        "candidate_attempts_used": 1,
        "recovery_attempts_used": 0,
        "candidate_install_permitted": False,
        "host_on_ac": True,
        "cart_lan_interface": "en0",
        "matrix": {"release_id": CANDIDATE, "candidate_sha256": candidate_sha,
            "mac": "704bca5b345c", "brightness": 52, "on": True,
            "diagnostic_off": True, "telemetry_off": True},
        "brightness_baseline": {
            "runtime": {"matrixBrightness": 52, "auxBrightness": 245, "vibe": 0},
            "persisted": {"matrixBrightness": 52, "auxBrightness": 245},
        },
        "aux": {"live": True, "mode": "DDP", "source": "192.168.77.10",
            "led_count": 22, "on": True, "lor": 0},
        "rollback": {"sha256": rollback_sha, "opal_ledger": f"55 exact-r4 {rollback_sha}"},
        "single_worker": {"pass": True, "worker_count": 1, "conflicting_pids": []},
    })
    subject = {
        "release_id": CANDIDATE,
        "artifact_sha256": candidate_sha,
        "installed_release_id": CANDIDATE,
        "installed_sha256": candidate_sha,
        "candidate_artifact_path": str(candidate_bin.relative_to(root)),
        "rollback_artifact_path": str(recovery_bin.relative_to(root)),
        "qualification_result": str(transaction.relative_to(root)),
        "qualification_result_sha256": tx_sha,
        "runtime_readonly_receipt": str(runtime.relative_to(root)),
        "runtime_readonly_sha256": runtime_sha,
    }
    state = {
        "installed_release": CANDIDATE,
        "installed_firmware_sha256": candidate_sha,
        "live_mutation_authorized": False,
        "live_authorization_binding": binding,
        "live_mutation_authorization": {
            "authorization_id": AUTH_ID,
            "source_evidence": str(owner_path.relative_to(root)),
            "candidate_release_id": CANDIDATE,
            "candidate_sha256": candidate_sha,
            "rollback_sha256": rollback_sha,
            "candidate_install_limit": 1,
            "candidate_attempts_used": 1,
            "candidate_install_permitted": False,
            "recovery_install_limit": 1,
            "recovery_attempts_used": 0,
            "transaction_consumed": True,
            "transaction_result": str(transaction.relative_to(root)),
            "authorized": False,
            "hardware_writes_permitted_now": False,
            "status": "QUALIFICATION_BRIGHTNESS_RESTORE_FAILED",
        },
        "execution_cursor": {"current_subject": subject, "exact_next_path": []},
        "current_task": {"installed_release": CANDIDATE, "installed_firmware_sha256": candidate_sha,
            "status": "QUALIFICATION_BRIGHTNESS_RESTORE_FAILED", "live_mutation_authorized": False},
    }
    return state, proof_path, candidate_sha, rollback_sha


def main():
    with tempfile.TemporaryDirectory(prefix="qualification-rearm-") as td:
        previous_root = CONTROL.ROOT
        CONTROL.ROOT = Path(td)
        try:
            state, proof, candidate_sha, rollback_sha = fixture(td)
            result = CONTROL.reconcile_installed_qualification(state, proof)
            auth = result["live_mutation_authorization"]
            assert result["live_mutation_authorized"] is True
            assert auth["operation_scope"] == "QUALIFICATION_ONLY"
            assert auth["candidate_install_permitted"] is False
            assert auth["candidate_attempts_used"] == 1 and auth["recovery_attempts_used"] == 0
            assert auth["candidate_sha256"] == candidate_sha and auth["rollback_sha256"] == rollback_sha
        finally:
            CONTROL.ROOT = previous_root

    with tempfile.TemporaryDirectory(prefix="qualification-restore-rearm-") as td:
        previous_root=CONTROL.ROOT
        CONTROL.ROOT=Path(td)
        try:
            state,proof,candidate_sha,rollback_sha=fixture(td)
            proof_doc=json.loads(proof.read_text())
            proof_doc["matrix"]["brightness"]=44
            proof_doc["brightness_baseline"]["runtime"]["matrixBrightness"]=44
            proof_doc["brightness_baseline"]["persisted"]["matrixBrightness"]=44
            proof.write_text(json.dumps(proof_doc,sort_keys=True)+"\n")
            tx_path=Path(td)/"evidence"/CANDIDATE/"live-qualification/continuation-03/QUALIFICATION_CONTINUATION_RESULT.json"
            tx_sha=write(tx_path,{
                "schema":"hbnf-cart2-candidate-qualification-continuation-v1",
                "candidate_release_id":CANDIDATE,"candidate_sha256":candidate_sha,
                "candidate_install_attempts":0,"recovery_attempts":0,
                "operation_scope":"QUALIFICATION_ONLY","preflight_completed":True,
                "setup_started":True,"brightness_setup_started":True,
                "restore_error":"RuntimeError: qualification-baseline-matrix-brightness-mismatch",
                "status":"QUALIFICATION_BRIGHTNESS_RESTORE_FAILED"})
            rel=str(tx_path.relative_to(Path(td)))
            state["live_mutation_authorization"]["transaction_result"]=rel
            subject=state["execution_cursor"]["current_subject"]
            subject["qualification_result"]=rel
            subject["qualification_result_sha256"]=tx_sha
            result=CONTROL.reconcile_installed_qualification(state,proof)
            auth=result["live_mutation_authorization"]
            assert result["live_mutation_authorized"] is True
            assert auth["qualification_recovery_subscope"]=="RESTORE_INTERRUPTED_BRIGHTNESS_THEN_QUALIFY"
            assert auth["candidate_install_permitted"] is False
            assert auth["candidate_attempts_used"]==1 and auth["recovery_attempts_used"]==0
        finally:
            CONTROL.ROOT=previous_root

    rejects = (
        {"captured_unix": time.time() - 301},
        {"candidate_install_permitted": True},
        {"candidate_attempts_used": 0},
        {"recovery_attempts_used": 1},
        {"matrix": {"mac": "000000000000"}},
        {"brightness_baseline": {"runtime": {"vibe": 99}}},
        {"single_worker": {"worker_count": 2}},
    )
    for change in rejects:
        with tempfile.TemporaryDirectory(prefix="qualification-rearm-reject-") as td:
            previous_root = CONTROL.ROOT
            CONTROL.ROOT = Path(td)
            try:
                state, proof_path, _, _ = fixture(td)
                proof = json.loads(proof_path.read_text())
                for key, value in change.items():
                    if isinstance(value, dict) and isinstance(proof.get(key), dict):
                        proof[key].update(value)
                    else:
                        proof[key] = value
                proof_path.write_text(json.dumps(proof, sort_keys=True) + "\n")
                before = copy.deepcopy(state)
                try:
                    CONTROL.reconcile_installed_qualification(state, proof_path)
                except ValueError:
                    pass
                else:
                    raise AssertionError(f"unsafe rearm fixture was accepted: {change}")
                assert state == before, "failed reconciliation must not mutate primary authority state"
            finally:
                CONTROL.ROOT = previous_root
    print("PASS: qualification-only rearm preserves the consumed install and unused exact recovery; stale/mismatched preflight fails without changing control state")


if __name__ == "__main__":
    main()
