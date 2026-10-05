#!/usr/bin/env python3
"""Static safety checks for the bounded Packet20 r2 live transaction."""
import ast
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
path = ROOT / "scripts/hbnf_packet20_r2_live_transaction.py"
source = path.read_text()
tree = ast.parse(source)

assert "BASE_SHA = \"8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab\"" in source
assert "CANDIDATE_SHA = \"42f2ed58c3b89af95926ee0cf5824a575df9dcf75c7fbb8ead9d6eaff427ee07\"" in source
assert "BASE_RELEASE_SEQ = 20" in source
assert "atomic_ledger_write(23, CANDIDATE_RELEASE, CANDIDATE_SHA)" in source
assert "atomic_ledger_write(24, BASE_RELEASE, BASE_SHA)" in source
assert "sweep_attempts\"] = 1" in source
assert "candidate_upload_attempts\"] = 1" in source
assert "recovery_upload_attempts\"] = 1" in source
assert '"--inventory"' in source and 'pathlib.Path(args.inventory).resolve()' in source
assert "retry_performed\": False" in source
assert "release-state" in source  # write target only; it must never be read
assert "cat /etc/hbnf-updater/release-state" not in source

for node in ast.walk(tree):
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {"open", "read_text", "read_bytes"}:
        for arg in node.args:
            if isinstance(arg, ast.Constant) and "release-state" in str(arg.value):
                raise AssertionError("transaction must never read release-state")

print("PASS: exact candidate/recovery identities, one-shot transaction calls, explicit inventory, no ledger read")
