#!/usr/bin/env python3
"""Verify the successor's exact OFFLINE_COMPILED admission and closed live gate.

This test reads local evidence and invokes the pure admission/guard CLIs. The
guard's child command only creates a temporary marker; no device/network client
is launched.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/cart2-r6-compositor-hoist-20261011"
ADMISSION = EVIDENCE / "OFFLINE_COMPILED_ADMISSION.json"
CONTROL = ROOT / "scripts/hbnf_control.py"
GUARD = ROOT / "scripts/hbnf_guarded_run.py"
LIVE_RUNNER = ROOT / "scripts/hbnf_r6_audio_cache_live_transaction.py"
EXPECTED_RELEASE = "hbnf-cart2-phase2-offline-wow-r6-compositor-hoist-20261011"
EXPECTED_SHA = "bbf9d12f703e37ed47e1705802436b835bb54c966d540291375001d4a93dc5c2"
EXPECTED_R4 = "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
EXPECTED_MAC = "70:4b:ca:5b:34:5c"


def sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(admission_path: pathlib.Path, stage: str = "OFFLINE_COMPILED"):
    return subprocess.run(
        [sys.executable, str(CONTROL), "check-admission", "--admission",
         str(admission_path), "--stage", stage],
        cwd=ROOT, capture_output=True, text=True, check=False,
    )


def main() -> None:
    manifest = json.loads((EVIDENCE / "OFFLINE_INTEGRATED_CANDIDATE_MANIFEST.json").read_text())
    build = json.loads((EVIDENCE / "SUCCESSOR_BUILD_RECEIPT.json").read_text())
    binding = json.loads((EVIDENCE / "SUCCESSOR_SOURCE_BINDING.json").read_text())
    admission = json.loads(ADMISSION.read_text())
    transaction = json.loads((EVIDENCE / "SUCCESSOR_TRANSACTION_DRYRUN.json").read_text())
    identity = admission["identities"]

    candidate_bin = ROOT / manifest["firmware"]["path"]
    rollback_bin = ROOT / manifest["rollback"]["path"]
    assert admission["schema"] == "hbnf-cart2-release-admission-v1"
    assert admission["stage"] == "OFFLINE_COMPILED" and admission["outcome"] == "PASS"
    assert admission.get("fresh_owner_authorization") is None
    assert admission["limits"]["live_mutation_authorized"] is False
    assert admission["limits"]["candidate_install_attempts_used"] == 0
    assert admission["limits"]["recovery_attempts_used"] == 0
    assert identity["candidate_release_id"] == EXPECTED_RELEASE == build["release_id"]
    assert identity["candidate_release_id"] == manifest["firmware"]["release_id"] == binding["release_id"]
    assert identity["source_commit"] == build["source_commit"] == binding["repository_source_commit"]
    assert identity["candidate_bin_sha256"] == EXPECTED_SHA == sha(candidate_bin)
    assert identity["candidate_bin_size_bytes"] == candidate_bin.stat().st_size == manifest["firmware"]["bytes"]
    assert identity["rollback_bin_sha256"] == EXPECTED_R4 == sha(rollback_bin)
    assert identity["matrix_mac"] == EXPECTED_MAC

    # The transaction evidence must identify the successor as its subject and
    # include exact-candidate success and R4-recovery replays. A valid file hash
    # alone cannot turn a rehearsal of the prior R6 image into successor proof.
    assert transaction["candidate_release_id"] == EXPECTED_RELEASE
    assert transaction["candidate_sha256"] == EXPECTED_SHA
    assert transaction["launcher_candidate_selection"]["candidate_release_id"] == EXPECTED_RELEASE
    assert transaction["launcher_candidate_selection"]["candidate_sha256"] == EXPECTED_SHA
    successor_cases = [case for case in transaction["cases"]
                       if case.get("case", "").startswith("exact successor fake-port")]
    assert len(successor_cases) == 2
    assert transaction["successor_fake_port_cases"] == [case["case"] for case in successor_cases]
    for case in successor_cases:
        result = case["result"]
        assert case["pass"] is True
        assert result["candidate_release_id"] == EXPECTED_RELEASE
        assert result["candidate_sha256"] == EXPECTED_SHA
    assert transaction["successor_fake_port_actual_device_calls"] == 0

    # Every PASS assertion is tied to a readable, exact-hash evidence file.
    hash_uses: dict[str, int] = {}
    for name, item in admission["checks"].items():
        assert item["pass"] is True, name
        path = pathlib.Path(item["evidence_file"])
        if not path.is_absolute():
            path = ROOT / path
        assert path.is_file() and sha(path) == item["sha256"], name
        hash_uses[item["sha256"]] = hash_uses.get(item["sha256"], 0) + 1
    assert max(hash_uses.values()) <= 3

    valid = check(ADMISSION)
    assert valid.returncode == 0, valid.stdout + valid.stderr
    assert json.loads(valid.stdout)["pass"] is True

    # Exercise the supported transaction entrypoint itself against the real
    # current closed control state. OFFLINE_COMPILED evidence cannot advance
    # to live preflight/staging; the launcher must reject before any device I/O.
    with tempfile.TemporaryDirectory(prefix="hbnf-successor-live-entrypoint-") as td:
        state_path = ROOT / "config/HBNF_CONTROL_STATE.json"
        prior_r6_result = ROOT / "evidence/cart2-r6-audio-cache-20261010/live-qualification/TRANSACTION_RESULT.json"
        before_state_sha = sha(state_path)
        before_r6_result_sha = sha(prior_r6_result)
        capsule = pathlib.Path(td) / "capsule.json"
        made = subprocess.run(
            [sys.executable, str(ROOT / "scripts/platform.py"), "capsule",
             "--system", "hbnf-cart", "--workflow", "phase2-live-qualification",
             "--out", str(capsule), "--run-id", "successor-closed-gate-test"],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        assert made.returncode == 0, made.stdout + made.stderr
        verified_dry_run = subprocess.run(
            [sys.executable, str(LIVE_RUNNER), "--admission", str(ADMISSION),
             "--capsule", str(capsule), "--prelive-proof", str(pathlib.Path(td) / "unused-proof.json"),
             "--dry-run"],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        assert verified_dry_run.returncode == 0, verified_dry_run.stdout + verified_dry_run.stderr
        dry_receipt = json.loads(verified_dry_run.stdout)
        assert dry_receipt["candidate"] == EXPECTED_RELEASE
        assert dry_receipt["candidate_sha256"] == EXPECTED_SHA
        assert dry_receipt["device_requests"] == 0
        rejected_live = subprocess.run(
            [sys.executable, str(LIVE_RUNNER), "--admission", str(ADMISSION),
             "--capsule", str(capsule), "--prelive-proof", str(pathlib.Path(td) / "missing-proof.json")],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        assert rejected_live.returncode != 0
        assert "live_approved-admission-rejected-before-device-request" in rejected_live.stdout
        assert "primary control state has NO live mutation authorization" in rejected_live.stdout
        assert sha(state_path) == before_state_sha
        assert sha(prior_r6_result) == before_r6_result_sha

    # Candidate or recovery byte substitutions are rejected by the actual
    # release-admission checker before any execution entrypoint is reached.
    with tempfile.TemporaryDirectory(prefix="hbnf-successor-admission-") as td:
        temp = pathlib.Path(td)
        for label, mutation, expected in (
            ("wrong-candidate-sha", lambda d: d["identities"].__setitem__("candidate_bin_sha256", "0" * 64), "candidate binary SHA mismatch"),
            ("wrong-rollback-sha", lambda d: d["identities"].__setitem__("rollback_bin_sha256", "0" * 64), "rollback binary SHA mismatch"),
        ):
            bad = json.loads(json.dumps(admission))
            mutation(bad)
            bad_path = temp / f"{label}.json"
            bad_path.write_text(json.dumps(bad) + "\n")
            rejected = check(bad_path)
            assert rejected.returncode != 0 and expected in rejected.stdout, (label, rejected.stdout, rejected.stderr)

        forged_live = json.loads(json.dumps(admission))
        forged_live["stage"] = "LIVE_APPROVED"
        forged_live["fresh_owner_authorization"] = None
        forged_path = temp / "offline-is-not-live.json"
        forged_path.write_text(json.dumps(forged_live) + "\n")
        rejected = check(forged_path, "LIVE_APPROVED")
        assert rejected.returncode != 0
        errors = json.loads(rejected.stdout)["errors"]
        assert "failed/missing check: launcher_rejects_invalid_manifest_before_device_access" in errors
        assert "primary control state has NO live mutation authorization" in errors

    # Run the real guard against the actual closed control state. Its would-be
    # child is only a temporary marker and must never run.
    with tempfile.TemporaryDirectory(prefix="hbnf-successor-live-closed-") as td:
        marker = pathlib.Path(td) / "device-request-marker"
        guarded = subprocess.run(
            [sys.executable, str(GUARD), "--require-state", "PHASE2_INTEGRATING",
             "--mutation", "--admission", str(ADMISSION), "--capsule", "unused-capsule",
             "--prelive-proof", "unused-proof", "--", sys.executable, "-c",
             f"open({str(marker)!r}, 'w').write('called')"],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        assert guarded.returncode != 0 and "live mutation is not authorized" in (guarded.stdout + guarded.stderr)
        assert not marker.exists(), "guard launched the simulated device request"

    print(f"PASS: exact successor OFFLINE_COMPILED admission; bad candidate/R4 and forged LIVE stage rejected; live guard made zero child/device calls ({EXPECTED_SHA})")


if __name__ == "__main__":
    main()
