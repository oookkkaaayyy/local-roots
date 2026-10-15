"""Fail-closed coverage for current-candidate recognition in platform doctor."""
import hashlib
import importlib.util
import json
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("local_platform_doctor", ROOT / "scripts/platform.py")
PLATFORM = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PLATFORM)

RELEASE = "hbnf-cart2-candidate-test"
SHA = "a" * 64


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True) + "\n")


def check_case(*, tamper_runtime_hash=False, tamper_transaction_hash=False, wrong_matrix=False,
               continuation=False, tamper_install_receipt_hash=False):
    with tempfile.TemporaryDirectory(prefix="platform-candidate-proof-") as tmp:
        root = Path(tmp)
        state_dir = root / "config"
        runtime_path = root / "evidence/runtime.json"
        tx_path = root / "evidence/transaction.json"
        adapter_path = state_dir / "HBNF_PACKET20_LIVE_SWEEP_ADAPTER_20261004.json"
        write(adapter_path, {"expected_release_id": "historical-r7"})
        runtime = {
            "schema": "cart2-current-matrix-readonly-snapshot-v1",
            "read_only": True,
            "device_mutations": 0,
            "matrix": {"identity": {
                "release_id": RELEASE,
                "candidate": RELEASE,
                "mac": "00:11:22:33:44:55" if wrong_matrix else "70:4b:ca:5b:34:5c",
            }},
        }
        tx = {
            "candidate_release_id": RELEASE,
            "candidate_sha256": SHA,
            "candidate_install_attempts": 0 if continuation else 1,
            "status": "QUALIFICATION_BRIGHTNESS_RESTORE_FAILED",
        }
        if continuation:
            tx.update({"schema":"hbnf-cart2-candidate-qualification-continuation-v1",
                "operation_scope":"QUALIFICATION_ONLY","recovery_attempts":0})
            install_path=root/"evidence/install.json"
            write(install_path,{"schema":"hbnf-cart2-candidate-qualification-transaction-v1",
                "candidate_release_id":RELEASE,"candidate_sha256":SHA,"candidate_install_attempts":1,
                "upload":{"confirmed":True,"http_status":"200"}})
        write(runtime_path, runtime)
        write(tx_path, tx)
        state = {
            "current_task": {"installed_release": RELEASE, "installed_firmware_sha256": SHA},
            "installed_firmware_sha256": SHA,
            "installed_release": RELEASE,
            "execution_cursor": {"current_subject": {
                "installed_release_id": RELEASE,
                "installed_sha256": SHA,
                "runtime_readonly_receipt": str(runtime_path.relative_to(root)),
                "runtime_readonly_sha256": "0" * 64 if tamper_runtime_hash else digest(runtime_path),
                "qualification_result": str(tx_path.relative_to(root)),
                "qualification_result_sha256": "0" * 64 if tamper_transaction_hash else digest(tx_path),
            }},
        }
        if continuation:
            state["live_mutation_authorization"]={"candidate_attempts_used":1,"transaction_consumed":True}
            subject=state["execution_cursor"]["current_subject"]
            subject["candidate_install_receipt"]=str(install_path.relative_to(root))
            subject["candidate_install_receipt_sha256"]=("0"*64 if tamper_install_receipt_hash else digest(install_path))
        write(state_dir / "HBNF_CONTROL_STATE.json", state)
        previous_root = PLATFORM.ROOT
        PLATFORM.ROOT = root
        errors, warnings = [], []
        try:
            PLATFORM.validate_hbnf_coherence(errors, warnings)
        finally:
            PLATFORM.ROOT = previous_root
        return errors


def check_recorded_adapter_case(*, adapter_sha=SHA):
    with tempfile.TemporaryDirectory(prefix="platform-recorded-adapter-") as tmp:
        root = Path(tmp)
        state_dir = root / "config"
        write(state_dir / "HBNF_PACKET20_LIVE_SWEEP_ADAPTER_20261004.json", {"expected_release_id": "historical-r7"})
        write(state_dir / "HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_SKINS_READABLE_20261014.json", {
            "expected_release_id": RELEASE,
            "preflight_argv": ["env", f"HBNF_EXPECTED_FIRMWARE_SHA256={adapter_sha}", "python3"]
        })
        write(state_dir / "HBNF_CONTROL_STATE.json", {
            "installed_release": RELEASE,
            "installed_firmware_sha256": SHA,
            "current_task": {"installed_release": RELEASE, "installed_firmware_sha256": SHA}
        })
        previous_root = PLATFORM.ROOT
        PLATFORM.ROOT = root
        errors, warnings = [], []
        try:
            PLATFORM.validate_hbnf_coherence(errors, warnings)
        finally:
            PLATFORM.ROOT = previous_root
        return errors, warnings


def main():
    assert check_case() == []
    assert check_case(tamper_runtime_hash=True), "stale device snapshot hash must reject current-candidate recognition"
    assert check_case(tamper_transaction_hash=True), "stale transaction hash must reject current-candidate recognition"
    assert check_case(wrong_matrix=True), "wrong device identity must reject current-candidate recognition"
    assert check_case(continuation=True) == [], "qualification continuation may reuse only a hash-bound consumed install receipt"
    assert check_case(continuation=True,tamper_install_receipt_hash=True), "stale candidate install receipt hash must reject continuation identity"
    errors, warnings = check_recorded_adapter_case()
    assert errors == [], "exact release-and-SHA-bound Foundation adapter should supersede the stale generic adapter"
    assert any("current installed device identity remains unverified" in warning for warning in warnings)
    errors, _ = check_recorded_adapter_case(adapter_sha="b" * 64)
    assert errors and "no exact release-and-SHA-bound Foundation adapter found" in errors[0], "adapter with wrong SHA must fail closed"
    print("PASS: platform doctor reconciles only the exact recorded release/SHA adapter and keeps live identity unverified")


if __name__ == "__main__":
    main()
