#!/usr/bin/env python3
"""Single exact candidate install + frozen qualification coordinator.

The only live transport is the previously proven SSH-to-Opal staging followed
by Opal-origin WLED /update. The generic sweep/adapter remain authoritative
for renderer selection, telemetry, 28-kernel comparisons, soak, and restore.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import shlex
import subprocess
import sys
import time
from typing import NamedTuple

ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE = "hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010"
CANDIDATE_SHA = "f89a55fbc85b8ffda90390c18eb9b09e934e9e73db96884d712c033d4684a35b"
CANDIDATE_SIZE = 1497984
R4 = "hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
R4_SHA = "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
R4_SIZE = 1489008
MATRIX = "http://192.168.77.10"
AUX = "http://192.168.77.11"
MATRIX_MAC = "704bca5b345c"
AUX_MAC = "8c94df55c34c"
FROZEN_MATRIX_BRIGHTNESS = 44
QUALIFICATION_BASELINE_BRIGHTNESS = 52
CONFIG_SAVE_SETTLE_SECONDS = 1.25
BRIGHTNESS_READBACK_TIMEOUT_SECONDS = 6.0
BRIGHTNESS_READBACK_POLL_SECONDS = 0.25
OPAL = "root@192.168.77.1"
SSH = ["ssh", "-i", str(pathlib.Path.home()/".ssh/hbnf_opal_rsa"),
       "-o", "IdentitiesOnly=yes", "-o", "HostKeyAlgorithms=+ssh-rsa",
       "-o", "PubkeyAcceptedAlgorithms=+ssh-rsa", "-o", "PasswordAuthentication=no",
       "-o", "BatchMode=yes"]
BIN = ROOT/"evidence/cart2-r6-audio-cache-20261010/artifact/hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010.bin"
R4_BIN = ROOT/"evidence/cart2-r7-performance-repair-20261009/artifact/hbnf-matrix-foundation-r4-exact.bin"
ADAPTER = ROOT/"evidence/cart2-r6-audio-cache-20261010/R6_AUDIO_CACHE_LIVE_SWEEP_ADAPTER.json"
OUT = ROOT/"evidence/cart2-r6-audio-cache-20261010/live-qualification"

# Explicit successor fixture used by the offline transaction rehearsal. Live
# execution resolves the selected profile only from the checked workflow capsule.
SUCCESSOR_RELEASE = "hbnf-cart2-phase2-offline-wow-r6-neutral-audio-hue-radial-lazy-20261011"
SUCCESSOR_SHA = "36881ca6c13e813762f3bbf5193d599a5ec3f93bf197771ad0f4ea9156358187"
SUCCESSOR_SIZE = 1498832
SUCCESSOR_BIN = ROOT/"evidence/cart2-r6-neutral-audio-hue-radial-lazy-20261011/artifact/hbnf-cart2-phase2-offline-wow-r6-neutral-audio-hue-radial-lazy-20261011.bin"


class CandidateProfile(NamedTuple):
    release_id: str
    sha256: str
    size_bytes: int
    binary: pathlib.Path
    adapter: pathlib.Path
    output: pathlib.Path
    rollback_binary: pathlib.Path = R4_BIN
    rollback_sha256: str = R4_SHA
    rollback_size_bytes: int = R4_SIZE


LEGACY_R6_PROFILE = CandidateProfile(RELEASE,CANDIDATE_SHA,CANDIDATE_SIZE,BIN,ADAPTER,OUT)
SUCCESSOR_PROFILE = CandidateProfile(
    SUCCESSOR_RELEASE,SUCCESSOR_SHA,SUCCESSOR_SIZE,SUCCESSOR_BIN,
    ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_NEUTRAL_AUDIO_HUE_RADIAL_LAZY_20261011.json",
    ROOT/"evidence/cart2-r6-neutral-audio-hue-radial-lazy-20261011/live-qualification")


def load_candidate_profile(capsule_path: pathlib.Path) -> CandidateProfile:
    """Resolve the candidate pinned by the checked Phase 2 workflow capsule."""
    capsule=json.loads(pathlib.Path(capsule_path).read_text())
    if capsule.get("schema")!="local-roots-execution-capsule-v1" or capsule.get("workflow_id")!="phase2-live-qualification":
        raise RuntimeError("phase2-candidate-capsule-required")
    source=capsule.get("workflow_source",{})
    workflow_path=ROOT/"platform/workflows/phase2-live-qualification.json"
    if (source.get("path")!="platform/workflows/phase2-live-qualification.json"
        or source.get("sha256")!=sha(workflow_path)):
        raise RuntimeError("phase2-workflow-capsule-binding-mismatch")
    workflow=json.loads(workflow_path.read_text())
    contract=workflow.get("qualification_contract",{})
    release=contract.get("candidate_release")
    candidate_sha=contract.get("candidate_sha256")
    candidate_size=contract.get("candidate_size_bytes")
    candidate_path=contract.get("candidate_bin_path")
    adapter_path=contract.get("foundation_adapter_path")
    output_path=contract.get("qualification_output_path")
    if (not isinstance(release,str) or not re.fullmatch(r"[A-Za-z0-9._-]+",release)
        or not isinstance(candidate_sha,str) or not re.fullmatch(r"[a-f0-9]{64}",candidate_sha)
        or not isinstance(candidate_size,int) or candidate_size<=0
        or not isinstance(candidate_path,str) or not isinstance(adapter_path,str) or not isinstance(output_path,str)):
        raise RuntimeError("phase2-workflow-candidate-profile-invalid")
    if (contract.get("recovery_release")!=R4 or contract.get("install_limit")!=1
        or contract.get("rollback_limit")!=1 or contract.get("thresholds_may_be_weakened") is not False):
        raise RuntimeError("phase2-workflow-frozen-transaction-contract-invalid")
    candidate_bin=(ROOT/candidate_path).resolve()
    adapter=(ROOT/adapter_path).resolve()
    output=(ROOT/output_path).resolve()
    try:
        candidate_bin.relative_to(ROOT.resolve()); adapter.relative_to(ROOT.resolve()); output.relative_to(ROOT.resolve())
    except ValueError as exc:
        raise RuntimeError("phase2-workflow-candidate-path-escapes-repository") from exc
    profile=CandidateProfile(release,candidate_sha,candidate_size,candidate_bin,adapter,
        output)
    expected_recovery=contract.get("recovery_sha256")
    expected_recovery_path=contract.get("recovery_bin_path")
    if (expected_recovery!=profile.rollback_sha256
        or expected_recovery_path!=str(profile.rollback_binary.relative_to(ROOT))):
        raise RuntimeError("phase2-workflow-recovery-profile-mismatch")
    adapter_doc=json.loads(adapter.read_text())
    if adapter_doc.get("schema")!="hbnf-live-sweep-adapter-v1":
        raise RuntimeError("phase2-workflow-adapter-schema-mismatch")
    argv_lists=[value for key,value in adapter_doc.items() if key.endswith("_argv") and isinstance(value,list)]
    expected_id=f"HBNF_EXPECTED_RELEASE_ID={profile.release_id}"
    expected_sha=f"HBNF_EXPECTED_FIRMWARE_SHA256={profile.sha256}"
    if (not argv_lists or any(expected_id not in argv or expected_sha not in argv for argv in argv_lists)):
        raise RuntimeError("phase2-workflow-adapter-candidate-mismatch")
    return profile


def verify_candidate_binding(admission: dict, profile: CandidateProfile) -> None:
    ids=admission.get("identities",{})
    if (ids.get("candidate_release_id")!=profile.release_id
        or ids.get("candidate_bin_sha256")!=profile.sha256
        or pathlib.Path(ids.get("candidate_bin_path","")).resolve()!=profile.binary.resolve()
        or ids.get("candidate_bin_size_bytes")!=profile.size_bytes
        or ids.get("rollback_bin_sha256")!=profile.rollback_sha256
        or pathlib.Path(ids.get("rollback_bin_path","")).resolve()!=profile.rollback_binary.resolve()
        or str(ids.get("matrix_mac","")).replace(":","").lower()!=MATRIX_MAC):
        raise RuntimeError("admission-artifact-target-binding-mismatch")
    if (sha(profile.binary)!=profile.sha256 or profile.binary.stat().st_size!=profile.size_bytes
        or sha(profile.rollback_binary)!=profile.rollback_sha256
        or profile.rollback_binary.stat().st_size!=profile.rollback_size_bytes):
        raise RuntimeError("candidate-or-recovery-artifact-bytes-mismatch")


def sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(argv, timeout=30, input_bytes=None):
    return subprocess.run(argv, input=input_bytes, capture_output=True, timeout=timeout)


def get_json(url: str, timeout: float = 4, request_counter=None):
    import urllib.request
    if request_counter is not None:
        request_counter()
    req = urllib.request.Request(url, headers={"Cache-Control": "no-store"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read()
        return response.status, raw, json.loads(raw)


def post_json(url: str, payload: dict, timeout: float = 10, request_counter=None):
    """Issue one JSON mutation. Callers must resolve timeouts by readback, never resend blindly."""
    import urllib.request
    if request_counter is not None:
        request_counter()
    req = urllib.request.Request(url, data=json.dumps(payload, separators=(",", ":")).encode(),
        headers={"Content-Type": "application/json", "Cache-Control": "no-store"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read()
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except Exception as exc:
            raise RuntimeError(f"POST {url} returned invalid JSON: {type(exc).__name__}: {exc}") from exc


PERSISTED_CONFIG_URL = MATRIX+"/edit?func=download&path=%2Fcfg.json"


def _get_json_counted(url, timeout, request_counter):
    if request_counter is None:
        return get_json(url, timeout=timeout)
    return get_json(url, timeout=timeout, request_counter=request_counter)


def _post_json_counted(url, payload, request_counter):
    if request_counter is None:
        return post_json(url, payload)
    return post_json(url, payload, request_counter=request_counter)


def read_matrix_identity(request_counter=None, expected_release=RELEASE):
    """Read and validate the exact R6 Matrix identity without retaining unrelated config data."""
    info = _get_json_counted(MATRIX+"/json/info", 4, request_counter)[2]
    build = _get_json_counted(MATRIX+"/hbnf/build.json", 4, request_counter)[2]
    identity = {"ip": info.get("ip"), "mac": str(info.get("mac", "")).replace(":", "").lower(),
        "wled": info.get("ver"), "release_id": build.get("release_id"),
        "candidate": build.get("candidate"), "build_mac": str(build.get("mac", "")).replace(":", "").lower()}
    if (identity["ip"] != "192.168.77.10" or identity["mac"] != MATRIX_MAC or identity["wled"] != "16.0.1"
            or identity["release_id"] != expected_release or identity["candidate"] != expected_release or identity["build_mac"] != MATRIX_MAC):
        raise RuntimeError("qualification-matrix-identity-binding-failed")
    return identity, info, build


def _read_expected_matrix_identity(request_counter, expected_release):
    # Keep the legacy default call shape stable for existing adapters/tests
    # that wrap read_matrix_identity with its original one-argument contract.
    if expected_release == RELEASE:
        return read_matrix_identity(request_counter) if request_counter is not None else read_matrix_identity()
    return read_matrix_identity(request_counter, expected_release) if request_counter is not None else read_matrix_identity(expected_release=expected_release)


def sanitized_persisted_hbnf(config: dict, *, allow_missing_vibe: bool = False) -> dict:
    """Retain HBNF settings only; R4 may legitimately omit Vibe from saved config."""
    um = config.get("um") if isinstance(config, dict) else None
    hbnf = um.get("hbnfFoundationV1") if isinstance(um, dict) else None
    if not isinstance(hbnf, dict):
        raise RuntimeError("persisted-config-missing-HBNF-settings")
    values = {key: hbnf.get(key) for key in ("matrixBrightness", "auxBrightness")}
    if "vibe" in hbnf:
        values["vibe"] = hbnf.get("vibe")
    if any(type(value) is not int for value in values.values()):
        raise RuntimeError("persisted-config-HBNF-settings-partial-or-invalid")
    if not allow_missing_vibe and "vibe" not in values:
        raise RuntimeError("persisted-config-HBNF-settings-partial-or-invalid")
    return values


def brightness_readback(state: dict, persisted: dict) -> dict:
    """Return only runtime and persisted HBNF settings; never retain full cfg secrets."""
    h = state.get("HBNF") if isinstance(state, dict) else None
    if not isinstance(h, dict) or not isinstance(persisted, dict):
        raise RuntimeError("brightness-readback-missing-HBNF-runtime-or-persisted-config")
    runtime = {key: h.get(key) for key in ("matrixBrightness", "auxBrightness", "vibe")}
    stored = dict(persisted)
    if any(type(v) is not int for v in runtime.values()) or any(type(v) is not int for v in stored.values()):
        raise RuntimeError("brightness-readback-partial-or-invalid-HBNF-values")
    return {"matrix_on": state.get("on") is True, "runtime": runtime, "persisted": stored}


def validate_brightness_baseline(state: dict, persisted: dict) -> dict:
    values = brightness_readback(state, persisted)
    if values["matrix_on"] is not True:
        raise RuntimeError("qualification-baseline-matrix-output-off")
    if values["runtime"]["matrixBrightness"] != QUALIFICATION_BASELINE_BRIGHTNESS:
        raise RuntimeError("qualification-baseline-runtime-brightness-mismatch")
    if values["persisted"]["matrixBrightness"] != QUALIFICATION_BASELINE_BRIGHTNESS:
        raise RuntimeError("qualification-baseline-config-brightness-mismatch")
    if values["runtime"] != values["persisted"]:
        raise RuntimeError("qualification-baseline-runtime-config-mismatch")
    return values


def validate_candidate_brightness_baseline(state: dict, persisted: dict,
                                          expected_matrix_brightness=None,
                                          authorized_runtime_vibe=None) -> dict:
    """Allow one legacy-config migration before qualification; require all values thereafter."""
    values = brightness_readback(state, persisted)
    if values["matrix_on"] is not True:
        raise RuntimeError("qualification-baseline-matrix-output-off")
    runtime = values["runtime"]
    stored = values["persisted"]
    if any(type(runtime.get(key)) is not int for key in ("matrixBrightness", "auxBrightness", "vibe")):
        raise RuntimeError("qualification-baseline-runtime-settings-partial-or-invalid")
    if not 0 <= runtime["vibe"] <= 5:
        raise RuntimeError("qualification-baseline-runtime-vibe-invalid")
    if any(type(stored.get(key)) is not int for key in ("matrixBrightness", "auxBrightness")):
        raise RuntimeError("qualification-baseline-config-settings-partial-or-invalid")
    if (runtime["matrixBrightness"] != stored["matrixBrightness"] or
        (expected_matrix_brightness is not None and
        (runtime["matrixBrightness"] != expected_matrix_brightness
         or stored["matrixBrightness"] != expected_matrix_brightness))):
        raise RuntimeError("qualification-baseline-matrix-brightness-mismatch")
    if runtime["auxBrightness"] != stored["auxBrightness"]:
        raise RuntimeError("qualification-baseline-aux-brightness-mismatch")
    vibe_persistence="verified"
    if "vibe" in stored:
        if type(stored["vibe"]) is not int or not 0 <= stored["vibe"] <= 5:
            raise RuntimeError("qualification-baseline-vibe-invalid")
        if stored["vibe"] != runtime["vibe"]:
            # Permit only the exact, explicitly authorized runtime Vibe to be
            # repaired by the already-admitted settings transaction. Keep the
            # mismatch visible in the receipt and require a verified write
            # before any qualification profile starts.
            if authorized_runtime_vibe is None or runtime["vibe"] != authorized_runtime_vibe:
                raise RuntimeError("qualification-baseline-vibe-mismatch")
            vibe_persistence="authorized_restore_required"
    else:
        vibe_persistence="one_brightness_write_must_persist_runtime_vibe"
    return {**values, "vibe_persistence": vibe_persistence}


def validate_preinstall_brightness_baseline(state: dict, persisted: dict) -> dict:
    """Capture R4's owner settings when its runtime omits the Vibe field.

    R4 exposes Matrix/AUX brightness at runtime, while persisted HBNF config is
    authoritative for Vibe until the successor exposes all three runtime
    values. The qualification runner later verifies the full runtime/config
    equality on the candidate before accepting any profile.
    """
    runtime_state=state.get("HBNF",{}) if isinstance(state,dict) else {}
    runtime={"matrixBrightness":runtime_state.get("matrixBrightness"),
        "auxBrightness":runtime_state.get("auxBrightness")}
    stored=dict(persisted)
    if "vibe" in stored:
        runtime["vibe"] = stored["vibe"]
    if any(type(value) is not int for value in runtime.values()) or any(type(value) is not int for value in stored.values()):
        raise RuntimeError("preinstall-brightness-baseline-partial-or-invalid")
    for key in ("matrixBrightness","auxBrightness"):
        if runtime[key]!=stored.get(key):
            raise RuntimeError("preinstall-brightness-runtime-config-mismatch:"+key)
    if not 0 <= runtime["matrixBrightness"] <= 255 or not 0 <= runtime["auxBrightness"] <= 255:
        raise RuntimeError("preinstall-owner-brightness-out-of-range")
    values={"matrix_on":state.get("on") is True,"runtime":runtime,"persisted":stored}
    if values["matrix_on"] is not True:
        raise RuntimeError("preinstall-matrix-output-off")
    values["runtime_observation"]={"runtime_fields":["matrixBrightness","auxBrightness"],
        "vibe_source":"persisted_config_only_on_exact_R4" if "vibe" in stored else "unavailable_on_exact_R4"}
    return values


def capture_owner_state_snapshot(matrix_state: dict, aux_state: dict, matrix_info: dict,
                                 aux_info: dict, matrix_identity: dict,
                                 aux_identity: dict, brightness_baseline: dict) -> dict:
    """Retain the exact pre-install renderer/output state without config secrets."""
    matrix_fields = ("on", "bri", "transition", "ps", "pl", "mainseg", "seg", "nl", "lor")
    aux_fields = ("on", "bri", "transition", "ps", "pl", "mainseg", "seg", "nl", "lor")
    matrix_runtime = {key: matrix_state[key] for key in matrix_fields if key in matrix_state}
    aux_runtime = {key: aux_state[key] for key in aux_fields if key in aux_state}
    if type(matrix_runtime.get("on")) is not bool or type(aux_runtime.get("on")) is not bool:
        raise RuntimeError("preinstall-renderer-snapshot-missing-output-state")
    if not isinstance(matrix_runtime.get("seg"), list) or not isinstance(aux_runtime.get("seg"), list):
        raise RuntimeError("preinstall-renderer-snapshot-missing-segments")
    return {
        "matrix": {
            "identity": matrix_identity,
            "uptime_seconds": matrix_info.get("uptime"),
            "free_heap": matrix_info.get("freeheap"),
            "fps": matrix_info.get("leds", {}).get("fps"),
            "runtime": matrix_runtime,
            "hbnf_brightness": brightness_baseline["runtime"],
            "persisted_hbnf_brightness": brightness_baseline["persisted"],
        },
        "aux": {
            "identity": aux_identity,
            "runtime": aux_runtime,
            "ddp": {key: aux_info.get(key) for key in ("live", "lm", "lip", "leds") if key in aux_info},
        },
    }


def read_matrix_context(request_counter=None, expected_release=RELEASE,
                        expected_matrix_brightness=None, authorized_runtime_vibe=None):
    identity_before, info, build = _read_expected_matrix_identity(request_counter,expected_release)
    state = _get_json_counted(MATRIX+"/json/state", 4, request_counter)[2]
    # The read-only file API is parsed in memory; only HBNF brightness/AUX/vibe
    # fields survive extraction, regardless of whether the target requires a PIN.
    persisted_raw = _get_json_counted(PERSISTED_CONFIG_URL, 6, request_counter)[2]
    # R4 never serialized Vibe; a new candidate can also inherit that config.
    # Candidate qualification accepts this only as a migration precondition,
    # then requires the brightness write to persist and verify the runtime Vibe.
    persisted = sanitized_persisted_hbnf(persisted_raw, allow_missing_vibe=True)
    identity_after, _, _ = _read_expected_matrix_identity(request_counter,expected_release)
    if identity_before != identity_after:
        raise RuntimeError("qualification-matrix-identity-changed-during-readback")
    brightness=(validate_preinstall_brightness_baseline(state,persisted)
        if expected_release==R4 else validate_candidate_brightness_baseline(
        state,persisted,expected_matrix_brightness,authorized_runtime_vibe))
    return {"identity": identity_after, "info": info, "build": build, "state": state,
        "persisted": persisted, "brightness": brightness}


def read_failed_candidate_recovery_context(request_counter, candidate, owner_brightness_baseline):
    """Read the exact current candidate state and bind recovery to captured owner brightness."""
    identity_before, info, build = _read_expected_matrix_identity(request_counter, candidate.release_id)
    state = _get_json_counted(MATRIX+"/json/state", 4, request_counter)[2]
    persisted_raw = _get_json_counted(PERSISTED_CONFIG_URL, 6, request_counter)[2]
    persisted = sanitized_persisted_hbnf(persisted_raw, allow_missing_vibe=True)
    identity_after, _, _ = _read_expected_matrix_identity(request_counter, candidate.release_id)
    h = state.get("HBNF", {})
    runtime = {key: h.get(key) for key in ("matrixBrightness", "auxBrightness", "vibe")}
    expected_runtime = dict(owner_brightness_baseline or {})
    expected_persisted = dict(owner_brightness_baseline or {})
    if (identity_before != identity_after or state.get("on") is not True
        or identity_after.get("mac") != MATRIX_MAC or info.get("ver") != "16.0.1"
        or build.get("release_id") != candidate.release_id or build.get("candidate") != candidate.release_id
        or h.get("candidate") != candidate.release_id or not expected_runtime
        or any(runtime.get(key) != value for key, value in expected_runtime.items())
        or any(persisted.get(key) != value for key, value in expected_persisted.items())
        or h.get("packet20Diagnostic", {}).get("enabled") is not False
        or h.get("foundationTelemetry", {}).get("enabled") is not False):
        raise RuntimeError("failed-candidate-recovery-state-or-owner-brightness-differs-from-captured-baseline")
    return {"identity": identity_after, "info": info, "build": build, "state": state,
        "runtime": runtime, "persisted": persisted}


def read_matrix_brightness_pair(request_counter=None, expected_release=RELEASE,
                                expected_matrix_brightness=QUALIFICATION_BASELINE_BRIGHTNESS):
    context = read_matrix_context(request_counter,expected_release,expected_matrix_brightness)
    result = context["brightness"]
    result["identity"] = context["identity"]
    return result


def _read_expected_matrix_brightness_pair(request_counter, expected_release,
                                          expected_matrix_brightness=QUALIFICATION_BASELINE_BRIGHTNESS):
    if expected_release == RELEASE:
        return (read_matrix_brightness_pair(request_counter,expected_matrix_brightness=expected_matrix_brightness)
            if request_counter is not None else read_matrix_brightness_pair(expected_matrix_brightness=expected_matrix_brightness))
    return (read_matrix_brightness_pair(request_counter,expected_release,expected_matrix_brightness)
        if request_counter is not None else read_matrix_brightness_pair(expected_release=expected_release,
            expected_matrix_brightness=expected_matrix_brightness))


def _read_candidate_settings_for_restore(request_counter, expected_release):
    """Read candidate HBNF settings without rejecting the mismatch restoration must repair."""
    identity_before, _, _ = _read_expected_matrix_identity(request_counter, expected_release)
    state = _get_json_counted(MATRIX+"/json/state", 4, request_counter)[2]
    persisted_raw = _get_json_counted(PERSISTED_CONFIG_URL, 6, request_counter)[2]
    persisted = sanitized_persisted_hbnf(persisted_raw)
    identity_after, _, _ = _read_expected_matrix_identity(request_counter, expected_release)
    if identity_before != identity_after:
        raise RuntimeError("qualification-matrix-identity-changed-during-restore-readback")
    values = brightness_readback(state, persisted)
    values["identity"] = identity_after
    return values


def change_matrix_brightness(target: dict, *, operation: str, sleeper=time.sleep,
                             monotonic=time.monotonic, request_counter=None,
                             expected_release=RELEASE) -> dict:
    """Set the frozen test brightness or restore captured HBNF settings, resolving uncertain POSTs by readback."""
    if operation == "measure":
        if (not isinstance(target, dict) or type(target.get("matrixBrightness")) is not int
            or not 0 <= target["matrixBrightness"] <= 255):
            raise RuntimeError("qualification-baseline-receipt-invalid")
        if any(type(v) is not int for v in target.values()):
            raise RuntimeError("qualification-baseline-receipt-invalid")
        requested = {"matrixBrightness": FROZEN_MATRIX_BRIGHTNESS}
        target_brightness = FROZEN_MATRIX_BRIGHTNESS
    elif operation == "restore":
        if (not isinstance(target, dict) or type(target.get("matrixBrightness")) is not int
            or not 0 <= target["matrixBrightness"] <= 255):
            raise RuntimeError("qualification-baseline-receipt-invalid")
        if any(type(v) is not int for v in target.values()):
            raise RuntimeError("qualification-baseline-receipt-invalid")
        if ("auxBrightness" in target and not 0 <= target["auxBrightness"] <= 255) or (
            "vibe" in target and not 0 <= target["vibe"] <= 5):
            raise RuntimeError("qualification-baseline-receipt-invalid")
        # Full captured owner baselines include AUX brightness and Vibe. Restore
        # those fields together because qualification intentionally changes Vibe;
        # requiring runtime/config Vibe equality before this write made the exact
        # mismatch the restore is meant to repair impossible to recover from.
        requested = ({key: target[key] for key in ("matrixBrightness", "auxBrightness", "vibe")}
            if expected_release != R4 and all(key in target for key in ("matrixBrightness", "auxBrightness", "vibe"))
            else {"matrixBrightness": target["matrixBrightness"]})
        target_brightness = target["matrixBrightness"]
    else:
        raise RuntimeError("unknown-qualification-brightness-operation")

    # Rebind both candidate identity and all current persisted HBNF settings before
    # the brightness-only write. R4 does not persist Vibe, so preserve the exact
    # installed candidate's Vibe instead of inferring it from the R4 baseline.
    identity_before_post, _, _ = _read_expected_matrix_identity(request_counter,expected_release)
    expected_before = target["matrixBrightness"] if operation == "measure" else None
    full_candidate_restore = operation == "restore" and expected_release != R4 and "vibe" in requested
    before = (_read_candidate_settings_for_restore(request_counter, expected_release)
        if full_candidate_restore else
        _read_expected_matrix_brightness_pair(request_counter,expected_release,expected_before))
    if before.get("identity") != identity_before_post or before.get("matrix_on") is not True:
        raise RuntimeError("qualification-brightness-prewrite-identity-or-output-mismatch")
    runtime = before.get("runtime", {})
    persisted = before.get("persisted", {})
    required_settings = ("matrixBrightness", "auxBrightness", "vibe")
    if full_candidate_restore:
        if (any(type(runtime.get(key)) is not int for key in required_settings)
            or any(type(persisted.get(key)) is not int for key in required_settings)
            or not 0 <= runtime["vibe"] <= 5 or not 0 <= persisted["vibe"] <= 5
            or runtime["auxBrightness"] != target["auxBrightness"]
            or persisted["auxBrightness"] != target["auxBrightness"]
            or runtime["matrixBrightness"] != persisted["matrixBrightness"]
            or runtime["matrixBrightness"] not in (target_brightness, FROZEN_MATRIX_BRIGHTNESS)):
            raise RuntimeError("qualification-owner-settings-restore-prewrite-state-unsafe")
    missing_vibe_migration = "vibe" not in persisted and operation == "measure"
    if not full_candidate_restore and (any(type(runtime.get(key)) is not int for key in required_settings)
            or not 0 <= runtime.get("vibe", -1) <= 5
            or any(type(persisted.get(key)) is not int for key in required_settings if key in persisted)
            or any(runtime.get(key) != persisted.get(key) for key in required_settings if key in persisted)
            or ("vibe" in persisted and not 0 <= persisted["vibe"] <= 5)
            or ("vibe" not in persisted and not missing_vibe_migration)):
        raise RuntimeError("qualification-brightness-prewrite-settings-incomplete-or-mismatched")
    if expected_before is not None and runtime["matrixBrightness"] != expected_before:
        raise RuntimeError("qualification-brightness-prewrite-level-mismatch")
    expected_settings = dict(requested) if full_candidate_restore else dict(runtime)
    expected_settings["matrixBrightness"] = target_brightness
    payload = {"HBNF": requested}
    post_error = None
    try:
        # Exactly one POST. A timeout has an unknown outcome; resolve only with readback.
        _post_json_counted(MATRIX+"/json/state", payload, request_counter)
    except Exception as exc:
        post_error = f"{type(exc).__name__}: {exc}"

    deadline = monotonic()+BRIGHTNESS_READBACK_TIMEOUT_SECONDS
    last_error = None
    while monotonic() <= deadline:
        try:
            values = (_read_candidate_settings_for_restore(request_counter, expected_release)
                if full_candidate_restore else
                _read_expected_matrix_brightness_pair(request_counter,expected_release,target_brightness))
            if values.get("identity") != identity_before_post:
                raise RuntimeError("qualification-matrix-identity-changed-before-readback")
            expected_runtime = dict(expected_settings)
            expected_persisted = dict(expected_settings)
            if values["matrix_on"] is True and all(values["runtime"].get(k) == v for k, v in expected_runtime.items()) and all(
                    values["persisted"].get(k) == v for k, v in expected_persisted.items()):
                # HBNF defers dirty marking for 850 ms after /json/state; wait beyond it,
                # then take a second readback before starting profiles or closing restore.
                sleeper(CONFIG_SAVE_SETTLE_SECONDS)
                final = (_read_candidate_settings_for_restore(request_counter, expected_release)
                    if full_candidate_restore else
                    _read_expected_matrix_brightness_pair(request_counter,expected_release,target_brightness))
                if final.get("identity") != identity_before_post:
                    raise RuntimeError("qualification-matrix-identity-changed-before-final-readback")
                if not (final["matrix_on"] is True and all(final["runtime"].get(k) == v for k, v in expected_runtime.items()) and all(
                        final["persisted"].get(k) == v for k, v in expected_persisted.items())):
                    raise RuntimeError("qualification-brightness-post-settle-readback-mismatch")
                return {"operation": operation, "target_matrix_brightness": target_brightness,
                    "requested_hbnf": requested, "post_outcome": "UNKNOWN_RESOLVED_BY_READBACK" if post_error else "RESPONSE_RECEIVED",
                    "post_error": post_error, "save_settle_seconds": CONFIG_SAVE_SETTLE_SECONDS,
                    "readback": final, "verified": True,
                    "identity_before_post": identity_before_post,
                    "readback_endpoints": ["GET /json/info", "GET /hbnf/build.json", "GET /json/state", PERSISTED_CONFIG_URL],
                    "persisted_readback_semantics": "Raw /cfg.json is parsed in memory; only HBNF brightness/AUX/vibe fields are retained; raw config is not logged or saved",
                    "vibe_config_migration": "verified_by_post_write_readback" if missing_vibe_migration else "not_needed"}
            last_error = "qualification-brightness-readback-mismatch"
        except Exception as exc:
            last_error = f"{type(exc).__name__}: {exc}"
        if monotonic() >= deadline:
            break
        sleeper(min(BRIGHTNESS_READBACK_POLL_SECONDS, max(0.0, deadline-monotonic())))
    raise RuntimeError(f"qualification-brightness-{operation}-unverified; post_error={post_error}; readback={last_error}")


def save(path: pathlib.Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix+".tmp")
    tmp.write_text(json.dumps(value, indent=2, sort_keys=True)+"\n")
    os.replace(tmp, path)


def exact_artifacts(profile=LEGACY_R6_PROFILE):
    if sha(profile.binary) != profile.sha256 or profile.binary.stat().st_size != profile.size_bytes:
        raise RuntimeError("candidate-byte-identity-failed")
    if sha(profile.rollback_binary) != profile.rollback_sha256 or profile.rollback_binary.stat().st_size != profile.rollback_size_bytes:
        raise RuntimeError("r4-recovery-byte-identity-failed")


def check_admission(admission_path: pathlib.Path, capsule_path: pathlib.Path, proof_path: pathlib.Path, stage="LIVE_APPROVED", profile=None):
    # This is deliberately before any LAN/router/device request.
    control = run([sys.executable, str(ROOT/"scripts/hbnf_control.py"), "check-admission",
                   "--admission", str(admission_path), "--stage", stage], timeout=20)
    if control.returncode:
        raise RuntimeError(stage.lower()+"-admission-rejected-before-device-request:"+control.stdout.decode(errors="replace")[-1200:])
    for argv in ([sys.executable, str(ROOT/"scripts/platform.py"), "check-capsule", "--capsule", str(capsule_path)],
                 [sys.executable, str(ROOT/"scripts/platform.py"), "prelive-check", "--capsule", str(capsule_path), "--proof", str(proof_path)]):
        result = run(list(argv), timeout=20)
        if result.returncode:
            raise RuntimeError("capsule-or-prelive-proof-rejected-before-device-request:"+result.stdout.decode(errors="replace")[-1200:])
    admission = json.loads(admission_path.read_text())
    selected=profile or load_candidate_profile(capsule_path)
    verify_candidate_binding(admission,selected)
    return admission


def single_worker_check():
    p = run(["ps", "-axo", "pid=,ppid=,command="], timeout=5)
    text = p.stdout.decode(errors="replace")
    needles = ("hbnf_live_kernel_sweep.py", "hbnf_r6_audio_cache_live_transaction.py",
               "hbnf_foundation_continuous_soak.py", "hbnf_r6_frame_context_diagnostic_transaction.py")
    rows = {}
    for line in text.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
            rows[int(parts[0])] = (int(parts[1]), parts[2].lower())
    ancestors = {os.getpid()}
    cursor = os.getpid()
    while cursor in rows and rows[cursor][0] not in ancestors:
        cursor = rows[cursor][0]
        ancestors.add(cursor)
    conflicts = [pid for pid, (_, cmd) in rows.items()
                 if pid not in ancestors and any(x in cmd for x in needles)]
    if conflicts:
        raise RuntimeError("another-live-cart-worker-is-running")
    return {"pass": True, "conflicting_pids": [], "worker_count": 1}


def preflight(profile=LEGACY_R6_PROFILE, request_counter=None):
    exact_artifacts(profile)
    power = run(["pmset", "-g", "batt"], timeout=5).stdout.decode(errors="replace")
    route = run(["route", "-n", "get", "192.168.77.10"], timeout=5).stdout.decode(errors="replace")
    if "AC Power" not in power or "interface: en0" not in route:
        raise RuntimeError("host-power-or-cart-lan-preflight-failed")
    matrix_context=read_matrix_context(request_counter,expected_release=R4)
    mi=matrix_context["info"]; ms=matrix_context["state"]; mb=matrix_context["build"]
    ai = _get_json_counted(AUX+"/json/info",4,request_counter)[2]
    ast = _get_json_counted(AUX+"/json/state",4,request_counter)[2]
    h = ms.get("HBNF", {})
    p20 = h.get("packet20Diagnostic", {})
    telem = h.get("foundationTelemetry", {})
    expected = (mi.get("ip") == "192.168.77.10" and mi.get("mac", "").replace(":", "").lower() == MATRIX_MAC
                and mi.get("ver") == "16.0.1" and mb.get("release_id") == R4 and mb.get("candidate") == R4
                and h.get("candidate") == R4 and ms.get("on") is True
                and p20.get("enabled") is False and telem.get("enabled") is False)
    aux_ok = (ai.get("ip") == "192.168.77.11" and ai.get("mac", "").replace(":", "").lower() == AUX_MAC
              and ai.get("ver") == "16.0.1" and ai.get("live") is True and ai.get("lm") == "DDP"
              and ai.get("lip") == "192.168.77.10" and ai.get("leds", {}).get("count") == 22
              and ast.get("on") is True and ast.get("lor") == 0)
    if not expected or not aux_ok:
        raise RuntimeError("fresh-matrix-r4-or-aux-ddp-preflight-failed")
    brightness_baseline=matrix_context["brightness"]
    worker = single_worker_check()
    opal = ("set -e; printf OPAL_PREFLIGHT_OK\\n; uptime; df -k /tmp; command -v curl; command -v sha256sum; "
            "test -r /etc/hbnf-updater/release-state; cat /etc/hbnf-updater/release-state")
    if request_counter is not None: request_counter()
    op = run(SSH+["-o", "ConnectTimeout=4", OPAL, opal], timeout=15)
    opal_out = op.stdout.decode(errors="replace")
    if op.returncode or "OPAL_PREFLIGHT_OK" not in opal_out or f"55 {R4} {R4_SHA}" not in opal_out or "curl" not in opal_out or "sha256sum" not in opal_out:
        raise RuntimeError("opal-readonly-release-ledger-or-transfer-preflight-failed")
    owner_state = capture_owner_state_snapshot(
        ms, ast, mi, ai, matrix_context["identity"],
        {"ip": ai.get("ip"), "mac": ai.get("mac"), "wled": ai.get("ver")},
        brightness_baseline)
    receipt = {"schema": "hbnf-cart2-candidate-fresh-prelive-v1", "captured_at_unix": time.time(),
               "pass": True, "host_on_ac": True, "route": "en0/192.168.77.0/24",
               "matrix": {"ip": mi["ip"], "mac": mi["mac"], "wled": mi["ver"], "release": mb["release_id"],
                          "uptime_seconds": mi.get("uptime"), "free_heap": mi.get("freeheap"),
                          "brightness": h.get("matrixBrightness"), "fps": mi.get("leds", {}).get("fps"),
                          "telemetry_off": telem.get("enabled") is False, "diagnostic_off": p20.get("enabled") is False},
               "aux": {"ip": ai["ip"], "mac": ai["mac"], "wled": ai["ver"], "live": ai["live"],
                       "mode": ai["lm"], "source": ai["lip"], "led_count": ai["leds"]["count"], "lor": ast.get("lor")},
               "opal": {"read_only": True, "stdout": opal_out}, "single_worker": worker,
               "candidate_release_id": profile.release_id,
               "candidate_sha256": profile.sha256, "rollback_sha256": profile.rollback_sha256,
               "brightness_baseline":brightness_baseline,
               "pre_mutation_state": owner_state,
               "no_house_voltage_sensor": True}
    save(profile.output/"FRESH_PRELIVE_READONLY.json", receipt)
    return receipt


def stage_once(path: pathlib.Path, remote: str):
    digest = sha(path)
    size = path.stat().st_size
    verify = ("umask 077; cat > "+shlex.quote(remote)+" && chmod 600 "+shlex.quote(remote)+
              " && test \"$(sha256sum "+shlex.quote(remote)+" | cut -d' ' -f1)\" = "+digest+
              " && test \"$(wc -c < "+shlex.quote(remote)+" | tr -d ' ')\" = "+str(size)+
              " && printf STAGED_HASH_SIZE_PASS\\n")
    p = run(SSH+["-o", "ConnectTimeout=8", "-T", OPAL, verify], timeout=90, input_bytes=path.read_bytes())
    out = p.stdout.decode(errors="replace")
    if p.returncode or "STAGED_HASH_SIZE_PASS" not in out:
        raise RuntimeError("opal-staging-hash-or-size-check-failed-before-wled-request")
    return {"remote_path": remote, "sha256": digest, "bytes": size, "mode": "0600", "firmware_requests": 0}


def upload_once(remote: str, response_path: pathlib.Path):
    response = "/tmp/hbnf-r6-cache-ota.html"
    cmd = ("set +e; code=$(curl --silent --show-error --connect-timeout 5 --max-time 180 -F 'update=@"+
           remote+";type=application/octet-stream' -o "+response+" -w '%{http_code}' http://192.168.77.10/update); "
           "rc=$?; printf 'CURL_EXIT=%s\\nHTTP_STATUS=%s\\n' \"$rc\" \"$code\"; "
           "if test \"$rc\" = 0 && test \"$code\" = 200 && grep -q 'Update successful' "+response+
           "; then printf OTA_CONFIRMED\\n; fi; if test -f "+response+"; then sha256sum "+response+
           "; cat "+response+"; fi; exit 0")
    p = run(SSH+["-o", "ConnectTimeout=8", OPAL, cmd], timeout=210)
    raw = p.stdout
    response_path.write_bytes(raw)
    text = raw.decode(errors="replace")
    m = re.search(r"CURL_EXIT=(-?\d+)\s+HTTP_STATUS=(\d{3})", text)
    confirmed = bool(m and int(m.group(1)) == 0 and m.group(2) == "200" and "OTA_CONFIRMED" in text and "Update successful" in text)
    receipt = {"ssh_exit": p.returncode, "curl_exit": int(m.group(1)) if m else None,
               "http_status": m.group(2) if m else "000", "response_sha256": hashlib.sha256(raw).hexdigest(),
               "response_bytes": len(raw), "confirmed": confirmed, "attempts": 1, "retry": False}
    save(response_path.with_suffix(".json"), receipt)
    return receipt


def read_runtime():
    mi = get_json(MATRIX+"/json/info")[2]
    build = get_json(MATRIX+"/hbnf/build.json")[2]
    ai = get_json(AUX+"/json/info")[2]
    return {"matrix_info": mi, "matrix_build": build, "aux_info": ai}


def exact_runtime(result, release):
    mi, b, ai = result["matrix_info"], result["matrix_build"], result["aux_info"]
    return (mi.get("ip") == "192.168.77.10" and mi.get("mac", "").replace(":", "").lower() == MATRIX_MAC
            and mi.get("ver") == "16.0.1" and b.get("release_id") == release and b.get("candidate") == release
            and ai.get("mac", "").replace(":", "").lower() == AUX_MAC and ai.get("live") is True
            and ai.get("lm") == "DDP" and ai.get("lip") == "192.168.77.10")


def wait_runtime(release, timeout=150):
    deadline = time.monotonic()+timeout
    last = None
    while time.monotonic() < deadline:
        try:
            result = read_runtime()
            if exact_runtime(result, release):
                return result
            last = {"release": result["matrix_build"].get("release_id"),
                    "candidate": result["matrix_build"].get("candidate"),
                    "mac": result["matrix_info"].get("mac")}
        except Exception as e:
            last = str(e)
        time.sleep(3)
    raise RuntimeError("runtime-identity-timeout:"+str(last))


def restore_r4_once(outdir: pathlib.Path):
    current = read_runtime()
    info = current.get("matrix_info", {})
    if (info.get("ip") != "192.168.77.10" or info.get("mac", "").replace(":", "").lower() != MATRIX_MAC
        or info.get("ver") != "16.0.1"):
        raise RuntimeError("refusing-r4-recovery-without-exact-matrix-target-identity")
    if exact_runtime(current, R4):
        return {"status": "R4_ALREADY_INSTALLED_NO_UPLOAD", "runtime": current}
    stage = stage_once(R4_BIN, "/tmp/hbnf-r6-cache-exact-r4.bin")
    save(outdir/"R4_STAGE.json", stage)
    receipt = upload_once("/tmp/hbnf-r6-cache-exact-r4.bin", outdir/"r4-ota-response.txt")
    save(outdir/"R4_UPLOAD.json", receipt)
    if not receipt["confirmed"]:
        # Resolve an ambiguous response only through read-only identity; never retry.
        state = wait_runtime(R4, timeout=150)
        return {"upload": receipt, "runtime": state, "status": "R4_READBACK_VERIFIED"}
    state = wait_runtime(R4, timeout=150)
    return {"upload": receipt, "runtime": state, "status": "R4_READBACK_VERIFIED"}


def qualification_command(outdir: pathlib.Path, profile=LEGACY_R6_PROFILE):
    sweep = [sys.executable, str(ROOT/"scripts/hbnf_live_kernel_sweep.py"),
        "--adapter", str(profile.adapter.relative_to(ROOT)), "--inventory", "config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json",
        "--outdir", str(outdir/"sweep"), "--contract", "foundation", "--qualify", "--soak-seconds", "5400",
        "--combined-check-script", str(ROOT/"scripts/hbnf_r6_combined_feature_check.py"),
        "--soak-interval-seconds", "8", "--threshold-policy", "config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json",
        "--early-r4-profile-dir", "evidence/hbnf-foundation-qualification-20261005/seq39/live/foundation-sweep",
        "--early-r4-baseline-manifest", "evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json",
        "--early-r4-release", R4, "--compare-all-r4", "--stop-on-first-gate-failure"]
    return sweep


def qualify_with_brightness_guard(port, baseline):
    """Run the frozen test at brightness 44, then restore captured owner settings."""
    outcome={"setup_started":False,"qualification":None,"setup_error":None,"worker_error":None,"restore_error":None}
    if (not isinstance(baseline,dict) or type(baseline.get("matrixBrightness")) is not int
        or not 0 <= baseline["matrixBrightness"] <= 255):
        outcome["setup_error"]="RuntimeError: qualification-baseline-receipt-invalid"
        return outcome
    try:
        # Mark before the single POST because a timeout may mean the device
        # applied it; the finally path must still attempt exact readback/restore.
        outcome["setup_started"]=True
        outcome["brightness_setup"]=port.apply_qualification_brightness(baseline)
        if not isinstance(outcome["brightness_setup"],dict) or outcome["brightness_setup"].get("verified") is not True:
            raise RuntimeError("qualification-brightness-setup-did-not-verify")
        try:
            outcome["qualification"]=port.qualify()
        except Exception as exc:
            outcome["worker_error"]=f"{type(exc).__name__}: {exc}"
    except Exception as exc:
        outcome["setup_error"]=f"{type(exc).__name__}: {exc}"
    finally:
        if outcome["setup_started"]:
            try:
                outcome["brightness_restore"]=port.restore_qualification_brightness(baseline)
                if not isinstance(outcome["brightness_restore"],dict) or outcome["brightness_restore"].get("verified") is not True:
                    raise RuntimeError("qualification-brightness-restore-did-not-verify")
            except Exception as exc:
                outcome["restore_error"]=f"{type(exc).__name__}: {exc}"
    return outcome


def coordinate(port):
    """One-attempt transaction state machine shared by live and fake ports."""
    profile = getattr(port, "candidate", LEGACY_R6_PROFILE)
    result = {"schema": "hbnf-cart2-candidate-qualification-transaction-v1",
              "candidate_release_id": profile.release_id, "candidate_sha256": profile.sha256,
              "rollback_sha256": profile.rollback_sha256, "candidate_install_attempts": 0,
              "recovery_attempts": 0, "device_requests": 0}
    try:
        # Port admission is local-only and must precede every read/write request.
        port.admit()
        port.verify_local_artifacts()
        pre = port.preflight()
        result["preflight"] = pre
        result["device_requests"] = port.device_requests
        stage = port.stage_candidate()
        result["candidate_stage"] = stage
        port.consume_install_attempt()
        result["candidate_install_attempts"] = 1
        upload = port.upload_candidate()
        result["upload"] = upload
        resolved = port.resolve_runtime(upload)
        result["runtime_resolution"] = resolved
        if resolved.get("installed") is False:
            result["status"] = "OTA_NOT_INSTALLED_R4_REMAINS_NO_RETRY"
        elif resolved.get("installed") is not True:
            try:
                result["recovery"] = port.recover_r4()
                result["recovery_attempts"] = 1
                result["status"] = "RUNTIME_IDENTITY_UNRESOLVED_R4_RECOVERED"
            except Exception as recovery_exc:
                result["recovery_error"] = f"{type(recovery_exc).__name__}: {recovery_exc}"
                result["recovery_attempts"] = getattr(port, "recovery_attempts", 1)
                result["status"] = "RECOVERY_UNVERIFIED_STOP"
        else:
            result["candidate_runtime"] = resolved["runtime"]
            brightness=qualify_with_brightness_guard(port,pre.get("brightness_baseline",{}).get("runtime"))
            result["brightness_setup_started"]=brightness["setup_started"]
            if "brightness_setup" in brightness: result["brightness_setup"]=brightness["brightness_setup"]
            if "brightness_restore" in brightness: result["brightness_restore"]=brightness["brightness_restore"]
            if brightness["restore_error"]:
                result["status"]="QUALIFICATION_BRIGHTNESS_RESTORE_FAILED"
                result["error"]=brightness["restore_error"]
                if brightness["qualification"] is not None:
                    result["captured_qualification_invalidated"]={"passed":brightness["qualification"].get("passed"),"profiles_not_accepted":True}
            elif brightness["setup_error"]:
                result["status"]="QUALIFICATION_BRIGHTNESS_SETUP_FAILED_NO_PROFILES"
                result["error"]=brightness["setup_error"]
            elif brightness["worker_error"]:
                result["status"]="QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED"
                result["error"]=brightness["worker_error"]
            else:
                q=brightness["qualification"]
                result["qualification"] = q
            if result.get("status") in ("QUALIFICATION_BRIGHTNESS_RESTORE_FAILED","QUALIFICATION_BRIGHTNESS_SETUP_FAILED_NO_PROFILES","QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED"):
                pass
            elif q.get("passed") is True:
                result["status"] = "QUALIFIED_OBJECTIVE_GATES_PASS"
            elif device_failure_requires_recovery(q):
                try:
                    result["recovery"] = port.recover_r4()
                    result["recovery_attempts"] = 1
                    result["status"] = "QUALIFICATION_FAILED_R4_RECOVERED"
                except Exception as recovery_exc:
                    result["recovery_error"] = f"{type(recovery_exc).__name__}: {recovery_exc}"
                    result["recovery_attempts"] = getattr(port, "recovery_attempts", 1)
                    result["status"] = "RECOVERY_UNVERIFIED_STOP"
            else:
                result["status"] = "QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED"
    except Exception as exc:
        result["status"] = "BLOCKED_OR_FAILED"
        result["error"] = f"{type(exc).__name__}: {exc}"
        # If install already ran, a host/runtime interruption is reconciled by
        # identity readback before deciding whether exact recovery is needed.
        if result["candidate_install_attempts"] and "runtime_resolution" not in result:
            try:
                resolved = port.resolve_runtime({"confirmed": False})
                result["runtime_resolution"] = resolved
                if resolved.get("installed") is False:
                    result["status"] = "TRANSACTION_EXCEPTION_R4_REMAINS"
                elif resolved.get("installed") is True:
                    result["candidate_runtime"] = resolved.get("runtime")
                    result["status"] = "TRANSACTION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED"
                else:
                    recovery = port.recover_r4()
                    result["recovery"] = recovery
                    result["recovery_attempts"] = 1
                    result["status"] = "TRANSACTION_EXCEPTION_R4_RECOVERED"
            except Exception as recovery_exc:
                result["recovery_error"] = f"{type(recovery_exc).__name__}: {recovery_exc}"
                result["status"] = "RECOVERY_UNVERIFIED_STOP"
    finally:
        result["device_requests"] = getattr(port, "device_requests", result["device_requests"])
        result["candidate_install_attempts"] = getattr(port, "install_attempts", result["candidate_install_attempts"])
        result["recovery_attempts"] = getattr(port, "recovery_attempts", result["recovery_attempts"])
        port.close(result)
    return result


def device_failure_requires_recovery(summary):
    """Only objective frozen device/runtime failures consume the R4 recovery."""
    text = json.dumps(summary, sort_keys=True).lower()
    markers = (
        "catastrophic foundation threshold crossed",
        "foundation-steady-state-frame-interval-stop",
        "-kernel-gate-failed",
        "aux-native-ddp-source-mismatch",
        "aux-ddp-not-live",
        "release-identity-changed",
        "release identity changed",
        "uptime decreased during sweep",
        "restart-count",
        "matrix-runtime-identity-mismatch",
        "candidate-runtime-identity-mismatch",
        # The telemetry adapter fails closed when a percentile reaches the
        # histogram's saturated terminal bucket. That is a runtime evidence
        # gate failure, not a collector/host failure: the candidate cannot be
        # qualified from that sample and the transaction must follow its
        # already-authorized recovery path.
        "foundation-frame-tail-quantile-saturated",
        "diagnostics_complete__performance_gate_failed",
        "qualification_stopped_at_first_gate_failure",
        # The frozen sweep's continuation guard records this condition when
        # Matrix-to-AUX DDP projection drops during qualification. The release
        # contract classifies AUX/runtime integrity as an immediate stop and
        # requires the already-authorized exact R4 recovery.
        "diagnostic-continuation-aux-projection-inactive",
    )
    return any(marker in text for marker in markers)


def coordinate_qualification(port):
    """Resume frozen gates for the exact installed profile; never uploads."""
    profile = getattr(port, "candidate", LEGACY_R6_PROFILE)
    result={"schema":"hbnf-cart2-candidate-qualification-continuation-v1",
        "candidate_release_id":profile.release_id,"candidate_sha256":profile.sha256,"rollback_sha256":profile.rollback_sha256,
        "operation_scope":"QUALIFICATION_ONLY","candidate_install_attempts":0,"recovery_attempts":0,"device_requests":0,
        "preflight_completed":False,"setup_started":False,"brightness_setup_started":False}
    preflight = None
    setup_started = False
    setup_error = None
    worker_error = None
    restore_error = None
    qualification = None
    try:
        port.admit("LIVE_QUALIFICATION")
        port.verify_local_artifacts()
        preflight = port.preflight_candidate()
        result["preflight"] = preflight
        result["preflight_completed"] = True
        result["device_requests"]=port.device_requests
        baseline = dict(preflight["brightness_baseline"]["runtime"])
        owner_baseline = dict(getattr(port,"owner_brightness_baseline",{}) or {})
        if owner_baseline:
            required=("matrixBrightness","auxBrightness","vibe")
            if (any(type(owner_baseline.get(key)) is not int for key in required)
                or not 0 <= owner_baseline["matrixBrightness"] <= 255
                or not 0 <= owner_baseline["auxBrightness"] <= 255
                or not 0 <= owner_baseline["vibe"] <= 5):
                raise RuntimeError("qualification-owner-settings-baseline-invalid")
            # From this point onward cleanup must target the exact authorized
            # owner settings, even if the initial repair or test setup fails.
            baseline=dict(owner_baseline)
            setup_started=True
            result["setup_started"]=True
            captured=preflight["brightness_baseline"]
            runtime=captured.get("runtime",{})
            persisted=captured.get("persisted",{})
            if (any(runtime.get(key)!=owner_baseline[key] for key in required)
                or any(persisted.get(key)!=owner_baseline[key] for key in required)):
                result["owner_settings_repair_started"]=True
                result["owner_settings_repair"]=port.restore_qualification_brightness(owner_baseline)
                if not isinstance(result["owner_settings_repair"],dict) or result["owner_settings_repair"].get("verified") is not True:
                    raise RuntimeError("qualification-owner-settings-repair-unverified")
                repaired=result["owner_settings_repair"]["readback"]
                if (any(repaired["runtime"].get(key)!=owner_baseline[key] for key in required)
                    or any(repaired["persisted"].get(key)!=owner_baseline[key] for key in required)):
                    raise RuntimeError("qualification-owner-settings-repair-readback-mismatch")
                preflight["brightness_baseline"]["runtime"]=dict(owner_baseline)
                preflight["brightness_baseline"]["persisted"]=dict(owner_baseline)
        if baseline.get("matrixBrightness") == FROZEN_MATRIX_BRIGHTNESS:
            if preflight.get("qualification_recovery_subscope") != "RESTORE_INTERRUPTED_BRIGHTNESS_THEN_QUALIFY":
                raise RuntimeError("qualification-preflight-found-unexpected-frozen-brightness")
            if not owner_baseline:
                raise RuntimeError("captured-owner-settings-baseline-unavailable")
            if baseline.get("matrixBrightness") == FROZEN_MATRIX_BRIGHTNESS:
                # The admitted setup is the only path that permits the frozen
                # test brightness to be present before continuation.
                result["interrupted_brightness_restore"] = port.restore_qualification_brightness(owner_baseline)
                restored = result["interrupted_brightness_restore"]
                if not isinstance(restored, dict) or restored.get("verified") is not True:
                    raise RuntimeError("interrupted-qualification-brightness-restore-unverified")
                baseline = dict(owner_baseline)
                preflight["brightness_baseline"]["runtime"] = dict(owner_baseline)
                preflight["brightness_baseline"]["persisted"] = dict(owner_baseline)
        if (type(baseline.get("matrixBrightness")) is not int
            or not 0 <= baseline["matrixBrightness"] <= 255):
            raise RuntimeError("qualification-preflight-does-not-prove-owner-brightness-baseline")
        setup_started = True
        result["setup_started"] = True
        try:
            result["brightness_setup_started"] = True
            result["brightness_setup"] = port.apply_qualification_brightness(
                baseline)
            if not isinstance(result["brightness_setup"], dict) or result["brightness_setup"].get("verified") is not True:
                raise RuntimeError("qualification-brightness-setup-did-not-verify")
        except Exception as exc:
            setup_error = f"{type(exc).__name__}: {exc}"
        else:
            try:
                qualification = port.qualify()
            except Exception as exc:
                worker_error = f"{type(exc).__name__}: {exc}"
    except Exception as exc:
        result["status"]="QUALIFICATION_BLOCKED_OR_FAILED"
        result["error"]=f"{type(exc).__name__}: {exc}"
    finally:
        # Once the exact preflight baseline is captured, every attempted setup/worker
        # path gets one bounded restore and independent runtime/config readback.
        if setup_started and preflight is not None:
            try:
                result["brightness_restore"] = port.restore_qualification_brightness(
                    baseline)
                if not isinstance(result["brightness_restore"], dict) or result["brightness_restore"].get("verified") is not True:
                    raise RuntimeError("qualification-brightness-restore-did-not-verify")
            except Exception as exc:
                restore_error = f"{type(exc).__name__}: {exc}"
                result["brightness_restore"] = {"verified": False, "error": restore_error}
        if restore_error:
            if qualification is not None:
                result["captured_qualification_invalidated"] = {
                    "passed": qualification.get("passed"),
                    "profiles_not_accepted": True,
                }
            result["status"] = "QUALIFICATION_BRIGHTNESS_RESTORE_FAILED"
            result["restore_error"] = restore_error
            if setup_error:
                result["setup_error"] = setup_error
        elif setup_error:
            result["status"] = "QUALIFICATION_BRIGHTNESS_SETUP_FAILED_NO_PROFILES"
            result["error"] = setup_error
        elif worker_error:
            result["status"] = "QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED"
            result["error"] = worker_error
        elif qualification is not None:
            if qualification.get("passed") is True:
                result["qualification"] = qualification
                result["status"] = "QUALIFIED_OBJECTIVE_GATES_PASS"
            elif device_failure_requires_recovery(qualification):
                result["qualification"] = qualification
                try:
                    result["recovery"] = port.recover_r4(); result["recovery_attempts"] = 1
                    result["status"] = "QUALIFICATION_FAILED_R4_RECOVERED"
                except Exception as exc:
                    result["recovery_error"] = f"{type(exc).__name__}: {exc}"
                    result["status"] = "RECOVERY_UNVERIFIED_STOP"
            else:
                result["qualification"] = qualification
                result["status"] = "QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED"
        result["device_requests"]=getattr(port,"device_requests",result["device_requests"])
        result["recovery_attempts"]=getattr(port,"recovery_attempts",result["recovery_attempts"])
        result["candidate_install_attempts"]=0
        save(port.outdir/"QUALIFICATION_CONTINUATION_RESULT.json",result)
        port.close(result)
    return result


class LivePort:
    def __init__(self, admission_path, capsule_path, proof_path, outdir=None, candidate=LEGACY_R6_PROFILE):
        self.admission_path = admission_path
        self.capsule_path = capsule_path
        self.proof_path = proof_path
        self.admission = None
        self.candidate = candidate
        self.device_requests = 0
        self.install_attempts = 0
        self.recovery_attempts = 0
        self.owner_brightness_baseline = None
        self.state_path = ROOT/"config/HBNF_CONTROL_STATE.json"
        # Recovery-only invocations are new processes. Reload the original
        # owner's captured brightness so the exact R4 readback can verify it.
        try:
            state=json.loads(self.state_path.read_text())
            baseline=state.get("live_mutation_authorization",{}).get("owner_brightness_baseline")
            if isinstance(baseline,dict):
                self.owner_brightness_baseline=dict(baseline)
        except (OSError,ValueError,TypeError):
            pass
        self._explicit_outdir = outdir is not None
        self.outdir = pathlib.Path(outdir).resolve() if outdir else candidate.output

    def admit(self, stage="LIVE_APPROVED"):
        self.candidate=load_candidate_profile(self.capsule_path)
        if not self._explicit_outdir:
            self.outdir=self.candidate.output
        self.admission = check_admission(self.admission_path, self.capsule_path, self.proof_path, stage,self.candidate)

    def _record_device_request(self):
        self.device_requests += 1

    def verify_local_artifacts(self):
        exact_artifacts(self.candidate)
        if self.admission is None:
            raise RuntimeError("admission-not-passed")

    def preflight(self):
        result=preflight(self.candidate,request_counter=self._record_device_request)
        self.owner_brightness_baseline=dict(result["brightness_baseline"]["runtime"])
        return result

    def preflight_candidate(self, expected_matrix_brightness=None):
        exact_artifacts(self.candidate)
        power=run(["pmset","-g","batt"],timeout=5).stdout.decode(errors="replace")
        route=run(["route","-n","get","192.168.77.10"],timeout=5).stdout.decode(errors="replace")
        if "AC Power" not in power or "interface: en0" not in route:
            raise RuntimeError("qualification-only host AC/LAN preflight failed")
        live_state=json.loads(self.state_path.read_text())
        qualification_auth=live_state.get("live_mutation_authorization",{})
        saved_owner=qualification_auth.get("owner_brightness_baseline")
        if isinstance(saved_owner,dict):
            self.owner_brightness_baseline=dict(saved_owner)
        recovery_subscope=qualification_auth.get("qualification_recovery_subscope")
        expected_brightness=expected_matrix_brightness
        if expected_brightness is None:
            expected_brightness=(FROZEN_MATRIX_BRIGHTNESS
                if recovery_subscope=="RESTORE_INTERRUPTED_BRIGHTNESS_THEN_QUALIFY"
                else None)
        if expected_brightness is not None and (type(expected_brightness) is not int or not 0 <= expected_brightness <= 255):
            raise RuntimeError("qualification-preflight-brightness-expectation-invalid")
        authorized_vibe=(saved_owner.get("vibe") if isinstance(saved_owner,dict) else None)
        matrix_context=read_matrix_context(self._record_device_request,self.candidate.release_id,
            expected_brightness,authorized_runtime_vibe=authorized_vibe)
        mi=matrix_context["info"]; ms=matrix_context["state"]; mb=matrix_context["build"]
        ai=_get_json_counted(AUX+"/json/info", 4, self._record_device_request)[2]
        ast=_get_json_counted(AUX+"/json/state", 4, self._record_device_request)[2]
        h=ms.get("HBNF",{}); p20=h.get("packet20Diagnostic",{}); telem=h.get("foundationTelemetry",{})
        if not (mi.get("ip")=="192.168.77.10" and mi.get("mac","").replace(":","").lower()==MATRIX_MAC
                and mi.get("ver")=="16.0.1" and mb.get("release_id")==self.candidate.release_id and mb.get("candidate")==self.candidate.release_id
                and mb.get("mac","").replace(":","").lower()==MATRIX_MAC and h.get("candidate")==self.candidate.release_id
                and ms.get("on") is True and p20.get("enabled") is False and telem.get("enabled") is False):
            raise RuntimeError("qualification preflight did not verify exact healthy candidate runtime")
        if not (ai.get("ip")=="192.168.77.11" and ai.get("mac","").replace(":","").lower()==AUX_MAC
                and ai.get("ver")=="16.0.1" and ai.get("live") is True and ai.get("lm")=="DDP"
                and ai.get("lip")=="192.168.77.10" and ai.get("leds",{}).get("count")==22
                and ast.get("on") is True and ast.get("lor")==0):
            raise RuntimeError("qualification preflight AUX DDP/output checks failed")
        brightness_baseline=matrix_context["brightness"]
        if matrix_context["identity"]["release_id"] != self.candidate.release_id:
            raise RuntimeError("qualification-matrix-identity-binding-failed")
        worker=single_worker_check()
        opal=("set -e; printf OPAL_QUALIFICATION_PREFLIGHT_OK\\n; command -v sha256sum; test -r /etc/hbnf-updater/release-state; cat /etc/hbnf-updater/release-state")
        self._record_device_request()
        p=run(SSH+["-o","ConnectTimeout=4",OPAL,opal],timeout=15); out=p.stdout.decode(errors="replace")
        if p.returncode or "OPAL_QUALIFICATION_PREFLIGHT_OK" not in out or f"55 {R4} {R4_SHA}" not in out:
            raise RuntimeError("qualification preflight cannot prove exact Opal R4 recovery")
        proof={"schema":"hbnf-cart2-qualification-prelive-v1","captured_unix":time.time(),"pass":True,
            "operation_scope":"QUALIFICATION_ONLY","host_on_ac":True,"cart_lan_interface":"en0",
            "qualification_recovery_subscope":recovery_subscope,
            "candidate_release_id":self.candidate.release_id,"candidate_sha256":self.candidate.sha256,
            "matrix":{"ip":mi["ip"],"mac":mi["mac"],"wled":mi["ver"],"release_id":mb["release_id"],
                "candidate_sha256":self.candidate.sha256,"uptime_seconds":mi.get("uptime"),"fps":mi.get("leds",{}).get("fps"),
                "free_heap":mi.get("freeheap"),"brightness":h.get("matrixBrightness"),"on":ms.get("on") is True,
                "diagnostic_off":True,"telemetry_off":True},
            "brightness_baseline":brightness_baseline,
            "owner_brightness_baseline":dict(self.owner_brightness_baseline or {}),
            "owner_settings_restore_required":any(
                brightness_baseline.get(section,{}).get(key)!=value
                for section in ("runtime","persisted")
                for key,value in (self.owner_brightness_baseline or {}).items()),
            "aux":{"ip":ai["ip"],"mac":ai["mac"],"live":ai["live"],"mode":ai["lm"],"source":ai["lip"],"led_count":ai["leds"]["count"],"on":ast["on"],"lor":ast["lor"]},
            "rollback":{"sha256":self.candidate.rollback_sha256,"opal_ledger":out},"single_worker":worker,
            "candidate_attempts_used":1,"candidate_install_permitted":False,
            "recovery_attempts_used":0,
            "read_only":True,"device_mutations":0,"device_requests":self.device_requests}
        save(self.outdir/"QUALIFICATION_PRELIVE_READONLY.json",proof)
        return proof

    def preflight_failed_candidate_recovery(self):
        """Capture fresh read-only proof for recovery after the completed failed sweep."""
        exact_artifacts(self.candidate)
        power=run(["pmset","-g","batt"],timeout=5).stdout.decode(errors="replace")
        route=run(["route","-n","get","192.168.77.10"],timeout=5).stdout.decode(errors="replace")
        if "AC Power" not in power or "interface: en0" not in route:
            raise RuntimeError("recovery-only host AC/LAN preflight failed")
        live_state=json.loads(self.state_path.read_text())
        saved_owner=live_state.get("live_mutation_authorization",{}).get("owner_brightness_baseline")
        if not isinstance(saved_owner,dict) or not saved_owner:
            raise RuntimeError("captured-owner-settings-baseline-unavailable")
        self.owner_brightness_baseline=dict(saved_owner)
        context=read_failed_candidate_recovery_context(
            self._record_device_request,self.candidate,self.owner_brightness_baseline)
        ai=_get_json_counted(AUX+"/json/info",4,self._record_device_request)[2]
        ast=_get_json_counted(AUX+"/json/state",4,self._record_device_request)[2]
        if not (ai.get("ip")=="192.168.77.11" and ai.get("mac","").replace(":","").lower()==AUX_MAC
            and ai.get("ver")=="16.0.1" and ai.get("live") is True and ai.get("lm")=="DDP"
            and ai.get("lip")=="192.168.77.10" and ai.get("leds",{}).get("count")==22
            and ast.get("on") is True and ast.get("lor")==0):
            raise RuntimeError("recovery-only preflight AUX DDP/output checks failed")
        worker=single_worker_check()
        opal=("set -e; printf OPAL_QUALIFICATION_PREFLIGHT_OK\\n; command -v sha256sum; "
            "test -r /etc/hbnf-updater/release-state; cat /etc/hbnf-updater/release-state")
        self._record_device_request()
        p=run(SSH+["-o","ConnectTimeout=4",OPAL,opal],timeout=15)
        out=p.stdout.decode(errors="replace")
        if p.returncode or "OPAL_QUALIFICATION_PREFLIGHT_OK" not in out or f"55 {R4} {R4_SHA}" not in out:
            raise RuntimeError("recovery-only preflight cannot prove exact Opal R4 recovery")
        proof={"schema":"hbnf-cart2-qualification-recovery-prelive-v1","captured_unix":time.time(),
            "pass":True,"read_only":True,"device_mutations":0,"operation_scope":"EXACT_R4_RECOVERY_ONLY",
            "host_on_ac":True,"cart_lan_interface":"en0",
            "candidate_release_id":self.candidate.release_id,"candidate_sha256":self.candidate.sha256,
            "matrix":{"ip":"192.168.77.10","mac":MATRIX_MAC,"wled":"16.0.1",
                "release_id":self.candidate.release_id,"candidate_sha256":self.candidate.sha256,
                "on":True,"brightness":context["runtime"].get("matrixBrightness"),
                "diagnostic_off":True,"telemetry_off":True},
            "brightness_baseline":{"runtime":context["runtime"],"persisted":context["persisted"]},
            "aux":{"ip":ai["ip"],"mac":ai["mac"],"live":ai["live"],"mode":ai["lm"],
                "source":ai["lip"],"led_count":ai["leds"]["count"],"on":ast["on"],"lor":ast["lor"]},
            "rollback":{"sha256":R4_SHA,"opal_ledger":out},"single_worker":worker,
            "candidate_attempts_used":1,"candidate_install_permitted":False,"recovery_attempts_used":0,
            "device_requests":self.device_requests}
        save(self.outdir/"RECOVERY_PRELIVE_READONLY.json",proof)
        return proof

    def restore_failed_candidate_owner_settings(self):
        """Verify the captured owner settings before rollback; never substitute stale defaults."""
        baseline=getattr(self,"owner_brightness_baseline",None)
        if not isinstance(baseline,dict):
            raise RuntimeError("captured-owner-settings-baseline-unavailable")
        identity, _, _ = read_matrix_identity(self._record_device_request,self.candidate.release_id)
        context=read_matrix_context(self._record_device_request,self.candidate.release_id)
        values=context["brightness"]
        if context["identity"]!=identity or any(values["runtime"].get(k)!=v for k,v in baseline.items()):
            raise RuntimeError("failed-candidate-owner-settings-no-longer-match-captured-baseline")
        if any(values["persisted"].get(k)!=v for k,v in baseline.items()):
            raise RuntimeError("failed-candidate-persisted-owner-settings-no-longer-match-captured-baseline")
        return {"readback":values,"verified":True,"device_write":False}

    def apply_qualification_brightness(self, baseline):
        if not isinstance(baseline, dict) or type(baseline.get("matrixBrightness")) is not int:
            raise RuntimeError("qualification-brightness-baseline-not-admitted")
        return change_matrix_brightness(baseline, operation="measure", request_counter=self._record_device_request,
                                        expected_release=self.candidate.release_id)

    def restore_qualification_brightness(self, baseline):
        if not isinstance(baseline, dict) or type(baseline.get("matrixBrightness")) is not int:
            raise RuntimeError("qualification-brightness-baseline-receipt-invalid")
        return change_matrix_brightness(baseline, operation="restore", request_counter=self._record_device_request,
                                        expected_release=self.candidate.release_id)

    def stage_candidate(self):
        self.staged_remote_path=f"/tmp/{self.candidate.release_id}.bin"
        return stage_once(self.candidate.binary, self.staged_remote_path)

    def consume_install_attempt(self):
        state = json.loads(self.state_path.read_text())
        binding = self.admission.get("fresh_owner_authorization") if self.admission else None
        current = state.get("live_mutation_authorization", {})
        if (not isinstance(binding, dict) or state.get("live_mutation_authorized") is not True
            or state.get("live_authorization_binding") != binding
            or binding.get("candidate_release_id") != self.candidate.release_id
            or binding.get("candidate_bin_sha256") != self.candidate.sha256
            or binding.get("rollback_bin_sha256") != self.candidate.rollback_sha256
            or binding.get("candidate_install_limit") != 1
            or binding.get("recovery_install_limit") != 1
            or str(binding.get("matrix_mac", "")).replace(":", "").lower() != MATRIX_MAC):
            raise RuntimeError("exact-owner-authorization-state-binding-changed-before-install")
        if current.get("candidate_attempts_used", 0) != 0:
            raise RuntimeError("candidate-attempt-already-consumed")
        current["candidate_attempts_used"] = 1
        current["candidate_attempt_started_unix"] = time.time()
        current["status"] = "CONSUMED_BEFORE_WLED_POST"
        state["live_mutation_authorized"] = True
        current.update({
            "authorized": True,
            "candidate_release_id": self.candidate.release_id,
            "candidate_sha256": self.candidate.sha256,
            "rollback_sha256": self.candidate.rollback_sha256,
            "candidate_install_limit": binding["candidate_install_limit"],
            "recovery_install_limit": binding["recovery_install_limit"],
            "hardware_writes_permitted_now": True,
            "transaction_consumed": True,
            "recovery_attempts_used": 0,
            "current_gate": "Exact candidate attempt durably consumed before the one WLED /update request.",
        })
        if isinstance(self.owner_brightness_baseline,dict):
            current["owner_brightness_baseline"]=dict(self.owner_brightness_baseline)
        self.state_path.write_text(json.dumps(state, indent=2)+"\n")
        self.install_attempts = 1
        save(self.outdir/"AUTHORIZATION_CONSUMPTION.json", {
            "authorization_id": self.admission["fresh_owner_authorization"]["authorization_id"],
            "candidate_release_id": self.candidate.release_id, "candidate_sha256": self.candidate.sha256,
            "candidate_attempt": 1, "candidate_attempt_limit": 1, "r4_recovery_limit": 1,
            "recorded_before_wled_post": True,
            "preflight_sha256": sha(self.outdir/"FRESH_PRELIVE_READONLY.json")})

    def upload_candidate(self):
        self.device_requests += 1
        remote=getattr(self,"staged_remote_path",None)
        if remote!=f"/tmp/{self.candidate.release_id}.bin":
            raise RuntimeError("exact-candidate-staging-path-not-proven")
        return upload_once(remote, self.outdir/"candidate-ota-response.txt")

    def resolve_runtime(self, upload):
        deadline = time.monotonic()+150
        last = None
        exact_r4_seen = False
        last_r4_runtime = None
        while time.monotonic() < deadline:
            try:
                self.device_requests += 3
                runtime = read_runtime()
                if exact_runtime(runtime, self.candidate.release_id):
                    return {"installed": True, "runtime": runtime,
                            "http_response_ambiguous": not upload.get("confirmed", False)}
                if exact_runtime(runtime, R4):
                    # WLED's success page is emitted before its delayed reboot.
                    # A stale pre-reboot R4 readback must not close a confirmed
                    # upload as failed; observe the full bounded identity window.
                    exact_r4_seen = True
                    last_r4_runtime = runtime
                last = "readback is neither exact candidate nor exact R4"
            except Exception as exc:
                last = str(exc)
            time.sleep(3)
        if exact_r4_seen and upload.get("confirmed", False):
            return {"installed": False, "runtime": last_r4_runtime,
                    "http_response_ambiguous": False,
                    "resolution_window_seconds": 150}
        return {"installed": None, "error": str(last), "http_response_ambiguous": True}

    def qualify(self):
        cmd = qualification_command(self.outdir,self.candidate)
        # The inner sweep has bounded adapter/request operations and owns the
        # renderer snapshot `finally` that restores device state. An outer
        # subprocess timeout would terminate it before that cleanup can run;
        # do not impose a shorter wall-clock limit than the 90-minute soak plus
        # 28 profiles and observer/setup/restore work.
        p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        (self.outdir/"SWEEP_STDOUT.json.txt").write_text(p.stdout)
        (self.outdir/"SWEEP_STDERR.txt").write_text(p.stderr)
        report_path = self.outdir/"sweep/ALL_KERNEL_SWEEP_REPORT.json"
        report = json.loads(report_path.read_text()) if report_path.is_file() else {}
        diagnostic_path = self.outdir/"sweep/DIAGNOSTIC_COMPLETE_RESULT.json"
        diagnostics = json.loads(diagnostic_path.read_text()) if diagnostic_path.is_file() else {}
        abort_path = self.outdir/"sweep/SWEEP_ABORT.json"
        abort = json.loads(abort_path.read_text()) if abort_path.is_file() else {}
        return {"passed": p.returncode == 0, "returncode": p.returncode, "report": report,
                "diagnostic_complete": diagnostics, "abort": abort}

    def recover_r4(self):
        self.consume_recovery_attempt()
        self.device_requests += 3
        return restore_r4_once(self.outdir)

    def consume_recovery_attempt(self):
        if self.recovery_attempts > 0:
            raise RuntimeError("exact-r4-recovery-attempt-limit-exceeded")
        state=json.loads(self.state_path.read_text())
        binding=self.admission.get("fresh_owner_authorization") if self.admission else None
        current=state.get("live_mutation_authorization",{})
        if (not isinstance(binding,dict) or state.get("live_mutation_authorized") is not True
            or state.get("live_authorization_binding")!=binding
            or binding.get("candidate_release_id")!=self.candidate.release_id
            or binding.get("candidate_bin_sha256")!=self.candidate.sha256
            or binding.get("rollback_bin_sha256")!=self.candidate.rollback_sha256
            or binding.get("recovery_install_limit")!=1
            or current.get("candidate_attempts_used")!=1
            or int(current.get("recovery_attempts_used",0))>=1):
            raise RuntimeError("exact-r4-recovery-authorization-or-attempt-binding-failed")
        # Durably consume recovery before any R4 transfer/OTA request so a host
        # interruption cannot silently create a second rollback attempt.
        current["recovery_attempts_used"]=1
        current["status"]="EXACT_R4_RECOVERY_ATTEMPT_CONSUMED"
        current["current_gate"]="Exact R4 recovery attempt durably consumed before recovery transfer."
        self.state_path.write_text(json.dumps(state,indent=2)+"\n")
        self.recovery_attempts = 1

    def recover_r4_after_failed_qualification(self, recovery_proof_path):
        """Use the single authorized recovery without reinstalling or requalifying R6."""
        result={"schema":"hbnf-cart2-candidate-qualification-continuation-v1",
            "operation_scope":"QUALIFICATION_ONLY","candidate_release_id":self.candidate.release_id,
            "candidate_sha256":self.candidate.sha256,"rollback_sha256":self.candidate.rollback_sha256,
            "candidate_install_attempts":0,"recovery_attempts":0,"device_requests":0}
        try:
            self.admit("LIVE_QUALIFICATION")
            self.verify_local_artifacts()
            state=json.loads(self.state_path.read_text())
            auth=state.get("live_mutation_authorization",{})
            recovery_path=pathlib.Path(recovery_proof_path).resolve()
            recovery_path.relative_to((ROOT/"evidence").resolve())
            proof=json.loads(recovery_path.read_text())
            diagnostic=ROOT/auth.get("qualification_recovery_diagnostic_receipt","")
            if (auth.get("qualification_recovery_subscope")!="EXACT_R4_RECOVERY_ONLY"
                or auth.get("candidate_install_permitted") is not False
                or auth.get("candidate_attempts_used")!=1 or auth.get("recovery_attempts_used")!=0
                or auth.get("qualification_prelive_receipt")!=str(recovery_path.relative_to(ROOT))
                or auth.get("qualification_prelive_sha256")!=sha(recovery_path)
                or not diagnostic.is_file()
                or auth.get("qualification_recovery_diagnostic_sha256")!=sha(diagnostic)):
                raise RuntimeError("exact-r4-recovery-only-control-binding-changed")
            age=time.time()-float(proof.get("captured_unix",0))
            if (proof.get("schema")!="hbnf-cart2-qualification-recovery-prelive-v1"
                or proof.get("pass") is not True or proof.get("read_only") is not True
                or proof.get("device_mutations")!=0 or proof.get("operation_scope")!="EXACT_R4_RECOVERY_ONLY"
                or proof.get("candidate_release_id")!=self.candidate.release_id
                or proof.get("candidate_sha256")!=self.candidate.sha256 or age<0 or age>300):
                raise RuntimeError("fresh-exact-r4-recovery-prelive-proof-invalid-or-stale")
            # Consume before the first device write. A settings restore problem must not block rollback.
            self.consume_recovery_attempt()
            try:
                result["owner_settings_restore"]=self.restore_failed_candidate_owner_settings()
            except Exception as exc:
                result["owner_settings_restore"]={"verified":False,"error":f"{type(exc).__name__}: {exc}"}
            self.device_requests += 3
            result["recovery"]=restore_r4_once(self.outdir)
            result["recovery_attempts"]=1
            if result["recovery"].get("status") not in ("R4_READBACK_VERIFIED","R4_ALREADY_INSTALLED_NO_UPLOAD"):
                raise RuntimeError("exact-r4-runtime-readback-not-verified")
            r4=read_matrix_context(self._record_device_request,R4)
            ai=_get_json_counted(AUX+"/json/info",4,self._record_device_request)[2]
            ast=_get_json_counted(AUX+"/json/state",4,self._record_device_request)[2]
            if not (r4["brightness"]["matrix_on"] is True
                and isinstance(self.owner_brightness_baseline,dict)
                and all(r4["brightness"]["runtime"].get(k)==v for k,v in self.owner_brightness_baseline.items())
                and all(r4["brightness"]["persisted"].get(k)==v for k,v in self.owner_brightness_baseline.items())
                and ai.get("mac","").replace(":","").lower()==AUX_MAC and ai.get("live") is True
                and ai.get("lm")=="DDP" and ai.get("lip")=="192.168.77.10"
                and ai.get("leds",{}).get("count")==22 and ast.get("on") is True and ast.get("lor")==0):
                raise RuntimeError("exact-r4-post-recovery-health-or-owner-settings-check-failed")
            result["post_recovery_readonly"]={"status":"PASS","release_id":R4,
                "matrix_brightness":self.owner_brightness_baseline["matrixBrightness"],
                "aux_brightness":self.owner_brightness_baseline["auxBrightness"],"aux_ddp_live":True,
                "runtime_identity":r4["identity"]}
            result["status"]=("EXACT_R4_RECOVERED_AFTER_FAILED_QUALIFICATION" if result["owner_settings_restore"].get("verified")
                else "EXACT_R4_RECOVERED_OWNER_SETTINGS_RESTORE_UNVERIFIED")
        except Exception as exc:
            result["error"]=f"{type(exc).__name__}: {exc}"
            result["status"]="EXACT_R4_RECOVERY_UNVERIFIED_STOP" if self.recovery_attempts else "RECOVERY_ADMISSION_BLOCKED_NO_WRITE"
        finally:
            result["device_requests"]=self.device_requests
            result["recovery_attempts"]=self.recovery_attempts
            result["candidate_install_attempts"]=0
            self.close(result)
        return result

    def close(self, result):
        continuation=result.get("operation_scope")=="QUALIFICATION_ONLY"
        target="QUALIFICATION_CONTINUATION_RESULT.json" if continuation else "TRANSACTION_RESULT.json"
        # Admission rejection is a read-only stop. Do not rewrite the control
        # state merely because the coordinator records its zero-request result.
        if self.admission is None:
            return
        save(self.outdir/target, result)
        state = json.loads(self.state_path.read_text())
        state["live_mutation_authorized"] = False
        current = state.setdefault("live_mutation_authorization", {})
        current.update({
            "authorized": False,
            "hardware_writes_permitted_now": False,
            "transaction_consumed": bool(current.get("transaction_consumed") or self.install_attempts > 0),
            "candidate_attempts_used": max(int(current.get("candidate_attempts_used", 0)),self.install_attempts),
            "recovery_attempts_used": max(int(current.get("recovery_attempts_used", 0)),self.recovery_attempts),
            "candidate_release_id": self.candidate.release_id,
            "candidate_sha256": self.candidate.sha256,
            "rollback_sha256": self.candidate.rollback_sha256,
            "status": result["status"],
            "current_gate": result["status"],
        })
        if continuation:
            current.update({"operation_scope":"CLOSED_AFTER_QUALIFICATION","candidate_install_permitted":False})
        try: result_ref=str((self.outdir/target).resolve().relative_to(ROOT))
        except ValueError: raise RuntimeError("qualification output must remain inside the repository")
        current["transaction_result"] = result_ref
        subject=state.setdefault("execution_cursor",{}).setdefault("current_subject",{})
        result_file=self.outdir/target
        prior_result=subject.get("qualification_result")
        if (continuation and not subject.get("candidate_install_receipt")
            and isinstance(prior_result,str) and prior_result!=result_ref):
            prior_path=ROOT/prior_result
            try:
                prior=json.loads(prior_path.read_text())
                if (prior.get("schema")=="hbnf-cart2-candidate-qualification-transaction-v1"
                    and prior.get("candidate_release_id")==self.candidate.release_id
                    and prior.get("candidate_sha256")==self.candidate.sha256
                    and prior.get("candidate_install_attempts")==1):
                    subject["candidate_install_receipt"]=prior_result
                    subject["candidate_install_receipt_sha256"]=sha(prior_path)
            except (OSError,ValueError,TypeError):
                pass
        subject["qualification_result"]=result_ref
        subject["qualification_result_sha256"]=sha(result_file)
        if result.get("recovery", {}).get("status") in ("R4_READBACK_VERIFIED", "R4_ALREADY_INSTALLED_NO_UPLOAD"):
            state["installed_release"] = self.candidate.release_id if result.get("recovery",{}).get("runtime",{}).get("release_id")==self.candidate.release_id else R4
            state["installed_firmware_sha256"] = self.candidate.sha256 if state["installed_release"]==self.candidate.release_id else self.candidate.rollback_sha256
        elif result.get("status") == "QUALIFIED_OBJECTIVE_GATES_PASS":
            state["installed_release"] = self.candidate.release_id
            state["installed_firmware_sha256"] = self.candidate.sha256
        elif result.get("status") in ("OTA_NOT_INSTALLED_R4_REMAINS_NO_RETRY", "CANDIDATE_STAGE_FAILED_NO_WLED_REQUEST"):
            state["installed_release"] = R4
            state["installed_firmware_sha256"] = self.candidate.rollback_sha256
        elif result.get("candidate_runtime"):
            state["installed_release"] = self.candidate.release_id
            state["installed_firmware_sha256"] = self.candidate.sha256
        elif result.get("status") == "RECOVERY_UNVERIFIED_STOP":
            state["installed_release"] = None
            state["installed_firmware_sha256"] = None
        state["last_updated_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        task=state.setdefault("current_task",{})
        task["installed_release"]=state.get("installed_release")
        task["installed_firmware_sha256"]=state.get("installed_firmware_sha256")
        task["status"]=result["status"]
        task["live_mutation_authorized"]=False
        self.state_path.write_text(json.dumps(state, indent=2)+"\n")


def execute(admission_path, capsule_path, proof_path):
    profile=load_candidate_profile(pathlib.Path(capsule_path))
    profile.output.mkdir(parents=True, exist_ok=True)
    port = LivePort(pathlib.Path(admission_path), pathlib.Path(capsule_path), pathlib.Path(proof_path),candidate=profile)
    return coordinate(port)


def execute_qualification(admission_path,capsule_path,proof_path,outdir=None):
    profile=load_candidate_profile(pathlib.Path(capsule_path))
    output=prepare_qualification_output(outdir,profile)
    port=LivePort(pathlib.Path(admission_path),pathlib.Path(capsule_path),pathlib.Path(proof_path),output,profile)
    return coordinate_qualification(port)

def execute_r4_recovery_only(admission_path,capsule_path,proof_path,recovery_proof_path,outdir):
    profile=load_candidate_profile(pathlib.Path(capsule_path))
    output=prepare_qualification_output(outdir,profile)
    port=LivePort(pathlib.Path(admission_path),pathlib.Path(capsule_path),pathlib.Path(proof_path),output,profile)
    return port.recover_r4_after_failed_qualification(recovery_proof_path)


def execute_readonly_qualification_preflight(capsule_path,outdir,expected_matrix_brightness=None):
    """Refresh exact current-device evidence without opening the mutation path."""
    profile=load_candidate_profile(pathlib.Path(capsule_path))
    exact_artifacts(profile)
    output=prepare_qualification_output(outdir,profile)
    port=LivePort(None,capsule_path,None,output,profile)
    proof=port.preflight_candidate(expected_matrix_brightness)
    print(json.dumps({"status":"READONLY_QUALIFICATION_PREFLIGHT_PASS",
        "candidate_release_id":profile.release_id,"candidate_sha256":profile.sha256,
        "device_requests":port.device_requests,"device_mutations":0,
        "receipt":str((output/"QUALIFICATION_PRELIVE_READONLY.json").relative_to(ROOT))},indent=2))
    return proof

def execute_readonly_recovery_preflight(capsule_path,outdir):
    """Refresh current read-only evidence for the one exact R4 recovery path."""
    profile=load_candidate_profile(pathlib.Path(capsule_path))
    output=prepare_qualification_output(outdir,profile)
    port=LivePort(None,capsule_path,None,output,profile)
    proof=port.preflight_failed_candidate_recovery()
    print(json.dumps({"status":"READONLY_EXACT_R4_RECOVERY_PREFLIGHT_PASS",
        "candidate_release_id":profile.release_id,"candidate_sha256":profile.sha256,
        "recovery_sha256":profile.rollback_sha256,"device_requests":port.device_requests,
        "device_mutations":0,"receipt":str((output/"RECOVERY_PRELIVE_READONLY.json").relative_to(ROOT))},indent=2))
    return proof

def prepare_qualification_output(outdir,profile=LEGACY_R6_PROFILE):
    if outdir is None: raise RuntimeError("qualification continuation requires a new --outdir")
    output=pathlib.Path(outdir).resolve()
    try: output.relative_to(profile.output.resolve())
    except ValueError: raise RuntimeError("qualification output must be inside the exact candidate qualification evidence directory")
    if output==profile.output.resolve(): raise RuntimeError("qualification continuation cannot reuse the original install transaction directory")
    if output.exists() and any(output.iterdir()):
        raise RuntimeError("qualification output directory is not empty; preserve prior evidence and choose a new run directory")
    output.mkdir(parents=True,exist_ok=True)
    return output


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--admission", required=True)
    ap.add_argument("--capsule", required=True)
    ap.add_argument("--prelive-proof", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--resume-qualification",action="store_true",help="Continue gates for the exact installed candidate; does not stage or upload firmware")
    ap.add_argument("--recover-r4-only",action="store_true",help="Use the one exact owner-authorized R4 recovery after a completed performance failure; never installs or qualifies the candidate")
    ap.add_argument("--recovery-proof",help="Fresh read-only exact post-failure R4 recovery proof")
    ap.add_argument("--readonly-preflight-only",action="store_true",help="Refresh host/Matrix/AUX/Opal evidence without device writes or live authorization")
    ap.add_argument("--readonly-recovery-preflight-only",action="store_true",help="Refresh exact post-failure state for an R4-only recovery; performs no device writes")
    ap.add_argument("--expected-matrix-brightness",type=int,choices=range(0,256),default=None,
        help="For read-only preflight, assert the freshly captured current candidate brightness")
    ap.add_argument("--outdir",help="New empty evidence directory under the exact R6 qualification directory; required for qualification continuation")
    args = ap.parse_args()
    if args.recover_r4_only and (args.dry_run or args.resume_qualification or args.readonly_preflight_only or args.readonly_recovery_preflight_only):
        raise SystemExit("--recover-r4-only cannot be combined with another execution mode")
    if args.dry_run:
        profile=load_candidate_profile(pathlib.Path(args.capsule))
        exact_artifacts(profile)
        print(json.dumps({"status": "EXACT_ARTIFACTS_VALID_NO_DEVICE_REQUESTS", "device_requests": 0,
            "candidate": profile.release_id, "candidate_sha256": sha(profile.binary), "rollback_sha256": sha(profile.rollback_binary),
            "dry_run_does_not_authorize_mutation": True}, indent=2))
        return 0
    if args.readonly_preflight_only:
        if args.resume_qualification or args.readonly_recovery_preflight_only:
            raise SystemExit("read-only qualification preflight cannot be combined with another execution mode")
        if not args.outdir:
            raise SystemExit("--readonly-preflight-only requires a new --outdir so prior evidence remains immutable")
        execute_readonly_qualification_preflight(pathlib.Path(args.capsule),args.outdir,args.expected_matrix_brightness)
        return 0
    if args.readonly_recovery_preflight_only:
        if args.resume_qualification:
            raise SystemExit("--readonly-recovery-preflight-only cannot be combined with --resume-qualification")
        if not args.outdir:
            raise SystemExit("--readonly-recovery-preflight-only requires a new --outdir")
        execute_readonly_recovery_preflight(pathlib.Path(args.capsule),args.outdir)
        return 0
    if args.recover_r4_only:
        if not args.outdir or not args.recovery_proof:
            raise SystemExit("--recover-r4-only requires --recovery-proof and a new --outdir")
        result=execute_r4_recovery_only(pathlib.Path(args.admission),pathlib.Path(args.capsule),
            pathlib.Path(args.prelive_proof),pathlib.Path(args.recovery_proof),args.outdir)
        print(json.dumps(result,indent=2))
        return 0 if result.get("status")=="EXACT_R4_RECOVERED_AFTER_FAILED_QUALIFICATION" else 2
    if args.resume_qualification:
        if not args.outdir: raise SystemExit("--resume-qualification requires a new --outdir so prior failure receipts remain immutable")
        result=execute_qualification(pathlib.Path(args.admission),pathlib.Path(args.capsule),pathlib.Path(args.prelive_proof),args.outdir)
    else:
        result = execute(pathlib.Path(args.admission), pathlib.Path(args.capsule), pathlib.Path(args.prelive_proof))
    print(json.dumps(result, indent=2))
    return 0 if result.get("status") == "QUALIFIED_OBJECTIVE_GATES_PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
