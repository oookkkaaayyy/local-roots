#!/usr/bin/env python3
"""Adversarial offline tests for the R6 qualification brightness transaction."""
import importlib.util
import json
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("r6_brightness_transaction", ROOT / "scripts/hbnf_r6_audio_cache_live_transaction.py")
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

BASELINE = {"matrixBrightness": 52, "auxBrightness": 245, "vibe": 3}


def pair(matrix, *, aux=245, vibe=3, persisted_matrix=None, partial=False):
    persisted = {"matrixBrightness": matrix if persisted_matrix is None else persisted_matrix,
        "auxBrightness": aux, "vibe": vibe}
    if partial:
        persisted.pop("vibe")
    return {"identity": exact_identity()[0], "matrix_on": True,
        "runtime": {"matrixBrightness": matrix, "auxBrightness": aux, "vibe": vibe}, "persisted": persisted}


def exact_identity(_request_counter=None):
    return ({"ip": "192.168.77.10", "mac": module.MATRIX_MAC, "wled": "16.0.1",
        "release_id": module.RELEASE, "candidate": module.RELEASE, "build_mac": module.MATRIX_MAC}, {}, {})


class FakePort:
    def __init__(self, *, admitted=True, baseline=BASELINE, setup_error=None,
                 worker_error=None, restore_error=None, setup_readback=None, restore_readback=None):
        self.admitted = admitted
        self.baseline = dict(baseline)
        self.setup_error = setup_error
        self.worker_error = worker_error
        self.restore_error = restore_error
        self.setup_readback = setup_readback
        self.restore_readback = restore_readback
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
            "brightness_baseline": {"runtime": dict(self.baseline), "persisted": dict(self.baseline)}}

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
        if self.restore_readback is not None:
            return self.restore_readback
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
    original_identity = module.read_matrix_identity
    writes = []
    current = pair(52)

    def post(_url, payload):
        writes.append(payload)
        target = payload["HBNF"]["matrixBrightness"]
        current["runtime"]["matrixBrightness"] = target
        current["persisted"]["matrixBrightness"] = target
        raise TimeoutError("response lost after server applied POST")

    module.post_json = post
    module.read_matrix_brightness_pair = lambda: {"identity": exact_identity()[0], "matrix_on": True,
        "runtime": dict(current["runtime"]), "persisted": dict(current["persisted"])}
    module.read_matrix_identity = exact_identity
    try:
        now = [0.0]
        receipt = module.change_matrix_brightness(BASELINE, operation="measure",
            sleeper=lambda seconds: now.__setitem__(0, now[0] + seconds), monotonic=lambda: now[0])
        assert receipt["verified"] and receipt["post_outcome"] == "UNKNOWN_RESOLVED_BY_READBACK"
        assert receipt["readback"]["runtime"] == {"matrixBrightness": 44, "auxBrightness": 245, "vibe": 3}
        assert writes == [{"HBNF": {"matrixBrightness": 44}}]
        assert module.PERSISTED_CONFIG_URL.endswith("/edit?func=download&path=%2Fcfg.json")
        assert len(writes) == 1
    finally:
        module.post_json = original_post
        module.read_matrix_brightness_pair = original_read
        module.read_matrix_identity = original_identity


