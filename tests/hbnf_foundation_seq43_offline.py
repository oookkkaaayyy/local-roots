#!/usr/bin/env python3
"""Offline source checks for current Foundation authority and host-failure policy."""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from hbnf_foundation_policy_authority import verify_consumed_seq41_policy
from hbnf_foundation_seq39_failure_policy import recovery_decision

verify_consumed_seq41_policy()
print("PASS: seq41/42 remain consumed; no historical freeze is reused for an unauthorized sequence")

host = recovery_decision("foundation soak sample gap invalid: 24.114s", True, True, True, True)
assert host["action"] == "PRESERVE_SEQ39_AND_FIX_HOST", host
runtime = recovery_decision("foundation-steady-state-frame-interval-stop: 1000ms", True, True, True, True)
assert runtime["action"] == "RECOVER_RELEASE07", runtime
unproven = recovery_decision("telemetry reader failed", True, True, False, True)
assert unproven["action"] == "RECOVER_RELEASE07", unproven
print("PASS: host-only sampling gap preserves the candidate; runtime failure or lost renderer-restore proof selects Release07 recovery")
