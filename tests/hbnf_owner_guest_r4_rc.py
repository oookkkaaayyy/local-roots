#!/usr/bin/env python3
"""Verify the exact offline Owner/Guest R4 software release candidate."""
from __future__ import annotations
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/cart2-owner-guest-r4-software-rc-20261009"
manifest = json.loads((EVIDENCE / "SOFTWARE_RC_MANIFEST.json").read_text())
assert manifest["schema"] == "hbnf-cart2-owner-guest-software-rc-v1"
assert manifest["status"] == "OFFLINE_CANDIDATE__NOT_DEPLOYED__NOT_OWNER_ACCEPTED"
assert manifest["base_firmware"]["sha256"] == "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
archive = EVIDENCE / manifest["static_package"]["file"].split("/")[-1]
data = archive.read_bytes()
sha = hashlib.sha256(data).hexdigest()
assert sha == manifest["static_package"]["sha256"]
assert len(data) == manifest["static_package"]["bytes"]
sidecar = (EVIDENCE / manifest["static_package"]["sha256_sidecar"].split("/")[-1]).read_text()
assert sidecar == f"{sha}  {archive.name}\n"
with zipfile.ZipFile(archive) as package:
    pkg_root = "HBNF_CART_OWNER_UX_R4_GUEST_ROUTE_R2_20261008/"
    embedded = json.loads(package.read(pkg_root + "MANIFEST.json"))
    assert embedded["sourceCommit"] == manifest["source_commit"]
    assert embedded["scope"] == "controller-only-no-firmware-no-phase2-hardware"
    for relative, expected in embedded["files"].items():
        member = pkg_root + "controller/" + relative
        actual = hashlib.sha256(package.read(member)).hexdigest()
        assert actual == expected, f"package file hash mismatch: {relative}"
        source = "hbnf-final-controller/" + relative
        if source in manifest["source_sha256"]:
            assert manifest["source_sha256"][source] == expected, f"source binding mismatch: {source}"
    guest = package.read(pkg_root + "controller/guest/hbnf-cart/guest.js").decode()
    assert 'button.hasAttribute("data-vibe-control")' in guest
    guest_html = package.read(pkg_root + "controller/guest/hbnf-cart/index.html").decode()
    assert "Guest Vibes stay disabled until the Cart’s matching Vibe runtime is qualified" in guest_html
    owner = package.read(pkg_root + "controller/hbnf-cart.html").decode()
    assert 'id="guestMode" type="checkbox" disabled' in owner
    assert "data-vibe=\"chill\"" in owner
assert manifest["compatibility"]["guest_mode"] == "OFF by default; no Guest Vibe or unqualified runtime feature enabled"
assert "production static/backend deployment" in manifest["not_proven"]
print(f"PASS: offline Owner/Guest R4 RC closure, R4 binding, Guest OFF, package SHA {sha}")