def test_exact_r4_owner_settings_restore_is_one_matrix_brightness_write():
    original_identity = module._read_expected_matrix_identity
    original_pair = module._read_expected_matrix_brightness_pair
    original_post = module._post_json_counted
    owner = {"matrixBrightness": 52, "auxBrightness": 245, "vibe": 2}
    identity = {"ip": "192.168.77.10", "mac": module.MATRIX_MAC,
        "wled": "16.0.1", "release_id": module.R4, "candidate": module.R4,
        "build_mac": module.MATRIX_MAC}
    current = {"identity": identity, "matrix_on": True,
        "runtime": {"matrixBrightness": 44, "auxBrightness": 245, "vibe": 2},
        "persisted": {"matrixBrightness": 44, "auxBrightness": 245, "vibe": 2}}
    writes = []

    def read_identity(_request_counter, expected_release):
        assert expected_release == module.R4
        return identity, {}, {}

    def read_pair(_request_counter, expected_release):
        assert expected_release == module.R4
        return json.loads(json.dumps(current))

    def post(_url, payload, _request_counter):
        writes.append(payload)
        current["runtime"]["matrixBrightness"] = payload["HBNF"]["matrixBrightness"]
        current["persisted"]["matrixBrightness"] = payload["HBNF"]["matrixBrightness"]

    module._read_expected_matrix_identity = read_identity
    module._read_expected_matrix_brightness_pair = read_pair
    module._post_json_counted = post
    try:
        receipt = module.change_matrix_brightness(owner, operation="restore",
            expected_release=module.R4, sleeper=lambda _seconds: None,
            monotonic=lambda: 0.0)
        assert receipt["verified"] is True
        assert receipt["readback"]["runtime"] == owner
        assert receipt["readback"]["persisted"] == owner
        assert writes == [{"HBNF": {"matrixBrightness": 52}}]
    finally:
        module._read_expected_matrix_identity = original_identity
        module._read_expected_matrix_brightness_pair = original_pair
        module._post_json_counted = original_post


def test_unknown_post_outcome_without_matching_readback_fails_once():
    original_post = module.post_json
    original_read = module.read_matrix_brightness_pair
    original_identity = module.read_matrix_identity
    writes = []
    now = [0.0]

    def post(_url, _payload):
        writes.append(True)
        raise TimeoutError("unknown outcome; no state change visible")

    module.post_json = post
    module.read_matrix_brightness_pair = lambda: pair(52)
    module.read_matrix_identity = exact_identity
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
        module.read_matrix_identity = original_identity


def test_restore_persisted_mismatch_fails_even_when_runtime_restored():
    original_post = module.post_json
    original_read = module.read_matrix_brightness_pair
    original_identity = module.read_matrix_identity
    writes = []
    current = pair(44, persisted_matrix=44)
    now = [0.0]

    def post(_url, payload):
        writes.append(payload)
        current["runtime"].update(payload["HBNF"])
        raise TimeoutError("restore response lost; persisted file remains at 44")

    module.post_json = post
    module.read_matrix_brightness_pair = lambda: {"identity": exact_identity()[0], "matrix_on": True,
        "runtime": dict(current["runtime"]), "persisted": dict(current["persisted"])}
    module.read_matrix_identity = exact_identity
    try:
        try:
            module.change_matrix_brightness(BASELINE, operation="restore",
                sleeper=lambda seconds: now.__setitem__(0, now[0] + seconds), monotonic=lambda: now[0])
        except RuntimeError as exc:
            assert "brightness-restore-unverified" in str(exc)
            assert "readback-mismatch" in str(exc)
        else:
            raise AssertionError("persisted-side restore mismatch must fail closed")
        assert len(writes) == 1
        assert writes[0] == {"HBNF": {"matrixBrightness": 52}}
    finally:
        module.post_json = original_post
        module.read_matrix_brightness_pair = original_read
        module.read_matrix_identity = original_identity


def test_partial_readback_fails_and_does_not_create_profiles():
    original_post = module._post_json_counted
    original_read = module.read_matrix_brightness_pair
    original_identity = module.read_matrix_identity
    writes = []
    now = [0.0]
    module._post_json_counted = lambda _url, payload, _counter: writes.append(payload)
    module.read_matrix_brightness_pair = lambda: pair(44, partial=True)
    module.read_matrix_identity = exact_identity
    try:
        try:
            module.change_matrix_brightness(BASELINE, operation="measure",
                sleeper=lambda seconds: now.__setitem__(0, now[0] + seconds), monotonic=lambda: now[0])
        except RuntimeError as exc:
            assert "prewrite-settings-incomplete-or-mismatched" in str(exc)
        else:
            raise AssertionError("partial config readback must fail closed")
        assert writes == []
    finally:
        module._post_json_counted = original_post
        module.read_matrix_brightness_pair = original_read
        module.read_matrix_identity = original_identity

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


