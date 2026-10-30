#!/usr/bin/env python3
"""Build deterministic Wrangler source-input and rollback ZIPs from exact asset roots."""

import argparse
import hashlib
import json
import posixpath
from pathlib import Path
import re
import stat
import zipfile


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


_STATIC_IMPORT = re.compile(r"""(?:^|\n)\s*(?:import|export)\s+(?:(?!;)[^;])*?\sfrom\s*(['\"])([^'\"]+)\1""")
_SIDE_EFFECT_IMPORT = re.compile(r"""(?:^|\n)\s*import\s+(['\"])([^'\"]+)\1""")
_DYNAMIC_IMPORT = re.compile(r"""\bimport\s*\(\s*(['\"])([^'\"]+)\1\s*\)""")


def assert_worker_import_closure(files: dict[str, bytes]) -> None:
    """Fail unless every relative import in the Worker source is packaged privately."""
    modules = {
        name for name in files
        if name.startswith(("src/", "worker-private/")) and name.endswith((".js", ".mjs", ".cjs"))
    }
    unresolved = []
    public_edges = []
    for name in sorted(modules):
        text = files[name].decode("utf-8")
        specifiers = set()
        for pattern in (_STATIC_IMPORT, _SIDE_EFFECT_IMPORT, _DYNAMIC_IMPORT):
            specifiers.update(match[1] for match in pattern.findall(text))
        for specifier in sorted(specifiers):
            if not specifier.startswith("."):
                continue
            target = posixpath.normpath(posixpath.join(posixpath.dirname(name), specifier))
            if target.startswith("public/"):
                public_edges.append(f"{name} -> {specifier}")
                continue
            candidates = (target, target + ".js", target + ".mjs", target + ".cjs",
                          target + "/index.js", target + "/index.mjs")
            if not any(candidate in files for candidate in candidates):
                unresolved.append(f"{name} -> {specifier}")
    if public_edges:
        raise SystemExit("Worker imports public asset paths; keep internal modules outside public/: " + ", ".join(public_edges))
    if unresolved:
        raise SystemExit("Worker package has unresolved relative imports: " + ", ".join(unresolved))


def asset_files(source: Path, manifest: Path, include_save_module: bool) -> list[Path]:
    """Package the exact installed asset path set plus the reviewed save module.

    The public directory also contains offline rehearsal pages and tooling. A
    recursive copy would silently turn those into production routes, so asset
    membership is pinned to the current rollback manifest.
    """
    paths = []
    for line in manifest.read_text().splitlines():
        if not line.strip():
            continue
        _, name = line.split(maxsplit=1)
        paths.append(name.strip().lstrip("*"))
    if len(paths) != 44 or len(set(paths)) != 44:
        raise SystemExit(f"expected 44 unique installed asset paths in {manifest}")
    if include_save_module:
        paths.extend(("public/glow-save-sync.mjs", "public/league-state-cas.mjs"))
    files = [source / name for name in paths]
    missing = [path.relative_to(source).as_posix() for path in files if not path.is_file()]
    if missing:
        raise SystemExit(f"release assets missing: {', '.join(missing)}")
    return files


def production_config(source: Path) -> bytes:
    config = json.loads((source / "wrangler.jsonc").read_text())
    config["$schema"] = "./node_modules/wrangler/config-schema.json"
    config["name"] = "hbnf"
    config["workers_dev"] = False
    assets = dict(config.get("assets", {}))
    assets["directory"] = "./public"
    assets["binding"] = "ASSETS"
    config["assets"] = assets
    return (json.dumps(config, indent=2) + "\n").encode()


