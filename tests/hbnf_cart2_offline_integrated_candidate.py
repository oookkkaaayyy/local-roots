#!/usr/bin/env python3
"""Verify current offline firmware, Owner/Guest bundle, and source bindings."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import argparse
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--manifest", default="evidence/cart2-r6-compositor-hoist-20261011/OFFLINE_INTEGRATED_CANDIDATE_MANIFEST.json")
args = parser.parse_args()
manifest = json.loads((ROOT / args.manifest).read_text())


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


assert manifest["status"] == "OFFLINE_INTEGRATION_CANDIDATE__NOT_DEPLOYED__NOT_LIVE_QUALIFIED__NOT_ACCEPTED"
assert all(value is False for value in manifest["authorization"].values())
assert manifest["firmware"]["release_id"] == manifest["release_id"]
assert sha(ROOT / manifest["firmware"]["path"]) == manifest["firmware"]["sha256"]
assert sha(ROOT / manifest["rollback"]["path"]) == manifest["rollback"]["sha256"]
assert sha(ROOT / manifest["firmware"]["source_binding_path"]) == manifest["firmware"]["source_binding_sha256"]
assert sha(ROOT / manifest["firmware"]["build_receipt_path"]) == manifest["firmware"]["build_receipt_sha256"]

for relative, expected in manifest["source_hashes"].items():
    assert sha(ROOT / relative) == expected, relative
adapter = manifest["qualification_adapter"]
assert sha(ROOT / adapter["path"]) == adapter["sha256"]
assert adapter["expected_release_id"] == manifest["release_id"]
assert adapter["expected_firmware_sha256"] == manifest["firmware"]["sha256"]
for relative, expected in manifest["offline_test_source_hashes"].items():
    assert sha(ROOT / relative) == expected, relative

package_path = ROOT / manifest["owner_guest_package"]["file"]
sidecar_path = ROOT / manifest["owner_guest_package"]["sidecar"]
package_sha = sha(package_path)
assert package_sha == manifest["owner_guest_package"]["sha256"]
assert package_path.stat().st_size == manifest["owner_guest_package"]["bytes"]
assert sidecar_path.read_text() == f"{package_sha}  {package_path.name}\n"

package_root = package_path.stem + "/"
with zipfile.ZipFile(package_path) as archive:
    embedded = json.loads(archive.read(package_root + "MANIFEST.json"))
    assert embedded["sourceCommit"] == manifest["owner_guest_package"]["source_commit"]
    assert embedded["buildMarker"] == manifest["owner_guest_package"]["build_marker"]
    for relative, expected in embedded["files"].items():
        assert hashlib.sha256(archive.read(package_root + "controller/" + relative)).hexdigest() == expected

# Reuse the existing deterministic packager and verify byte identity.
spec = importlib.util.spec_from_file_location("package_builder", ROOT / "scripts/hbnf_build_owner_guest_package.py")
builder = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(builder)
with tempfile.TemporaryDirectory(prefix="cart2-compositor-owner-guest-repro-") as temp:
    rebuilt, rebuilt_sha = builder.build(
        ROOT,
        Path(temp),
        manifest["owner_guest_package"]["source_commit"],
        package_name=package_path.stem,
        manifest_schema=manifest["owner_guest_package"].get("manifest_schema", "hbnf-cart2-owner-guest-vibe-package-v2"),
        build_marker=manifest["owner_guest_package"]["build_marker"],
        scope=manifest["owner_guest_package"]["scope"],
    )
    assert rebuilt_sha == package_sha
    assert rebuilt.read_bytes() == package_path.read_bytes()

assert manifest["offline_checks"]["matched_kernel0_performance"] == "NOT_RUN"
assert manifest["offline_checks"]["successor_bound_live_admission"] == "OFFLINE_COMPILED_ONLY__LIVE_APPROVAL_NOT_PRESENT"
print(f"PASS: current offline firmware/package/source bindings and deterministic Owner/Guest rebuild ({package_sha})")
