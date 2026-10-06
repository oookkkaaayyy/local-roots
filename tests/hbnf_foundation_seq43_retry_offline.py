#!/usr/bin/env python3
"""Offline closure for the single seq43 same-install host-fix retry."""
from __future__ import annotations
import json, pathlib, subprocess, sys, tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
retry=ROOT/"scripts/hbnf_foundation_seq43_soak_retry.py"
prior=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq43/live"
candidate=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/artifact/firmware.bin"
recovery=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/artifact/release07.bin"
inventory=ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"
policy=ROOT/"config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006.json"
baseline=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json"
for path in [retry,prior/"TRANSACTION_RESULT.json",candidate,recovery,inventory,policy]:
    assert path.exists(), path

with tempfile.TemporaryDirectory(prefix="hbnf-seq43-retry-dry-run-") as td:
    out=pathlib.Path(td)/"retry"
    cmd=[sys.executable,str(retry),"--candidate-bin",str(candidate),"--recovery-bin",str(recovery),
         "--inventory",str(inventory),"--policy",str(policy),"--baseline",str(baseline),
         "--outdir",str(out),"--prior-live",str(prior),"--dry-run"]
    result=subprocess.run(cmd,capture_output=True,text=True,timeout=10)
    assert result.returncode==0,(result.stdout,result.stderr)
    receipt=json.loads((out/"RETRY_DRY_RUN.json").read_text())
    assert receipt["status"]=="DRY_RUN_PASS",receipt
    assert receipt["firmware_install"]=="NONE" and receipt["sequence_allocation"]=="NONE",receipt
    assert receipt["reuse_snapshot"] is True and receipt["duration_seconds"]==5400,receipt
    assert receipt["prior"]["prior_sample_count"]==74,receipt
    assert not (out/"RETRY_STARTED.json").exists()

print("PASS: exact seq43 host-only failure, retained candidate, 74 clean samples, and same boot-scoped snapshot bind to one no-reinstall/no-new-sequence retry plan")
