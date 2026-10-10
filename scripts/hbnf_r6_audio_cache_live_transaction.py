#!/usr/bin/env python3
"""Single exact R6 audio-cache install + frozen qualification coordinator.

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


def read_matrix_identity(request_counter=None):
    """Read and validate the exact R6 Matrix identity without retaining unrelated config data."""
    info = _get_json_counted(MATRIX+"/json/info", 4, request_counter)[2]
    build = _get_json_counted(MATRIX+"/hbnf/build.json", 4, request_counter)[2]
    identity = {"ip": info.get("ip"), "mac": str(info.get("mac", "")).replace(":", "").lower(),
        "wled": info.get("ver"), "release_id": build.get("release_id"),
        "candidate": build.get("candidate"), "build_mac": str(build.get("mac", "")).replace(":", "").lower()}
    if (identity["ip"] != "192.168.77.10" or identity["mac"] != MATRIX_MAC or identity["wled"] != "16.0.1"
            or identity["release_id"] != RELEASE or identity["candidate"] != RELEASE or identity["build_mac"] != MATRIX_MAC):
        raise RuntimeError("qualification-matrix-identity-binding-failed")
    return identity, info, build


def sanitized_persisted_hbnf(config: dict) -> dict:
    """Extract only the three HBNF fields; raw cfg may contain credentials and is never logged or written."""
    um = config.get("um") if isinstance(config, dict) else None
    hbnf = um.get("hbnfFoundationV1") if isinstance(um, dict) else None
    if not isinstance(hbnf, dict):
        raise RuntimeError("persisted-config-missing-HBNF-settings")
    values = {key: hbnf.get(key) for key in ("matrixBrightness", "auxBrightness", "vibe")}
    if any(type(value) is not int for value in values.values()):
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


def read_matrix_context(request_counter=None):
    identity_before, info, build = read_matrix_identity(request_counter) if request_counter is not None else read_matrix_identity()
    state = _get_json_counted(MATRIX+"/json/state", 4, request_counter)[2]
    # The read-only file API is parsed in memory; only HBNF brightness/AUX/vibe
    # fields survive extraction, regardless of whether the target requires a PIN.
    persisted_raw = _get_json_counted(PERSISTED_CONFIG_URL, 6, request_counter)[2]
    persisted = sanitized_persisted_hbnf(persisted_raw)
    identity_after, _, _ = read_matrix_identity(request_counter) if request_counter is not None else read_matrix_identity()
    if identity_before != identity_after:
        raise RuntimeError("qualification-matrix-identity-changed-during-readback")
    return {"identity": identity_after, "info": info, "build": build, "state": state,
        "persisted": persisted, "brightness": brightness_readback(state, persisted)}


def read_matrix_brightness_pair(request_counter=None):
    context = read_matrix_context(request_counter)
    result = context["brightness"]
    result["identity"] = context["identity"]
    return result


def change_matrix_brightness(target: dict, *, operation: str, sleeper=time.sleep,
                             monotonic=time.monotonic, request_counter=None) -> dict:
    """Set the frozen test brightness or restore captured HBNF settings, resolving uncertain POSTs by readback."""
    if operation == "measure":
        if not isinstance(target, dict) or set(target) != {"matrixBrightness", "auxBrightness", "vibe"}:
            raise RuntimeError("qualification-baseline-receipt-invalid")
        if any(type(v) is not int for v in target.values()) or target["matrixBrightness"] != QUALIFICATION_BASELINE_BRIGHTNESS:
            raise RuntimeError("qualification-baseline-receipt-invalid")
        requested = {"matrixBrightness": FROZEN_MATRIX_BRIGHTNESS}
        target_brightness = FROZEN_MATRIX_BRIGHTNESS
        expected_settings = {**target, "matrixBrightness": target_brightness}
    elif operation == "restore":
        if not isinstance(target, dict) or set(target) != {"matrixBrightness", "auxBrightness", "vibe"}:
            raise RuntimeError("qualification-baseline-receipt-invalid")
        if any(type(v) is not int for v in target.values()):
            raise RuntimeError("qualification-baseline-receipt-invalid")
        requested = {"matrixBrightness": target["matrixBrightness"]}
        target_brightness = target["matrixBrightness"]
        expected_settings = dict(target)
    else:
        raise RuntimeError("unknown-qualification-brightness-operation")

    # Rebind the target immediately before every write; never set power, AUX, or Vibe.
    identity_before_post, _, _ = read_matrix_identity(request_counter) if request_counter is not None else read_matrix_identity()
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
            values = read_matrix_brightness_pair(request_counter) if request_counter is not None else read_matrix_brightness_pair()
            if values.get("identity") != identity_before_post:
                raise RuntimeError("qualification-matrix-identity-changed-before-readback")
            expected_runtime = dict(expected_settings)
            expected_persisted = dict(expected_settings)
            if values["matrix_on"] is True and all(values["runtime"].get(k) == v for k, v in expected_runtime.items()) and all(
                    values["persisted"].get(k) == v for k, v in expected_persisted.items()):
                # HBNF defers dirty marking for 850 ms after /json/state; wait beyond it,
                # then take a second readback before starting profiles or closing restore.
                sleeper(CONFIG_SAVE_SETTLE_SECONDS)
                final = read_matrix_brightness_pair(request_counter) if request_counter is not None else read_matrix_brightness_pair()
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
                    "persisted_readback_semantics": "Raw /cfg.json is parsed in memory; only HBNF brightness/AUX/vibe fields are retained; raw config is not logged or saved"}
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


def exact_artifacts():
    if sha(BIN) != CANDIDATE_SHA or BIN.stat().st_size != CANDIDATE_SIZE:
        raise RuntimeError("candidate-byte-identity-failed")
    if sha(R4_BIN) != R4_SHA or R4_BIN.stat().st_size != R4_SIZE:
        raise RuntimeError("r4-recovery-byte-identity-failed")


def check_admission(admission_path: pathlib.Path, capsule_path: pathlib.Path, proof_path: pathlib.Path, stage="LIVE_APPROVED"):
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
    ids = admission["identities"]
    if (ids.get("candidate_release_id") != RELEASE or ids.get("candidate_bin_sha256") != CANDIDATE_SHA
        or pathlib.Path(ids.get("candidate_bin_path", "")).resolve() != BIN.resolve()
        or ids.get("rollback_bin_sha256") != R4_SHA
        or pathlib.Path(ids.get("rollback_bin_path", "")).resolve() != R4_BIN.resolve()
        or str(ids.get("matrix_mac", "")).replace(":", "").lower() != MATRIX_MAC):
        raise RuntimeError("admission-artifact-target-binding-mismatch")
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


def preflight():
    exact_artifacts()
    power = run(["pmset", "-g", "batt"], timeout=5).stdout.decode(errors="replace")
    route = run(["route", "-n", "get", "192.168.77.10"], timeout=5).stdout.decode(errors="replace")
    if "AC Power" not in power or "interface: en0" not in route:
        raise RuntimeError("host-power-or-cart-lan-preflight-failed")
    mi = get_json(MATRIX+"/json/info")[2]
    ms = get_json(MATRIX+"/json/state")[2]
    mb = get_json(MATRIX+"/hbnf/build.json")[2]
    ai = get_json(AUX+"/json/info")[2]
    ast = get_json(AUX+"/json/state")[2]
    h = ms.get("HBNF", {})
    p20 = h.get("packet20Diagnostic", {})
    telem = h.get("foundationTelemetry", {})
    expected = (mi.get("ip") == "192.168.77.10" and mi.get("mac", "").replace(":", "").lower() == MATRIX_MAC
                and mi.get("ver") == "16.0.1" and mb.get("release_id") == R4 and mb.get("candidate") == R4
                and h.get("candidate") == R4 and ms.get("on") is True and h.get("matrixBrightness") == 44
                and p20.get("enabled") is False and telem.get("enabled") is False)
    aux_ok = (ai.get("ip") == "192.168.77.11" and ai.get("mac", "").replace(":", "").lower() == AUX_MAC
              and ai.get("ver") == "16.0.1" and ai.get("live") is True and ai.get("lm") == "DDP"
              and ai.get("lip") == "192.168.77.10" and ai.get("leds", {}).get("count") == 22
              and ast.get("on") is True and ast.get("lor") == 0)
    if not expected or not aux_ok:
        raise RuntimeError("fresh-matrix-r4-or-aux-ddp-preflight-failed")
    worker = single_worker_check()
    opal = ("set -e; printf OPAL_PREFLIGHT_OK\\n; uptime; df -k /tmp; command -v curl; command -v sha256sum; "
            "test -r /etc/hbnf-updater/release-state; cat /etc/hbnf-updater/release-state")
    op = run(SSH+["-o", "ConnectTimeout=4", OPAL, opal], timeout=15)
    opal_out = op.stdout.decode(errors="replace")
    if op.returncode or "OPAL_PREFLIGHT_OK" not in opal_out or f"55 {R4} {R4_SHA}" not in opal_out or "curl" not in opal_out or "sha256sum" not in opal_out:
        raise RuntimeError("opal-readonly-release-ledger-or-transfer-preflight-failed")
    receipt = {"schema": "hbnf-r6-audio-cache-fresh-prelive-v1", "captured_at_unix": time.time(),
               "pass": True, "host_on_ac": True, "route": "en0/192.168.77.0/24",
               "matrix": {"ip": mi["ip"], "mac": mi["mac"], "wled": mi["ver"], "release": mb["release_id"],
                          "uptime_seconds": mi.get("uptime"), "free_heap": mi.get("freeheap"),
                          "brightness": h.get("matrixBrightness"), "fps": mi.get("leds", {}).get("fps"),
                          "telemetry_off": telem.get("enabled") is False, "diagnostic_off": p20.get("enabled") is False},
               "aux": {"ip": ai["ip"], "mac": ai["mac"], "wled": ai["ver"], "live": ai["live"],
                       "mode": ai["lm"], "source": ai["lip"], "led_count": ai["leds"]["count"], "lor": ast.get("lor")},
               "opal": {"read_only": True, "stdout": opal_out}, "single_worker": worker,
               "candidate_sha256": CANDIDATE_SHA, "rollback_sha256": R4_SHA,
               "no_house_voltage_sensor": True}
    save(OUT/"FRESH_PRELIVE_READONLY.json", receipt)
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


def qualification_command(outdir: pathlib.Path):
    sweep = [sys.executable, str(ROOT/"scripts/hbnf_live_kernel_sweep.py"),
        "--adapter", str(ADAPTER.relative_to(ROOT)), "--inventory", "config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json",
        "--outdir", str(outdir/"sweep"), "--contract", "foundation", "--qualify", "--soak-seconds", "5400",
        "--combined-check-script", str(ROOT/"scripts/hbnf_r6_combined_feature_check.py"),
        "--soak-interval-seconds", "8", "--threshold-policy", "config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json",
        "--early-r4-profile-dir", "evidence/hbnf-foundation-qualification-20261005/seq39/live/foundation-sweep",
        "--early-r4-baseline-manifest", "evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json",
        "--early-r4-release", R4, "--compare-all-r4"]
    return sweep


def coordinate(port):
    """One-attempt transaction state machine shared by live and fake ports."""
    result = {"schema": "hbnf-r6-audio-cache-qualification-transaction-v1",
              "candidate_release_id": RELEASE, "candidate_sha256": CANDIDATE_SHA,
              "rollback_sha256": R4_SHA, "candidate_install_attempts": 0,
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
            q = port.qualify()
            result["qualification"] = q
            if q.get("passed") is True:
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
    )
    return any(marker in text for marker in markers)


def coordinate_qualification(port):
    """Resume the remaining frozen gates for an already-installed exact R6; never uploads."""
    result={"schema":"hbnf-r6-audio-cache-qualification-continuation-v1",
        "candidate_release_id":RELEASE,"candidate_sha256":CANDIDATE_SHA,"rollback_sha256":R4_SHA,
        "operation_scope":"QUALIFICATION_ONLY","candidate_install_attempts":0,"recovery_attempts":0,"device_requests":0}
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
        result["device_requests"]=port.device_requests
        setup_started = True
        try:
            result["brightness_setup"] = port.apply_qualification_brightness(
                preflight["brightness_baseline"]["runtime"])
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
                    preflight["brightness_baseline"]["runtime"])
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
    def __init__(self, admission_path, capsule_path, proof_path, outdir=None):
        self.admission_path = admission_path
        self.capsule_path = capsule_path
        self.proof_path = proof_path
        self.admission = None
        self.device_requests = 0
        self.install_attempts = 0
        self.recovery_attempts = 0
        self.state_path = ROOT/"config/HBNF_CONTROL_STATE.json"
        self.outdir = pathlib.Path(outdir).resolve() if outdir else OUT

    def admit(self, stage="LIVE_APPROVED"):
        self.admission = check_admission(self.admission_path, self.capsule_path, self.proof_path, stage)

    def _record_device_request(self):
        self.device_requests += 1

    def verify_local_artifacts(self):
        exact_artifacts()
        if self.admission is None:
            raise RuntimeError("admission-not-passed")

    def preflight(self):
        self.device_requests += 6
        return preflight()

    def preflight_candidate(self):
        exact_artifacts()
        power=run(["pmset","-g","batt"],timeout=5).stdout.decode(errors="replace")
        route=run(["route","-n","get","192.168.77.10"],timeout=5).stdout.decode(errors="replace")
        if "AC Power" not in power or "interface: en0" not in route:
            raise RuntimeError("qualification-only host AC/LAN preflight failed")
        matrix_context=read_matrix_context(self._record_device_request)
        mi=matrix_context["info"]; ms=matrix_context["state"]; mb=matrix_context["build"]
        ai=_get_json_counted(AUX+"/json/info", 4, self._record_device_request)[2]
        ast=_get_json_counted(AUX+"/json/state", 4, self._record_device_request)[2]
        h=ms.get("HBNF",{}); p20=h.get("packet20Diagnostic",{}); telem=h.get("foundationTelemetry",{})
        if not (mi.get("ip")=="192.168.77.10" and mi.get("mac","").replace(":","").lower()==MATRIX_MAC
                and mi.get("ver")=="16.0.1" and mb.get("release_id")==RELEASE and mb.get("candidate")==RELEASE
                and mb.get("mac","").replace(":","").lower()==MATRIX_MAC and h.get("candidate")==RELEASE
                and ms.get("on") is True and p20.get("enabled") is False and telem.get("enabled") is False):
            raise RuntimeError("qualification preflight did not verify exact healthy R6 runtime")
        if not (ai.get("ip")=="192.168.77.11" and ai.get("mac","").replace(":","").lower()==AUX_MAC
                and ai.get("ver")=="16.0.1" and ai.get("live") is True and ai.get("lm")=="DDP"
                and ai.get("lip")=="192.168.77.10" and ai.get("leds",{}).get("count")==22
                and ast.get("on") is True and ast.get("lor")==0):
            raise RuntimeError("qualification preflight AUX DDP/output checks failed")
        brightness_baseline=validate_brightness_baseline(ms,matrix_context["persisted"])
        if matrix_context["identity"]["release_id"] != RELEASE:
            raise RuntimeError("qualification-matrix-identity-binding-failed")
        worker=single_worker_check()
        opal=("set -e; printf OPAL_QUALIFICATION_PREFLIGHT_OK\\n; command -v sha256sum; test -r /etc/hbnf-updater/release-state; cat /etc/hbnf-updater/release-state")
        self._record_device_request()
        p=run(SSH+["-o","ConnectTimeout=4",OPAL,opal],timeout=15); out=p.stdout.decode(errors="replace")
        if p.returncode or "OPAL_QUALIFICATION_PREFLIGHT_OK" not in out or f"55 {R4} {R4_SHA}" not in out:
            raise RuntimeError("qualification preflight cannot prove exact Opal R4 recovery")
        proof={"schema":"hbnf-r6-qualification-prelive-v1","captured_unix":time.time(),"pass":True,
            "operation_scope":"QUALIFICATION_ONLY","host_on_ac":True,"cart_lan_interface":"en0",
            "matrix":{"ip":mi["ip"],"mac":mi["mac"],"wled":mi["ver"],"release_id":mb["release_id"],
                "candidate_sha256":CANDIDATE_SHA,"uptime_seconds":mi.get("uptime"),"fps":mi.get("leds",{}).get("fps"),
                "free_heap":mi.get("freeheap"),"brightness":h.get("matrixBrightness"),"diagnostic_off":True,"telemetry_off":True},
            "brightness_baseline":brightness_baseline,
            "aux":{"ip":ai["ip"],"mac":ai["mac"],"live":ai["live"],"mode":ai["lm"],"source":ai["lip"],"led_count":ai["leds"]["count"],"on":ast["on"],"lor":ast["lor"]},
            "rollback":{"sha256":R4_SHA,"opal_ledger":out},"single_worker":worker,
            "candidate_attempts_used":1,"candidate_install_permitted":False}
        save(self.outdir/"QUALIFICATION_PRELIVE_READONLY.json",proof)
        return proof

    def apply_qualification_brightness(self, baseline):
        if not isinstance(baseline, dict) or baseline.get("matrixBrightness") != QUALIFICATION_BASELINE_BRIGHTNESS:
            raise RuntimeError("qualification-brightness-baseline-not-admitted")
        return change_matrix_brightness(baseline, operation="measure", request_counter=self._record_device_request)

    def restore_qualification_brightness(self, baseline):
        if not isinstance(baseline, dict) or baseline.get("matrixBrightness") != QUALIFICATION_BASELINE_BRIGHTNESS:
            raise RuntimeError("qualification-brightness-baseline-receipt-invalid")
        return change_matrix_brightness(baseline, operation="restore", request_counter=self._record_device_request)

    def stage_candidate(self):
        return stage_once(BIN, "/tmp/hbnf-r6-audio-cache-candidate.bin")

    def consume_install_attempt(self):
        state = json.loads(self.state_path.read_text())
        binding = self.admission.get("fresh_owner_authorization") if self.admission else None
        auth = state.get("r6_audio_cache_successor", {}).get("conditional_authority", {})
        if (not isinstance(binding, dict) or state.get("live_mutation_authorized") is not True
            or state.get("live_authorization_binding") != binding
            or binding.get("candidate_release_id") != RELEASE
            or binding.get("candidate_bin_sha256") != CANDIDATE_SHA
            or binding.get("rollback_bin_sha256") != R4_SHA
            or str(binding.get("matrix_mac", "")).replace(":", "").lower() != MATRIX_MAC):
            raise RuntimeError("exact-owner-authorization-state-binding-changed-before-install")
        if auth.get("candidate_attempts_used", 0) != 0:
            raise RuntimeError("candidate-attempt-already-consumed")
        auth["candidate_attempts_used"] = 1
        auth["candidate_attempt_started_unix"] = time.time()
        auth["status"] = "CONSUMED_BEFORE_WLED_POST"
        state["r6_audio_cache_successor"]["conditional_authority"] = auth
        state["live_mutation_authorized"] = True
        current = state.setdefault("live_mutation_authorization", {})
        current.update({
            "authorized": True,
            "candidate_release_id": RELEASE,
            "candidate_sha256": CANDIDATE_SHA,
            "rollback_sha256": R4_SHA,
            "hardware_writes_permitted_now": True,
            "transaction_consumed": True,
            "candidate_attempts_used": 1,
            "recovery_attempts_used": 0,
            "current_gate": "Exact candidate attempt durably consumed before the one WLED /update request.",
        })
        self.state_path.write_text(json.dumps(state, indent=2)+"\n")
        self.install_attempts = 1
        save(self.outdir/"AUTHORIZATION_CONSUMPTION.json", {
            "authorization_id": self.admission["fresh_owner_authorization"]["authorization_id"],
            "candidate_release_id": RELEASE, "candidate_sha256": CANDIDATE_SHA,
            "candidate_attempt": 1, "candidate_attempt_limit": 1, "r4_recovery_limit": 1,
            "recorded_before_wled_post": True,
            "preflight_sha256": sha(self.outdir/"FRESH_PRELIVE_READONLY.json")})

    def upload_candidate(self):
        self.device_requests += 1
        return upload_once("/tmp/hbnf-r6-audio-cache-candidate.bin", self.outdir/"candidate-ota-response.txt")

    def resolve_runtime(self, upload):
        deadline = time.monotonic()+150
        last = None
        exact_r4_seen = False
        last_r4_runtime = None
        while time.monotonic() < deadline:
            try:
                self.device_requests += 3
                runtime = read_runtime()
                if exact_runtime(runtime, RELEASE):
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
        cmd = qualification_command(self.outdir)
        p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=6000)
        (self.outdir/"SWEEP_STDOUT.json.txt").write_text(p.stdout)
        (self.outdir/"SWEEP_STDERR.txt").write_text(p.stderr)
        report_path = self.outdir/"sweep/ALL_KERNEL_SWEEP_REPORT.json"
        report = json.loads(report_path.read_text()) if report_path.is_file() else {}
        abort_path = self.outdir/"sweep/SWEEP_ABORT.json"
        abort = json.loads(abort_path.read_text()) if abort_path.is_file() else {}
        return {"passed": p.returncode == 0, "returncode": p.returncode, "report": report, "abort": abort}

    def recover_r4(self):
        self.recovery_attempts += 1
        if self.recovery_attempts > 1:
            raise RuntimeError("exact-r4-recovery-attempt-limit-exceeded")
        self.device_requests += 3
        return restore_r4_once(self.outdir)

    def close(self, result):
        continuation=result.get("operation_scope")=="QUALIFICATION_ONLY"
        target="QUALIFICATION_CONTINUATION_RESULT.json" if continuation else "TRANSACTION_RESULT.json"
        save(self.outdir/target, result)
        state = json.loads(self.state_path.read_text())
        state["live_mutation_authorized"] = False
        auth = state.get("r6_audio_cache_successor", {}).get("conditional_authority", {})
        current = state.setdefault("live_mutation_authorization", {})
        current.update({
            "authorized": False,
            "hardware_writes_permitted_now": False,
            "transaction_consumed": self.install_attempts > 0,
            "candidate_attempts_used": auth.get("candidate_attempts_used", 0),
            "recovery_attempts_used": self.recovery_attempts,
            "current_gate": result["status"],
        })
        if continuation:
            current.update({"operation_scope":"CLOSED_AFTER_QUALIFICATION","candidate_install_permitted":False})
        auth["live_mutation_authorized"] = False
        auth["status"] = result["status"]
        auth["recovery_attempts_used"] = self.recovery_attempts
        state["r6_audio_cache_successor"]["conditional_authority"] = auth
        state["r6_audio_cache_successor"]["status"] = result["status"]
        if continuation:
            try: result_ref=str((self.outdir/target).resolve().relative_to(ROOT))
            except ValueError: raise RuntimeError("qualification output must remain inside the repository")
            state["r6_audio_cache_successor"]["qualification_result"] = result_ref
        else:
            state["r6_audio_cache_successor"]["transaction_result"] = "evidence/cart2-r6-audio-cache-20261010/live-qualification/TRANSACTION_RESULT.json"
        if result.get("recovery", {}).get("status") in ("R4_READBACK_VERIFIED", "R4_ALREADY_INSTALLED_NO_UPLOAD"):
            state["installed_release"] = R4
            state["installed_firmware_sha256"] = R4_SHA
        elif result.get("status") == "QUALIFIED_OBJECTIVE_GATES_PASS":
            state["installed_release"] = RELEASE
            state["installed_firmware_sha256"] = CANDIDATE_SHA
        elif result.get("status") in ("OTA_NOT_INSTALLED_R4_REMAINS_NO_RETRY", "CANDIDATE_STAGE_FAILED_NO_WLED_REQUEST"):
            state["installed_release"] = R4
            state["installed_firmware_sha256"] = R4_SHA
        elif result.get("candidate_runtime"):
            state["installed_release"] = RELEASE
            state["installed_firmware_sha256"] = CANDIDATE_SHA
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
    OUT.mkdir(parents=True, exist_ok=True)
    port = LivePort(pathlib.Path(admission_path), pathlib.Path(capsule_path), pathlib.Path(proof_path))
    return coordinate(port)


def execute_qualification(admission_path,capsule_path,proof_path,outdir=None):
    output=prepare_qualification_output(outdir)
    port=LivePort(pathlib.Path(admission_path),pathlib.Path(capsule_path),pathlib.Path(proof_path),output)
    return coordinate_qualification(port)

def prepare_qualification_output(outdir):
    if outdir is None: raise RuntimeError("qualification continuation requires a new --outdir")
    output=pathlib.Path(outdir).resolve()
    try: output.relative_to(OUT.resolve())
    except ValueError: raise RuntimeError("qualification output must be inside the exact R6 qualification evidence directory")
    if output==OUT.resolve(): raise RuntimeError("qualification continuation cannot reuse the original install transaction directory")
    if output.exists() and any(output.iterdir()):
        raise RuntimeError("qualification output directory is not empty; preserve prior evidence and choose a new run directory")
    output.mkdir(parents=True,exist_ok=True)
    return output


def close_authority(status, result):
    path = ROOT/"config/HBNF_CONTROL_STATE.json"
    state = json.loads(path.read_text())
    state["live_mutation_authorized"] = False
    state["r6_audio_cache_successor"]["conditional_authority"]["live_mutation_authorized"] = False
    state["r6_audio_cache_successor"]["conditional_authority"]["status"] = status
    state["r6_audio_cache_successor"]["status"] = status
    state["r6_audio_cache_successor"]["transaction_result"] = "evidence/cart2-r6-audio-cache-20261010/live-qualification/TRANSACTION_RESULT.json"
    if status in ("QUALIFIED_OBJECTIVE_GATES_PASS", "QUALIFICATION_FAILED_OR_INCOMPLETE"):
        # Preserve the read-back runtime, which may be candidate or known R4.
        observed = result.get("recovery", {}).get("runtime", {}).get("matrix_build", {})
        if observed.get("release_id") == R4:
            state["installed_release"] = R4
            state["installed_firmware_sha256"] = R4_SHA
    elif result.get("recovery", {}).get("status") == "R4_READBACK_VERIFIED":
        state["installed_release"] = R4
        state["installed_firmware_sha256"] = R4_SHA
    state["last_updated_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    path.write_text(json.dumps(state, indent=2)+"\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--admission", required=True)
    ap.add_argument("--capsule", required=True)
    ap.add_argument("--prelive-proof", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--resume-qualification",action="store_true",help="Continue gates for the exact installed candidate; does not stage or upload firmware")
    ap.add_argument("--outdir",help="New empty evidence directory under the exact R6 qualification directory; required for qualification continuation")
    args = ap.parse_args()
    if args.dry_run:
        exact_artifacts()
        print(json.dumps({"status": "EXACT_ARTIFACTS_VALID_NO_DEVICE_REQUESTS", "device_requests": 0,
            "candidate": RELEASE, "candidate_sha256": sha(BIN), "rollback_sha256": sha(R4_BIN),
            "dry_run_does_not_authorize_mutation": True}, indent=2))
        return 0
    if args.resume_qualification:
        if not args.outdir: raise SystemExit("--resume-qualification requires a new --outdir so prior failure receipts remain immutable")
        result=execute_qualification(pathlib.Path(args.admission),pathlib.Path(args.capsule),pathlib.Path(args.prelive_proof),args.outdir)
    else:
        result = execute(pathlib.Path(args.admission), pathlib.Path(args.capsule), pathlib.Path(args.prelive_proof))
    print(json.dumps(result, indent=2))
    return 0 if result.get("status") == "QUALIFIED_OBJECTIVE_GATES_PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
