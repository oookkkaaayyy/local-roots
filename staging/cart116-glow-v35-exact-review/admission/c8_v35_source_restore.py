#!/usr/bin/env python3
"""Build/verify the bounded C8 v35 source-equivalent restore capsule.

This is source recovery, not an ESZip exporter and not a deployment command.
It never reads credentials, contacts Supabase, or changes provider state.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "rollback-v35"
EXPECTED_BLOBS = {
    "index.ts": "017eea939643850fd38182a5ecd3404167cb4b27",
    "guest-command.ts": "50e38cad043c4f4fcf1990d779671010365a0e45",
    "runtime-vibe.ts": "c41f0ff6cf7f92615f3d75f712edb7309e82912a",
    "live.ts": "b5f72cc38269bfdad3feea8446ea32e389eea345",
    "skins_scoring.ts": "c7b773d11fdb4b8099d83aba01d22eb148432c57",
    "matrix-relay.ts": "8b4eccf738c2f76faead74589897f5f2fe2a89f8",
    "matrix-relay-projection.ts": "5b60dd7fd2def68a186d6c77b6f08c035153213d",
    "matrix-relay-auth.ts": "49225ac466f562706abd44809ce9cf3d5af68e22",
    "pairing-expiry.mjs": "0c87ee5b711eb6e74a2079df080bfc4a5e7315b8",
    "deno.json": "1d245785ce55817c7e0265a28d12968b754aac5f",
}
CONFIG = {
    "schema": "cart116-c8-source-equivalent-restore-v1",
    "authority": "GitHub #116 Controls; existing C7 source-equivalent policy",
    "project_id": "phcpbvuqibyarpfrftgx",
    "function_slug": "hbnf-cart-control",
    "original_provider_version": 35,
    "original_provider_ezbr_sha256": "377945d8c9c930420ac36febd304d2a4d5f632cbcc4c9e3467c8f440aaa04e73",
    "source_tree_git_sha1": "74dd1d687de44eacb20eff8e3960d9129948ef88",
    "entrypoint_path": "index.ts",
    "import_map_path": "deno.json",
    "verify_jwt": False,
    "environment": "reuse the existing same-project provider environment; do not export, replace, or disclose secret values",
    "restore_operation": "redeploy these exact 10 source files through the existing authenticated provider deployment route",
    "expected_after_restore": "ACTIVE source/config equivalent deployment; provider version and compiled ezbr digest may differ",
    "compiled_bundle_identity": "NOT_CLAIMED; deployed ESZip bytes are unavailable",
    "post_restore_readback": [
        "same project and function slug",
        "ACTIVE status and new provider version",
        "all 10 source file bytes equal this capsule",
        "entrypoint_path=index.ts and import_map_path=deno.json",
        "verify_jwt=false",
        "record the new compiled digest without comparing it equal to the old digest",
        "read-only legacy route smoke checks pass and no C8 RPC/table appears",
    ],
    "failure_route": "If deploy errors or any post-readback check fails, stop downstream SQL/Opal work; perform read-only provider readback; if state is uncertain, do not retry blindly. A single guarded redeploy of this exact source/config is the recovery action, followed by the same independent checks.",
}


def git_blob(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def source_bytes() -> dict[str, bytes]:
    got = {p.name: p.read_bytes() for p in SOURCE.iterdir() if p.is_file()}
    if set(got) != set(EXPECTED_BLOBS):
        raise ValueError("rollback source member set drift")
    for name, expected in EXPECTED_BLOBS.items():
        if git_blob(got[name]) != expected:
            raise ValueError(f"rollback source Git blob drift: {name}")
    return got


def make_contract(files: dict[str, bytes]) -> bytes:
    value = dict(CONFIG)
    value["files"] = {
        name: {"git_blob_sha1": EXPECTED_BLOBS[name], "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
        for name, data in sorted(files.items())
    }
    return (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()


def build(destination: pathlib.Path) -> dict:
    files = source_bytes()
    members = {**files, "RESTORE-CONTRACT.json": make_contract(files)}
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in sorted(members.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 6, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    return {"path": str(destination), "bytes": destination.stat().st_size,
            "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(), "members": len(members)}


def verify_readback(readback: dict) -> list[str]:
    errors = []
    if readback.get("project_id") != CONFIG["project_id"]: errors.append("PROJECT_MISMATCH")
    if readback.get("function_slug") != CONFIG["function_slug"]: errors.append("FUNCTION_MISMATCH")
    if readback.get("status") != "ACTIVE": errors.append("NOT_ACTIVE")
    if not isinstance(readback.get("version"), int) or readback["version"] <= CONFIG["original_provider_version"]:
        errors.append("RESTORE_VERSION_NOT_NEW")
    entrypoint = str(readback.get("entrypoint_path", "")).rstrip("/")
    import_map = str(readback.get("import_map_path", "")).rstrip("/")
    if not (entrypoint == "index.ts" or entrypoint.endswith("/source/index.ts")):
        errors.append("ENTRYPOINT_MISMATCH")
    if not (import_map == "deno.json" or import_map.endswith("/source/deno.json")):
        errors.append("IMPORT_MAP_MISMATCH")
    if readback.get("verify_jwt") is not CONFIG["verify_jwt"]: errors.append("JWT_SETTING_MISMATCH")
    digest = readback.get("ezbr_sha256")
    if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        errors.append("COMPILED_DIGEST_MISSING")
    elif digest == CONFIG["original_provider_ezbr_sha256"]:
        # A matching digest is possible but must not be used as an assumed restore condition.
        pass
    raw_files = readback.get("files")
    if isinstance(raw_files, list):
        files = {}
        for item in raw_files:
            if not isinstance(item, dict) or not isinstance(item.get("name"), str) or item["name"] in files:
                errors.append("SOURCE_MEMBER_SET_MISMATCH")
                files = {}
                break
            files[item["name"]] = item.get("content")
    else:
        files = raw_files
    if not isinstance(files, dict) or set(files) != set(EXPECTED_BLOBS):
        errors.append("SOURCE_MEMBER_SET_MISMATCH")
    else:
        actual = source_bytes()
        for name, data in actual.items():
            if files.get(name) != data.decode("utf-8"):
                errors.append("SOURCE_BYTE_MISMATCH:" + name)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", type=pathlib.Path)
    parser.add_argument("--verify-readback", type=pathlib.Path)
    args = parser.parse_args()
    if bool(args.build) == bool(args.verify_readback):
        parser.error("choose exactly one of --build or --verify-readback")
    if args.build:
        print(json.dumps(build(args.build), sort_keys=True))
        return 0
    readback = json.loads(args.verify_readback.read_text())
    failures = verify_readback(readback)
    print(json.dumps({"source_equivalent_restore_readback": "FAIL" if failures else "PASS_SOURCE_CONFIG_ONLY_NOT_BINARY_IDENTITY",
                      "failures": failures}, sort_keys=True))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
