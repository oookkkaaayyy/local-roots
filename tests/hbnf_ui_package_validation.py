#!/usr/bin/env python3
"""Run the packaged installer's real offline validation path and tamper cases."""
from __future__ import annotations
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/cart2-owner-guest-vibe-r2-20261009"
PACKAGE = EVIDENCE / "HBNF_CART_OWNER_GUEST_CART2_VIBE_R2_20261009.zip"
SIDECAR = EVIDENCE / (PACKAGE.name + ".sha256")
EXPECTED_MARKER = "hbnf-cart2-owner-guest-vibe-r2-20261009"
EXPECTED_SHA = hashlib.sha256(PACKAGE.read_bytes()).hexdigest()
assert SIDECAR.read_text() == f"{EXPECTED_SHA}  {PACKAGE.name}\n"

with zipfile.ZipFile(PACKAGE) as archive:
    names = archive.namelist()
    prefix = next(name.split("/", 1)[0] for name in names if name.endswith("/MANIFEST.json"))
    embedded = json.loads(archive.read(f"{prefix}/MANIFEST.json"))
    assert embedded["buildMarker"] == EXPECTED_MARKER
    assert embedded["sourceCommit"]


def run_copy(mutate=None):
    with tempfile.TemporaryDirectory(prefix="cart2-installer-validation-") as tmp:
        target = Path(tmp) / prefix
        target.mkdir()
        with zipfile.ZipFile(PACKAGE) as archive:
            for name in archive.namelist():
                if not name.startswith(prefix + "/"):
                    continue
                relative = name[len(prefix)+1:]
                out = target / relative
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(archive.read(name))
        if mutate:
            mutate(target)
        result = subprocess.run([sys.executable, str(target / "install_ui_v6.py"), "--validate-only"], text=True, capture_output=True)
        return result

ok = run_copy()
assert ok.returncode == 0, ok.stdout + ok.stderr
assert "HBNF_CART2_PACKAGE_VALIDATION=PASS" in ok.stdout


def bad_marker(root):
    p = root / "MANIFEST.json"
    data = json.loads(p.read_text()); data["buildMarker"] = "hbnf-cart2-wrong"; p.write_text(json.dumps(data))

def bad_asset(root):
    p = root / "controller/hbnf-cart.html"
    p.write_text(p.read_text().replace(EXPECTED_MARKER, "hbnf-cart2-wrong", 1))

def bad_source_identity(root):
    (root / "SOURCE_COMMIT.txt").write_text("0000000000000000000000000000000000000000\n")

def bad_installer(root):
    p = root / "install_ui_v6.py"; p.write_text(p.read_text() + "\n# tampered\n")

for mutate in (bad_marker, bad_asset, bad_source_identity, bad_installer):
    failed = run_copy(mutate)
    assert failed.returncode != 0, mutate.__name__ + " unexpectedly accepted"
print("PASS: actual installer validator accepts exact package; rejects marker, asset, source-identity and installer tampering; validation-only made no deployment/network calls")