def build(args, label: str, source: Path, source_commit: str, output: Path, repo_root=None) -> tuple[Path, str]:
    files: dict[str, bytes] = {}
    path_manifest = args.candidate_root / "package-validation" / "LOCAL_ASSET_SHA256SUMS"
    for path in asset_files(source, path_manifest, label == "candidate"):
        files[path.relative_to(source).as_posix()] = path.read_bytes()
    for directory in ("src", "worker-private"):
        directory_path = source / directory
        if directory_path.exists():
            for path in sorted(directory_path.rglob("*")):
                if path.is_file():
                    files[path.relative_to(source).as_posix()] = path.read_bytes()
    migration_root = (repo_root or args.repo_root) / "supabase" / "migrations"
    migration_patterns = ("*_hbnf_glow_atomic_week_sync.sql", "*_hbnf_league_state_server_revision_guard.sql", "*_hbnf_league_state_anon_cas_rpc.sql")
    migrations = sorted(path for pattern in migration_patterns for path in migration_root.glob(pattern))
    if label == "candidate":
        if len(migrations) != 3:
            raise SystemExit(f"expected all three canonical HBNF Glow migrations in {migration_root}; found {len(migrations)}")
        snapshots = {"hbnf_glow_atomic_week_sync": "20261028_udisc_glow_atomic_week_sync.sql", "hbnf_league_state_server_revision_guard": "20261029203741_hbnf_league_state_server_revision_guard.sql", "hbnf_league_state_anon_cas_rpc": "20261030021038_hbnf_league_state_anon_cas_rpc.sql"}
        for migration in migrations:
            snapshot_name = next((value for key, value in snapshots.items() if key in migration.name), None)
            snapshot_migration = source / "database" / snapshot_name if snapshot_name else None
            if not snapshot_migration or not snapshot_migration.is_file() or snapshot_migration.read_bytes() != migration.read_bytes():
                raise SystemExit(f"canonical Supabase migration differs from the reviewed snapshot migration: {migration.name}")
            files[f"database/{migration.name}"] = migration.read_bytes()
    asset_count = len([name for name in files if name.startswith("public/")])
    expected_assets = 46 if label == "candidate" else 44
    if asset_count != expected_assets:
        raise SystemExit(f"{label}: expected {expected_assets} approved assets; found {asset_count}")
    files["wrangler.jsonc"] = production_config(source)
    if (source / "package.json").exists() and (source / "package-lock.json").exists():
        files["package.json"] = (source / "package.json").read_bytes()
        files["package-lock.json"] = (source / "package-lock.json").read_bytes()
    else:
        files["package.json"] = json.dumps({
            "name": "hbnf-worker-release-input",
            "version": "1.0.0",
            "private": True,
            "devDependencies": {"wrangler": "4.152.0"},
        }, indent=2).encode() + b"\n"
        lock = json.loads((args.toolchain_root / "package-lock.json").read_text())
        lock["name"] = "hbnf-worker-release-input"
        lock["version"] = "1.0.0"
        lock["packages"][""]["name"] = "hbnf-worker-release-input"
        lock["packages"][""]["version"] = "1.0.0"
        files["package-lock.json"] = (json.dumps(lock, indent=2) + "\n").encode()
    assert_worker_import_closure(files)
    readme = (
        "# HBNF Worker release input\n\n"
        f"Package: {label}\nSource commit: {source_commit}\n"
        "This archive contains the Worker source, public assets, pinned build inputs, and any included target migration; it is not an uploaded Cloudflare Version.\n"
        "Install the pinned toolchain with `npm ci`; inspect with `npx wrangler versions upload --help`.\n"
        "An authorized `wrangler versions upload --config ./wrangler.jsonc` creates a remote Worker Version.\n"
        "It does not by itself change traffic. Do not upload or deploy without the applicable approval.\n"
    ).encode()
    files["README-RELEASE-INPUT.md"] = readme
    manifest = {
        "format": "hbnf-wrangler-worker-input-v2",
        "package": label,
        "sourceCommit": source_commit,
        "activeProductionVersionObservedAtPreparation": args.active_version,
        "cloudflareRollbackVersionIdToReverifyBeforeUse": args.active_version,
        "sourceToVersionLineage": "NOT_ESTABLISHED; current deployed Worker executable bytes were not exported",
        "toolchain": {"wrangler": "4.152.0", "lockfile": "package-lock.json"},
        "assetCount": asset_count,
        "files": [{"path": name, "bytes": len(data), "sha256": sha256(data)} for name, data in sorted(files.items())],
        "providerVersionUploaded": False,
        "productionTrafficChanged": False,
    }
    files["PACKAGE_MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED, strict_timestamps=True) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, data)
    digest = sha256(output.read_bytes())
    output.with_suffix(output.suffix + ".sha256").write_text(f"{digest}  {output.name}\n")
    return output, digest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-root", type=Path, required=True)
    parser.add_argument("--candidate-commit", required=True)
    parser.add_argument("--rollback-archive", type=Path)
    parser.add_argument("--rollback-sha256")
    parser.add_argument("--rollback-bytes", type=int)
    parser.add_argument("--toolchain-root", type=Path, required=True)
    parser.add_argument("--active-version", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--repo-root", type=Path, required=True)
    args = parser.parse_args()
    for key in ("candidate_root", "toolchain_root", "repo_root"):
        setattr(args, key, getattr(args, key).resolve())
    items = [build(args, "candidate", args.candidate_root, args.candidate_commit,
                   args.output_dir / "HBNF-scoring-candidate.zip")]
    rollback_args = (args.rollback_archive, args.rollback_sha256, args.rollback_bytes)
    if any(value is not None for value in rollback_args):
        if any(value is None for value in rollback_args):
            raise SystemExit("rollback archive, SHA-256, and byte count must be supplied together")
        args.rollback_archive = args.rollback_archive.resolve()
        rollback = args.output_dir / "HBNF-scoring-rollback.zip"
        rollback.parent.mkdir(parents=True, exist_ok=True)
        rollback.write_bytes(args.rollback_archive.read_bytes())
        rollback_hash = sha256(rollback.read_bytes())
        if rollback_hash != args.rollback_sha256 or rollback.stat().st_size != args.rollback_bytes:
            raise SystemExit("rollback archive does not match the declared current-baseline bytes")
        rollback.with_suffix(rollback.suffix + ".sha256").write_text(f"{rollback_hash}  {rollback.name}\n")
        items.append((rollback, rollback_hash))
    print(json.dumps({"result": "PASS", "packages": [
        {"path": str(path), "sha256": digest, "bytes": path.stat().st_size}
        for path, digest in items
    ], "rollbackIncluded": len(items) == 2}, indent=2))


if __name__ == "__main__":
    main()
