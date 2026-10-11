"""Pin the exact-release wait and telemetry-read shapes used by the transaction."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("diag_transaction", ROOT / "scripts/hbnf_r6_frame_context_diagnostic_transaction.py")
tx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tx)
adapter_spec = importlib.util.spec_from_file_location("foundation_adapter", ROOT / "scripts/hbnf_foundation_live_adapter.py")
foundation_adapter = importlib.util.module_from_spec(adapter_spec)
adapter_spec.loader.exec_module(foundation_adapter)


class FakeAdapter:
    EXPECTED = tx.R4_ID

    def __init__(self, release):
        self.release = release

    def identity(self):
        return ({"ip": "192.168.77.10", "mac": "70:4b:ca:5b:34:5c", "ver": "16.0.1", "uptime": 1, "freeheap": 50000},
                {"release_id": self.release, "candidate": self.release})


def test_identity_wait_rejects_old_release_and_accepts_exact_candidate():
    old = FakeAdapter(tx.R4_ID)
    try:
        tx.identity(old, tx.DIAG_ID)
    except RuntimeError as exc:
        assert "exact runtime release identity mismatch" in str(exc)
    else:
        raise AssertionError("wait must not accept reachable old firmware as the candidate")
    assert old.EXPECTED == tx.DIAG_ID
    new = FakeAdapter(tx.DIAG_ID)
    _, build = tx.identity(new, tx.DIAG_ID)
    assert build["release_id"] == tx.DIAG_ID and build["candidate"] == tx.DIAG_ID


def test_flat_and_wrapped_parallel_read_shapes():
    info = {"ip": "192.168.77.11", "mac": "8c:94:df:55:c3:4c", "live": True, "lm": "DDP", "lip": "192.168.77.10", "leds": {"count": 22}}
    state = {"on": True}
    flat = {"aux_info": info, "aux_state": state}
    wrapped = {"aux_info": {"body": info, "sha256": "x"}, "aux_state": {"body": state, "sha256": "y"}}
    assert tx.aux_ok(flat) is True
    assert tx.aux_ok(wrapped) is True
    assert tx.aux_summary(flat) == tx.aux_summary(wrapped)
    assert tx.aux_summary(flat)["aux_source"] == "192.168.77.10"
    assert tx.response_body(info) is info


def test_recovery_requires_exact_target_identity():
    info = {"ip": "192.168.77.10", "mac": "70:4b:ca:5b:34:5c", "ver": "16.0.1"}
    for release in (tx.R4_ID, tx.DIAG_ID):
        assert tx.exact_recovery_release(info, {"release_id": release, "candidate": release}) == release
    for bad_info, bad_build in (
        ({**info, "mac": "00:00:00:00:00:00"}, {"release_id": tx.DIAG_ID, "candidate": tx.DIAG_ID}),
        (info, {"release_id": "unknown", "candidate": "unknown"}),
        (info, {"release_id": tx.R4_ID, "candidate": tx.DIAG_ID}),
    ):
        try:
            tx.exact_recovery_release(bad_info, bad_build)
        except RuntimeError:
            pass
        else:
            raise AssertionError("recovery must fail closed for unexpected device/build identity")


def test_readonly_preflight_can_capture_owner_brightness_without_weakening_default():
    original = foundation_adapter._parallel_soak_reads
    original_expected = foundation_adapter.EXPECTED
    foundation_adapter.EXPECTED = tx.R4_ID
    foundation_adapter._parallel_soak_reads = lambda _session: ({
        "matrix_info": {"ip": "192.168.77.10", "mac": "70:4b:ca:5b:34:5c", "ver": "16.0.1", "uptime": 100, "freeheap": 50000},
        "matrix_build": {"release_id": tx.R4_ID, "candidate": tx.R4_ID},
        "matrix_state": {"on": True, "HBNF": {"matrixBrightness": 52, "timing": {"fps": 60}, "packet20Diagnostic": {"enabled": False, "snapshotValid": False}, "foundationTelemetry": {"enabled": False}}},
        "aux_info": {"ip": "192.168.77.11", "mac": "8c94df55c34c", "live": True, "lm": "DDP", "lip": "192.168.77.10", "leds": {"count": 22}},
        "aux_state": {"on": True}, "_endpoint_timing": {}}, 0.01)
    try:
        assert foundation_adapter.readonly_preflight("capture-owner-brightness", expected_brightness=None)["matrix_brightness"] == 52
        try:
            foundation_adapter.readonly_preflight("default-matched-brightness")
        except RuntimeError as exc:
            assert "brightness-mismatch" in str(exc)
        else:
            raise AssertionError("other callers must retain the default exact-44 contract")
    finally:
        foundation_adapter._parallel_soak_reads = original
        foundation_adapter.EXPECTED = original_expected


if __name__ == "__main__":
    test_identity_wait_rejects_old_release_and_accepts_exact_candidate()
    test_flat_and_wrapped_parallel_read_shapes()
    test_recovery_requires_exact_target_identity()
    test_readonly_preflight_can_capture_owner_brightness_without_weakening_default()
    print("PASS exact runtime identity wait and flattened read contract")
