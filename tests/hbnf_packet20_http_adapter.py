#!/usr/bin/env python3
"""Pure/non-network tests for the Packet20 HTTP adapter candidate."""
import argparse
import importlib.util
import json
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]

def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module

adapter = load_module("packet20_adapter", ROOT / "tools/hbnf_packet20_http_adapter.py")
runner = load_module("live_sweep_runner", ROOT / "scripts/hbnf_live_kernel_sweep.py")

assert adapter.effect_to_kernel(220) == 0
assert adapter.effect_to_kernel(247) == 27
assert adapter.kernel_name(2) == "Parametric_Water"
assert adapter.kernel_name(3) == "RGB_Blobs5"
diagnostic_release = "hbnf-matrix-packet20-timing-hook-v1-20261004-r1"
assert adapter._require_release({"HBNF": {"candidate": diagnostic_release}}, diagnostic_release)["candidate"] == diagnostic_release
try:
    adapter._require_release({"HBNF": {"candidate": diagnostic_release}}, "wrong-release")
    raise AssertionError("wrong runtime release identity was accepted")
except adapter.AdapterError:
    pass
for bad in (219, 248):
    try:
        adapter.effect_to_kernel(bad)
        raise AssertionError(f"out-of-range effect accepted: {bad}")
    except adapter.AdapterError:
        pass

state = {
    "HBNF": {
        "candidate": adapter.EXPECTED_RELEASE_ID,
        "kernel": 2,
        "variantSignature": 0x504B2002,
        "companionRenderCount": 1234,
        "packet20Diagnostic": {
            "enabled": True,
            "selectedKernel": 2,
            "snapshotValid": True,
            "snapshotId": 7,
            "snapshotState": "READY",
            "snapshotGeneration": 7,
            "snapshotHash": 123456789,
            "restoreVerified": False,
            "lastCommand": "select",
            "lastCommandAccepted": True,
            "resetReasonCore0": 1,
            "resetReasonCore1": 1,
            "espResetReason": 1,
        },
        "timing": {
            "kernel": 2,
            "variantSignature": 0x504B2002,
            "wholeFrameUs": 85300,
            "kernelRenderUs": 68900,
            "audioModulationUs": 6700,
            "schedulerVariantUs": 1000,
            "paletteColorUs": 470,
            "overlayUs": 40,
            "companionPrepUs": 2100,
            "companionDdpSendUs": 2700,
            "unaccountedUs": 3000,
            "fps": 11.53,
            "freeHeap": 98700,
            "rssi": -45,
            "uptimeSec": 729,
        },
    }
}
matrix_info = {"ws": 0, "leds": {"fps": 11}}
aux_info = {"leds": {"fps": 11}}

receipt = adapter.snapshot_receipt(state)
assert receipt == {"snapshotId": 7, "snapshotHash": 123456789}

sample = adapter.normalize_telemetry(state, matrix_info, aux_info)
assert sample["release_id"] == adapter.EXPECTED_RELEASE_ID
assert sample["kernel_id"] == 2
assert sample["kernel_name"] == "Parametric_Water"
assert abs(sample["frame_ms_avg"] - 85.3) < 1e-9
assert abs(sample["kernel_ms_avg"] - 68.9) < 1e-9
assert abs(sample["palette_ms_avg"] - 0.47) < 1e-9
assert abs(sample["audio_ms_avg"] - 6.7) < 1e-9
assert abs(sample["aux_prepare_send_ms_avg"] - 4.8) < 1e-9
assert sample["aux_projection_active"] is True
assert sample["aux_render_fps"] == 11.0
assert sample["restart_count"] == 0
runner.validate_sample(sample, "diagnostic")

# AUX reachability is preserved as diagnostic evidence rather than hiding the
# Matrix sample.
sample_no_aux = adapter.normalize_telemetry(state, matrix_info, None)
assert sample_no_aux["aux_projection_active"] is False
assert sample_no_aux["aux_render_fps"] == 0.0
runner.validate_sample(sample_no_aux, "diagnostic")

# The generic runner calls snapshot a second time after restore. Verify that
# the adapter returns the immutable receipt without issuing another mutation
# only after firmware has reported a verified restore and exited diagnostics.
restored = json.loads(json.dumps(state))
restored["HBNF"]["packet20Diagnostic"]["enabled"] = False
restored["HBNF"]["packet20Diagnostic"]["restoreVerified"] = True
restored["HBNF"]["packet20Diagnostic"]["lastCommand"] = "restore"

