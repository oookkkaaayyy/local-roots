#!/usr/bin/env python3
"""Build exact-source Opal local-origin CORS fix v1.0.18."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

PKG = Path("staging/coordinated-backend/opal/owner-local-control-cors-v1.0.18")
SOURCE = Path("staging/coordinated-backend/opal/owner-local-control/nginx.conf.example")
TX = "OWNER-LOCAL-CONTROL-CORS-V118-20261028-02"
PACKAGE = "hbnf-owner-local-control-cors-v1.0.18"
TARGET = "etc/hbnf-local-control/nginx-server.conf"
ROLLBACK_DRIVE_ID = "1JLYWaYi_jyFAUUlmL-gyfJtR8h5qW7Co"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build(repo: Path, commit: str, out: Path) -> tuple[Path, str]:
    repo, out = repo.resolve(), out.resolve()
    if subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip() != commit:
        raise ValueError("source commit must equal checkout HEAD")
    if subprocess.check_output(["git", "-C", str(repo), "status", "--porcelain", "--untracked-files=all"], text=True).strip():
        raise ValueError("source checkout must be clean")

    package_dir = repo / PKG
    baseline_manifest = (package_dir / "BASELINE_FILES.SHA256SUMS").read_bytes()
    baseline_archive = (package_dir / "ROLLBACK_BASELINE.zip").read_bytes()
    baseline = {}
    for line in baseline_manifest.decode().splitlines():
        digest, rel = line[:64], line[66:]
        if len(digest) != 64 or not rel or rel.startswith("/") or ".." in rel.split("/"):
            raise ValueError("live baseline manifest is malformed")
        baseline[rel] = digest
    if len(baseline) != 20 or TARGET not in baseline:
        raise ValueError("exact live gateway baseline must contain 20 files including its server config")
    with zipfile.ZipFile(package_dir / "ROLLBACK_BASELINE.zip") as zf:
        old = {name: zf.read(name) for name in zf.namelist()}
    if set(old) != set(baseline) or any(sha(old[name]) != digest for name, digest in baseline.items()):
        raise ValueError("durable rollback bytes do not match the current live manifest")

    candidate = (repo / SOURCE).read_bytes()
    committed = subprocess.check_output(["git", "-C", str(repo), "show", f"{commit}:{SOURCE.as_posix()}"])
    if candidate != committed:
        raise ValueError("candidate server config differs from exact source commit")
    if b'if ($http_origin !~ \"^(https://hbnightflyers[.]com|http://192[.]168[.]77[.]1)?$\") { return 403; }' not in candidate:
        raise ValueError("exact-origin CORS guard missing")
    if b'http://192[.]168[.]77[.]1' not in candidate:
        raise ValueError("Cart-local PWA origin missing")
    if b'map $http_origin' in candidate or b'if ($http_origin !=' in candidate or b'Access-Control-Allow-Origin \"https://hbnightflyers.com\"' in candidate:
        raise ValueError("stale fixed-origin CORS policy remains")

    updated = dict(baseline)
    updated[TARGET] = sha(candidate)
    updated_manifest = "".join(f"{updated[name]}  {name}\n" for name in sorted(updated)).encode()
    files = {
        "BASELINE_FILES.SHA256SUMS": baseline_manifest,
        "UPDATED_FILES.SHA256SUMS": updated_manifest,
        "ROLLBACK_BASELINE.zip": baseline_archive,
        "baseline-nginx-server.conf": old[TARGET],
        "nginx-server.conf": candidate,
        "install.sh": (package_dir / "install.sh").read_bytes(),
        "rollback.sh": (package_dir / "rollback.sh").read_bytes(),
        "README.md": (package_dir / "README.md").read_bytes(),
    }
    rollback_sha = sha(baseline_archive)
    metadata = {
        "schema": "hbnf-owner-local-control-cors-update-v1",
        "package": PACKAGE,
        "transactionId": TX,
        "sourceCommit": commit,
        "releaseDisposition": "INSTALLABLE_REQUIRES_ONE_TIME_ADMISSION_AND_FRESH_TARGET_READBACK",
        "target": {"model": "GL-SFT1200", "ip": "192.168.77.1"},
        "baseline": {"managedFiles": 20, "packageSha256": rollback_sha,
                     "installed_files_manifest_sha256": sha(baseline_manifest),
                     "installedFilesManifestSha256": sha(baseline_manifest)},
        "recovery": {"archivePath": "ROLLBACK_BASELINE.zip", "sha256": rollback_sha,
                     "size": len(baseline_archive), "driveFileId": ROLLBACK_DRIVE_ID},
        "changedInstalledFiles": ["/" + TARGET],
        "scope": ["Allow the exact Opal-local PWA origin and existing public HTTPS origin through the authenticated gateway CORS check",
                  "Keep all unknown origins denied and keep Owner token authentication unchanged",
                  "Change no WLED routes, AUX firmware, Matrix behavior, Mission Control files, or router-wide Nginx service"],
        "acceptanceCriteria": [
            {"id": "cart-local-origin", "method": "Cart-local browser preflight with x-hbnf-device", "expected": "HTTP 204 and exact Access-Control-Allow-Origin http://192.168.77.1"},
            {"id": "public-origin", "method": "public Owner PWA preflight", "expected": "HTTP 204 and exact Access-Control-Allow-Origin https://hbnightflyers.com"},
            {"id": "untrusted-origin", "method": "preflight with https://untrusted.invalid", "expected": "HTTP 403 and no allow-origin"},
            {"id": "gateway-health", "method": "nginx config check, reload, PID and listener readback", "expected": "dedicated 9443 instance remains healthy"},
            {"id": "owner-auth", "method": "authenticated local UV status request through installed Safari PWA", "expected": "browser request reaches authenticated gateway and returns its current readiness result"},
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
