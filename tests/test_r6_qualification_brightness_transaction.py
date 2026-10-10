#!/usr/bin/env python3
"""Adversarial offline tests for the R6 qualification brightness transaction."""
import importlib.util
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("r6_brightness_transaction", ROOT / "scripts/hbnf_r6_audio_cache_live_transaction.py")
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

BASELINE = {"matrixBrightness": 52, "auxBrightness": 245, "vibe": 3}


def pair(matrix, *, aux=245, vibe=3, config_matrix=None, partial=False):
    config = {"matrixBrightness": matrix if config_matrix is None else config_matrix,
        "auxBrightness": aux, "vibe": vibe}
    if partial:
        config.pop("vibe")
    return {"matrix_on": True, "runtime": {"matrixBrightness": matrix, "auxBrightness": aux, "vibe": vibe}, "config": config}


class FakePort:
    def __init__(self, *, admitted=True, baseline=BASELINE, setup_error=None,
                 worker_error=None, restore_error=None, setup_readback=None):
        self.admitted = admitted
        self.baseline = dict(baseline)
        self.setup_error = setup_error
        self.worker_error = worker_error
        self.restore_error = restore_error
        self.setup_readback = setup_readback
        self.events = []
        self.device_requests = 0
        self.recovery_attempts = 0
        self._temp = tempfile.TemporaryDirectory(prefix="brightness-transaction-test-")
        self.outdir = pathlib.Path(self._temp.name)

    def admit(self, stage="LIVE_APPROVED"):
        self.events.append(("admit", stage))
        if not self.admitted:
            raise RuntimeError("admission-rejected")

    def verify_local_artifacts(self):
        self.events.append(("local",))

    def preflight_candidate(self):
        self.events.append(("preflight",))
        self.device_requests += 6
        if self.baseline["matrixBrightness"] != 52:
            raise RuntimeError("qualification-baseline-runtime-brightness-mismatch")
        return {"pass": True, "release_id": module.RELEASE,
            "brightness_baseline": {"runtime": dict(self.baseline), "config": dict(self.baseline)}}

    def apply_qualification_brightness(self, baseline):
        self.events.append(("set", dict(baseline)))
        self.device_requests += 1
        if self.setup_error:
            raise RuntimeError(self.setup_error)
        if self.setup_readback:
            return self.setup_readback
        return {"verified": True, "target_matrix_brightness": 44}

    def qualify(self):
        self.events.append(("worker",))
        if self.worker_error:
            raise RuntimeError(self.worker_error)
        return {"passed": True, "profiles_completed": 28}

    def restore_qualification_brightness(self, baseline):
        self.events.append(("restore", dict(baseline)))
        self.device_requests += 1
        if self.restore_error:
            raise RuntimeError(self.restore_error)
        return {"verified": True, "target_matrix_brightness": 52, "readback": pair(52)}

    def close(self, result):
        self.events.append(("close", result["status"]))
        self._temp.cleanup()

    def recover_r4(self):
        raise AssertionError("brightness host/setup/restore failure must not trigger firmware recovery")


def run(port):
    return module.coordinate_qualification(port)


def test_post_timeout_is_resolved_by_readback_without_retry():
    original_post = module.post_json
    original_read = module.read_matrix_brightness_pair
    writes = []
    current = pair(52)

    def post(_url, payload):
        writes.append(payload)
        target = payload["HBNF"]["matrixBrightness"]
        current["runtime"]["matrixBrightness"] = target
        current["config"]["matrixBrightness"] = target
        raise TimeoutError("response lost after server applied POST")

    module.post_json = post
    module.read_matrix_brightness_pair = lambda: {"matrix_on": True, "runtime": dict(current["runtime"]), "config": dict(current["config"])}
    try:
        now = [0.0]
        receipt = module.change_matrix_brightness(BASELINE, operation="measure",
            sleeper=lambda seconds: now.__setitem__(0, now[0] + seconds), monotonic=lambda: now[0])
        assert receipt["verified"] and receipt["post_outcome"] == "UNKNOWN_RESOLVED_BY_READBACK"
        assert receipt["readback"]["runtime"] == {"matrixBrightness": 44, "auxBrightness": 245, "vibe": 3}
        assert len(writes) == 1
    finally:
        module.post_json = original_post
        module.read_matrix_brightness_pair = original_read


def test_unknown_post_outcome_without_matching_readback_fails_once():
    original_post = module.post_json
    original_read = module.read_matrix_brightness_pair
    writes = []
    now = [0.0]

    def post(_url, _payload):
        writes.append(True)
        raise TimeoutError("unknown outcome; no state change visible")

    module.post_json = post
    module.read_matrix_brightness_pair = lambda: pair(52)
    try:
        try:
            module.change_matrix_brightness(BASELINE, operation="measure",
                sleeper=lambda seconds: now.__setitem__(0, now[0] + seconds), monotonic=lambda: now[0])
        except RuntimeError as exc:
            assert "brightness-measure-unverified" in str(exc)
        else:
            raise AssertionError("unknown POST without target readback must fail closed")
        assert len(writes) == 1
    finally:
        module.post_json = original_post
        module.read_matrix_brightness_pair = original_read