def test_live_and_persisted_baseline_must_match_at_52():
    state = {"on": True, "HBNF": dict(BASELINE)}
    config_with_secret = {"wifi": {"psk": "never-log-this"}, "um": {"hbnfFoundationV1": dict(BASELINE)}}
    good = module.sanitized_persisted_hbnf(config_with_secret)
    assert set(good) == {"matrixBrightness", "auxBrightness", "vibe"}
    assert module.validate_brightness_baseline(state, good) == {"matrix_on": True, "runtime": BASELINE, "persisted": BASELINE}
    for bad_persisted in (
        {**BASELINE, "matrixBrightness": 44},
        {**BASELINE, "auxBrightness": 200},
        {"matrixBrightness": 52, "auxBrightness": 245},
    ):
        try:
            module.validate_brightness_baseline(state, bad_persisted)
        except RuntimeError as exc:
            assert "baseline" in str(exc) or "readback" in str(exc) or "persisted" in str(exc)
        else:
            raise AssertionError("runtime/persisted baseline mismatch must fail before writes")


def test_r4_preinstall_baseline_uses_persisted_vibe_when_runtime_omits_it():
    state={"on":True,"HBNF":{"matrixBrightness":52,"auxBrightness":245}}
    persisted={"matrixBrightness":52,"auxBrightness":245,"vibe":0}
    result=module.validate_preinstall_brightness_baseline(state,persisted)
    assert result["runtime"]==persisted and result["persisted"]==persisted
    assert result["runtime_observation"]["vibe_source"]=="persisted_config_only_on_exact_R4"
    no_vibe={"matrixBrightness":52,"auxBrightness":245}
    result=module.validate_preinstall_brightness_baseline(state,no_vibe)
    assert result["runtime"]==no_vibe and result["persisted"]==no_vibe
    assert result["runtime_observation"]["vibe_source"]=="unavailable_on_exact_R4"
    for bad_state,bad_persisted in (({"on":True,"HBNF":{"matrixBrightness":44,"auxBrightness":245}},persisted),
                                    ({"on":True,"HBNF":{"matrixBrightness":52}},no_vibe)):
        try:
            module.validate_preinstall_brightness_baseline(bad_state,bad_persisted)
        except RuntimeError:
            pass
        else:
            raise AssertionError("preinstall baseline must reject changed or missing brightness settings")


def test_r4_context_accepts_missing_vibe_only_for_exact_r4():
    original_get = module.get_json
    original_identity = module.read_matrix_identity
    requests = []
    identity = {"ip": "192.168.77.10", "mac": module.MATRIX_MAC, "wled": "16.0.1",
        "release_id": module.R4, "candidate": module.R4, "build_mac": module.MATRIX_MAC}
    info = {"ip": "192.168.77.10", "mac": "70:4b:ca:5b:34:5c", "ver": "16.0.1", "uptime": 500}
    build = {"release_id": module.R4, "candidate": module.R4, "mac": "70:4b:ca:5b:34:5c"}
    state = {"on": True, "HBNF": {"matrixBrightness": 52, "auxBrightness": 245}}
    raw_cfg = {"wifi": {"psk": "must-not-be-retained"},
        "um": {"hbnfFoundationV1": {"matrixBrightness": 52, "auxBrightness": 245}}}

    def get(url, timeout=4):
        requests.append(url)
        if url.endswith("/json/state"):
            return 200, b"{}", state
        if url == module.PERSISTED_CONFIG_URL:
            return 200, b"{}", raw_cfg
        raise AssertionError(f"unexpected GET endpoint: {url}")

    def read_identity(_request_counter=None, expected_release=module.RELEASE):
        assert expected_release == module.R4
        return identity, info, build

    module.get_json = get
    module.read_matrix_identity = read_identity
    try:
        context = module.read_matrix_context(expected_release=module.R4)
        assert context["persisted"] == {"matrixBrightness": 52, "auxBrightness": 245}
        assert context["brightness"]["runtime"] == {"matrixBrightness": 52, "auxBrightness": 245}
        assert context["brightness"]["persisted"] == {"matrixBrightness": 52, "auxBrightness": 245}
        assert context["brightness"]["runtime_observation"]["vibe_source"] == "unavailable_on_exact_R4"
        assert "must-not-be-retained" not in repr(context)
        assert requests == [module.MATRIX+"/json/state", module.PERSISTED_CONFIG_URL]
        try:
            module.sanitized_persisted_hbnf(raw_cfg)
        except RuntimeError as exc:
            assert "partial-or-invalid" in str(exc)
        else:
            raise AssertionError("candidate/default parser must remain strict when Vibe is absent")
    finally:
        module.get_json = original_get
        module.read_matrix_identity = original_identity


