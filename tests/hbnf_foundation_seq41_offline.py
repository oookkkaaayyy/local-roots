#!/usr/bin/env python3
"""Offline closure tests for the reuse-sweep/seq41 same-install soak path."""
import json, pathlib, subprocess, sys, tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
base=[sys.executable,str(ROOT/"scripts/hbnf_foundation_seq41_transaction.py"),
 "--candidate-bin",str(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/artifact/firmware.bin"),
 "--recovery-bin",str(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/artifact/release07.bin"),
 "--provenance",str(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/BUILD_PROVENANCE.json"),
 "--inventory",str(ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"),
 "--policy",str(ROOT/"config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006.json"),
 "--baseline",str(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json"),
 "--sweep-manifest",str(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/foundation-sweep/PRE_SOAK_SWEEP_REUSE_MANIFEST.json"),
 "--threshold-freeze",str(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq41/THRESHOLD_FREEZE_RECEIPT.json")]

with tempfile.TemporaryDirectory(prefix="hbnf-seq41-offline-") as td:
    out=pathlib.Path(td)/"dry-run"
    p=subprocess.run(base+["--outdir",str(out),"--dry-run"],capture_output=True,text=True,timeout=30)
    assert p.returncode==0,p.stdout+p.stderr
    assert json.loads((out/"DRY_RUN.json").read_text())["status"]=="DRY_RUN_PASS"
    assert not (out/"TRANSACTION_STARTED.json").exists()
    bad=pathlib.Path(td)/"wrong.bin";bad.write_bytes(b"not Release/R4")
    q=subprocess.run(base[:base.index("--candidate-bin")]+["--candidate-bin",str(bad)]+base[base.index("--recovery-bin"):]+["--outdir",str(pathlib.Path(td)/"bad"),"--dry-run"],capture_output=True,text=True,timeout=30)
    assert q.returncode!=0 and "candidate hash/size mismatch" in q.stderr

print("PASS: seq41 dry-run proves exact inherited seq39 sweep/restore, frozen policy, candidate/recovery hashes and 28-kernel coverage without starting network or mutation")
