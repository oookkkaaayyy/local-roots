#!/usr/bin/env python3
"""Build a deterministic, source-bound Opal local Owner Control package."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

PACKAGE_NAME = "hbnf-owner-local-control-v1.0.0"
SOURCE_DIR = Path("staging/coordinated-backend/opal/owner-local-control")
TRANSPORT = Path("staging/coordinated-backend/opal/mission-control-local/local-transport.js")
FILES = (
    "README.md", "SOURCE_BASE.json", "auth.lua", "auth_origin.lua", "auth_owner.lua",
    "auth_websocket.lua", "aux_command_access.lua", "enroll.lua", "install.sh",
    "nginx.conf.example", "preflight.sh", "revoke.lua", "rollback.sh", "session.lua",
)
EXPECTED_ROLLBACK = "a91e84c89a481739f9c47c619a1d3c5c35d690869c54159486d528d3863c746e"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build(repo: Path, out_dir: Path, source_commit: str) -> tuple[Path, str]:
    repo = repo.resolve()
    actual_commit = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    if source_commit != actual_commit:
        raise ValueError(f"source_commit must equal current HEAD ({actual_commit})")
    root = repo / SOURCE_DIR
    payload = {name: (root / name).read_bytes() for name in FILES}
    transport = (repo / TRANSPORT).read_bytes()
    payload["local-transport.js"] = transport
    source_base = json.loads(payload["SOURCE_BASE.json"])
    if source_base.get("opal_rollback_transport_sha256") != EXPECTED_ROLLBACK:
        raise ValueError("recorded exact Opal rollback identity changed")
    rollback = (root / "rollback.sh").read_text()
    expected_candidate = f"CANDIDATE_TRANSPORT_SHA={sha(transport)}"
    if expected_candidate not in rollback:
        raise ValueError("rollback script is not bound to the packaged transport SHA")
    hashes = {name: sha(data) for name, data in sorted(payload.items())}
    manifest = {
        "schema": "hbnf-owner-local-control-package-v1",
        "package": PACKAGE_NAME,
        "sourceCommit": source_commit,
        "baseCommit": source_base["base_commit"],
        "installedTransportSha256": sha(transport),
        "rollbackTransportSha256": EXPECTED_ROLLBACK,
        "scope": ["Opal Nginx/Lua local gateway", "existing Opal Mission Control transport module"],
        "notIncluded": ["TLS private key", "DNS provider credential", "router network policy marker", "firmware", "Supabase production payload"],
        "files": hashes,
    }
    payload["PACKAGE-MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    sums = "".join(f"{sha(data)}  {name}\n" for name, data in sorted(payload.items())).encode()
    payload["SHA256SUMS"] = sums

    out_dir.mkdir(parents=True, exist_ok=True)
    archive = out_dir / f"{PACKAGE_NAME}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED, strict_timestamps=True) as zf:
        for name, data in sorted(payload.items()):
            info = zipfile.ZipInfo(f"{PACKAGE_NAME}/{name}", date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if name.endswith(".sh") else 0o100644) << 16
            info.compress_type = zipfile.ZIP_STORED
            zf.writestr(info, data)
    digest = sha(archive.read_bytes())
    (out_dir / f"{PACKAGE_NAME}.zip.sha256").write_text(f"{digest}  {archive.name}\n")
    return archive, digest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--source-commit", required=True)
    args = parser.parse_args()
    archive, digest = build(args.repo, args.out_dir, args.source_commit)
    print(f"PACKAGE={archive}")
    print(f"SHA256={digest}")
    print(f"BYTES={archive.stat().st_size}")


if __name__ == "__main__":
    main()
