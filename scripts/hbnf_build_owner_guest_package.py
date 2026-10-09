#!/usr/bin/env python3
"""Build the Owner/Guest static package with stable ZIP metadata and ordering."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import stat
import zipfile
from pathlib import Path

PACKAGE = "HBNF_CART_OWNER_UX_R4_GUEST_ROUTE_R2_20261008"
CONTROLLER_FILES = (
    "hbnf-cart.html", "hbnf-cart.js", "hbnf-cart-net.mjs", "hbnf-cart-sw.js",
    "hbnf-cart-semantic.mjs", "hbnf-cart-manifest.webmanifest", "hbnf-cart-ui-v6.css",
    "hbnf-cart-ui-v6.mjs", "hbnf-cart-features.mjs", "hbnf-cart-skins-score.mjs",
    "hbnf-cart-icon-180.png", "hbnf-cart-icon-192.png", "hbnf-cart-icon-512.png",
    "guest/hbnf-cart/index.html", "guest/hbnf-cart/guest.js", "guest/hbnf-cart/guest.css",
)
PACKAGE_FILES = (
    *(f"controller/{name}" for name in CONTROLLER_FILES),
    "install_ui_v6.py", "INSTALL_UI_V6.command", "SOURCE_COMMIT.txt", "MANIFEST.json",
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build(
    source_root: Path,
    output_dir: Path,
    source_commit: str,
    *,
    package_name: str = PACKAGE,
    manifest_schema: str = "hbnf-cart-owner-ux-r4-guest-route-r2-package-v1",
    build_marker: str = "hbnf-cart2-owner-ux-r4-20261008",
    scope: str = "controller-only-no-firmware-no-phase2-hardware",
) -> tuple[Path, str]:
    source_root = source_root.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    package_dir = output_dir / package_name
    if package_dir.exists():
        shutil.rmtree(package_dir)
    controller = package_dir / "controller"
    for relative in CONTROLLER_FILES:
        src = source_root / "hbnf-final-controller" / relative
        if not src.is_file():
            raise FileNotFoundError(f"required package input missing: {src}")
        target = controller / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, target)
    for relative in ("install_ui_v6.py", "INSTALL_UI_V6.command"):
        src = source_root / "hbnf-ui-v6-package" / relative
        if not src.is_file():
            raise FileNotFoundError(f"required package input missing: {src}")
        shutil.copyfile(src, package_dir / relative)
    (package_dir / "SOURCE_COMMIT.txt").write_bytes((source_commit.strip() + "\n").encode("utf-8"))
    files = {
        relative: digest((controller / relative).read_bytes())
        for relative in sorted(CONTROLLER_FILES)
    }
    manifest = {
        "schema": manifest_schema,
        "buildMarker": build_marker,
        "sourceCommit": source_commit.strip(),
        "scope": scope,
        "files": files,
    }
    (package_dir / "MANIFEST.json").write_bytes((json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
    archive = output_dir / f"{package_name}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED, strict_timestamps=True) as zf:
        for name in PACKAGE_FILES:
            path = package_dir / name
            info = zipfile.ZipInfo(f"{package_name}/{name}", date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            executable = name in ("INSTALL_UI_V6.command", "install_ui_v6.py")
            info.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
            info.compress_type = zipfile.ZIP_STORED
            zf.writestr(info, path.read_bytes())
    sha = digest(archive.read_bytes())
    (output_dir / f"{PACKAGE}.zip.sha256").write_bytes(f"{sha}  {archive.name}\n".encode("ascii"))
    return archive, sha


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-root", type=Path, required=True)
    ap.add_argument("--output-dir", type=Path, required=True)
    ap.add_argument("--source-commit", required=True)
    ap.add_argument("--package-name", default=PACKAGE)
    ap.add_argument("--manifest-schema", default="hbnf-cart-owner-ux-r4-guest-route-r2-package-v1")
    ap.add_argument("--build-marker", default="hbnf-cart2-owner-ux-r4-20261008")
    ap.add_argument("--scope", default="controller-only-no-firmware-no-phase2-hardware")
    args = ap.parse_args()
    archive, sha = build(
        args.source_root, args.output_dir, args.source_commit,
        package_name=args.package_name,
        manifest_schema=args.manifest_schema,
        build_marker=args.build_marker,
        scope=args.scope,
    )
    print(f"PACKAGE={archive}")
    print(f"SHA256={sha}")
    print(f"BYTES={archive.stat().st_size}")


if __name__ == "__main__":
    main()
