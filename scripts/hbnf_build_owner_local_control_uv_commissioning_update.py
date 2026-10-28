#!/usr/bin/env python3
"""Build the exact-source, three-module Opal UV commissioning update."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path

BASE = Path("staging/coordinated-backend/opal/owner-local-control-uv-status-v1.0.15")
SOURCE = Path("staging/coordinated-backend/opal/owner-local-control")
PACKAGE = Path("staging/coordinated-backend/opal/owner-local-control-uv-commissioning-v1.0.15")
RECEIPT = Path("evidence/cart-owner-pwa-baseline-v1.0.15/POST-INSTALL-READBACK.json")
INSTALL_LOG = Path("evidence/cart-owner-pwa-baseline-v1.0.15/OWNER-PASTED-GATEWAY-INSTALL-OUTPUT.txt")
BASELINE_SHA = "a5a877c3c9089df245c1262341ad3a3926c9fc85ba660d67197f277fad6096fa"
BASELINE_SIZE = 263059
BASELINE_FILE_ID = "1W7gvgzlUBshQiFYVFaqFjrVyjNMl065q"
TX = "OWNER-LOCAL-CONTROL-UV-COMMISSIONING-V115-20261027-01"
MODULES = {
    "uv_policy_access.lua": "etc/hbnf-local-control/lua/uv_policy_access.lua",
    "uv_runtime.lua": "etc/hbnf-local-control/lua/uv_runtime.lua",
    "uv_status_access.lua": "etc/hbnf-local-control/lua/uv_status_access.lua",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def checked_commit(root: Path, commit: str) -> None:
    head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=all"], text=True).strip()
    branch = subprocess.check_output(["git", "-C", str(root), "branch", "--show-current"], text=True).strip()
    if head != commit or dirty or not branch:
        raise ValueError("package requires the exact named-branch HEAD and a clean source tree")


def baseline_archive(path: Path, root: Path) -> dict:
    data = path.read_bytes()
    if len(data) != BASELINE_SIZE or sha(data) != BASELINE_SHA:
        raise ValueError("retained exact gateway v1.0.14 rollback ZIP failed its size or SHA-256 check")
    receipt = json.loads((root / RECEIPT).read_text())
    gateway = receipt.get("installedSoftware", {}).get("opalGateway", {})
    if (receipt.get("schema") != "hbnf-cart-uv-post-install-evidence-v1" or
            gateway.get("version") != "1.0.14" or gateway.get("packageSha256") != BASELINE_SHA or
            gateway.get("install") != "PASS" or gateway.get("packageIntegrity") != "PASS" or
            gateway.get("preflight") != "PASS"):
        raise ValueError("existing install receipt does not establish the exact v1.0.14 baseline")
    log = root / INSTALL_LOG
    if (receipt.get("sourceEvidence", {}).get("gatewayInstallerOutputSha256") != sha(log.read_bytes()) or
            b"GATEWAY_INSTALL_COMPLETE: Opal Local Control v1.0.14 installed" not in log.read_bytes()):
        raise ValueError("owner-provided gateway install output does not match its retained receipt")
    prefix = "hbnf-owner-local-control-v1.0.14/"
    with zipfile.ZipFile(path) as zf:
        manifest = json.loads(zf.read(prefix + "PACKAGE-MANIFEST.json"))
        sums = zf.read(prefix + "SHA256SUMS").decode()
        archive_files = {}
        for line in sums.splitlines():
            match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
            if not match:
                raise ValueError("v1.0.14 package checksum manifest is malformed")
            expected, name = match.groups()
            content = zf.read(prefix + name)
            if sha(content) != expected:
                raise ValueError("v1.0.14 rollback ZIP internal hash mismatch: " + name)
            archive_files[name] = content
        if manifest.get("package") != "hbnf-owner-local-control-v1.0.14":
            raise ValueError("rollback package identifies an unexpected gateway version")
    return {"bytes": data, "files": archive_files, "receipt": receipt}


def build(root: Path, commit: str, baseline_zip: Path, out: Path) -> tuple[Path, str]:
    root, out = root.resolve(), out.resolve()
    checked_commit(root, commit)
    prior = baseline_archive(baseline_zip.resolve(), root)
    old = (root / BASE / "BASELINE_FILES.SHA256SUMS").read_bytes()
    baseline_map: dict[str, str] = {}
    for line in old.decode().splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9._/-]+)", line)
        if not match:
            raise ValueError("v1.0.14 installed-file manifest is malformed")
        digest, rel = match.groups()
        if rel in baseline_map or rel.startswith("/") or ".." in rel.split("/"):
            raise ValueError("v1.0.14 baseline contains an unsafe or duplicate path")
        baseline_map[rel] = digest
    if len(baseline_map) != 20:
        raise ValueError("expected an exact 20-file Opal gateway baseline")
    candidates, old_modules = {}, {}
    updated_map = dict(baseline_map)
    for name, rel in MODULES.items():
        expected_old = baseline_map.get(rel)
        old_content = prior["files"].get(name)
        if not old_content or sha(old_content) != expected_old:
            raise ValueError("exact v1.0.14 rollback module does not match baseline manifest: " + name)
        path = SOURCE / name
        candidate = (root / path).read_bytes()
        committed = subprocess.check_output(["git", "-C", str(root), "show", f"{commit}:{path.as_posix()}"])
        if candidate != committed:
            raise ValueError("candidate module differs from exact source commit: " + name)
        candidates[name], old_modules[name] = candidate, old_content
        updated_map[rel] = sha(candidate)
    baseline_text = old.decode()
    updated_text = "".join(f"{updated_map[p]}  {p}\n" for p in sorted(updated_map))
    if len(updated_text.splitlines()) != 20:
        raise ValueError("candidate manifest changed the managed gateway file count")

    out.mkdir(parents=True, exist_ok=True)
    package_name = "hbnf-owner-local-control-uv-commissioning-v1.0.15"
    files: dict[str, bytes] = {
        "README.md": (root / PACKAGE / "README.md").read_bytes(),
        "BASELINE_FILES.SHA256SUMS": baseline_text.encode(),
        "UPDATED_FILES.SHA256SUMS": updated_text.encode(),
        "ROLLBACK_BASELINE.zip": prior["bytes"],
        "install.sh": (root / PACKAGE / "install.sh").read_bytes(),
        "rollback.sh": (root / PACKAGE / "rollback.sh").read_bytes(),
    }
    files.update(candidates)
    for name, content in old_modules.items():
        files["baseline-" + name] = content
    file_meta = {name: sha(content) for name, content in sorted(files.items())}
    package_json = {
        "schema": "hbnf-owner-local-control-uv-commissioning-update-v1",
        "package": package_name,
        "transactionId": TX,
        "sourceCommit": commit,
        "releaseDisposition": "INSTALLABLE_REQUIRES_ONE_TIME_ADMISSION_AND_FRESH_TARGET_READBACK",
        "baseline": {
            "version": "1.0.14",
            "packageSha256": BASELINE_SHA,
            "packageSize": BASELINE_SIZE,
            "packageDriveFileId": BASELINE_FILE_ID,
            "receipt": RECEIPT.as_posix(),
            "receiptEvidence": "owner-reported install output; fresh same-device manifest verification is mandatory before mutation",
            "installedFileCount": 20,
            "installedManifestSha256": sha(old),
        },
        "changedInstalledFiles": ["/" + p for p in MODULES.values()],
        "scope": [
            "Owner-authenticated three-second, one-channel W-only UV commissioning pulse against exact AUX witness and fixed segments 1/2",
            "Always attempt and read back both outputs OFF after a pulse; expose result as unknown if readback fails",
            "Permit an explicit UV OFF command while full activation profile gates remain incomplete",
            "Keep MANUAL and FOLLOW_MATRIX activation behind all existing hardware and commissioning gates",
        ],
        "acceptanceCriteria": [
            {"id": "auth-and-map", "method": "local Opal route readback", "expected": "Owner session, AUX firmware witness, WLED output witness, and fixed 22..24 pixel segment map pass"},
            {"id": "cart-pulse", "method": "Owner presses Test Cart; observe strip and read status", "expected": "only main output gets selected W brightness for 3 seconds, then both read back off"},
            {"id": "bar-pulse", "method": "Owner presses Test Bar; observe strip and read status", "expected": "only short output gets selected W brightness for 3 seconds, then both read back off"},
            {"id": "safe-off", "method": "issue OFF with unverified profile", "expected": "both outputs turn off and read back off"},
            {"id": "full-gates", "method": "try MANUAL/FOLLOW before full profile", "expected": "rejected without mutation"},
            {"id": "cloud-boundary", "method": "cloud UV proxy request", "expected": "commissioning-test mode rejected without upstream call"},
        ],
        "recovery": {"archivePath": "ROLLBACK_BASELINE.zip", "packageSha256": BASELINE_SHA, "packageSize": BASELINE_SIZE, "packageDriveFileId": BASELINE_FILE_ID},
        "files": file_meta,
    }
    files["PACKAGE.json"] = (json.dumps(package_json, indent=2, sort_keys=True) + "\n").encode()
    files["SHA256SUMS"] = "".join(f"{sha(b)}  {name}\n" for name, b in sorted(files.items())).encode()
    output = out / (package_name + ".zip")
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED, strict_timestamps=True) as zf:
        for name, content in sorted(files.items()):
            info = zipfile.ZipInfo(f"{package_name}/{name}", date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if name.endswith(".sh") else 0o100644) << 16
            info.compress_type = zipfile.ZIP_STORED
            zf.writestr(info, content)
    digest = sha(output.read_bytes())
    (out / "PACKAGE.SHA256").write_text(f"{digest}  {output.name}\n")
    (out / "PACKAGE.json").write_bytes(files["PACKAGE.json"])
    (out / "SHA256SUMS").write_bytes(files["SHA256SUMS"])
    return output, digest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--baseline-package", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    output, digest = build(args.repo, args.source_commit, args.baseline_package, args.out_dir)
    print(f"PACKAGE={output}")
    print(f"SHA256={digest}")
    print(f"SIZE={output.stat().st_size}")


if __name__ == "__main__":
    main()
