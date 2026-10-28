#!/usr/bin/env python3
"""Build the v1.0.17 three-module UV commissioning update against a live snapshot."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path

PKG = Path("staging/coordinated-backend/opal/owner-local-control-uv-commissioning-v1.0.17")
SOURCE = Path("staging/coordinated-backend/opal/owner-local-control")
TX = "OWNER-LOCAL-CONTROL-UV-COMMISSIONING-V117-20261028-01"
PACKAGE = "hbnf-owner-local-control-uv-commissioning-v1.0.17"
DRIVE_ID = "1U3p5hs9qtrLWFHePkomhY1YnQhaNSI1h"
MODULES = {
    "uv_policy_access.lua": "etc/hbnf-local-control/lua/uv_policy_access.lua",
    "uv_runtime.lua": "etc/hbnf-local-control/lua/uv_runtime.lua",
    "uv_status_access.lua": "etc/hbnf-local-control/lua/uv_status_access.lua",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build(root: Path, commit: str, out: Path) -> tuple[Path, str]:
    root, out = root.resolve(), out.resolve()
    if subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip() != commit:
        raise ValueError("source commit must equal checkout HEAD")
    if subprocess.check_output(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=all"], text=True).strip():
        raise ValueError("source checkout must be clean")
    package_dir = root / PKG
    baseline_manifest = (package_dir / "BASELINE_FILES.SHA256SUMS").read_bytes()
    baseline_archive = (package_dir / "ROLLBACK_BASELINE.zip").read_bytes()
    baseline: dict[str, str] = {}
    for line in baseline_manifest.decode().splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9._/-]+)", line)
        if not match:
            raise ValueError("live baseline manifest is malformed")
        digest, rel = match.groups()
        if rel.startswith("/") or ".." in rel.split("/") or rel in baseline:
            raise ValueError("live baseline contains an unsafe or duplicate path")
        baseline[rel] = digest
    if len(baseline) != 20:
        raise ValueError("exact Opal baseline must contain 20 managed files")
    with zipfile.ZipFile(package_dir / "ROLLBACK_BASELINE.zip") as zf:
        members = {name: zf.read(name) for name in zf.namelist()}
    if set(members) != set(baseline):
        raise ValueError("durable rollback snapshot file set differs from the live baseline manifest")
    if any(sha(members[name]) != digest for name, digest in baseline.items()):
        raise ValueError("durable rollback snapshot bytes differ from the live baseline manifest")
    updated = dict(baseline)
    candidates: dict[str, bytes] = {}
    for name, rel in MODULES.items():
        content = (root / SOURCE / name).read_bytes()
        committed = subprocess.check_output(["git", "-C", str(root), "show", f"{commit}:{(SOURCE / name).as_posix()}"])
        if content != committed:
            raise ValueError("candidate module differs from exact source commit: " + name)
        candidates[name] = content
        updated[rel] = sha(content)
    updated_manifest = "".join(f"{updated[p]}  {p}\n" for p in sorted(updated)).encode()
    files: dict[str, bytes] = {
        "README.md": (package_dir / "README.md").read_bytes(),
        "BASELINE_FILES.SHA256SUMS": baseline_manifest,
        "UPDATED_FILES.SHA256SUMS": updated_manifest,
        "ROLLBACK_BASELINE.zip": baseline_archive,
        "install.sh": (package_dir / "install.sh").read_bytes(),
        "rollback.sh": (package_dir / "rollback.sh").read_bytes(),
    }
    files.update(candidates)
    for name, rel in MODULES.items():
        files["baseline-" + name] = members[rel]
    rollback_sha = sha(baseline_archive)
    metadata = {
        "schema": "hbnf-owner-local-control-uv-commissioning-update-v1",
        "package": PACKAGE,
        "transactionId": TX,
        "sourceCommit": commit,
        "releaseDisposition": "INSTALLABLE_REQUIRES_ONE_TIME_ADMISSION_AND_FRESH_TARGET_READBACK",
        "target": {"model": "GL-SFT1200", "ip": "192.168.77.1"},
        "baseline": {"observedVersion": "1.0.16 runtime lineage", "managedFiles": 20,
                     "packageSha256": rollback_sha,
                     "installed_files_manifest_sha256": sha(baseline_manifest),
                     "installedFilesManifestSha256": sha(baseline_manifest)},
        "recovery": {"archivePath": "ROLLBACK_BASELINE.zip", "sha256": rollback_sha,
                     "size": len(baseline_archive), "driveFileId": DRIVE_ID,
                     "liveReadbackEvidence": "evidence/opal-uv-live-baseline-readback-20261028.json"},
        "changedInstalledFiles": ["/" + p for p in MODULES.values()],
        "scope": ["Owner-authenticated three-second, one-channel W-only UV test pulse for Cart and Bar",
                  "Always attempt both outputs OFF and report unknown if final readback fails",
                  "Allow explicit UV OFF while full activation profile gates remain incomplete",
                  "Keep MANUAL and FOLLOW_MATRIX activation behind existing hardware and commissioning gates"],
        "acceptanceCriteria": [
            {"id": "owner-auth-status", "method": "authenticated local status request", "expected": "Owner identity and AUX/WLED witnesses match the live target"},
            {"id": "cart-pulse", "method": "Test Cart request plus output readback", "expected": "only Cart receives selected W level for three seconds; both outputs then read OFF"},
            {"id": "bar-pulse", "method": "Test Bar request plus output readback", "expected": "only Bar receives selected W level for three seconds; both outputs then read OFF"},
            {"id": "explicit-off", "method": "OFF request with unverified profile", "expected": "both outputs read OFF"},
            {"id": "activation-lock", "method": "MANUAL/FOLLOW request before full commissioning", "expected": "rejected without mutation"},
            {"id": "cloud-boundary", "method": "cloud UV proxy request", "expected": "commissioning mode rejected without upstream request"},
        ],
        "files": {name: sha(content) for name, content in sorted(files.items())},
    }
    files["PACKAGE.json"] = (json.dumps(metadata, indent=2, sort_keys=True) + "\n").encode()
    files["SHA256SUMS"] = "".join(f"{sha(content)}  {name}\n" for name, content in sorted(files.items())).encode()
    out.mkdir(parents=True, exist_ok=True)
    archive = out / (PACKAGE + ".zip")
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED, strict_timestamps=True) as zf:
        for name, content in sorted(files.items()):
            info = zipfile.ZipInfo(f"{PACKAGE}/{name}", (2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if name.endswith(".sh") else 0o100644) << 16
            info.compress_type = zipfile.ZIP_STORED
            zf.writestr(info, content)
    digest = sha(archive.read_bytes())
    (out / "PACKAGE.SHA256").write_text(f"{digest}  {archive.name}\n")
    (out / "PACKAGE.json").write_bytes(files["PACKAGE.json"])
    (out / "SHA256SUMS").write_bytes(files["SHA256SUMS"])
    return archive, digest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    archive, digest = build(args.repo, args.source_commit, args.out_dir)
    print(f"PACKAGE={archive}\nSHA256={digest}\nBYTES={archive.stat().st_size}")


if __name__ == "__main__":
    main()
