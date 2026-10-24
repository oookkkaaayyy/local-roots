#!/usr/bin/env python3
"""Build deterministic Wrangler source-input and rollback ZIPs from exact asset roots."""

import argparse
import hashlib
import json
from pathlib import Path
import stat
import zipfile


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def asset_files(root: Path) -> list[Path]:
    files = sorted((root / "public").rglob("*"))
    return [path for path in files if path.is_file()]


def production_config(source: Path) -> bytes:
    config = json.loads((source / "wrangler.jsonc").read_text())
    config["$schema"] = "./node_modules/wrangler/config-schema.json"
    config["name"] = "hbnf"
    config["workers_dev"] = False
    config["assets"] = {"directory": "./public"}
    return (json.dumps(config, indent=2) + "\n").encode()


def build(args, label: str, source: Path, source_commit: str, output: Path) -> tuple[Path, str]:
    files: dict[str, bytes] = {}
    for path in asset_files(source):
        files[path.relative_to(source).as_posix()] = path.read_bytes()
    if len([name for name in files if name.startswith("public/")]) != 44:
        raise SystemExit(f"{label}: expected 44 public assets, found {len(files)}")
    files["wrangler.jsonc"] = production_config(source)
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
    readme = (
        "# HBNF Worker release input\n\n"
        f"Package: {label}\nSource commit: {source_commit}\n"
        "This archive is a complete static-assets Wrangler input, not an uploaded Cloudflare Version.\n"
        "Install the pinned toolchain with `npm ci`; inspect with `npx wrangler versions upload --help`.\n"
        "An authorized `wrangler versions upload --config ./wrangler.jsonc` creates a remote Worker Version.\n"
        "It does not by itself change traffic. Do not upload or deploy without the applicable approval.\n"
    ).encode()
    files["README-RELEASE-INPUT.md"] = readme
    manifest = {
        "format": "hbnf-wrangler-static-assets-input-v1",
        "package": label,
        "sourceCommit": source_commit,
        "activeProductionVersionAtPreparation": args.active_version,
        "rollbackTargetVersion": args.active_version,
        "toolchain": {"wrangler": "4.152.0", "lockfile": "package-lock.json"},
        "assetCount": 44,
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
    parser.add_argument("--rollback-root", type=Path, required=True)
    parser.add_argument("--rollback-commit", required=True)
    parser.add_argument("--toolchain-root", type=Path, required=True)
    parser.add_argument("--active-version", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    for key in ("candidate_root", "rollback_root", "toolchain_root"):
        setattr(args, key, getattr(args, key).resolve())
    items = [
        build(args, "candidate", args.candidate_root, args.candidate_commit,
              args.output_dir / "HBNF-scoring-candidate.zip"),
        build(args, "rollback", args.rollback_root, args.rollback_commit,
              args.output_dir / "HBNF-scoring-rollback.zip"),
    ]
    print(json.dumps({"result": "PASS", "packages": [
        {"path": str(path), "sha256": digest, "bytes": path.stat().st_size}
        for path, digest in items
    ]}, indent=2))


if __name__ == "__main__":
    main()
