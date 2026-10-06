#!/usr/bin/env python3
"""Fail-closed routing for seq39 failures without host-error recovery loops."""
from __future__ import annotations
import json

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
    """Require firmware proof and exact immutable snapshot id/hash binding."""
    if not isinstance(snapshot,dict) or not isinstance(raw_restore,dict):return False
    p20=raw_restore.get("HBNF",{}).get("packet20Diagnostic",raw_restore)
    if p20.get("restoreVerified") is not True or p20.get("packet20Same") is not True:return False
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
    if safe:return {"action":"PRESERVE_SEQ37_AND_FIX_HOST","reason":"host_or_external_failure_with_all_device_safety_proofs","safe_candidate_retry":True}
    return {"action":"RECOVER_RELEASE07","reason":"one_or_more_safety_proofs_missing","safe_candidate_retry":False}

def read_json(path):
    try:
        with open(path,encoding="utf-8") as stream:return json.load(stream)
    except Exception:return None
