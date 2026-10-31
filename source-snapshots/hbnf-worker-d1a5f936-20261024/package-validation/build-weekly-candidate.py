#!/usr/bin/env python3
"""Build an exact-source weekly Glow candidate from the currently installed 086 package."""
import argparse
import hashlib
import json
from pathlib import Path
import stat
import subprocess
import zipfile

WORKER = "hbnf"
ACCOUNT = "e3bc6b78f1104fa0c2a01245084594cf"
BASELINE_VERSION = "08633e43-dbaa-4421-a072-5af56f75d4b7"
BASELINE_SHA256 = "a3ef09676caf0a39d53cc269ed8863cf2705708c528641cf94cd47dd49d58dc7"
EVENT_MIGRATION = "20261031054752_hbnf_udisc_glow_event_bindings.sql"
EXPECTED_MODIFIED_ASSETS = ["public/udisc-glow-live-source.mjs"]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_files(root: Path, directory: str) -> dict[str, bytes]:
    base = root / directory
    return {f"{directory}/{p.relative_to(base).as_posix()}": p.read_bytes()
            for p in sorted(base.rglob("*")) if p.is_file()}


def deterministic_zip(path: Path, files: dict[str, bytes]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED, strict_timestamps=True) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, data)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True, type=Path)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--baseline-archive", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    repo, source, baseline, output = (p.resolve() for p in (args.repo_root, args.source_root, args.baseline_archive, args.output_dir))
    if len(args.source_commit) != 40:
        raise SystemExit("source commit must be a full 40-character SHA")
    subprocess.check_call(["git", "-C", str(repo), "cat-file", "-e", f"{args.source_commit}^{{commit}}"])
    baseline_bytes = baseline.read_bytes()
    if sha(baseline_bytes) != BASELINE_SHA256:
        raise SystemExit("current installed Worker rollback bytes do not match the verified 086 candidate")

    base_manifest_path = source / "package-validation" / "INSTALLED_086_BASELINE.json"
    base_manifest = json.loads(base_manifest_path.read_text())
    if (base_manifest.get("worker") != WORKER or base_manifest.get("activeVersionId") != BASELINE_VERSION or
            base_manifest.get("activePercentage") != 100 or base_manifest.get("rollbackPackageSha256") != BASELINE_SHA256 or
            base_manifest.get("assetCount") != 46):
        raise SystemExit("installed baseline witness does not match the authenticated 086 target")
    expected_assets = {item["path"]: item for item in base_manifest["assets"]}
    if len(expected_assets) != 46:
        raise SystemExit("installed baseline witness must contain exactly 46 assets")
    with zipfile.ZipFile(baseline) as archive:
        baseline_assets = {name: archive.read(name) for name in archive.namelist()
                           if name.startswith("public/") and not name.endswith("/")}
    if set(baseline_assets) != set(expected_assets):
        raise SystemExit("rollback package public asset paths do not match the indexed 086 witness")
    for name, data in baseline_assets.items():
        item = expected_assets[name]
        if len(data) != item["bytes"] or sha(data) != item["sha256"]:
            raise SystemExit(f"rollback asset witness mismatch: {name}")

    source_assets_all = source_files(source, "public")
    if not set(baseline_assets).issubset(source_assets_all):
        raise SystemExit("candidate source is missing one or more assets from the current installed 46-asset set")
    # The historical source snapshot contains review/rehearsal files that were
    # never installed. Preserve the complete live baseline and select only
    # paths that existed in that baseline; never import snapshot-only assets.
    source_assets = {name: source_assets_all[name] for name in baseline_assets}
    changed = [name for name in sorted(baseline_assets)
               if sha(source_assets[name]) != sha(baseline_assets[name])]
    if changed != EXPECTED_MODIFIED_ASSETS:
        raise SystemExit(f"unexpected public asset delta: {changed}")
    assets = dict(baseline_assets)
    for name in changed:
        assets[name] = source_assets[name]

    runtime = {}
    for folder in ("src", "worker-private"):
        runtime.update(source_files(source, folder))
    for name, data in runtime.items():
        actual = subprocess.check_output(["git", "-C", str(repo), "show", f"{args.source_commit}:{(source / name).relative_to(repo).as_posix()}"])
        if actual != data:
            raise SystemExit(f"runtime file is not from the exact source commit: {name}")

    migration = repo / "supabase" / "migrations" / EVENT_MIGRATION
    if not migration.is_file():
        raise SystemExit("the exact event-binding migration is missing")
    migration_bytes = migration.read_bytes()
    migration_rel = migration.relative_to(repo).as_posix()
    if subprocess.check_output(["git", "-C", str(repo), "show", f"{args.source_commit}:{migration_rel}"]) != migration_bytes:
        raise SystemExit("event-binding migration differs from the exact source commit")

    # Start with the exact source config so bindings, compatibility settings,
    # asset routing, and cron cannot drift from the reviewed commit. Add only
    # the target account identity required for this production package.
    source_config = source / "wrangler.jsonc"
    source_config_bytes = source_config.read_bytes()
    try:
        config = json.loads(source_config_bytes)
    except json.JSONDecodeError as error:
        raise SystemExit(f"weekly package builder requires JSON-compatible wrangler.jsonc: {error}")
    if config.get("name") != WORKER or config.get("main") != "./src/index.js":
        raise SystemExit("source Wrangler config does not identify the expected HBNF Worker")
    if config.get("triggers", {}).get("crons") != ["* * * * *"]:
        raise SystemExit("source Wrangler config changed the qualified one-minute schedule")
    if config.get("assets", {}).get("binding") != "ASSETS":
        raise SystemExit("source Wrangler config changed the qualified static asset binding")
    if config.get("vars", {}).get("UDISC_GLOW_ACCESS_APPROVED") != "true":
        raise SystemExit("source Wrangler config does not explicitly bind approved event access")
    config["account_id"] = ACCOUNT
    config_bytes = (json.dumps(config, indent=2) + "\n").encode()
    files = {**assets, **runtime, "database/" + EVENT_MIGRATION: migration_bytes,
             "wrangler.jsonc": config_bytes,
             "package.json": (source / "package.json").read_bytes(),
             "package-lock.json": (source / "package-lock.json").read_bytes()}
    for name in ("package.json", "package-lock.json", "wrangler.jsonc"):
        current = (source / name).read_bytes()
        rel = (source / name).relative_to(repo).as_posix()
        if subprocess.check_output(["git", "-C", str(repo), "show", f"{args.source_commit}:{rel}"]) != current:
            raise SystemExit(f"pinned packaging input is not from the exact source commit: {name}")

    modifications = {name: {"priorSha256": sha(baseline_assets[name]), "candidateSha256": sha(assets[name]), "source": args.source_commit}
                     for name in changed}
    manifest = {
        "format": "hbnf-weekly-glow-worker-package-v1",
        "source": {"repository": "oookkkaaayyy/local-roots", "branch": "feature/udisc-glow-standings-prototype", "commit": args.source_commit},
        "baseline": {"worker": WORKER, "activeVersionId": BASELINE_VERSION, "activePercentage": 100,
                     "rollbackPackageSha256": BASELINE_SHA256, "rollbackPackageBytes": len(baseline_bytes), "assetCount": 46},
        "assetChanges": modifications,
        "assetCounts": {"unchanged": 45, "modified": changed, "added": []},
        "databaseMigration": {"path": "database/" + EVENT_MIGRATION, "sha256": sha(migration_bytes), "bytes": len(migration_bytes), "order": 1},
        "runtimeAccess": {"sourceMethod": "event-specific /leaderboard/export XLSX", "approvalFlag": "UDISC_GLOW_ACCESS_APPROVED=true",
                          "credentialName": "SUPABASE_SERVICE_ROLE_KEY", "credentialIncludedInPackage": False},
        "toolchain": {"wrangler": "4.152.0", "lockfile": "package-lock.json"},
        "files": [{"path": name, "bytes": len(data), "sha256": sha(data)} for name, data in sorted(files.items())],
        "rollback": {"workerVersion": BASELINE_VERSION, "sha256": BASELINE_SHA256, "cronChange": "none; retain existing minute schedule; rollback version has no Supabase credential"},
        "acceptance": {"realNov3Scoring": "NOT_YET_OCCURRED", "noScoresImportedDuringQualification": True},
    }
    files["PACKAGE_MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    candidate = output / "HBNF-weekly-glow-candidate.zip"
    deterministic_zip(candidate, files)
    rollback = output / "HBNF-weekly-glow-rollback-086.zip"
    rollback.parent.mkdir(parents=True, exist_ok=True)
    rollback.write_bytes(baseline_bytes)
    if sha(rollback.read_bytes()) != BASELINE_SHA256:
        raise SystemExit("rollback copy failed byte verification")
    candidate_record = {"path": candidate.name, "bytes": candidate.stat().st_size, "sha256": sha(candidate.read_bytes()), "sourceCommit": args.source_commit}
    rollback_record = {"path": rollback.name, "bytes": rollback.stat().st_size, "sha256": sha(rollback.read_bytes()), "workerVersion": BASELINE_VERSION}
    (output / "PACKAGE_MANIFEST.json").write_text(json.dumps({"candidate": candidate_record, "rollback": rollback_record, "package": manifest}, indent=2) + "\n")
    (output / "HBNF-weekly-glow-candidate.zip.sha256").write_text(f"{candidate_record['sha256']}  {candidate.name}\n")
    (output / "HBNF-weekly-glow-rollback-086.zip.sha256").write_text(f"{rollback_record['sha256']}  {rollback.name}\n")
    print(json.dumps({"result": "PASS", "candidate": candidate_record, "rollback": rollback_record,
                      "assetCounts": manifest["assetCounts"], "migration": manifest["databaseMigration"]}, indent=2))


if __name__ == "__main__":
    main()
