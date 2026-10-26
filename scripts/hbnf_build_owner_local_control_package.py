#!/usr/bin/env python3
"""Build a deterministic, source-bound Opal local Owner Control package."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

PACKAGE_NAME = "hbnf-owner-local-control-v1.0.5"
SOURCE_DIR = Path("staging/coordinated-backend/opal/owner-local-control")
TRANSPORT = Path("staging/coordinated-backend/opal/mission-control-local/local-transport.js")
OWNER_HTTP_TRANSPORT = Path("staging/coordinated-backend/opal/mission-control-local/owner-http-transport.js")
UV_POLICY_SPEC = Path("hbnf-aux-lighting/backend/aux_uv_policy_spec.json")
FILES = (
    "README.md", "SOURCE_BASE.json", "auth.lua", "auth_origin.lua", "auth_owner.lua",
    "auth_websocket.lua", "aux_command_access.lua", "dedicated-nginx.conf.example", "matrix_command_access.lua", "uv_policy_access.lua", "uv_status_access.lua",
    "enroll.lua", "hbnf-owner-local-control.init", "install.sh", "matrix_topology.sh",
    "nginx.conf.example", "preflight.sh", "revalidate.lua", "revoke.lua", "rollback.sh", "session.lua",
)
EXPECTED_ROLLBACK = "a91e84c89a481739f9c47c619a1d3c5c35d690869c54159486d528d3863c746e"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build(repo: Path, out_dir: Path, source_commit: str) -> tuple[Path, str]:
    repo = repo.resolve()
    if len(source_commit) != 40 or any(character not in "0123456789abcdef" for character in source_commit):
        raise ValueError("source commit must be a full 40-character lowercase Git SHA-1")
    root = repo / SOURCE_DIR
    payload = {name: (root / name).read_bytes() for name in FILES}
    transport = (repo / TRANSPORT).read_bytes()
    owner_http_transport = (repo / OWNER_HTTP_TRANSPORT).read_bytes()
    uv_policy_spec = (repo / UV_POLICY_SPEC).read_bytes()
    payload["local-transport.js"] = transport
    payload["owner-http-transport.js"] = owner_http_transport
    payload["uv_policy_spec.json"] = uv_policy_spec
    resolved_commit = subprocess.check_output(
        ["git", "-C", str(repo), "rev-parse", f"{source_commit}^{{commit}}"], text=True
    ).strip()
    if resolved_commit != source_commit:
        raise ValueError("source commit must resolve to the exact full Git commit ID")
    for name, data in payload.items():
        path = (TRANSPORT if name == "local-transport.js" else OWNER_HTTP_TRANSPORT if name == "owner-http-transport.js" else UV_POLICY_SPEC if name == "uv_policy_spec.json" else SOURCE_DIR / name).as_posix()
        committed = subprocess.check_output(["git", "-C", str(repo), "show", f"{source_commit}:{path}"])
        if committed != data:
            raise ValueError(f"working package input differs from {source_commit}:{path}")
    source_base = json.loads(payload["SOURCE_BASE.json"])
    policy_spec = json.loads(payload["uv_policy_spec.json"])
    if policy_spec.get("schema") != "hbnf-aux-uv-policy-spec-v1" or policy_spec.get("networkBoundary", {}).get("directWledRouteAllowed") is not False:
        raise ValueError("shared UV policy contract missing or permits direct WLED access")
    if source_base.get("opal_rollback_transport_sha256") != EXPECTED_ROLLBACK:
        raise ValueError("recorded exact Opal rollback identity changed")
    rollback = (root / "rollback.sh").read_text()
    expected_candidate = f"CANDIDATE_TRANSPORT_SHA={sha(transport)}"
    if expected_candidate not in rollback:
        raise ValueError("rollback script is not bound to the packaged transport SHA")
    expected_owner_http = f"CANDIDATE_OWNER_HTTP_SHA={sha(owner_http_transport)}"
    if expected_owner_http not in rollback:
        raise ValueError("rollback script is not bound to the packaged Owner PWA HTTP transport SHA")
    hashes = {name: sha(data) for name, data in sorted(payload.items())}
    manifest = {
        "schema": "hbnf-owner-local-control-package-v1",
        "package": PACKAGE_NAME,
        "sourceCommit": source_commit,
        "baseCommit": source_base["base_commit"],
        "installedTransportSha256": sha(transport),
        "ownerPwaTransportSha256": sha(owner_http_transport),
        "rollbackTransportSha256": EXPECTED_ROLLBACK,
        "scope": ["separate Opal Nginx/Lua gateway on TCP 8443 with nobody request worker", "existing Opal Mission Control WebSocket transport upgraded with the current compatible command mappings", "separate authenticated per-command HTTPS transport for the existing Owner PWA", "authenticated fail-closed local UV status and policy routes", "shared versioned UV request contract consumed by backend JavaScript and Opal Lua validation"],
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
