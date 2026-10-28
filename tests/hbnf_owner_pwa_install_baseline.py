#!/usr/bin/env python3
"""Fail-closed coverage for installed Owner PWA package/readback binding."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts/hbnf_build_local_owner_pwa.py"
spec = importlib.util.spec_from_file_location("owner_pwa_builder", BUILDER)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


with tempfile.TemporaryDirectory(prefix="hbnf-owner-pwa-readback-") as temp:
    root = Path(temp)
    package_dir = root / "baseline-package"
    package_dir.mkdir()
    archive = package_dir / "hbnf-owner-pwa-local-v1.0.19.zip"
    source_commit = "a" * 40
    transaction = "OWNER-PWA-LOCAL-V119-TEST-20261028-01"
    asset = b"exact installed asset\n"
    payload_manifest = f"{sha(asset)}  owner-pwa/index.js\n".encode()
    install = b"#!/bin/sh\nexit 0\n"
    rollback = b"#!/bin/sh\nexit 0\n"
    old_package_baseline = b"old baseline fixture\n"
    package = {
        "package": "hbnf-owner-pwa-local-v1.0.19",
        "sourceCommit": source_commit,
        "transactionId": transaction,
        "assets": [{"path": "index.js", "sha256": sha(asset), "size": len(asset)}],
    }
    (package_dir / "PACKAGE.json").write_text(json.dumps(package, sort_keys=True) + "\n")
    (package_dir / "PAYLOAD.SHA256SUMS").write_bytes(payload_manifest)
    (package_dir / "BASELINE.SHA256SUMS").write_bytes(old_package_baseline)
    (package_dir / "install.sh").write_bytes(install)
    (package_dir / "rollback.sh").write_bytes(rollback)
    installed_payload = payload_manifest.replace(b"owner-pwa/", b"")
    baseline_entries = {
        "index.js": sha(asset),
        ".hbnf-package-marker": sha(b"hbnf-owner-pwa-local-v1\n"),
        ".hbnf-package-version": sha(b"1.0.19\n"),
        ".hbnf-payload.sha256": sha(installed_payload),
        ".hbnf-rollback.sh": sha(rollback),
    }
    baseline = root / "INSTALLED.SHA256SUMS"
    baseline.write_text("".join(f"{value}  {name}\n" for name, value in baseline_entries.items()))

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in {
            "PACKAGE.json": (package_dir / "PACKAGE.json").read_bytes(),
            "PAYLOAD.SHA256SUMS": payload_manifest,
            "BASELINE.SHA256SUMS": old_package_baseline,
            "install.sh": install,
            "rollback.sh": rollback,
            "owner-pwa/index.js": asset,
        }.items():
            zf.writestr(name, data)
    archive_sha = sha(archive.read_bytes())
    (package_dir / "PACKAGE.SHA256").write_text(f"{archive_sha}  {archive.name}\n")

    admission = root / "admission.json"
    admission_data = {
        "schema": "hbnf-opal-uv-update-admission-v1",
        "transaction_id": transaction,
        "outcome": "PASS",
        "candidate": {"version": "1.0.19", "source_commit": source_commit, "package_sha256": archive_sha},
        "durable_readback": {"status": "PASS"},
    }
    admission.write_text(json.dumps(admission_data))
    receipt = root / "readback.json"
    receipt.write_text(json.dumps({
        "schema": "hbnf-owner-pwa-install-readback-v1",
        "transaction_id": transaction,
        "admission_manifest_sha256": sha(admission.read_bytes()),
        "candidate_archive_sha256": archive_sha,
        "installed_payload_manifest": "PASS",
        "version_readback": "PASS",
        "rollback_copy": "PASS",
    }))

    result = module.verify_live_readback_baseline(receipt, baseline, package_dir, "1.0.19", archive, admission)
    assert result["servedPayloadHashesVerified"] == 1
    assert result["expectedInstalledRegularFiles"] == 5

    invalid = json.loads(admission.read_text())
    invalid["candidate"]["package_sha256"] = "0" * 64
    admission.write_text(json.dumps(invalid))
    try:
        module.verify_live_readback_baseline(receipt, baseline, package_dir, "1.0.19", archive, admission)
    except SystemExit:
        pass
    else:
        raise AssertionError("A mismatched install admission must fail closed")

print("PASS: installed Owner PWA package/readback/admission binding accepts exact bytes and rejects mismatches")
