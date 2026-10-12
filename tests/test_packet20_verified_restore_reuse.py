#!/usr/bin/env python3
"""Host regression for starting a new diagnostic session after verified restore."""
from __future__ import annotations

import copy
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import hbnf_foundation_live_adapter as adapter


def run(snapshot_state: str, snapshot_valid: bool, restore_verified: bool):
    device = {
        "HBNF": {
            "foundationTelemetry": {"enabled": False},
            "packet20Diagnostic": {
                "enabled": False,
                "snapshotValid": snapshot_valid,
                "snapshotState": snapshot_state,
                "snapshotId": 17,
                "snapshotHash": 9876,
                "restoreVerified": restore_verified,
            },
        }
    }
    commands: list[str] = []

    adapter.identity = lambda: None
    adapter.p20_state = lambda *args, **kwargs: (copy.deepcopy(device), device["HBNF"]["packet20Diagnostic"])

    def command(op, **kwargs):
        commands.append(op)
        p20 = device["HBNF"]["packet20Diagnostic"]
        p20["lastCommand"] = op
        p20["lastCommandAccepted"] = True
        if op == "begin":
            p20.update(enabled=True, snapshotValid=False, snapshotState="IDLE", restoreVerified=False)
        elif op == "snapshot":
            p20.update(snapshotValid=True, snapshotState="READY", snapshotId=18, snapshotHash=12345)
        return {"HBNF": {"packet20Diagnostic": copy.deepcopy(p20)}}

    adapter.command = command
    original_sleep = adapter.time.sleep
    adapter.time.sleep = lambda _: None
    try:
        result = adapter.snapshot()
    finally:
        adapter.time.sleep = original_sleep
    return result, commands


result, commands = run("RESTORED", False, True)
assert commands == ["begin", "snapshot"]
assert result["snapshotId"] == 18 and result["snapshotHash"] == 12345

try:
    run("READY", True, True)
except RuntimeError as exc:
    assert str(exc) == "packet20-diagnostic-session-closed; installed firmware does not support verified same-boot reuse"
else:
    raise AssertionError("legacy one-shot firmware must remain fail-closed")

source = (ROOT / "firmware/phase2/integration-r6-f89-compact-font/usermod/usermod_hbnf_foundation_v1.cpp").read_text()
assert "Packet20SnapshotState::RESTORED" in source
assert "packet20SavedValid=false;" in source
assert "packet20SnapshotState=Packet20SnapshotState::RESTORED;" in source
assert "const bool restored=packet20SnapshotState==Packet20SnapshotState::RESTORED&&packet20RestoreVerified&&!packet20SavedValid;" in source

print("PASS: verified restore permits a fresh begin and snapshot; legacy one-shot state refuses before command")
