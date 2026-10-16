#!/usr/bin/env python3
"""Build a deterministic additive Opal bundle for the existing Owner PWA."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path

ASSETS = (
    "hbnf-cart.html",
    "hbnf-cart.js",
    "hbnf-cart-local.mjs",
    "hbnf-cart-net.mjs",
    "hbnf-cart-semantic.mjs",
    "hbnf-cart-ui-v6.css",
    "hbnf-cart-ui-v6.mjs",
    "hbnf-cart-features.mjs",
    "hbnf-cart-skins-score.mjs",
    "hbnf-cart-icon-180.png",
    "hbnf-cart-icon-192.png",
    "hbnf-cart-icon-512.png",
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--source-commit", required=True)
    args = parser.parse_args()
    root = args.source_root.resolve()
    source = root / "hbnf-final-controller"
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    archive = output / "hbnf-owner-pwa-local-v1.0.0.zip"
    for stale in (archive, output / "PACKAGE.SHA256"):
        stale.unlink(missing_ok=True)
    payload = output / "owner-pwa"
    if payload.exists():
        shutil.rmtree(payload)
    payload.mkdir()

    html = (source / "hbnf-cart.html").read_text()
    service_worker = re.compile(r'<script>if\("serviceWorker"[\s\S]*?</script>')
    html, removed = service_worker.subn("", html)
    if removed != 1:
        raise SystemExit("Expected exactly one HTTPS-only service-worker registration block")
    html, removed = re.subn(r'<nav class="quick-links local-control-entry"[\s\S]*?</nav>', "", html)
    if removed != 1:
        raise SystemExit("Expected exactly one old local-controller shortcut in the Owner PWA")
    html = html.replace('href="/guest/hbnf-cart/"', 'href="https://hbnightflyers.com/guest/hbnf-cart/"')
    # OpenWrt's existing uHTTPd map is verified for .js; earlier Opal UI
    # modules failed when served as .mjs. Keep module content, use known-good
    # .js URLs, and rewrite imports only in the local copy.
    html = html.replace(".mjs", ".js")
    (payload / "hbnf-cart.html").write_text(html)

    for name in ASSETS[1:]:
        out_name = name.replace(".mjs", ".js")
        data = (source / name).read_bytes()
        if name.endswith((".js", ".mjs")):
            data = data.replace(b".mjs", b".js")
        (payload / out_name).write_bytes(data)

    manifest_source = json.loads((source / "hbnf-cart-manifest.webmanifest").read_text())
    manifest_source["id"] = "./hbnf-cart.html"
    manifest_source["start_url"] = "./hbnf-cart.html?local-owner=" + args.source_commit[:12]
    manifest_source["scope"] = "./"
    manifest_source["icons"] = [
        {"src": "./hbnf-cart-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "./hbnf-cart-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
    ]
    (payload / "hbnf-cart-manifest.webmanifest").write_text(json.dumps(manifest_source, indent=2) + "\n")

    files = sorted(p for p in payload.iterdir() if p.is_file())
    checksums = "".join(f"{digest(path.read_bytes())}  owner-pwa/{path.name}\n" for path in files)
    (output / "PAYLOAD.SHA256SUMS").write_text(checksums)
    metadata = {
        "package": "hbnf-owner-pwa-local-v1.0.0",
        "sourceCommit": args.source_commit,
        "destination": "/www/mission-control-local/owner-pwa",
        "mode": "additive-static-subtree",
        "assets": [{"path": p.name, "sha256": digest(p.read_bytes()), "size": p.stat().st_size} for p in files],
        "cloudScoring": "remote-only; live results are fetched on demand and cached entries are labeled CACHED",
    }
    (output / "PACKAGE.json").write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n")

    deploy_dir = root / "staging/coordinated-backend/opal/owner-pwa-local-v1.0.0"
    for name in ("install.sh", "rollback.sh"):
        shutil.copy2(deploy_dir / name, output / name)

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(p for p in output.rglob("*") if p.is_file() and p != archive):
            rel = path.relative_to(output).as_posix()
            info = zipfile.ZipInfo(rel, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            zf.writestr(info, path.read_bytes())
    (output / "PACKAGE.SHA256").write_text(f"{digest(archive.read_bytes())}  {archive.name}\n")
    print(f"source={args.source_commit}")
    print(f"archive={archive}")
    print(f"sha256={digest(archive.read_bytes())}")
    print(f"size={archive.stat().st_size}")


if __name__ == "__main__":
    main()