original_get_state = adapter._get_state
original_post = adapter._post_packet20
try:
    adapter._get_state = lambda *_args, **_kwargs: restored
    def mutation_forbidden(*_args, **_kwargs):
        raise AssertionError("post-restore snapshot attempted a second mutation")
    adapter._post_packet20 = mutation_forbidden
    args = argparse.Namespace(
        matrix_url=adapter.DEFAULT_MATRIX_URL,
        aux_url=adapter.DEFAULT_AUX_URL,
        http_timeout=0.1,
        wait_seconds=0.1,
        expected_release_id=adapter.EXPECTED_RELEASE_ID,
    )
    assert adapter.command_snapshot(args) == receipt
finally:
    adapter._get_state = original_get_state
    adapter._post_packet20 = original_post

# The exact raw firmware response must survive before adapter validation. This
# keeps restoreVerified and failure/reset fields available to offline review.
restored = json.loads(json.dumps(state))
restored["HBNF"]["packet20Diagnostic"]["enabled"] = False
restored["HBNF"]["packet20Diagnostic"]["restoreVerified"] = True
restored["HBNF"]["packet20Diagnostic"]["lastCommand"] = "restore"
original_get_state = adapter._get_state
original_post = adapter._post_packet20
try:
    responses = iter((state, restored))
    adapter._get_state = lambda *_args, **_kwargs: next(responses)
    adapter._post_packet20 = lambda *_args, **_kwargs: None
    with tempfile.TemporaryDirectory() as td:
        snapshot_path = pathlib.Path(td) / "snapshot.json"
        raw_path = pathlib.Path(td) / "POST_RESTORE_RAW_STATE.json"
        snapshot_path.write_text(json.dumps(receipt))
        args = argparse.Namespace(
            matrix_url=adapter.DEFAULT_MATRIX_URL,
            http_timeout=0.1,
            wait_seconds=0.1,
            expected_release_id=adapter.EXPECTED_RELEASE_ID,
            snapshot=str(snapshot_path),
            raw_restore_state=str(raw_path),
        )
        assert adapter.command_restore(args) == receipt
        assert json.loads(raw_path.read_text()) == restored
        assert json.loads(raw_path.read_text())["HBNF"]["packet20Diagnostic"]["restoreVerified"] is True
finally:
    adapter._get_state = original_get_state
    adapter._post_packet20 = original_post

config = json.loads(
    (ROOT / "config/HBNF_PACKET20_LIVE_SWEEP_ADAPTER_20261004.json").read_text()
)
runner.validate_adapter(config)
diagnostic_config = json.loads(
    (ROOT / "config/HBNF_PACKET20_LIVE_SWEEP_ADAPTER_20261005.json").read_text()
)
runner.validate_adapter(diagnostic_config)
assert diagnostic_config["expected_release_id"] == diagnostic_release
assert diagnostic_config["timeout_seconds"] == 75
r2_config = json.loads(
    (ROOT / "config/HBNF_PACKET20_LIVE_SWEEP_ADAPTER_20261005_R2.json").read_text()
)
runner.validate_adapter(r2_config)
r2_release = "hbnf-matrix-packet20-timing-hook-v1-20261005-r2"
assert r2_config["expected_release_id"] == r2_release
assert r2_config["timeout_seconds"] == 75
for command_name in ("snapshot_argv", "select_argv", "telemetry_argv", "restore_argv"):
    assert r2_release in r2_config[command_name]
assert "{restore_raw_state}" in r2_config["restore_argv"]
inventory = json.loads(
    (ROOT / "config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json").read_text()
)
runner.validate_inventory(inventory)
assert inventory["entries"][0]["effect_id"] == 220
assert inventory["entries"][-1]["effect_id"] == 247

parsed = adapter.build_parser().parse_args(
    [
        "--matrix-url", "http://192.168.77.10",
        "--aux-url", "http://192.168.77.11",
        "--expected-release-id", diagnostic_release,
        "select", "--effect-id", "222",
    ]
)
assert parsed.command == "select"
assert parsed.effect_id == 222
assert parsed.expected_release_id == diagnostic_release

print(
    "PASS: Packet20 adapter mapping, diagnostic telemetry normalization, "
    "one-snapshot post-restore semantics, exact config, and 28-kernel inventory"
)
