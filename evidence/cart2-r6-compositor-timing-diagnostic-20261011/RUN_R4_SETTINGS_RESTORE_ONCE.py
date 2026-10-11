#!/usr/bin/env python3
"""One exact settings-only cleanup after the diagnostic's R4 return."""
import datetime, hashlib, importlib.util, json, os, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "evidence/cart2-r6-compositor-timing-diagnostic-20261011"
OUT = EVIDENCE / "live-diagnostic"
STATE_PATH = ROOT / "config/HBNF_CONTROL_STATE.json"
R4 = "hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
R4_SHA = "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
R4_BIN = ROOT / "evidence/cart2-r7-performance-repair-20261009/artifact/hbnf-matrix-foundation-r4-exact.bin"
MATRIX = "http://192.168.77.10"
TARGET = {"matrixBrightness": 52, "auxBrightness": 245, "vibe": 2}
AUTH_ID = "OWNER-20261011-COMPOSITOR-TIMING-DIAGNOSTIC-01"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def save(path, value):
    path = pathlib.Path(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    with tmp.open("r+b") as stream:
        os.fsync(stream.fileno())
    tmp.replace(path)


def main():
    state = json.loads(STATE_PATH.read_text())
    auth = state.get("r4_owner_settings_restore_authorization", {})
    binding = state.get("live_authorization_binding", {})
    diag = state.get("r6_compositor_timing_diagnostic_authorization", {})
    if (state.get("lifecycle_state") != "PHASE2_INTEGRATING"
            or state.get("live_mutation_authorized") is not True
            or auth.get("authorization_id") != AUTH_ID
            or auth.get("authorization_consumed") is not False
            or auth.get("settings_writes_used") != 0
            or auth.get("target_settings") != TARGET
            or binding.get("authorization_id") != AUTH_ID
            or binding.get("candidate_release_id") != diag.get("candidate_release_id")
            or binding.get("candidate_bin_sha256") != diag.get("candidate_sha256")
            or diag.get("authorization_consumed") is not True
            or diag.get("install_attempts_used") != 1
            or diag.get("recovery_attempts_used") != 1
            or state.get("installed_release") != R4
            or state.get("installed_firmware_sha256") != R4_SHA):
        raise RuntimeError("exact one-use R4 settings restoration authorization/state mismatch")
    if hashlib.sha256(R4_BIN.read_bytes()).hexdigest() != R4_SHA:
        raise RuntimeError("exact R4 local artifact hash mismatch")

    adapter = load("r4_settings_adapter", ROOT / "scripts/hbnf_foundation_live_adapter.py")
    brightness = load("r4_settings_transaction", ROOT / "scripts/hbnf_r6_audio_cache_live_transaction.py")
    diagnostic = load("r4_settings_opal_preflight", ROOT / "scripts/hbnf_r6_frame_context_diagnostic_transaction.py")
    os.environ["HBNF_EXPECTED_RELEASE_ID"] = R4
    os.environ["HBNF_EXPECTED_FIRMWARE_SHA256"] = R4_SHA
    adapter.EXPECTED = R4

    # Fresh read-only checks immediately before consuming the single setting write.
    preflight = adapter.readonly_preflight("r4-owner-settings-restore-immediate", expected_brightness=None)
    if preflight.get("release_id") != R4 or preflight.get("matrix_brightness") != 44:
        raise RuntimeError("immediate Matrix R4/brightness preflight mismatch")
    _, _, state_json = brightness.get_json(MATRIX + "/json/state", timeout=4)
    _, _, raw_config = brightness.get_json(brightness.PERSISTED_CONFIG_URL, timeout=6)
    persisted = brightness.sanitized_persisted_hbnf(raw_config)
    runtime = {key: state_json.get("HBNF", {}).get(key)
               for key in ("matrixBrightness", "auxBrightness", "vibe")}
    if (state_json.get("on") is not True or runtime.get("matrixBrightness") != 44
            or runtime.get("auxBrightness") != 245 or persisted != {"matrixBrightness": 44, "auxBrightness": 245, "vibe": 2}):
        raise RuntimeError("immediate exact-current-settings mismatch; no write made")
    reads, _ = adapter._parallel_soak_reads("r4-owner-settings-restore-immediate-aux")
    bodies = {key: value for key, value in reads.items() if not key.startswith("_")}
    if not diagnostic.aux_ok(bodies):
        raise RuntimeError("immediate AUX native DDP preflight failed; no write made")
    opal = diagnostic.opal_readonly_preflight()
    power = subprocess.run(["pmset", "-g", "batt"], capture_output=True, text=True, timeout=5).stdout
    route = subprocess.run(["route", "-n", "get", "192.168.77.10"], capture_output=True, text=True, timeout=5).stdout
    if "AC Power" not in power or "interface: en0" not in route:
        raise RuntimeError("Mac power/LAN preflight failed; no write made")

    started = {"schema": "hbnf-r4-settings-restore-attempt-v1",
        "authorization_id": AUTH_ID, "started_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "release_id": R4, "firmware_sha256": R4_SHA, "matrix_mac": "70:4b:ca:5b:34:5c",
        "preflight_brightness": 44, "target_settings": TARGET, "firmware_uploads": 0,
        "settings_write_attempt": 1, "settings_write_limit": 1, "status": "ATTEMPT_CONSUMED_BEFORE_POST"}
    auth.update({"authorization_consumed": True, "settings_writes_used": 1,
        "attempt_started_at_utc": started["started_at_utc"], "status": "SETTINGS_WRITE_ATTEMPT_CONSUMED"})
    state["live_mutation_authorized"] = True
    state["status"] = "R4_SETTINGS_RESTORE_ATTEMPT_CONSUMED__READBACK_PENDING"
    state.setdefault("live_mutation_authorization", {}).update({
        "authorized": True, "hardware_writes_permitted_now": True,
        "operation_scope": "ONE_EXACT_R4_OWNER_SETTINGS_RESTORE_ONLY",
        "candidate_install_permitted": False, "current_gate": "Single Matrix settings write consumed; no firmware upload is in scope."})
    save(STATE_PATH, state)
    save(OUT / "R4_SETTINGS_RESTORE_STARTED.json", started)

    result = {"schema": "hbnf-r4-settings-restore-result-v1", **started,
        "preflight": {"matrix_aux": preflight, "runtime_settings": runtime,
            "persisted_settings": persisted, "opal": opal, "aux_ddp_verified": True,
            "on_ac": True, "lan_interface": "en0", "device_mutations_before_post": 0}}
    success = False
    try:
        result["settings_transaction"] = brightness.change_matrix_brightness(
            TARGET, operation="restore", expected_release=R4)
        post = adapter.readonly_preflight("r4-owner-settings-restore-postwrite", expected_brightness=52)
        if post.get("foundation_telemetry_enabled") is not False:
            raise RuntimeError("R4 returned with diagnostic telemetry enabled")
        reads, _ = adapter._parallel_soak_reads("r4-owner-settings-restore-postwrite-aux")
        bodies = {key: value for key, value in reads.items() if not key.startswith("_")}
        if not diagnostic.aux_ok(bodies):
            raise RuntimeError("AUX native DDP not verified after settings restore")
        result["postflight"] = {"matrix_aux": post, "aux_ddp_verified": True,
            "runtime_and_persisted_settings": result["settings_transaction"]["readback"],
            "firmware_uploads": 0}
        result["status"] = "PASS_EXACT_R4_SETTINGS_RESTORED__NO_FIRMWARE_UPLOAD"
        success = True
    except Exception as exc:
        result["status"] = "FAILED_NO_RETRY__EXACT_R4_REMAINS_INSTALLED"
        result["error"] = f"{type(exc).__name__}: {exc}"
    result["completed_at_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save(OUT / "R4_SETTINGS_RESTORE_RESULT.json", result)
    state = json.loads(STATE_PATH.read_text())
    auth = state["r4_owner_settings_restore_authorization"]
    auth.update({"status": result["status"], "completed_at_utc": result["completed_at_utc"],
        "result_path": "evidence/cart2-r6-compositor-timing-diagnostic-20261011/live-diagnostic/R4_SETTINGS_RESTORE_RESULT.json"})
    state["live_mutation_authorized"] = False
    state["live_mutation_authorization_closed_at_utc"] = result["completed_at_utc"]
    state.setdefault("live_mutation_authorization", {}).update({"authorized": False,
        "hardware_writes_permitted_now": False, "current_gate": result["status"]})
    state["status"] = result["status"]
    task = state.setdefault("current_task", {})
    task["status"] = result["status"]
    task["blockers"] = (["The exact compositor diagnostic failed the kernel-0 performance gate; no 28-kernel sweep, combined-feature qualification, 90-minute soak, or owner acceptance has completed."] if success else ["The exact compositor diagnostic failed performance; R4 is installed but exact owner settings restoration needs a new safe resolution."])
    state["last_updated_utc"] = result["completed_at_utc"]
    save(STATE_PATH, state)
    print(json.dumps({"status": result["status"], "firmware_uploads": 0,
        "settings_write_attempts": 1, "brightness": result.get("postflight", {}).get("matrix_aux", {}).get("matrix_brightness")}, sort_keys=True))
    return 0 if success else 2


if __name__ == "__main__":
    raise SystemExit(main())