def test_candidate_brightness_guard_preserves_postinstall_vibe():
    original_post = module._post_json_counted
    original_read = module.read_matrix_brightness_pair
    original_identity = module.read_matrix_identity
    current = pair(52, vibe=4)
    writes = []

    def post(_url, payload, _request_counter):
        writes.append(payload)
        target = payload["HBNF"]["matrixBrightness"]
        current["runtime"]["matrixBrightness"] = target
        current["persisted"]["matrixBrightness"] = target

    module._post_json_counted = post
    module.read_matrix_brightness_pair = lambda: json.loads(json.dumps(current))
    module.read_matrix_identity = exact_identity
    try:
        r4_baseline = {"matrixBrightness": 52, "auxBrightness": 245}
        measured = module.change_matrix_brightness(r4_baseline, operation="measure",
            sleeper=lambda _seconds: None, monotonic=lambda: 0.0)
        assert measured["verified"] is True
        assert measured["readback"]["runtime"] == {"matrixBrightness": 44, "auxBrightness": 245, "vibe": 4}
        restored = module.change_matrix_brightness(r4_baseline, operation="restore",
            sleeper=lambda _seconds: None, monotonic=lambda: 0.0)
        assert restored["verified"] is True
        assert restored["readback"]["runtime"] == {"matrixBrightness": 52, "auxBrightness": 245, "vibe": 4}
        assert writes == [
            {"HBNF": {"matrixBrightness": 44}},
            {"HBNF": {"matrixBrightness": 52}},
        ]
    finally:
        module._post_json_counted = original_post
        module.read_matrix_brightness_pair = original_read
        module.read_matrix_identity = original_identity


def test_r4_missing_vibe_fails_before_any_brightness_write():
    original_post = module._post_json_counted
    original_read = module.read_matrix_brightness_pair
    original_identity = module.read_matrix_identity
    identity = {"ip": "192.168.77.10", "mac": module.MATRIX_MAC, "wled": "16.0.1",
        "release_id": module.R4, "candidate": module.R4, "build_mac": module.MATRIX_MAC}
    pair_without_vibe = {"identity": identity, "matrix_on": True,
        "runtime": {"matrixBrightness": 52, "auxBrightness": 245},
        "persisted": {"matrixBrightness": 52, "auxBrightness": 245}}
    writes = []
    module._post_json_counted = lambda *args, **kwargs: writes.append((args, kwargs))
    module.read_matrix_brightness_pair = lambda _request_counter=None, expected_release=module.RELEASE: pair_without_vibe
    module.read_matrix_identity = lambda _request_counter=None, expected_release=module.RELEASE: (identity, {}, {})
    try:
        try:
            module.change_matrix_brightness({"matrixBrightness": 52}, operation="restore",
                expected_release=module.R4)
        except RuntimeError as exc:
            assert "settings-incomplete" in str(exc)
        else:
            raise AssertionError("R4 without Vibe must fail closed before a write")
        assert writes == []
    finally:
        module._post_json_counted = original_post
        module.read_matrix_brightness_pair = original_read
        module.read_matrix_identity = original_identity


