#!/usr/bin/env python3
"""Build a closed, source-identified HBNF coordinated release bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE_NAME = "HBNF_COORDINATED_RELEASE_SOURCE_20261001"
DEFAULT_MAX_BYTES = 50_000_000

FILES = (
    ("hbnf-final-controller/hbnf-cart.html", "controller/hbnf-cart.html"),
    ("hbnf-final-controller/hbnf-cart.js", "controller/hbnf-cart.js"),
    ("hbnf-final-controller/hbnf-cart-local.mjs", "controller/hbnf-cart-local.mjs"),
    ("hbnf-final-controller/hbnf-cart-net.mjs", "controller/hbnf-cart-net.mjs"),
    ("hbnf-final-controller/hbnf-cart-sw.js", "controller/hbnf-cart-sw.js"),
    ("hbnf-final-controller/hbnf-cart-semantic.mjs", "controller/hbnf-cart-semantic.mjs"),
    ("hbnf-final-controller/hbnf-cart-ui-v6.css", "controller/hbnf-cart-ui-v6.css"),
    ("hbnf-final-controller/hbnf-cart-ui-v6.mjs", "controller/hbnf-cart-ui-v6.mjs"),
    ("hbnf-final-controller/hbnf-cart-features.mjs", "controller/hbnf-cart-features.mjs"),
    ("hbnf-final-controller/hbnf-cart-skins-score.mjs", "controller/hbnf-cart-skins-score.mjs"),
    ("hbnf-final-controller/hbnf-cart-manifest.webmanifest", "controller/hbnf-cart-manifest.webmanifest"),
    ("hbnf-final-controller/hbnf-cart-icon-180.png", "controller/hbnf-cart-icon-180.png"),
    ("hbnf-final-controller/hbnf-cart-icon-192.png", "controller/hbnf-cart-icon-192.png"),
    ("hbnf-final-controller/hbnf-cart-icon-512.png", "controller/hbnf-cart-icon-512.png"),
    ("hbnf-final-controller/hbnf-guest-qr.png", "controller/hbnf-guest-qr.png"),
    ("hbnf-ui-v6-package/install_ui_v6.py", "installer/install_ui_v6.py"),
    ("hbnf-cart-core/domain/palette-projection.mjs", "domain/palette-projection.mjs"),
    ("config/HBNF_COORDINATED_RELEASE_GATES.json", "config/HBNF_COORDINATED_RELEASE_GATES.json"),
    ("config/HBNF_COORDINATED_CANDIDATE_MANIFEST.json", "config/HBNF_COORDINATED_CANDIDATE_MANIFEST.json"),
    ("tools/hbnf-rebuild-opal-updater.py", "tools/hbnf-rebuild-opal-updater.py"),
    ("tools/hbnf-source-identity-preflight.py", "tools/hbnf-source-identity-preflight.py"),
    ("tools/hbnf-local-release-preflight.py", "tools/hbnf-local-release-preflight.py"),
    ("scripts/hbnf_candidate_bundle.py", "tools/hbnf_candidate_bundle.py"),
    ("tests/hbnf-coordinated-controller-contract.mjs", "tests/hbnf-coordinated-controller-contract.mjs"),
    ("tests/hbnf-release-readiness.mjs", "tests/hbnf-release-readiness.mjs"),
    ("tests/hbnf-ios12-compat-audit.mjs", "tests/hbnf-ios12-compat-audit.mjs"),
    ("tests/hbnf-canonical-palette-projection.mjs", "tests/hbnf-canonical-palette-projection.mjs"),
    ("tests/hbnf-opal-updater-rebuilder.test.py", "tests/hbnf-opal-updater-rebuilder.test.py"),
    ("tests/hbnf-coordinated-backend-staging.mjs", "tests/hbnf-coordinated-backend-staging.mjs"),
    ("tests/test_hbnf_candidate_bundle.py", "tests/test_hbnf_candidate_bundle.py"),
    ("work/HBNF_COORDINATED_RELEASE_20261001.md", "work/HBNF_COORDINATED_RELEASE_20261001.md"),
    ("work/HBNF_READ_THIS_FIRST.md", "work/HBNF_READ_THIS_FIRST.md"),
    ("work/HBNF_ROLLOUT_RUNBOOK_20261001.md", "work/HBNF_ROLLOUT_RUNBOOK_20261001.md"),
    ("work/HBNF_OPAL_UPDATER_NEXT_PACKAGE_REQUIREMENTS.md", "work/HBNF_OPAL_UPDATER_NEXT_PACKAGE_REQUIREMENTS.md"),
    ("work/HBNF_SOURCE_IDENTITY_RECOVERY.md", "work/HBNF_SOURCE_IDENTITY_RECOVERY.md"),
    ("work/HBNF_CANONICAL_CONTROL_RECONCILIATION.md", "work/HBNF_CANONICAL_CONTROL_RECONCILIATION.md"),
    ("work/HBNF_FIRMWARE_COORDINATED_CONTRACT.md", "work/HBNF_FIRMWARE_COORDINATED_CONTRACT.md"),
    ("work/HBNF_CODEX_FIRMWARE_RECONCILIATION_PROMPT.md", "work/HBNF_CODEX_FIRMWARE_RECONCILIATION_PROMPT.md"),
    ("work/HBNF_BACKEND_CUTOVER_20261001.md", "work/HBNF_BACKEND_CUTOVER_20261001.md"),
)

RECURSIVE_DIRS = (
    ("staging/coordinated-backend", "staging/coordinated-backend"),
    ("evidence/live-production-20261001", "evidence/live-production-20261001"),
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def collect_files() -> dict[str, bytes]:
    collected: dict[str, bytes] = {}
    for source_name, archive_name in FILES:
        source = ROOT / source_name
        if not source.is_file() or source.is_symlink():
            raise FileNotFoundError(f"required regular source file missing: {source_name}")
        if archive_name in collected:
            raise ValueError(f"duplicate package path: {archive_name}")
        collected[archive_name] = source.read_bytes()
    for source_name, archive_prefix in RECURSIVE_DIRS:
        source_root = ROOT / source_name
        if not source_root.is_dir() or source_root.is_symlink():
            raise FileNotFoundError(f"required source directory missing: {source_name}")
        for source in sorted(source_root.rglob("*")):
            if source.is_symlink():
                raise ValueError(f"symlinks are not allowed in candidate source: {source.relative_to(ROOT)}")
            if source.is_file():
                relative = source.relative_to(source_root).as_posix()
                archive_name = f"{archive_prefix}/{relative}"
                if archive_name in collected:
                    raise ValueError(f"duplicate package path: {archive_name}")
                collected[archive_name] = source.read_bytes()
    return collected


def build(output: Path, source_commit: str, max_bytes: int = DEFAULT_MAX_BYTES) -> dict:
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise ValueError("source commit must be a full lowercase 40-character Git SHA")
    if max_bytes <= 0:
        raise ValueError("maximum bundle size must be positive")

    files = collect_files()
    records = [
        {"path": name, "bytes": len(data), "sha256": sha256(data)}
        for name, data in sorted(files.items())
    ]
    manifest = {
        "schema": "hbnf-coordinated-source-bundle-v1",
        "source_commit": source_commit,
        "files": records,
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    package_files = {
        **files,
        "SOURCE_COMMIT.txt": (source_commit + "\n").encode(),
        "PACKAGE_MANIFEST.json": manifest_bytes,
    }

    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, prefix=output.name + ".", delete=False) as tmp:
        temp_path = Path(tmp.name)
    try:
        with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, data in sorted(package_files.items()):
                info = zipfile.ZipInfo(f"{BUNDLE_NAME}/{name}", date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        size = temp_path.stat().st_size
        if size > max_bytes:
            raise ValueError(f"candidate bundle exceeds configured size limit: {size} > {max_bytes} bytes")
        temp_path.replace(output)
    finally:
        temp_path.unlink(missing_ok=True)

    output.with_suffix(output.suffix + ".sha256").write_text(f"{sha256(output.read_bytes())}  {output.name}\n")
    output.with_suffix(output.suffix + ".manifest.json").write_bytes(manifest_bytes)
    return {"archive": str(output), "archive_bytes": output.stat().st_size, "source_commit": source_commit, "file_count": len(files)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    args = parser.parse_args()
    print(json.dumps(build(args.output, args.source_commit, args.max_bytes), sort_keys=True))


if __name__ == "__main__":
    main()
