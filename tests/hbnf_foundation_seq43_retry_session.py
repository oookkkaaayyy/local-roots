#!/usr/bin/env python3
"""Offline regression for retrying after firmware restored a boot-scoped snapshot."""
from __future__ import annotations
import json, pathlib, sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import hbnf_foundation_seq43_soak_retry as retry

EVIDENCE=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq43"
PRELIVE=json.loads((EVIDENCE/"retry1/RETRY_PRELIVE_READONLY.json").read_text())
PRIOR=json.loads((EVIDENCE/"live/TRANSACTION_RESULT.json").read_text())
PRIOR_ROWS=[json.loads(x) for x in (EVIDENCE/"live/FOUNDATION_SOAK.jsonl").read_text().splitlines()]
SNAPSHOT=json.loads((EVIDENCE/"live/PRE_SWEEP_STATE.json").read_text())

# Use the exact pre-retry device capture as the regression fixture.
p20=PRELIVE["responses"]["matrix_state"]["HBNF"]["packet20Diagnostic"]
fixture={
    "release_id":PRELIVE["release_id"],"matrix_mac":PRELIVE["matrix_mac"],
    "uptime_seconds":PRELIVE["uptime_seconds"],"snapshot_id":PRELIVE["snapshot_id"],
    "snapshot_hash":PRELIVE["snapshot_hash"],"snapshot_valid":PRELIVE["snapshot_valid"],
    "packet20_restore_verified":PRELIVE["packet20_restore_verified"],
    "packet20_diagnostic_active":p20["enabled"],
    "packet20_last_command":p20["lastCommand"],
    "packet20_last_command_accepted":p20["lastCommandAccepted"],
    "telemetry_enabled":PRELIVE["telemetry_enabled"],"aux_ddp_live":PRELIVE["aux_ddp_live"]}
prior={"prior_last_uptime_seconds":max(float(x["uptime_seconds"]) for x in PRIOR_ROWS)}
assert fixture["packet20_restore_verified"] is True
assert fixture["packet20_diagnostic_active"] is False
assert fixture["packet20_last_command"]=="restore" and fixture["packet20_last_command_accepted"] is True
assert fixture["snapshot_valid"] is True and fixture["telemetry_enabled"] is False
assert fixture["release_id"]==retry.CANDIDATE and fixture["snapshot_id"]==SNAPSHOT["snapshotId"]
try:
    retry.validate_retry_session(fixture,prior,SNAPSHOT)
except RuntimeError as exc:
    assert str(exc)=="same-install-retry-refused-before-start-packet20-diagnostic-session-closed"
else:
    raise AssertionError("closed one-snapshot diagnostic session must be refused before a same-boot retry")

# Static firmware/source proof: restore closes diag mode; the one saved snapshot
# blocks a second begin; select requires diag mode; a rejected select sets only
# the command receipt fields and returns before clearing restoreVerified.
src=(ROOT/"firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1.cpp").read_text()
assert "diagnosticMode_=false;" in src
assert "if(packet20SavedValid)return false;" in src
assert "if(!runtime.diagnosticActive())return false;" in src
assert "if(!runtime.diagnosticSelectKernel(kernel))return false;" in src
assert "packet20LastCommandAccepted=packet20Command(command);" in src
assert "if(!packet20LastCommandAccepted)return;" in src
select=src[src.index('if(!strcmp(op,"select"))'):src.index('if(!strcmp(op,"snapshot"))')]
assert "packet20RestoreVerified=false" in select
assert select.index("if(!runtime.diagnosticSelectKernel(kernel))return false;") < select.index("packet20RestoreVerified=false")
restore=src[src.index("static void packet20Restore()"):src.index("static void packet20ServiceAtRendererSafePoint()")]
assert "runtime.diagnosticEndAfterRestore(millis());" in restore

adapter_src=(ROOT/"scripts/hbnf_foundation_live_adapter.py").read_text()
guard=adapter_src[adapter_src.index("def _restore_snapshot"):adapter_src.index("def select(")]
assert 'if p20.get("restoreVerified") is not True:' in guard
assert 'if p20.get("lastCommand")!="restore":raise RuntimeError("packet20-restore-command-identity-mismatch")' in guard

print("PASS: exact seq43 retry prelive fixture proves diagnostic session was closed while snapshot restore remained verified; offline guard now refuses before state-changing calls")