def test_preinstall_snapshot_captures_exact_renderer_and_ddp_state_without_secrets():
    matrix_state = {"on": True, "bri": 128, "transition": 7, "ps": -1, "pl": -1,
        "mainseg": 0, "seg": [{"id": 0, "fx": 3, "sx": 128, "ix": 96, "col": [[1, 2, 3]]}],
        "wifi": {"psk": "must-not-be-retained"}, "HBNF": {"candidate": "private-runtime"}}
    aux_state = {"on": True, "bri": 255, "lor": 0, "seg": [{"id": 0, "fx": 0}],
        "wifi": {"psk": "must-not-be-retained"}}
    snapshot = module.capture_owner_state_snapshot(
        matrix_state, aux_state, {"uptime": 1234, "freeheap": 70000, "leds": {"fps": 42}},
        {"live": True, "lm": "DDP", "lip": "192.168.77.10", "leds": {"count": 22}},
        {"ip": "192.168.77.10", "mac": module.MATRIX_MAC, "release_id": module.R4},
        {"ip": "192.168.77.11", "mac": module.AUX_MAC, "wled": "16.0.1"},
        {"runtime": {"matrixBrightness": 52, "auxBrightness": 245},
         "persisted": {"matrixBrightness": 52, "auxBrightness": 245}})
    assert snapshot["matrix"]["runtime"]["seg"] == matrix_state["seg"]
    assert snapshot["matrix"]["hbnf_brightness"] == {"matrixBrightness": 52, "auxBrightness": 245}
    assert snapshot["aux"]["runtime"] == {"on": True, "bri": 255, "lor": 0,
        "seg": [{"id": 0, "fx": 0}]}
    assert "wifi" not in repr(snapshot) and "private-runtime" not in repr(snapshot)
    for bad_matrix, bad_aux in (({**matrix_state, "seg": None}, aux_state),
                                (matrix_state, {**aux_state, "on": 1})):
        try:
            module.capture_owner_state_snapshot(bad_matrix, bad_aux, {}, {}, {}, {},
                {"runtime": {}, "persisted": {}})
        except RuntimeError:
            pass
        else:
            raise AssertionError("incomplete pre-install state must fail closed")


def test_context_reads_persisted_cfg_and_retains_only_hbnf_fields():
    original_get = module.get_json
    original_identity = module.read_matrix_identity
    requests = []
    identity = exact_identity()
    state = {"on": True, "HBNF": dict(BASELINE)}
    raw_cfg = {"wifi": {"psk": "never-retain-this"},
        "um": {"hbnfFoundationV1": dict(BASELINE)}}

    def get(url, timeout=4):
        requests.append(url)
        if url.endswith("/json/state"):
            return 200, b"{}", state
        if url == module.PERSISTED_CONFIG_URL:
            return 200, b"{}", raw_cfg
        raise AssertionError(f"unexpected GET endpoint: {url}")

    module.get_json = get
    module.read_matrix_identity = lambda _request_counter=None: identity
    try:
        context = module.read_matrix_context()
        assert context["persisted"] == BASELINE
        assert context["brightness"]["persisted"] == BASELINE
        assert "never-retain-this" not in repr(context)
        assert requests == [module.MATRIX+"/json/state", module.PERSISTED_CONFIG_URL]
    finally:
        module.get_json = original_get
        module.read_matrix_identity = original_identity


