#!/usr/bin/env python3
"""Verify the versioned, offline Cart 2.0 Owner/Guest integration RC."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/cart2-owner-guest-vibe-r1-20261009"
manifest = json.loads((EVIDENCE / "INTEGRATED_RELEASE_MANIFEST.json").read_text())
assert manifest["status"].startswith("OFFLINE_INTEGRATION_CANDIDATE")
assert manifest["authorization"]["live_mutation_authorized"] is False
assert manifest["authorization"]["production_deployment_authorized"] is False
assert manifest["authorization"]["guest_mode_enable_authorized"] is False
assert manifest["firmware"]["sha256"] == "f663c0736256186eff009b69818f5d41b1eec9df310be3128e1b3c67a9feea8b"
assert manifest["rollback"]["sha256"] == "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
firmware_manifest = json.loads((ROOT / "evidence/hbnf-phase2-integration-20261007/r5-offline-qualification-20261009/FINAL_OFFLINE_CANDIDATE_MANIFEST.json").read_text())
firmware_receipt = json.loads((ROOT / "evidence/hbnf-phase2-integration-20261007/r5-offline-qualification-20261009/R5_SOURCE_PRESERVATION_RECEIPT.json").read_text())
assert firmware_manifest["firmware"]["sha256"] == manifest["firmware"]["sha256"]
assert firmware_receipt["drive_evidence_ids"]["binary"] == manifest["firmware"]["artifact_drive_id"]
rollback = ROOT / "evidence/cart2-r7-performance-repair-20261009/artifact/hbnf-matrix-foundation-r4-exact.bin"
assert hashlib.sha256(rollback.read_bytes()).hexdigest() == manifest["rollback"]["sha256"]
assert hashlib.sha256((ROOT / manifest["package_builder"]["path"]).read_bytes()).hexdigest() == manifest["package_builder"]["sha256"]

archive = EVIDENCE / manifest["owner_guest_package"]["file"]
data = archive.read_bytes()
digest = hashlib.sha256(data).hexdigest()
assert digest == manifest["owner_guest_package"]["sha256"]
assert len(data) == manifest["owner_guest_package"]["bytes"]
assert (EVIDENCE / manifest["owner_guest_package"]["sidecar"]).read_text() == f"{digest}  {archive.name}\n"
for path, expected in manifest["source_hashes"].items():
    assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected, path

with zipfile.ZipFile(archive) as package:
    root = "HBNF_CART_OWNER_GUEST_CART2_VIBE_R1_20261009/"
    embedded = json.loads(package.read(root + "MANIFEST.json"))
    assert embedded["sourceCommit"] == manifest["source_commit"]
    assert embedded["scope"] == "owner-guest-static-assets-bound-to-staged-backend-and-r5-firmware"
    for relative, expected in embedded["files"].items():
        assert hashlib.sha256(package.read(root + "controller/" + relative)).hexdigest() == expected
    owner = package.read(root + "controller/hbnf-cart.js").decode()
    guest = package.read(root + "controller/guest/hbnf-cart/guest.js").decode()
    assert "phase2VibeRuntimeV1 === true" in owner
    assert "snapshot.capabilities.phase2VibeRuntimeV1===true" in guest

# Rebuild in a temporary directory with the same source identity and verify
# byte-for-byte reproducibility, without replacing the preserved candidate.
spec = importlib.util.spec_from_file_location("package_builder", ROOT / "scripts/hbnf_build_owner_guest_package.py")
builder = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(builder)
with tempfile.TemporaryDirectory(prefix="cart2-package-repro-") as temp:
    built, rebuilt_sha = builder.build(
        ROOT,
        Path(temp),
        manifest["source_commit"],
        package_name="HBNF_CART_OWNER_GUEST_CART2_VIBE_R1_20261009",
        manifest_schema="hbnf-cart2-owner-guest-vibe-package-v1",
        build_marker="hbnf-cart2-owner-guest-vibe-r1-20261009",
        scope="owner-guest-static-assets-bound-to-staged-backend-and-r5-firmware",
    )
    assert rebuilt_sha == digest
    assert built.read_bytes() == data

print(f"PASS: integrated offline RC hashes, exact R5/R4 identity and reproducible Owner/Guest package ({digest})")
