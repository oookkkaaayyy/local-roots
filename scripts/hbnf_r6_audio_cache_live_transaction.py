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


def get_json(url: str, timeout: float = 4):
    import urllib.request
    req = urllib.request.Request(url, headers={"Cache-Control": "no-store"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read()
        return response.status, raw, json.loads(raw)


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


def check_admission(admission_path: pathlib.Path, capsule_path: pathlib.Path, proof_path: pathlib.Path):
    # This is deliberately before any LAN/router/device request.
    control = run([sys.executable, str(ROOT/"scripts/hbnf_control.py"), "check-admission",
                   "--admission", str(admission_path), "--stage", "LIVE_APPROVED"], timeout=20)
    if control.returncode:
        raise RuntimeError("live-admission-rejected-before-device-request:"+control.stdout.decode(errors="replace")[-1200:])
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


class LivePort:
    def __init__(self, admission_path, capsule_path, proof_path):
        self.admission_path = admission_path
        self.capsule_path = capsule_path
        self.proof_path = proof_path
        self.admission = None
        self.device_requests = 0
        self.install_attempts = 0
        self.recovery_attempts = 0
        self.state_path = ROOT/"config/HBNF_CONTROL_STATE.json"
        self.outdir = OUT

    def admit(self):
        self.admission = check_admission(self.admission_path, self.capsule_path, self.proof_path)

    def verify_local_artifacts(self):
        exact_artifacts()
        if self.admission is None:
            raise RuntimeError("admission-not-passed")

    def preflight(self):
        self.device_requests += 6
        return preflight()

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
        while time.monotonic() < deadline:
            try:
                self.device_requests += 3
                runtime = read_runtime()
                if exact_runtime(runtime, RELEASE):
                    return {"installed": True, "runtime": runtime,
                            "http_response_ambiguous": not upload.get("confirmed", False)}
                if exact_runtime(runtime, R4):
                    return {"installed": False, "runtime": runtime,
                            "http_response_ambiguous": not upload.get("confirmed", False)}
                last = "readback is neither exact candidate nor exact R4"
            except Exception as exc:
                last = str(exc)
            time.sleep(3)
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
        save(self.outdir/"TRANSACTION_RESULT.json", result)
        state = json.loads(self.state_path.read_text())
        state["live_mutation_authorized"] = False
        auth = state.get("r6_audio_cache_successor", {}).get("conditional_authority", {})
        auth["live_mutation_authorized"] = False
        auth["status"] = result["status"]
        auth["recovery_attempts_used"] = self.recovery_attempts
        state["r6_audio_cache_successor"]["conditional_authority"] = auth
        state["r6_audio_cache_successor"]["status"] = result["status"]
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
        self.state_path.write_text(json.dumps(state, indent=2)+"\n")


def execute(admission_path, capsule_path, proof_path):
    OUT.mkdir(parents=True, exist_ok=True)
    port = LivePort(pathlib.Path(admission_path), pathlib.Path(capsule_path), pathlib.Path(proof_path))
    return coordinate(port)


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
    args = ap.parse_args()
    if args.dry_run:
        exact_artifacts()
        print(json.dumps({"status": "EXACT_ARTIFACTS_VALID_NO_DEVICE_REQUESTS", "device_requests": 0,
            "candidate": RELEASE, "candidate_sha256": sha(BIN), "rollback_sha256": sha(R4_BIN),
            "dry_run_does_not_authorize_mutation": True}, indent=2))
        return 0
    result = execute(pathlib.Path(args.admission), pathlib.Path(args.capsule), pathlib.Path(args.prelive_proof))
    print(json.dumps(result, indent=2))
    return 0 if result.get("status") == "QUALIFIED_OBJECTIVE_GATES_PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
