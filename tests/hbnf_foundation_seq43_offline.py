#!/usr/bin/env python3
"""Offline closure for seq43: inherited qualification evidence plus new sampler."""
import json, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from hbnf_foundation_seq39_failure_policy import recovery_decision
base = [sys.executable, str(ROOT / "scripts/hbnf_foundation_seq43_transaction.py"),
    "--candidate-bin", str(ROOT / "evidence/hbnf-foundation-qualification-20261005/seq39/artifact/firmware.bin"),
    "--recovery-bin", str(ROOT / "evidence/hbnf-foundation-qualification-20261005/seq39/artifact/release07.bin"),
    "--provenance", str(ROOT / "evidence/hbnf-foundation-qualification-20261005/seq39/BUILD_PROVENANCE.json"),
    "--inventory", str(ROOT / "config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"),
    "--policy", str(ROOT / "config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006.json"),
    "--baseline", str(ROOT / "evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json"),
    "--sweep-manifest", str(ROOT / "evidence/hbnf-foundation-qualification-20261005/seq39/live/foundation-sweep/PRE_SOAK_SWEEP_REUSE_MANIFEST.json"),
    "--threshold-freeze", str(ROOT / "evidence/hbnf-foundation-qualification-20261005/seq41/THRESHOLD_FREEZE_RECEIPT.json")]

with tempfile.TemporaryDirectory(prefix="hbnf-seq43-offline-") as td:
    out = pathlib.Path(td) / "dry-run"
    p = subprocess.run(base + ["--outdir", str(out), "--dry-run"], capture_output=True, text=True, timeout=30)
    assert p.returncode == 0, p.stdout + p.stderr
    result = json.loads((out / "DRY_RUN.json").read_text())
    assert result["status"] == "DRY_RUN_PASS" and result["sequence"] == 43 and result["recovery_sequence"] == 44
    assert result["repeat_sweep"] is False and result["observer_effect"].startswith("inherited")
    assert not (out / "TRANSACTION_STARTED.json").exists()
    bad = pathlib.Path(td) / "wrong.bin"; bad.write_bytes(b"wrong candidate")
    args = base.copy(); args[args.index("--candidate-bin") + 1] = str(bad)
    q = subprocess.run(args + ["--outdir", str(pathlib.Path(td) / "bad"), "--dry-run"], capture_output=True, text=True, timeout=30)
    assert q.returncode != 0 and "candidate hash/size mismatch" in q.stderr

print("PASS: seq43 dry-run binds exact inherited seq39 sweep/baseline/policy and exact candidate/recovery artifacts without network or mutation")
host = recovery_decision("foundation soak sample gap invalid: 24.114s", True, True, True, True)
assert host["action"] == "PRESERVE_SEQ39_AND_FIX_HOST", host
runtime = recovery_decision("foundation-steady-state-frame-interval-stop: 1000ms", True, True, True, True)
assert runtime["action"] == "RECOVER_RELEASE07", runtime
unproven = recovery_decision("telemetry reader failed", True, True, False, True)
assert unproven["action"] == "RECOVER_RELEASE07", unproven
print("PASS: host-only sampling gap preserves the installed candidate; real runtime failure or lost renderer-restore proof selects exact Release07 recovery")