def test_identity_change_after_unknown_post_blocks_readback_acceptance():
    original_post = module.post_json
    original_get = module.get_json
    original_identity = module.read_matrix_identity
    calls = [0]
    posts = []
    good = exact_identity()

    def identity(_request_counter=None):
        calls[0] += 1
        if calls[0] <= 2:
            return good
        raise RuntimeError("qualification-matrix-identity-binding-failed")

    state = {"on": True, "HBNF": dict(BASELINE, matrixBrightness=44)}
    cfg = {"um": {"hbnfFoundationV1": dict(BASELINE, matrixBrightness=44)}}

    def get(url, timeout=4):
        if url.endswith("/json/state"):
            return 200, b"{}", state
        return 200, b"{}", cfg

    module.read_matrix_identity = identity
    def post(*args, **kwargs):
        posts.append((args, kwargs))
        raise TimeoutError("unknown POST")
    module.post_json = post
    module.get_json = get
    try:
        now = [0.0]
        try:
            module.change_matrix_brightness(BASELINE, operation="measure",
                sleeper=lambda seconds: now.__setitem__(0, now[0] + seconds), monotonic=lambda: now[0])
        except RuntimeError as exc:
            assert "brightness-measure-unverified" in str(exc)
            assert "identity-" in str(exc)
        else:
            raise AssertionError("identity change after uncertain POST must reject readback")
        assert len(posts) == 1 and calls[0] >= 3
    finally:
        module.post_json = original_post
        module.get_json = original_get
        module.read_matrix_identity = original_identity


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


def test_unverified_false_setup_and_restore_receipts_fail_closed():
    setup = FakePort(setup_readback={"verified": False})
    setup_result = run(setup)
    assert setup_result["status"] == "QUALIFICATION_BRIGHTNESS_SETUP_FAILED_NO_PROFILES"
    assert "worker" not in [event[0] for event in setup.events]
    assert "restore" in [event[0] for event in setup.events]

    restore = FakePort(restore_readback={"verified": False})
    restore_result = run(restore)
    assert restore_result["status"] == "QUALIFICATION_BRIGHTNESS_RESTORE_FAILED"
    assert "qualification" not in restore_result
    assert restore_result["captured_qualification_invalidated"]["profiles_not_accepted"] is True


def test_identity_mismatch_immediately_before_setup_and_restore_means_zero_posts():
    original_identity = module.read_matrix_identity
    original_post = module.post_json
    posts = []

    def identity_mismatch():
        raise RuntimeError("qualification-matrix-identity-binding-failed")

    module.read_matrix_identity = identity_mismatch
    module.post_json = lambda *args, **kwargs: posts.append((args, kwargs))
    try:
        for operation, target in (("measure", BASELINE), ("restore", BASELINE)):
            try:
                module.change_matrix_brightness(target, operation=operation)
            except RuntimeError as exc:
                assert "identity-binding-failed" in str(exc)
            else:
                raise AssertionError(f"{operation} must reject mismatched target identity")
        assert posts == []
    finally:
        module.read_matrix_identity = original_identity
        module.post_json = original_post


def main():
    for test in (
        test_post_timeout_is_resolved_by_readback_without_retry,
        test_unknown_post_outcome_without_matching_readback_fails_once,
        test_restore_persisted_mismatch_fails_even_when_runtime_restored,
        test_partial_readback_fails_and_does_not_create_profiles,
        test_invalid_baseline_rejected_after_admission_before_any_write,
        test_live_and_persisted_baseline_must_match_at_52,
        test_context_reads_persisted_cfg_and_retains_only_hbnf_fields,
        test_r4_context_accepts_missing_vibe_only_for_exact_r4,
        test_candidate_brightness_guard_preserves_postinstall_vibe,
        test_r4_missing_vibe_fails_before_any_brightness_write,
        test_preinstall_snapshot_captures_exact_renderer_and_ddp_state_without_secrets,
        test_invalid_admission_causes_zero_device_requests_and_writes,
        test_worker_exception_restores_baseline,
        test_restore_failure_invalidates_captured_profiles_and_never_passes,
        test_unverified_false_setup_and_restore_receipts_fail_closed,
        test_identity_mismatch_immediately_before_setup_and_restore_means_zero_posts,
        test_exact_r4_owner_settings_restore_is_one_matrix_brightness_write,
    ):
        test()
    print("PASS: brightness transaction preserves candidate Vibe, accepts the documented R4 missing-Vibe baseline, and fails closed before writes on incomplete candidate state")


if __name__ == "__main__":
    main()
