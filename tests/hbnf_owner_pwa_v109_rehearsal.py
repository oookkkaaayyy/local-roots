#!/usr/bin/env python3
"""Offline install and exact rollback rehearsal for the source-bound v1.0.9 ZIP."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = Path(os.environ["HBNF_V109_CANDIDATE_ZIP"]).resolve()
BASELINE = Path(os.environ["HBNF_V108_BASELINE_ZIP"]).resolve()
MISSION = ROOT / "staging/coordinated-backend/opal/hbnf-opal-mission-control-local-v1.0.2-ios12.zip"

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(args, *, env=None):
    result = subprocess.run(args, check=False, env=env, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed ({result.returncode}): {result.stderr.strip() or result.stdout.strip()}")
    return result

with tempfile.TemporaryDirectory(prefix="hbnf-owner-pwa-v109-rehearsal-") as raw:
    temp = Path(raw)
    www = temp / "www"
    backup = temp / "backup"
    extracted = temp / "candidate"
    www.mkdir(); backup.mkdir(); extracted.mkdir()
    run(["unzip", "-q", str(MISSION), "-d", str(www)])
    run(["unzip", "-q", str(BASELINE), "-d", str(temp / "baseline")])
    run(["unzip", "-q", str(CANDIDATE), "-d", str(extracted)])

    base = www / "mission-control-local"
    (base / ".hbnf-package-marker").write_text("hbnf-owner-pwa-empty-runtime-recovery-v2\n")
    (base / ".hbnf-package-version").write_text("1.0.2\n")

    old = temp / "baseline/owner-pwa"
    target = base / "owner-pwa"
    shutil.copytree(old, target)
    old_checksums = (temp / "baseline/PAYLOAD.SHA256SUMS").read_text()
    (target / ".hbnf-payload.sha256").write_text(old_checksums.replace("owner-pwa/", ""))
    (target / ".hbnf-package-marker").write_text("hbnf-owner-pwa-local-v1\n")
    (target / ".hbnf-package-version").write_text("1.0.8\n")
    shutil.copy2(temp / "baseline/rollback.sh", target / ".hbnf-rollback.sh")

    baseline_lines = (extracted / "BASELINE.SHA256SUMS").read_text().splitlines()
    assert len(baseline_lines) == 20
    subprocess.run(["sha256sum", "-c", str(extracted / "BASELINE.SHA256SUMS")], cwd=target, check=True, capture_output=True)

    def mission_files():
        return {
            p.relative_to(base).as_posix(): digest(p)
            for p in base.rglob("*")
            if p.is_file() and p.relative_to(base).parts[0] != "owner-pwa"
            and not p.relative_to(base).parts[0].startswith(".owner-pwa.")
        }
    original_mission = mission_files()
    fake_bin = temp / "bin"; fake_bin.mkdir()
    fake_id = fake_bin / "id"; fake_id.write_text("#!/bin/sh\necho 0\n"); fake_id.chmod(0o755)
    env = {**os.environ, "PATH": f"{fake_bin}:{os.environ['PATH']}", "HBNF_WWW_ROOT": str(www), "HBNF_BACKUP_ROOT": str(backup)}

    run(["sh", str(extracted / "install.sh")], env=env)
    assert (target / ".hbnf-package-version").read_text().strip() == "1.0.9"
    subprocess.run(["sha256sum", "-c", ".hbnf-payload.sha256"], cwd=target, check=True, capture_output=True)
    manifest = json.loads((target / "hbnf-cart-manifest.webmanifest").read_text())
    assert manifest["icons"] == [
        {"src": "./hbnf-cart-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "./hbnf-cart-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
    ]
    assert (target / "hbnf-cart-icon-180.png").read_bytes() != (temp / "baseline/owner-pwa/hbnf-cart-icon-180.png").read_bytes()

    run(["sh", str(target / ".hbnf-rollback.sh")], env=env)
    assert (target / ".hbnf-package-version").read_text().strip() == "1.0.8"
    subprocess.run(["sha256sum", "-c", str(backup / "hbnf-owner-pwa-OWNER-PWA-LOCAL-V109-UX-20261022-01.BASELINE.SHA256SUMS")], cwd=target, check=True, capture_output=True)
    restored = mission_files()
    assert restored == original_mission, "Mission Control must remain unchanged through install and rollback"
    assert len(list(target.iterdir())) == 20

print("PASS: v1.0.9 candidate installs offline over exact v1.0.8 tree, preserves Mission Control, and restores all 20 prior files byte-for-byte")
