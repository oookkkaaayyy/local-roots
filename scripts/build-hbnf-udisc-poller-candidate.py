#!/usr/bin/env python3
"""Build a config-only UDisc poller-off Worker package from the exact current ZIP.

No source files, static assets, database migrations, dependencies, Cron, or secret
values are created or changed. The ZIP is deliberately regenerated with fixed
metadata so its exact bytes can be hashed and independently retained.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

BASELINE_SHA256 = "0b51b7ecdfeced01cc73bee96dff8085f2f1f9529df48223fa4f7185c7d15b4c"
BASELINE_BYTES = 5_015_699
BASELINE_VERSION = "48ffa87e-3c83-46d0-a6ca-db7bf0b064e6"
SOURCE_COMMIT = "44612c09677f59b84bece7de655af7bb011b51e7"
SUPABASE_PROJECT = "phcpbvuqibyarpfrftgx"
SUPABASE_STATE_MD5 = "ec15053c2bde3c28fa252ee804c07623"
SUPABASE_UPDATED_AT = "2026-11-01T22:33:40.372437Z"
SUPABASE_EVIDENCE_DRIVE_ID = "1O5sKF03z72jdGAo14yuV6mRbKTh7Iu0V"
SUPABASE_EVIDENCE_SHA256 = "4ad947436b7fceb531b1c0c451b7c36aef5c38d16f5cce1bbe634b81fdacfd96"
BACKUP_DRIVE_ID = "1UUDgrd5udbV7ZX0BG-GwSAT6FRLpd69v"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build(source: Path, output: Path) -> dict:
    original = source.read_bytes()
    if len(original) != BASELINE_BYTES or sha(original) != BASELINE_SHA256:
        raise ValueError("source ZIP is not the verified current Worker baseline")

    with zipfile.ZipFile(source, "r") as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or any(name.endswith("/") for name in names):
            raise ValueError("baseline ZIP contains duplicate paths or directory entries")
        files = {name: archive.read(name) for name in names}
    original_files = dict(files)

    if "wrangler.jsonc" not in files or "PACKAGE_MANIFEST.json" not in files:
        raise ValueError("baseline ZIP is missing release configuration or package manifest")
    config = json.loads(files["wrangler.jsonc"])
    manifest = json.loads(files["PACKAGE_MANIFEST.json"])
    if config.get("name") != "hbnf" or config.get("account_id") != "e3bc6b78f1104fa0c2a01245084594cf":
        raise ValueError("Worker/account identity mismatch")
    if config.get("vars", {}).get("UDISC_GLOW_ACCESS_APPROVED") != "true":
        raise ValueError("baseline poller approval flag is not exactly true")
    if config.get("triggers", {}).get("crons") != ["* * * * *"]:
        raise ValueError("baseline Cron schedule differs from the verified current baseline")
    if manifest.get("source", {}).get("commit") != SOURCE_COMMIT:
        raise ValueError("baseline package source commit changed")
    if manifest.get("assetCounts", {}).get("unchanged") != 46:
        raise ValueError("baseline package no longer records all 46 assets as unchanged")
    asset_map = sorted(
        [[entry["path"], entry["sha256"]] for entry in manifest.get("files", []) if entry.get("path", "").startswith("public/")],
        key=lambda item: item[0],
    )
    if len(asset_map) != 46:
        raise ValueError("baseline package must identify exactly 46 public assets")
    asset_map_sha256 = sha(json.dumps(asset_map, separators=(",", ":"), ensure_ascii=False).encode())

    config["vars"]["UDISC_GLOW_ACCESS_APPROVED"] = "false"
    config_bytes = (json.dumps(config, indent=2, ensure_ascii=False) + "\n").encode()
    files["wrangler.jsonc"] = config_bytes

    manifest["baseline"] = {
        "worker": "hbnf",
        "activeVersionId": BASELINE_VERSION,
        "activePercentage": 100,
        "rollbackPackageSha256": BASELINE_SHA256,
        "rollbackPackageBytes": BASELINE_BYTES,
        "assetCount": 46,
    }
    manifest["rollback"] = {
        "workerVersion": BASELINE_VERSION,
        "sha256": BASELINE_SHA256,
        "bytes": BASELINE_BYTES,
        "driveFileId": BACKUP_DRIVE_ID,
        "restoreCommand": f"wrangler versions deploy {BASELINE_VERSION}@100% --name hbnf --yes",
    }
    manifest["runtimeAccess"]["approvalFlag"] = "UDISC_GLOW_ACCESS_APPROVED=false"
    manifest["configurationOnlyChange"] = {
        "setting": "UDISC_GLOW_ACCESS_APPROVED",
        "from": "true",
        "to": "false",
        "scope": "Nov 3, 2026 HBNF Glow test event window only",
        "supabaseProject": SUPABASE_PROJECT,
        "supabaseStateFingerprint": SUPABASE_STATE_MD5,
        "supabaseUpdatedAt": SUPABASE_UPDATED_AT,
        "supabaseReadbackDriveFileId": SUPABASE_EVIDENCE_DRIVE_ID,
        "supabaseReadbackSha256": SUPABASE_EVIDENCE_SHA256,
    }
    manifest["pollerReleaseEvidence"] = {
        "baselinePackageDriveFileId": BACKUP_DRIVE_ID,
        "baselinePackageSha256": BASELINE_SHA256,
        "baselineWorkerVersion": BASELINE_VERSION,
        "baselineSupabaseProject": SUPABASE_PROJECT,
        "baselineSupabaseStateFingerprint": SUPABASE_STATE_MD5,
        "baselineSupabaseUpdatedAt": SUPABASE_UPDATED_AT,
    }
    manifest["assetMapSha256"] = asset_map_sha256
    manifest["files"] = [
        ({**entry, "bytes": len(config_bytes), "sha256": sha(config_bytes)}
         if entry.get("path") == "wrangler.jsonc" else entry)
        for entry in manifest["files"]
    ]
    if sum(entry.get("path") == "wrangler.jsonc" for entry in manifest["files"]) != 1:
        raise ValueError("package manifest must list wrangler.jsonc exactly once")
    files["PACKAGE_MANIFEST.json"] = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode()

    # Write sorted entries with fixed timestamps/permissions. The result is
    # deterministic for this Python/zlib toolchain and contains exact original
    # bytes for every file except the two declared configuration/manifest files.
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(files):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, files[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    candidate = output.read_bytes()
    with zipfile.ZipFile(output, "r") as archive:
        actual = {name: archive.read(name) for name in archive.namelist()}
    changed = sorted(name for name in original_files if actual.get(name) != original_files[name])
    if changed != ["PACKAGE_MANIFEST.json", "wrangler.jsonc"]:
        raise ValueError(f"candidate diff is not configuration-only: {changed}")
    if any(actual[name] != files[name] for name in files if name not in {"PACKAGE_MANIFEST.json", "wrangler.jsonc"}):
        raise ValueError("one or more non-configuration package files changed")
    unexpected = sorted(name for name in actual if name not in files)
    if unexpected:
        raise ValueError(f"candidate archive has unexpected files: {unexpected}")
    unchanged = sorted(name for name in files if name not in {"wrangler.jsonc", "PACKAGE_MANIFEST.json"}
                       and actual[name] == files[name])
    if len(unchanged) != len(files) - 2:
        raise ValueError("candidate did not preserve every non-configuration file")
    return {
        "baselineSha256": BASELINE_SHA256,
        "baselineBytes": BASELINE_BYTES,
        "candidateSha256": sha(candidate),
        "candidateBytes": len(candidate),
        "publicAssetsSha256": asset_map_sha256,
        "sourceCommit": SOURCE_COMMIT,
        "changedFiles": ["PACKAGE_MANIFEST.json", "wrangler.jsonc"],
        "unchangedFiles": len(unchanged),
        "udiscApprovalBefore": "true",
        "udiscApprovalAfter": json.loads(actual["wrangler.jsonc"]).get("vars", {}).get("UDISC_GLOW_ACCESS_APPROVED"),
        "supabaseStateFingerprint": SUPABASE_STATE_MD5,
        "supabaseUpdatedAt": SUPABASE_UPDATED_AT,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.baseline, args.output), sort_keys=True))
        return 0
    except (OSError, ValueError, zipfile.BadZipFile, json.JSONDecodeError) as error:
        print(f"BLOCKED: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