def test_restore_config_mismatch_fails_even_when_runtime_restored():
    original_post = module.post_json
    original_read = module.read_matrix_brightness_pair
    writes = []
    current = pair(44, config_matrix=44)
    now = [0.0]

    def post(_url, payload):
        writes.append(payload)
        current["runtime"].update(payload["HBNF"])
        raise TimeoutError("restore response lost; disk/config view remains at 44")

    module.post_json = post
    module.read_matrix_brightness_pair = lambda: {"matrix_on": True, "runtime": dict(current["runtime"]), "config": dict(current["config"])}
    try:
        try:
            module.change_matrix_brightness(BASELINE, operation="restore",
                sleeper=lambda seconds: now.__setitem__(0, now[0] + seconds), monotonic=lambda: now[0])
        except RuntimeError as exc:
            assert "brightness-restore-unverified" in str(exc)
            assert "readback-mismatch" in str(exc)
        else:
            raise AssertionError("config-side restore mismatch must fail closed")
        assert len(writes) == 1
    finally:
        module.post_json = original_post
        module.read_matrix_brightness_pair = original_read


def test_partial_readback_fails_and_does_not_create_profiles():
    original_post = module.post_json
    original_read = module.read_matrix_brightness_pair
    writes = []
    now = [0.0]
    module.post_json = lambda _url, payload: writes.append(payload)
    module.read_matrix_brightness_pair = lambda: pair(44, partial=True)
    try:
        try:
            module.change_matrix_brightness(BASELINE, operation="measure",
                sleeper=lambda seconds: now.__setitem__(0, now[0] + seconds), monotonic=lambda: now[0])
        except RuntimeError as exc:
            assert "brightness-measure-unverified" in str(exc)
        else:
            raise AssertionError("partial config readback must fail closed")
        assert len(writes) == 1
    finally:
        module.post_json = original_post
        module.read_matrix_brightness_pair = original_read

    port = FakePort(setup_error="partial-readback")
    result = run(port)
    assert result["status"] == "QUALIFICATION_BRIGHTNESS_SETUP_FAILED_NO_PROFILES"
    assert "worker" not in [event[0] for event in port.events]
    assert [event[0] for event in port.events].index("set") < [event[0] for event in port.events].index("restore")


def test_invalid_baseline_rejected_after_admission_before_any_write():
    port = FakePort(baseline={"matrixBrightness": 51, "auxBrightness": 245, "vibe": 3})
    result = run(port)
    names = [event[0] for event in port.events]
    assert result["status"] == "QUALIFICATION_BLOCKED_OR_FAILED"
    assert port.device_requests == 6  # read-only identity/preflight only
    assert "set" not in names and "worker" not in names and "restore" not in names


def test_live_and_config_baseline_must_match_at_52():
    state = {"on": True, "HBNF": dict(BASELINE)}
    good = {"um": {"hbnfFoundationV1": dict(BASELINE)}}
    assert module.validate_brightness_baseline(state, good) == {"matrix_on": True, "runtime": BASELINE, "config": BASELINE}
    for bad_config in (
        {"um": {"hbnfFoundationV1": {**BASELINE, "matrixBrightness": 44}}},
        {"um": {"hbnfFoundationV1": {**BASELINE, "auxBrightness": 200}}},
        {"um": {"hbnfFoundationV1": {"matrixBrightness": 52, "auxBrightness": 245}}},
    ):
        try:
            module.validate_brightness_baseline(state, bad_config)
        except RuntimeError as exc:
            assert "baseline" in str(exc) or "readback" in str(exc)
        else:
            raise AssertionError("runtime/config baseline mismatch must fail before writes")


def test_invalid_admission_causes_zero_device_requests_and_writes():
    port = FakePort(admitted=False)
    result = run(port)
    assert result["status"] == "QUALIFICATION_BLOCKED_OR_FAILED"
    assert port.device_requests == 0
    assert [event[0] for event in port.events] == ["admit", "close"]


def test_worker_exception_restores_baseline():
    port = FakePort(worker_error="collector network interruption")
    result = run(port)
    names = [event[0] for event in port.events]
    assert result["status"] == "QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED"
    assert names.index("set") < names.index("worker") < names.index("restore")
    assert result["brightness_restore"]["verified"] is True


def test_restore_failure_invalidates_captured_profiles_and_never_passes():
    port = FakePort(restore_error="baseline readback mismatch")
    result = run(port)
    assert result["status"] == "QUALIFICATION_BRIGHTNESS_RESTORE_FAILED"
    assert "qualification" not in result
    assert result["captured_qualification_invalidated"]["profiles_not_accepted"] is True
    assert result["brightness_restore"]["verified"] is False


def main():
    for test in (
        test_post_timeout_is_resolved_by_readback_without_retry,
        test_unknown_post_outcome_without_matching_readback_fails_once,
        test_restore_config_mismatch_fails_even_when_runtime_restored,
        test_partial_readback_fails_and_does_not_create_profiles,
        test_invalid_baseline_rejected_after_admission_before_any_write,
        test_live_and_config_baseline_must_match_at_52,
        test_invalid_admission_causes_zero_device_requests_and_writes,
        test_worker_exception_restores_baseline,
        test_restore_failure_invalidates_captured_profiles_and_never_passes,
    ):
        test()
    print("PASS: baseline/setup/restore transaction fails closed across admission, timeout, partial-readback, worker, and restoration faults")


if __name__ == "__main__":
    main()
