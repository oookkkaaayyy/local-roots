#!/usr/bin/env python3
"""Build a deterministic, exact-source, single-module Opal UV-status upgrade."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path

SOURCE = Path("staging/coordinated-backend/opal/owner-local-control/uv_status_access.lua")
PACKAGE_DIR = Path("staging/coordinated-backend/opal/owner-local-control-uv-status-v1.0.15")
RECEIPT = Path("evidence/cart-owner-pwa-baseline-v1.0.15/POST-INSTALL-READBACK.json")
INSTALL_LOG = Path("evidence/cart-owner-pwa-baseline-v1.0.15/OWNER-PASTED-GATEWAY-INSTALL-OUTPUT.txt")
PACKAGE_NAME = "hbnf-owner-local-control-uv-status-v1.0.15"
BASELINE_PACKAGE_SHA256 = "a5a877c3c9089df245c1262341ad3a3926c9fc85ba660d67197f277fad6096fa"
BASELINE_PACKAGE_BYTES = 263059
BASELINE_PACKAGE_DRIVE_FILE_ID = "1W7gvgzlUBshQiFYVFaqFjrVyjNMl065q"
BASELINE_MODULE_SHA256 = "72e586ba9d2643967923d0f3202523b0fee025b507affc281bc284bb17a40d13"
TX = "OWNER-LOCAL-CONTROL-UV-STATUS-V115-20261027-01"
PACKAGE_FILES = (
    "BASELINE_FILES.SHA256SUMS", "UPDATED_FILES.SHA256SUMS", "baseline-uv_status_access.lua",
    "install.sh", "rollback.sh",
)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_clean_source(root: Path, source_commit: str) -> None:
    head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    if head != source_commit:
        raise ValueError(f"source commit must equal clean checkout HEAD ({head})")
    if subprocess.check_output(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=all"], text=True).strip():
        raise ValueError("strict source binding requires a clean checkout")
    if not subprocess.check_output(["git", "-C", str(root), "branch", "--show-current"], text=True).strip():
        raise ValueError("strict source binding requires a named integrated branch")


def validate_baseline_archive(archive_path: Path, receipt_path: Path, log_path: Path) -> dict:
    archive_bytes = archive_path.read_bytes()
    if len(archive_bytes) != BASELINE_PACKAGE_BYTES or sha(archive_bytes) != BASELINE_PACKAGE_SHA256:
        raise ValueError("exact retained Opal v1.0.14 package bytes do not match the recorded baseline")
    receipt = json.loads(receipt_path.read_text())
    pwa_receipt = receipt.get("installedSoftware", {}).get("ownerPwa", {})
    gateway = receipt.get("installedSoftware", {}).get("opalGateway", {})
    if (receipt.get("schema") != "hbnf-cart-uv-post-install-evidence-v1" or
            gateway.get("version") != "1.0.14" or gateway.get("packageSha256") != BASELINE_PACKAGE_SHA256 or
            gateway.get("packageIntegrity") != "PASS" or gateway.get("install") != "PASS" or
            gateway.get("preflight") != "PASS" or pwa_receipt.get("version") != "1.0.15"):
        raise ValueError("retained install receipt does not bind the exact installed v1.0.14 gateway")
    evidence = receipt.get("sourceEvidence", {})
    log_bytes = log_path.read_bytes()
    if (evidence.get("gatewayInstallerOutput") != log_path.name or
            evidence.get("gatewayInstallerOutputSha256") != sha(log_bytes) or
            b"GATEWAY_INSTALL_COMPLETE: Opal Local Control v1.0.14 installed" not in log_bytes):
        raise ValueError("retained gateway install output is missing or does not match its receipt hash")
    with zipfile.ZipFile(archive_path) as zf:
        prefix = "hbnf-owner-local-control-v1.0.14/"
        manifest = json.loads(zf.read(prefix + "PACKAGE-MANIFEST.json"))
        sums = zf.read(prefix + "SHA256SUMS").decode()
        for line in sums.splitlines():
            match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
            if not match or sha(zf.read(prefix + match.group(2))) != match.group(1):
                raise ValueError("v1.0.14 rollback package fails its internal SHA256SUMS")
        if manifest.get("package") != "hbnf-owner-local-control-v1.0.14":
            raise ValueError("rollback ZIP manifest does not identify gateway v1.0.14")
        old_module = zf.read(prefix + "uv_status_access.lua")
        if sha(old_module) != BASELINE_MODULE_SHA256 or b"outputMode" in old_module:
            raise ValueError("exact installed v1.0.14 status module identity differs from the expected baseline")
    return {"archiveBytes": archive_bytes, "oldModule": old_module, "receipt": receipt}


def build(root: Path, out_dir: Path, source_commit: str, baseline_archive: Path) -> tuple[Path, str]:
    root = root.resolve()
    out_dir = out_dir.resolve()
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise ValueError("source commit must be a full 40-character lowercase Git SHA-1")
    verify_clean_source(root, source_commit)
    archive_info = validate_baseline_archive(
        baseline_archive.resolve(), root / RECEIPT, root / INSTALL_LOG,
    )
    source_path = root / SOURCE
    candidate = source_path.read_bytes()
    committed_candidate = subprocess.check_output(["git", "-C", str(root), "show", f"{source_commit}:{SOURCE.as_posix()}"])
    if candidate != committed_candidate or b'outputMode = "FOLLOW_MATRIX"' not in candidate or b'outputMode = "MANUAL"' not in candidate:
        raise ValueError("candidate UV status module is not committed or does not expose observed output modes")

    package_source = root / PACKAGE_DIR
    files = {name: (package_source / name).read_bytes() for name in PACKAGE_FILES}
    old_module = (package_source / "baseline-uv_status_access.lua").read_bytes()
    if sha(old_module) != BASELINE_MODULE_SHA256 or old_module != archive_info["oldModule"]:
        raise ValueError("staged rollback module differs from the exact retained v1.0.14 package")
    baseline_manifest = files["BASELINE_FILES.SHA256SUMS"]
    if len(baseline_manifest.decode().splitlines()) != 20:
        raise ValueError("gateway installed-file baseline must bind exactly 20 files")
    updated_by_path = {}
    found_status = False
    for line in baseline_manifest.decode().splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([^/]+)", line)
        if not match:
            raise ValueError("gateway baseline file manifest is malformed")
        old_sha, path = match.groups()
        if path == "etc/hbnf-local-control/lua/uv_status_access.lua":
            if old_sha != BASELINE_MODULE_SHA256:
                raise ValueError("gateway baseline manifest does not bind the exact old status module")
            updated_by_path[path] = sha(candidate)
            found_status = True
        else:
            updated_by_path[path] = old_sha
    updated_lines = "".join(f"{updated_by_path[path]}  {path}\n" for path in sorted(updated_by_path))
    if not found_status or updated_lines.encode() != files["UPDATED_FILES.SHA256SUMS"]:
        raise ValueError("updated gateway file manifest must change only the UV status module")

    payload = dict(files)
    payload["uv_status_access.lua"] = candidate
    payload["ROLLBACK_BASELINE.zip"] = archive_info["archiveBytes"]
    package_manifest = {
        "schema": "hbnf-owner-local-control-uv-status-update-v1",
        "package": PACKAGE_NAME,
        "transactionId": TX,
        "sourceCommit": source_commit,
        "releaseDisposition": "INSTALLABLE_REQUIRES_EXISTING_ADMISSION",
        "scope": ["Expose outputMode from existing observed Matrix/manual/off segment state on authenticated UV status route"],
        "changedInstalledFiles": ["/etc/hbnf-local-control/lua/uv_status_access.lua"],
        "baseline": {
            "version": "1.0.14",
            "packageArchive": {"sha256": BASELINE_PACKAGE_SHA256, "size": BASELINE_PACKAGE_BYTES,
                                "driveFileId": BASELINE_PACKAGE_DRIVE_FILE_ID},
            "readbackReceipt": {"path": RECEIPT.as_posix(), "sha256": sha((root / RECEIPT).read_bytes()),
                                "evidenceLevel": "OWNER_REPORTED_INSTALL_TRANSACTION_NOT_FRESH_FILESYSTEM_READBACK"},
            "installedManagedFileCount": 20,
            "installedFilesManifestSha256": sha(baseline_manifest),
            "previousStatusModuleSha256": BASELINE_MODULE_SHA256,
        },
        "candidateModuleSha256": sha(candidate),
        "recovery": {"archivePath": "ROLLBACK_BASELINE.zip", "sha256": BASELINE_PACKAGE_SHA256,
                     "size": BASELINE_PACKAGE_BYTES, "driveFileId": BASELINE_PACKAGE_DRIVE_FILE_ID,
                     "deviceSnapshotPath": "/root/hbnf-owner-local-control-uv-status.rollback-V115-20261027-01"},
        "files": {name: sha(data) for name, data in sorted(payload.items())},
    }
    payload["PACKAGE.json"] = (json.dumps(package_manifest, indent=2, sort_keys=True) + "\n").encode()
    payload["SHA256SUMS"] = "".join(f"{sha(data)}  {name}\n" for name, data in sorted(payload.items())).encode()

    out_dir.mkdir(parents=True, exist_ok=True)
    output = out_dir / f"{PACKAGE_NAME}.zip"
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED, strict_timestamps=True) as zf:
        for name, data in sorted(payload.items()):
            info = zipfile.ZipInfo(f"{PACKAGE_NAME}/{name}", date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if name.endswith(".sh") else 0o100644) << 16
            info.compress_type = zipfile.ZIP_STORED
            zf.writestr(info, data)
    digest = sha(output.read_bytes())
    (out_dir / "PACKAGE.SHA256").write_text(f"{digest}  {output.name}\n")
    return output, digest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--baseline-package", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    output, digest = build(args.repo, args.out_dir, args.source_commit, args.baseline_package)
    print(f"PACKAGE={output}")
    print(f"SHA256={digest}")
    print(f"BYTES={output.stat().st_size}")


if __name__ == "__main__":
    main()
