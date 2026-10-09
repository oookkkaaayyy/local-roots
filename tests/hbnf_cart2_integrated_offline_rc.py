#!/usr/bin/env python3
"""Verify the exact offline Cart 2.0 R6/Owner/Guest release candidate."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/cart2-r6-integrated-20261009"
manifest = json.loads((EVIDENCE / "INTEGRATED_RELEASE_MANIFEST.json").read_text())
assert manifest["status"] == "OFFLINE_INTEGRATION_CANDIDATE__NOT_DEPLOYED__NOT_LIVE_QUALIFIED__NOT_ACCEPTED"
assert manifest["authorization"] == {
    "live_mutation_authorized": False,
    "production_deployment_authorized": False,
    "guest_mode_enable_authorized": False,
    "uv_energization_authorized": False,
}
assert manifest["firmware"]["sha256"] == "340fe93b2eae35518fc588fa194c097b1d44d34050d54933fd97e552762becfb"
assert manifest["firmware"]["release_id"] == "hbnf-cart2-phase2-offline-wow-r6-integrated-20261009"
assert manifest["rollback"]["sha256"] == "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
assert manifest["feature_contract"]["guest_mode_default"] is False
assert manifest["feature_contract"]["uv"] == "dormant OFF; hardware_available=false; max brightness 0"
assert manifest["application_confirmation"]["mqtt_liveness_is_application_confirmation"] is False
assert manifest["application_confirmation"]["matrix_status"] == "submitted until revision/fence-bound evidence exists"

fw_manifest = json.loads((EVIDENCE / "FINAL_OFFLINE_CANDIDATE_MANIFEST.json").read_text())
assert fw_manifest["artifact"]["sha256"] == manifest["firmware"]["sha256"]
assert fw_manifest["rollback"]["sha256"] == manifest["rollback"]["sha256"]
assert manifest["firmware"]["bytes"] == Path(ROOT / manifest["firmware"]["path"]).stat().st_size
assert hashlib.sha256((ROOT / manifest["firmware"]["path"]).read_bytes()).hexdigest() == manifest["firmware"]["sha256"]
assert hashlib.sha256((ROOT / manifest["rollback"]["path"]).read_bytes()).hexdigest() == manifest["rollback"]["sha256"]

package_meta = manifest["owner_guest_package"]
archive = ROOT / "evidence/cart2-owner-guest-vibe-r2-20261009" / package_meta["file"]
data = archive.read_bytes()
digest = hashlib.sha256(data).hexdigest()
assert digest == package_meta["sha256"]
assert len(data) == package_meta["bytes"]
assert (archive.parent / package_meta["sidecar"]).read_text() == f"{digest}  {archive.name}\n"
assert manifest["source_commit"] == package_meta["source_commit"]

for path, expected in manifest["source_hashes"].items():
    assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected, path

with zipfile.ZipFile(archive) as package:
    root = "HBNF_CART_OWNER_GUEST_CART2_VIBE_R2_20261009/"
    embedded = json.loads(package.read(root + "MANIFEST.json"))
    assert embedded["sourceCommit"] == manifest["source_commit"]
    assert embedded["buildMarker"] == "hbnf-cart2-owner-guest-vibe-r2-20261009"
    assert embedded["scope"] == "controller-only-no-firmware-no-phase2-hardware"
    for relative, expected in embedded["files"].items():
        assert hashlib.sha256(package.read(root + "controller/" + relative)).hexdigest() == expected
    owner = package.read(root + "controller/hbnf-cart.js").decode()
    guest = package.read(root + "controller/guest/hbnf-cart/guest.js").decode()
    assert "phase2VibeRuntimeV1 === true" in owner
    assert "snapshot.capabilities.phase2VibeRuntimeV1===true" in guest

    # Rehearse the exact static-file overlay and source rollback offline. The
    # predeploy source is the fresh-read package base; no Wrangler or network
    # command is invoked by this fixture.
    base_commit = manifest["owner_guest_package"]["rollback_source_commit"]
    assert base_commit == "bbedf3c847435010089cd7a3f1c8b7342c138af3"
    with tempfile.TemporaryDirectory(prefix="cart2-static-deploy-rehearsal-") as temp:
        staged = Path(temp) / "public"
        staged.mkdir(parents=True)
        rel_files = ["controller/" + rel for rel in embedded["files"]]
        original = {}
        for member in rel_files:
            relative = member.removeprefix("controller/")
            old = subprocess.run(["git", "show", f"{base_commit}:hbnf-final-controller/{relative}"], cwd=ROOT, check=True, capture_output=True).stdout
            original[relative] = old
            target = staged / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(old)
        for member in rel_files:
            relative = member.removeprefix("controller/")
            target = staged / relative
            target.write_bytes(package.read(root + member))
            assert hashlib.sha256(target.read_bytes()).hexdigest() == embedded["files"][relative]
        assert (staged / "hbnf-cart.html").read_text().find("hbnf-cart2-owner-guest-vibe-r2-20261009") >= 0
        for relative, content in original.items():
            (staged / relative).write_bytes(content)
        assert all((staged / relative).read_bytes() == content for relative, content in original.items())

# Exercise the builder again in an isolated directory and demand byte identity.
spec = importlib.util.spec_from_file_location("package_builder", ROOT / "scripts/hbnf_build_owner_guest_package.py")
builder = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(builder)
with tempfile.TemporaryDirectory(prefix="cart2-package-repro-") as temp:
    built, rebuilt_sha = builder.build(ROOT, Path(temp), manifest["source_commit"])
    assert rebuilt_sha == digest
    assert built.read_bytes() == data

validation = subprocess.run([sys.executable, str(ROOT / "tests/hbnf_ui_package_validation.py")], text=True, capture_output=True)
assert validation.returncode == 0, validation.stdout + validation.stderr
print(f"PASS: integrated R6 firmware, exact R4 recovery, Owner/Guest package, source hashes, and deterministic installer path ({digest})")
