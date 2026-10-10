#!/usr/bin/env python3
"""One guarded Packet20 r2 install/sweep/Release07 recovery transaction.

This host controller deliberately never reads the Opal release-state file.
Each OTA is sent once. After a candidate OTA has been attempted, exact Release07
recovery is attempted once even if candidate identity or the sweep fails.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
MATRIX = "http://192.168.77.10"
AUX = "http://192.168.77.11"
MATRIX_MAC = "704bca5b345c"
AUX_MAC = "8c94df55c34c"
BASE_RELEASE = "hbnf-matrix-coordinated-v1-20261002-07"
BASE_SHA = "8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab"
BASE_SIZE = 1458624
BASE_MANIFEST_SHA = "7741978130173a84d3f96aa80dd31a4ab8f6657d4810bdf492bc170f653a61b3"
BASE_SIGNATURE_SHA = "d197c58e21010f3a1eec09d47e8e5abc452246355a6ad4f36f40c16b93c98be3"
BASE_RELEASE_SEQ = 20
CANDIDATE_RELEASE = "hbnf-matrix-packet20-timing-hook-v1-20261005-r2"
CANDIDATE_SHA = "42f2ed58c3b89af95926ee0cf5824a575df9dcf75c7fbb8ead9d6eaff427ee07"
CANDIDATE_SIZE = 1463664
CANDIDATE_SOURCE_SHA = "4449619d41a485126633baf15f35ec5507827587f2a38e6a372b8e5e4f2cab0b"
CANDIDATE_BUILD_COMMIT = "d98cc5a94a326f0610238314c542e8c59083d414"


def sha(path: pathlib.Path) -> tuple[str, int]:
    b = path.read_bytes()
    return hashlib.sha256(b).hexdigest(), len(b)


def get_json(url: str, timeout: float = 7) -> tuple[int, bytes, dict]:
    req = urllib.request.Request(url, headers={"Cache-Control": "no-store"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        return r.status, raw, json.loads(raw)


def save_json(path: pathlib.Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def capture(out: pathlib.Path, label: str) -> dict:
    result = {"captured_at_unix": time.time(), "responses": {}}
    for name, url in (
        ("matrix_info", MATRIX + "/json/info"),
        ("matrix_state", MATRIX + "/json/state"),
        ("matrix_build", MATRIX + "/hbnf/build.json"),
        ("aux_info", AUX + "/json/info"),
    ):
        code, raw, data = get_json(url)
        save_json(out / f"{label}-{name}.json", data)
        result["responses"][name] = {
            "http": code,
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "data": data,
        }
    return result


def assert_matrix(data: dict, release: str) -> None:
    info = data["responses"]["matrix_info"]["data"]
    build = data["responses"]["matrix_build"]["data"]
    if info.get("ip") != "192.168.77.10" or info.get("mac", "").replace(":", "").lower() != MATRIX_MAC:
        raise RuntimeError("matrix-ip-or-mac-mismatch")
    if info.get("ver") != "16.0.1":
        raise RuntimeError("matrix-wled-version-mismatch")
    if build.get("release_id") != release or build.get("candidate") != release:
        raise RuntimeError(f"matrix-runtime-identity-mismatch:{build.get('release_id')}:{release}")
    if "HBNF" not in data["responses"]["matrix_state"]["data"]:
        raise RuntimeError("matrix-hbnf-telemetry-missing")


def upload_once(bin_path: pathlib.Path, response_path: pathlib.Path) -> dict:
    cmd = [
        "curl", "--silent", "--show-error", "--connect-timeout", "5",
        "--max-time", "180", "-F",
        f"update=@{bin_path};type=application/octet-stream",
        "-o", str(response_path), "-w", "%{http_code}", MATRIX + "/update",
    ]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=190)
    response = response_path.read_bytes() if response_path.exists() else b""
    receipt = {
        "curl_exit": p.returncode,
        "http_status": p.stdout.strip(),
        "response_sha256": hashlib.sha256(response).hexdigest(),
        "response_bytes": len(response),
        "response_contains_update_successful": b"Update successful" in response,
        "stderr": p.stderr[-1000:],
        "attempts": 1,
        "retry_performed": False,
    }
    if p.returncode or p.stdout.strip() != "200" or not receipt["response_contains_update_successful"]:
        raise RuntimeError("ota-response-not-confirmed-no-retry")
    return receipt


def wait_identity(out: pathlib.Path, release: str, timeout: int = 150) -> dict:
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            data = capture(out, "identity-poll")
            assert_matrix(data, release)
            return data
        except Exception as exc:
            last_error = str(exc)
            time.sleep(3)
    raise RuntimeError(f"runtime-identity-timeout:{release}:{last_error}")


def atomic_ledger_write(sequence: int, release: str, digest: str) -> None:
    line = f"{sequence} {release} {digest}"
    remote = (
        "umask 077; printf '%s\\n' '" + line + "' > /etc/hbnf-updater/release-state.tmp"
        " && chmod 600 /etc/hbnf-updater/release-state.tmp && sync"
        " && mv /etc/hbnf-updater/release-state.tmp /etc/hbnf-updater/release-state"
        " && sync && printf LEDGER_WRITE_OK"
    )
    ssh = [
        "ssh", "-i", str(pathlib.Path.home() / ".ssh/hbnf_opal_rsa"),
        "-o", "IdentitiesOnly=yes", "-o", "HostKeyAlgorithms=+ssh-rsa",
        "-o", "PubkeyAcceptedAlgorithms=+ssh-rsa", "-o", "PasswordAuthentication=no",
        "-o", "BatchMode=yes", "root@192.168.77.1", remote,
    ]
    p = subprocess.run(ssh, capture_output=True, text=True, timeout=20)
    if p.returncode or "LEDGER_WRITE_OK" not in p.stdout:
        raise RuntimeError(f"release-state-seq{sequence}-atomic-write-failed")


def verify_recovery(manifest: pathlib.Path, signature: pathlib.Path, pubkey: pathlib.Path,
                    recovery_bin: pathlib.Path, out: pathlib.Path) -> dict:
    raw, sig, blob = manifest.read_bytes(), signature.read_bytes(), recovery_bin.read_bytes()
    m = json.loads(raw)
    values = {
        "manifest_sha256": hashlib.sha256(raw).hexdigest(),
        "signature_sha256": hashlib.sha256(sig).hexdigest(),
        "firmware_sha256": hashlib.sha256(blob).hexdigest(),
        "firmware_bytes": len(blob),
        "release_id": m.get("release_id"),
        "role": m.get("release_role"),
        "sequence": m.get("release_sequence"),
        "matrix_mac": m.get("matrix_mac"),
    }
    if (values["manifest_sha256"] != BASE_MANIFEST_SHA or values["signature_sha256"] != BASE_SIGNATURE_SHA
            or values["firmware_sha256"] != BASE_SHA or len(blob) != BASE_SIZE
            or m.get("release_id") != BASE_RELEASE or m.get("release_role") != "recovery"
            or m.get("release_sequence") != BASE_RELEASE_SEQ
            or m.get("matrix_mac", "").replace(":", "").lower() != MATRIX_MAC
            or m.get("sha256") != BASE_SHA or m.get("size_bytes") != BASE_SIZE):
        raise RuntimeError("exact-release07-recovery-artifact-contract-failed")
    p = subprocess.run(
        ["openssl", "dgst", "-sha256", "-verify", str(pubkey), "-signature", str(signature), str(manifest)],
        capture_output=True, text=True,
    )
    if p.returncode:
        raise RuntimeError("seq20-signature-invalid")
    values["signature_valid"] = True
    save_json(out / "release07-artifact-verification.json", values)
    return values


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidate-bin", required=True)
    ap.add_argument("--admission", required=True,
                    help="Fresh LIVE_APPROVED admission checked before any device request")
    ap.add_argument("--candidate-provenance", required=True)
    ap.add_argument("--recovery-manifest", required=True)
    ap.add_argument("--recovery-signature", required=True)
    ap.add_argument("--release-public-key", required=True)
    ap.add_argument("--recovery-bin", required=True)
    ap.add_argument("--adapter", required=True)
    ap.add_argument("--inventory", required=True)
    ap.add_argument("--outdir", required=True)
    args = ap.parse_args()

    # This transaction predates the common guard and contains direct WLED
    # requests. Enforce current admission at this real entrypoint, before even
    # read-only device traffic, and bind the approved byte paths to CLI inputs.
    admission_path = pathlib.Path(args.admission).resolve()
    admission = json.loads(admission_path.read_text())
    control = ROOT / "scripts/hbnf_control.py"
    check = subprocess.run(
        [sys.executable, str(control), "check-admission", "--admission", str(admission_path), "--stage", "LIVE_APPROVED"],
        cwd=ROOT, capture_output=True, text=True, timeout=20,
    )
    if check.returncode:
        raise RuntimeError("live-admission-rejected-before-device-access:" + check.stdout[-1000:])
    identities = admission.get("identities", {})
    candidate_arg = pathlib.Path(args.candidate_bin).resolve()
    recovery_arg = pathlib.Path(args.recovery_bin).resolve()
    if pathlib.Path(identities.get("candidate_bin_path", "")).expanduser().resolve() != candidate_arg:
        raise RuntimeError("admitted-candidate-path-does-not-match-transaction-argument")
    if pathlib.Path(identities.get("rollback_bin_path", "")).expanduser().resolve() != recovery_arg:
        raise RuntimeError("admitted-rollback-path-does-not-match-transaction-argument")
    if sha(candidate_arg)[0] != identities.get("candidate_bin_sha256"):
        raise RuntimeError("admitted-candidate-bytes-do-not-match-transaction-argument")
    if sha(recovery_arg)[0] != identities.get("rollback_bin_sha256"):
        raise RuntimeError("admitted-rollback-bytes-do-not-match-transaction-argument")

    out = pathlib.Path(args.outdir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    candidate_bin = pathlib.Path(args.candidate_bin).resolve()
    provenance_path = pathlib.Path(args.candidate_provenance).resolve()
    recovery_bin = pathlib.Path(args.recovery_bin).resolve()
    manifest = pathlib.Path(args.recovery_manifest).resolve()
    signature = pathlib.Path(args.recovery_signature).resolve()
    pubkey = pathlib.Path(args.release_public_key).resolve()

    candidate_sha, candidate_size = sha(candidate_bin)
    provenance = json.loads(provenance_path.read_text())
    if (candidate_sha != CANDIDATE_SHA or candidate_size != CANDIDATE_SIZE
            or provenance.get("firmware_sha256") != CANDIDATE_SHA
            or provenance.get("firmware_bytes") != CANDIDATE_SIZE
            or provenance.get("diagnostic_source_sha256") != CANDIDATE_SOURCE_SHA
            or provenance.get("github_commit") != CANDIDATE_BUILD_COMMIT
            or provenance.get("candidate_release_id") != CANDIDATE_RELEASE):
        raise RuntimeError("exact-r2-build-artifact-contract-failed")
    recovery = verify_recovery(manifest, signature, pubkey, recovery_bin, out)
    inventory = json.loads(pathlib.Path(args.inventory).read_text())
    entries = inventory.get("entries", [])
    if (inventory.get("expected_kernel_count") != 28 or len(entries) != 28
            or [item.get("effect_id") for item in entries] != list(range(220, 248))
            or [item.get("runtime_kernel_index_expected") for item in entries] != list(range(28))):
        raise RuntimeError("expected-exactly-28-kernels")
    adapter = json.loads(pathlib.Path(args.adapter).read_text())
    if adapter.get("expected_release_id") != CANDIDATE_RELEASE or adapter.get("timeout_seconds") != 75:
        raise RuntimeError("r2-adapter-contract-mismatch")

    result = {
        "schema": "hbnf-packet20-r2-live-transaction-v1",
        "candidate": {"release_id": CANDIDATE_RELEASE, "sha256": candidate_sha,
                      "size_bytes": candidate_size, "source_sha256": CANDIDATE_SOURCE_SHA,
                      "build_commit": CANDIDATE_BUILD_COMMIT},
        "recovery": recovery,
        "candidate_upload_attempts": 0,
        "sweep_attempts": 0,
        "recovery_upload_attempts": 0,
        "sweep_status": "NOT_RUN",
        "recovery_status": "NOT_RUN",
    }
    save_json(out / "TRANSACTION_STARTED.json", result)

    # Minimal live identity check immediately before the single candidate POST.
    before = capture(out, "pre-candidate")
    assert_matrix(before, BASE_RELEASE)
    result["pre_candidate_identity"] = {
        "matrix_mac": before["responses"]["matrix_info"]["data"].get("mac"),
        "release_id": before["responses"]["matrix_build"]["data"].get("release_id"),
        "uptime": before["responses"]["matrix_info"]["data"].get("uptime"),
    }

    candidate_attempted = True
    result["candidate_upload_attempts"] = 1
    try:
        result["candidate_upload"] = upload_once(candidate_bin, out / "candidate-ota-response.html")
        installed = wait_identity(out, CANDIDATE_RELEASE)
        result["candidate_runtime_identity"] = {
            "matrix_mac": installed["responses"]["matrix_info"]["data"].get("mac"),
            "release_id": installed["responses"]["matrix_build"]["data"].get("release_id"),
            "uptime": installed["responses"]["matrix_info"]["data"].get("uptime"),
        }
        atomic_ledger_write(23, CANDIDATE_RELEASE, CANDIDATE_SHA)
        result["seq23_ledger_write"] = "PASS_WITHOUT_READBACK"

        sweep_dir = out / "live-sweep"
        cmd = [
            sys.executable, str(ROOT / "scripts/hbnf_live_kernel_sweep.py"),
            "--adapter", str(pathlib.Path(args.adapter).resolve()),
            "--inventory", str(pathlib.Path(args.inventory).resolve()),
            "--outdir", str(sweep_dir),
        ]
        result["sweep_attempts"] = 1
        sweep = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=3600)
        (out / "sweep-stdout.txt").write_text(sweep.stdout)
        (out / "sweep-stderr.txt").write_text(sweep.stderr)
        result["sweep_exit_code"] = sweep.returncode
        try:
            restore = json.loads((sweep_dir / "RESTORE_RECEIPT.json").read_text())
            result["renderer_restore"] = restore
        except Exception as exc:
            result["renderer_restore"] = {"status": "MISSING_OR_INVALID", "error": str(exc)}
        result["sweep_status"] = "PASS" if sweep.returncode == 0 and result["renderer_restore"].get("status") == "PASS" and result["renderer_restore"].get("snapshot_equal") is True else "FAIL"
        save_json(out / "POST_SWEEP_PRE_RECOVERY.json", result)
    except Exception as exc:
        result["sweep_status"] = "NOT_COMPLETED"
        result["candidate_or_sweep_error"] = str(exc)
        save_json(out / "CANDIDATE_PHASE_FAILURE.json", result)

    # Once the candidate upload was attempted, use exactly one Release07 OTA
    # request to close the reversible transaction, even when candidate checks fail.
    if candidate_attempted:
        result["recovery_upload_attempts"] = 1
        try:
            result["recovery_upload"] = upload_once(recovery_bin, out / "release07-ota-response.html")
            installed = wait_identity(out, BASE_RELEASE)
            time.sleep(8)
            stable = capture(out, "post-release07")
            assert_matrix(stable, BASE_RELEASE)
            pre_uptime = int(installed["responses"]["matrix_info"]["data"].get("uptime", 0))
            post_uptime = int(stable["responses"]["matrix_info"]["data"].get("uptime", 0))
            aux = stable["responses"]["aux_info"]["data"]
            if post_uptime <= pre_uptime:
                raise RuntimeError("release07-uptime-not-advancing")
            if (aux.get("ip") != "192.168.77.11" or aux.get("mac", "").replace(":", "").lower() != AUX_MAC
                    or aux.get("live") is not True or aux.get("lm") != "DDP" or aux.get("lip") != "192.168.77.10"):
                raise RuntimeError("aux-ddp-basic-continuity-failed")
            atomic_ledger_write(24, BASE_RELEASE, BASE_SHA)
            result["seq24_ledger_write"] = "PASS_WITHOUT_READBACK"
            result["recovery_status"] = "PASS"
            result["installed_release"] = BASE_RELEASE
            result["installed_sha256"] = BASE_SHA
            result["matrix_mac"] = stable["responses"]["matrix_info"]["data"].get("mac")
            result["matrix_uptime"] = post_uptime
            result["aux_ddp_live"] = True
        except Exception as exc:
            result["recovery_status"] = "FAIL_STOP"
            result["recovery_error"] = str(exc)
    result["status"] = "PASS" if result["sweep_status"] == "PASS" and result["recovery_status"] == "PASS" else "RECOVERY_PASS_SWEEP_FAIL" if result["recovery_status"] == "PASS" else "FAIL_STOP"
    save_json(out / "TRANSACTION_RESULT.json", result)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"status": "FAIL_STOP", "error": str(exc), "no_retry": True}), file=sys.stderr)
        raise SystemExit(2)
