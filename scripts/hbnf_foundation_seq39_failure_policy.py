#!/usr/bin/env python3
"""Fail-closed routing for seq39 failures without host-error recovery loops."""
from __future__ import annotations
import hashlib, json, pathlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
RESTORE_SOURCE_PATH="firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1.cpp"
RESTORE_SOURCE_SHA256="31126d341bf0a3e54a33d87de0856c5f68e79f20dd05653ae1d5df3270a9bc9d"
RESTORE_CANDIDATE="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
RESTORE_CANDIDATE_SHA256="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"

DEVICE_FAILURE_MARKERS=(
    "foundation-steady-state-frame-interval-stop",
    "release identity changed during sweep",
    "release-identity-mismatch",
    "runtime identity mismatch",
    "restart_count changed",
    "uptime decreased",
    "matrix-ip-or-mac-mismatch",
    "matrix-runtime-identity-mismatch",
    "aux-ddp-not-live-from-matrix",
    "auxiliary health failed",
    "foundation-frame-tail-",
    "foundation-telemetry-",
    "telemetry runtime-kernel identity outside inventory",
    "packet20-snapshot-failed",
    "packet20-snapshot-command-rejected",
    "packet20-restore-failed",
    "packet20-restore-command-rejected",
    "packet20-snapshot-id-mismatch",
    "packet20-snapshot-hash-mismatch",
    "packet20-existing-snapshot-not-ready",
    "catastrophic Foundation threshold crossed",
    "foundation-lost-snapshot-state",
    "envelope failure",
    "regressed vs qualified baseline",
    "projection stale/inactive fraction exceeded policy",
    "foundation-sweep-report-failed",
)

def classify_run_error(error):
    """Classify only explicit runtime/contract failures as device failures."""
    if not error:return "NONE"
    text=str(error).lower()
    return "DEVICE_OR_FOUNDATION_GATE" if any(marker.lower() in text for marker in DEVICE_FAILURE_MARKERS) else "HOST_OR_EXTERNAL"

def restore_is_proven(snapshot, raw_restore, receipt=None):
    """Require firmware proof and exact immutable snapshot id/hash binding.

    This firmware serializes restoreVerified but not packet20Same. For the
    exact source-bound Foundation candidate below, restoreVerified is assigned
    directly from packet20Same(saved, verify). Accept that omitted wire field
    only with a receipt bound to that exact artifact and source bytes.
    """
    if not isinstance(snapshot,dict) or not isinstance(raw_restore,dict):return False
    p20=raw_restore.get("HBNF",{}).get("packet20Diagnostic",raw_restore)
    if p20.get("restoreVerified") is not True:return False
    same=p20.get("packet20Same")
    if same is False:return False
    if same is not True:
        contract=(receipt or {}).get("packet20_same_contract",{})
        source=ROOT/RESTORE_SOURCE_PATH
        if (contract.get("schema")!="hbnf-packet20-restore-semantic-binding-v1" or
            contract.get("candidate_release")!=RESTORE_CANDIDATE or
            contract.get("candidate_sha256")!=RESTORE_CANDIDATE_SHA256 or
            contract.get("source_path")!=RESTORE_SOURCE_PATH or
            contract.get("source_sha256")!=RESTORE_SOURCE_SHA256 or
            not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest()!=RESTORE_SOURCE_SHA256 or
            (receipt or {}).get("packet20Same") is not True):
            return False
    if p20.get("snapshotId")!=snapshot.get("snapshotId") or p20.get("snapshotHash")!=snapshot.get("snapshotHash"):return False
    if receipt and (receipt.get("snapshot_equal") is not True or receipt.get("snapshotId")!=snapshot.get("snapshotId") or receipt.get("snapshotHash")!=snapshot.get("snapshotHash")):return False
    return True

def recovery_decision(error, candidate_healthy, no_restart, renderer_restored, aux_healthy):
    """Seq40 is reserved for actual candidate/runtime/restore/Matrix-AUX failure."""
    cause=classify_run_error(error)
    safe=bool(candidate_healthy and no_restart and renderer_restored and aux_healthy)
    if cause=="DEVICE_OR_FOUNDATION_GATE":return {"action":"RECOVER_RELEASE07","reason":"device_or_foundation_gate","safe_candidate_retry":False}
    if not candidate_healthy:return {"action":"RECOVER_RELEASE07","reason":"candidate_identity_or_health_failed","safe_candidate_retry":False}
    if not no_restart:return {"action":"RECOVER_RELEASE07","reason":"unexpected_restart_or_uptime_regression","safe_candidate_retry":False}
    if not aux_healthy:return {"action":"RECOVER_RELEASE07","reason":"aux_health_failed","safe_candidate_retry":False}
    if not renderer_restored:return {"action":"RECOVER_RELEASE07","reason":"renderer_restore_unverified","safe_candidate_retry":False}
    if safe:return {"action":"PRESERVE_SEQ39_AND_FIX_HOST","reason":"host_or_external_failure_with_all_device_safety_proofs","safe_candidate_retry":True}
    return {"action":"RECOVER_RELEASE07","reason":"one_or_more_safety_proofs_missing","safe_candidate_retry":False}

def read_json(path):
    try:
        with open(path,encoding="utf-8") as stream:return json.load(stream)
    except Exception:return None
