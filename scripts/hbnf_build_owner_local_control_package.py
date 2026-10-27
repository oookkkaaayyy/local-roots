#!/usr/bin/env python3
"""Build a deterministic, source-bound Opal local Owner Control package."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

PACKAGE_NAME = "hbnf-owner-local-control-v1.0.13"
SOURCE_DIR = Path("staging/coordinated-backend/opal/owner-local-control")
TRANSPORT = Path("staging/coordinated-backend/opal/mission-control-local/local-transport.js")
OWNER_HTTP_TRANSPORT = Path("staging/coordinated-backend/opal/mission-control-local/owner-http-transport.js")
UV_POLICY_SPEC = Path("hbnf-aux-lighting/backend/aux_uv_policy_spec.json")
UV_HARDWARE_PROFILE = Path("hbnf-aux-lighting/backend/uv_hardware_profile.json")
FILES = (
    "README.md", "SOURCE_BASE.json", "auth.lua", "auth_origin.lua", "auth_owner.lua",
    "auth_websocket.lua", "aux_command_access.lua", "dedicated-nginx.conf.example", "matrix_command_access.lua", "uv_policy_access.lua", "uv_status_access.lua", "uv_runtime.lua",
    "enroll.lua", "hbnf-owner-local-control.init", "install.sh", "matrix_topology.sh",
    "nginx.conf.example", "preflight.sh", "revalidate.lua", "revoke.lua", "rollback.sh", "session.lua",
    "vendor/resty/LICENSE.txt", "vendor/resty/sha.lua", "vendor/resty/sha256.lua", "vendor/resty/string.lua",
)
EXPECTED_ROLLBACK = "51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a"


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
    uv_hardware_profile = (repo / UV_HARDWARE_PROFILE).read_bytes()
    payload["local-transport.js"] = transport
    payload["owner-http-transport.js"] = owner_http_transport
    payload["uv_policy_spec.json"] = uv_policy_spec
    payload["uv_hardware_profile.json"] = uv_hardware_profile
    resolved_commit = subprocess.check_output(
        ["git", "-C", str(repo), "rev-parse", f"{source_commit}^{{commit}}"], text=True
    ).strip()
    if resolved_commit != source_commit:
        raise ValueError("source commit must resolve to the exact full Git commit ID")
    for name, data in payload.items():
        path_by_name = {
            "local-transport.js": TRANSPORT,
            "owner-http-transport.js": OWNER_HTTP_TRANSPORT,
            "uv_policy_spec.json": UV_POLICY_SPEC,
            "uv_hardware_profile.json": UV_HARDWARE_PROFILE,
        }
        path = path_by_name.get(name, SOURCE_DIR / name).as_posix()
        committed = subprocess.check_output(["git", "-C", str(repo), "show", f"{source_commit}:{path}"])
        if committed != data:
            raise ValueError(f"working package input differs from {source_commit}:{path}")
    source_base = json.loads(payload["SOURCE_BASE.json"])
    base_commit = source_base.get("base_commit")
    if not isinstance(base_commit, str) or len(base_commit) != 40:
        raise ValueError("SOURCE_BASE must identify the exact accepted Mission Control baseline commit")
    baseline_transport = subprocess.check_output(
        ["git", "-C", str(repo), "show", f"{base_commit}:{TRANSPORT.as_posix()}"]
    )
    if sha(baseline_transport) != EXPECTED_ROLLBACK:
        raise ValueError("SOURCE_BASE commit does not contain the exact accepted Mission Control rollback transport")
    if source_base.get("opal_rollback_transport_source_commit") != base_commit or source_base.get("opal_rollback_transport_source_path") != TRANSPORT.as_posix():
        raise ValueError("SOURCE_BASE rollback provenance does not name the exact source commit and transport path")
    if sha(transport) != EXPECTED_ROLLBACK:
        raise ValueError("packaged Mission Control transport differs from the accepted rollback baseline")
    policy_spec = json.loads(payload["uv_policy_spec.json"])
    hardware_profile = json.loads(payload["uv_hardware_profile.json"])
    if policy_spec.get("schema") != "hbnf-aux-uv-policy-spec-v1" or policy_spec.get("networkBoundary", {}).get("directWledRouteAllowed") is not False:
        raise ValueError("shared UV policy contract missing or permits direct WLED access")
    if hardware_profile.get("schema") != "hbnf-aux-uv-hardware-profile-v1":
        raise ValueError("shared UV hardware profile schema missing")
    if hardware_profile.get("verified") is not False or any(
        value is not False for group in (hardware_profile.get("runtimeGates", {}), hardware_profile.get("commissioningGates", {}))
        for value in group.values()
    ):
        raise ValueError("packaged UV hardware profile must remain default-off")
    if policy_spec.get("requiredRuntimeGates") != ["auxEnabled", "uvEnabled", "uvOutputsVerified", "hardwareReady"]:
        raise ValueError("UV runtime gate contract changed; update Opal gate implementation and package admission")
    if policy_spec.get("requiredCommissioningGates") != list(hardware_profile.get("commissioningGates", {})):
        raise ValueError("UV commissioning gates do not match the shared profile")
    if source_base.get("opal_rollback_transport_sha256") != EXPECTED_ROLLBACK:
        raise ValueError("recorded exact Opal rollback identity changed")
    exposure = source_base.get("owner_accepted_network_exposure") or {}
    if (exposure.get("owner_accepted") is not True
        or exposure.get("isolation_test_required_for_admission") is not False
        or exposure.get("observation_status") != "NOT_TESTED"):
        raise ValueError("SOURCE_BASE must explicitly record owner-accepted direct WLED network exposure without claiming a test")
    rollback = (root / "rollback.sh").read_text()
    installer = (root / "install.sh").read_text()
    if f"EXPECTED_OLD_TRANSPORT={EXPECTED_ROLLBACK}" not in installer:
        raise ValueError("installer is not bound to the exact accepted Mission Control rollback transport")
    if 'lua_package_path "/etc/hbnf-local-control/lua/?.lua;;";' not in (root / "dedicated-nginx.conf.example").read_text():
        raise ValueError("dedicated Nginx config does not load the isolated bundled Lua modules")
    preflight = (root / "preflight.sh").read_text()
    if ('vendor/resty/sha256.lua' not in installer
        or 'lua_package_path "$PROBE_DIR/lua/?.lua;;"' not in preflight
        or 'cp "$SCRIPT_DIR/vendor/resty/sha.lua"' not in preflight
        or 'content_by_lua_file $PROBE_DIR/probe.lua' not in preflight
        or 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' not in preflight):
        raise ValueError("installer/preflight does not load and exercise the packaged OpenResty modules in Nginx LuaJIT")
    if f"EXPECTED_ROLLBACK_TRANSPORT_SHA={EXPECTED_ROLLBACK}" not in rollback:
        raise ValueError("rollback script is not bound to the exact accepted Mission Control transport")
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
        "rollbackTransportSourceCommit": source_base["opal_rollback_transport_source_commit"],
        "rollbackTransportSourcePath": source_base["opal_rollback_transport_source_path"],
        "ownerAcceptedNetworkExposure": exposure,
        "bundledLuaSha256": {"repository": "openresty/lua-resty-string", "version": "0.17", "commit": "ac0967a020e7d05475ae53808ebf685232fe1c1d", "license": "BSD", "isolatedLuaPath": "/etc/hbnf-local-control/lua"},
        "installedTransportSha256": sha(transport),
        "ownerPwaTransportSha256": sha(owner_http_transport),
        "rollbackTransportSha256": EXPECTED_ROLLBACK,
        "scope": ["separate Opal Nginx/Lua gateway on TCP 8443 with nobody request worker", "existing Opal Mission Control WebSocket transport upgraded with the current compatible command mappings", "separate authenticated per-command HTTPS transport for the existing Owner PWA", "authenticated local UV status and policy routes for fixed segments 1 and 2 with AUX build identity, shared default-off hardware profile and commissioning-gate checks, and command readback", "shared versioned UV request contract and hardware profile consumed by backend JavaScript and Opal Lua validation"],
        "releaseDisposition": "SOURCE_BOUND_NOT_INSTALLED",
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
