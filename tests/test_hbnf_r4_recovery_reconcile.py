"""Exact, evidence-bound state reconciliation after a verified R4 recovery."""
import copy
import hashlib
import importlib.util
import json
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("hbnf_control_r4_reconcile", ROOT / "scripts/hbnf_control.py")
CONTROL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONTROL)
CANDIDATE = "candidate-r6"
R4 = CONTROL.R4_RELEASE


def put(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, sort_keys=True) + "\n")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fixture(root):
    ev = root / "evidence"
    artifact = ev / "r4.bin"
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_bytes(b"exact R4")
    r4_sha = hashlib.sha256(artifact.read_bytes()).hexdigest()
    candidate_sha = "a" * 64
    receipt = ev / "recovery.json"
    receipt_sha = put(receipt, {
        "schema": "hbnf-cart2-candidate-qualification-continuation-v1",
        "candidate_release_id": CANDIDATE, "candidate_sha256": candidate_sha,
        "candidate_install_attempts": 0, "recovery_attempts": 1,
        "status": "EXACT_R4_RECOVERED_AFTER_FAILED_QUALIFICATION",
        "owner_settings_restore": {"verified": True},
        "recovery": {"status": "R4_READBACK_VERIFIED", "upload": {
            "confirmed": True, "http_status": "200", "attempts": 1, "retry": False}},
        "post_recovery_readonly": {"status": "PASS", "release_id": R4,
            "matrix_brightness": 52, "aux_brightness": 245, "aux_ddp_live": True}})
    readonly = ev / "readonly.json"
    readonly_sha = put(readonly, {
        "schema": "cart2-current-matrix-readonly-snapshot-v1", "read_only": True,
        "device_mutations": 0,
        "matrix": {"identity": {"release_id": R4, "candidate": R4,
                "mac": "704bca5b345c"},
            "hbnf": {"matrixBrightness": 52, "auxBrightness": 245, "vibe": 0,
                "packet20DiagnosticEnabled": False, "foundationTelemetryEnabled": False},
            "persistedHbnf": {"matrixBrightness": 52, "auxBrightness": 245, "vibe": 0}},
        "aux": {"identity": {"mac": "8c94df55c34c"},
            "runtime": {"on": True, "lor": 0},
            "ddp": {"live": True, "mode": "DDP", "source": "192.168.77.10", "led_count": 22}}})
    subject = {"failed_candidate_release_id": CANDIDATE, "candidate_release_id": CANDIDATE,
        "rollback_artifact_path": str(artifact.relative_to(root)),
        "recovery_artifact_path": str(artifact.relative_to(root)),
        "qualification_result": str(receipt.relative_to(root)),
        "qualification_result_sha256": receipt_sha}
    auth = {"authorized": False, "candidate_release_id": CANDIDATE,
        "candidate_sha256": candidate_sha, "rollback_sha256": r4_sha,
        "candidate_attempts_used": 1, "recovery_attempts_used": 1,
        "candidate_install_permitted": False, "transaction_consumed": True,
        "transaction_result": str(receipt.relative_to(root)), "operation_scope": "CLOSED"}
    state = {"installed_release": CANDIDATE, "installed_firmware_sha256": candidate_sha,
        "live_mutation_authorized": False, "live_mutation_authorization": auth,
        "execution_cursor": {"current_subject": subject}, "current_task": {}}
    return state, receipt, readonly, readonly_sha, r4_sha


def run():
    with tempfile.TemporaryDirectory(prefix="r4-reconcile-") as td:
        root = Path(td)
        old_root = CONTROL.ROOT
        CONTROL.ROOT = root
        try:
            state, receipt, readonly, readonly_sha, r4_sha = fixture(root)
            CONTROL.reconcile_verified_r4_recovery(state, receipt, readonly)
            assert state["installed_release"] == R4
            assert state["installed_firmware_sha256"] == r4_sha
            assert state["live_mutation_authorized"] is False
            assert state["execution_cursor"]["current_subject"]["runtime_readonly_sha256"] == readonly_sha
            assert state["current_task"]["exact_r4_recovery_reconciliation"]["status"] == "PASS__EXACT_R4_RECOVERY_VERIFIED"
        finally:
            CONTROL.ROOT = old_root

    for tamper in ("release", "retry", "readonly_mutation"):
        with tempfile.TemporaryDirectory(prefix="r4-reconcile-reject-") as td:
            root = Path(td)
            old_root = CONTROL.ROOT
            CONTROL.ROOT = root
            try:
                state, receipt, readonly, _, _ = fixture(root)
                if tamper == "release":
                    data = json.loads(readonly.read_text())
                    data["matrix"]["identity"]["release_id"] = CANDIDATE
                    put(readonly, data)
                elif tamper == "retry":
                    data = json.loads(receipt.read_text())
                    data["recovery"]["upload"]["retry"] = True
                    put(receipt, data)
                else:
                    data = json.loads(readonly.read_text())
                    data["device_mutations"] = 1
                    put(readonly, data)
                before = copy.deepcopy(state)
                try:
                    CONTROL.reconcile_verified_r4_recovery(state, receipt, readonly)
                except ValueError:
                    pass
                else:
                    raise AssertionError(f"tampered {tamper} evidence was accepted")
                assert state == before, "rejected reconciliation must not mutate control state"
            finally:
                CONTROL.ROOT = old_root
    print("PASS: verified exact R4 recovery reconciles state; altered identity, retry, and mutation evidence fail closed")


if __name__ == "__main__":
    run()
