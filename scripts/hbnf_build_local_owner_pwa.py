#!/usr/bin/env python3
"""Build a deterministic additive Opal bundle for the existing Owner PWA."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import zipfile
from pathlib import Path

ASSETS = (
    "hbnf-cart.html",
    "hbnf-cart.js",
    "hbnf-cart-local.mjs",
    "hbnf-cart-net.mjs",
    "hbnf-cart-semantic.mjs",
    "hbnf-cart-live-display.mjs",
    "hbnf-cart-readiness.mjs",
    "hbnf-cart-ui-v6.css",
    "hbnf-cart-ui-v6.mjs",
    "hbnf-cart-features.mjs",
    "hbnf-cart-skins-score.mjs",
    "hbnf-cart-icon-180.png",
    "hbnf-cart-icon-192.png",
    "hbnf-cart-icon-512.png",
    "hbnf-guest-qr.png",
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--package-script-dir", type=Path)
    parser.add_argument("--source-commit")
    parser.add_argument("--strict-source-binding", action="store_true")
    parser.add_argument("--source-locator", type=Path)
    parser.add_argument("--review-only", action="store_true")
    parser.add_argument("--package-version", default="1.0.2")
    parser.add_argument("--transaction-id")
    parser.add_argument("--rollback-baseline-transaction-id")
    parser.add_argument("--rollback-baseline-installed-manifest", type=Path)
    parser.add_argument("--rollback-baseline-archive", type=Path)
    parser.add_argument("--rollback-baseline-receipt", type=Path)
    parser.add_argument("--rollback-baseline-source-commit")
    parser.add_argument("--rollback-baseline-owner-source-archive", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"\d+\.\d+\.\d+", args.package_version):
        raise SystemExit("--package-version must be a semantic x.y.z version")
    if args.review_only and not args.strict_source_binding:
        raise SystemExit("--review-only requires --strict-source-binding")
    root = args.source_root.resolve()
    if args.strict_source_binding:
        if not args.source_locator:
            raise SystemExit("--strict-source-binding requires the existing --source-locator checker")
        head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
        if args.source_commit and args.source_commit != head:
            raise SystemExit(f"--source-commit does not match clean checkout HEAD ({head})")
        args.source_commit = head
        status = subprocess.check_output(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=all"], text=True)
        if status.strip():
            raise SystemExit("strict source binding requires a clean checkout before packaging")
        try:
            args.output_dir.resolve().relative_to(root)
        except ValueError:
            pass
        else:
            raise SystemExit("strict source binding requires --output-dir outside the source checkout")
    elif not args.source_commit:
        raise SystemExit("--source-commit is required unless --strict-source-binding derives it from Git")
    source = root / "hbnf-final-controller"
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    version = args.package_version
    archive = output / f"hbnf-owner-pwa-local-v{version}.zip"
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
    html = "\n".join(line.rstrip() for line in html.splitlines()) + "\n"
    (payload / "hbnf-cart.html").write_text(html)

    for name in ASSETS[1:]:
        out_name = name.replace(".mjs", ".js")
        data = (source / name).read_bytes()
        if name.endswith((".js", ".mjs")):
            data = data.replace(b".mjs", b".js")
        (payload / out_name).write_bytes(data)

    if args.strict_source_binding:
        for script in sorted(payload.glob("*.js")):
            checked = subprocess.run(["node", "--check", str(script)], capture_output=True, text=True)
            if checked.returncode:
                detail = (checked.stderr or checked.stdout).strip()
                raise SystemExit(f"Packaged JavaScript failed syntax validation ({script.name}): {detail[-1200:]}")

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
    source_inputs = [source / name for name in ASSETS]
    source_inputs.append(source / "hbnf-cart-manifest.webmanifest")
    if args.strict_source_binding:
        source_inputs.append(Path(__file__).resolve())
    deploy_dir = root / f"staging/coordinated-backend/opal/owner-pwa-local-v{version}"
    baseline = deploy_dir / "BASELINE.SHA256SUMS"
    baseline_provenance_args = (
        args.rollback_baseline_transaction_id,
        args.rollback_baseline_installed_manifest,
        args.rollback_baseline_archive,
        args.rollback_baseline_receipt,
        args.rollback_baseline_source_commit,
    )
    if any(baseline_provenance_args) and not all(baseline_provenance_args):
        raise SystemExit("Recovery transaction, installed manifest, archive, and receipt are required together")
    if args.rollback_baseline_owner_source_archive and not all(baseline_provenance_args):
        raise SystemExit("Historical Owner PWA archive requires complete recovery-v2 baseline provenance")
    baseline_provenance = None
    if args.rollback_baseline_installed_manifest and args.rollback_baseline_archive and args.rollback_baseline_receipt:
        manifest_source = (root / args.rollback_baseline_installed_manifest).resolve()
        archive_source = (root / args.rollback_baseline_archive).resolve()
        receipt_source = (root / args.rollback_baseline_receipt).resolve()
        owner_source_archive = (root / args.rollback_baseline_owner_source_archive).resolve() if args.rollback_baseline_owner_source_archive else None
        if not manifest_source.is_file() or not archive_source.is_file() or not receipt_source.is_file():
            raise SystemExit("Rollback baseline provenance input is missing")
        payload_prefix = "payload/mission-control-local/owner-pwa/"
        subtree_lines = []
        for line in manifest_source.read_text().splitlines():
            match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
            if match and match.group(2).startswith(payload_prefix):
                subtree_lines.append(f"{match.group(1)}  {match.group(2)[len(payload_prefix):]}\n")
        subtree_manifest = "".join(subtree_lines).encode()
        if len(subtree_lines) != 18 or not baseline.is_file() or subtree_manifest != baseline.read_bytes():
            raise SystemExit("Packaged rollback manifest is not the exact Owner PWA subtree from the recovery-v2 installed payload")
        receipt = json.loads(receipt_source.read_text())
        if (receipt.get("status") != "PASS" or receipt.get("transaction_id") != args.rollback_baseline_transaction_id or
                receipt.get("owner_pwa_version") != "1.0.5" or receipt.get("installed_manifest_pass") is not True or
                receipt.get("installed_manifest_entries") != 24 or receipt.get("served_hashes_verified") is not True or
                receipt.get("runtime_version") != "1.0.2" or receipt.get("source_commit") != args.rollback_baseline_source_commit or
                receipt.get("rollback_available") is not True):
            raise SystemExit("Recovery-v2 readback receipt does not verify the selected Owner PWA baseline provenance")
        if owner_source_archive and not owner_source_archive.is_file():
            raise SystemExit("Historical Owner PWA source archive is missing")
        baseline_provenance = {
            "transactionId": args.rollback_baseline_transaction_id,
            "sourceCommit": args.rollback_baseline_source_commit,
            "ownerPwaVersion": "1.0.5",
            "installedPayloadManifest": {
                "path": manifest_source.relative_to(root).as_posix(),
                "sha256": digest(manifest_source.read_bytes()),
                "ownerPwaSubtreePrefix": payload_prefix,
                "ownerPwaSubtreeEntries": len(subtree_lines),
                "ownerPwaSubtreeSha256": digest(subtree_manifest),
            },
            "archive": {
                "path": archive_source.relative_to(root).as_posix(),
                "sha256": digest(archive_source.read_bytes()),
            },
            "readbackReceipt": {
                "path": receipt_source.relative_to(root).as_posix(),
                "sha256": digest(receipt_source.read_bytes()),
                "installedManifestEntries": receipt["installed_manifest_entries"],
            },
        }
        if owner_source_archive:
            baseline_provenance["historicalOwnerPwaArchive"] = {
                "path": owner_source_archive.relative_to(root).as_posix(),
                "sha256": digest(owner_source_archive.read_bytes()),
            }
    if args.transaction_id:
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9-]{7,100}", args.transaction_id):
            raise SystemExit("--transaction-id must be a bounded uppercase transaction identifier")

    package_tools = []
    if args.review_only:
        if args.transaction_id:
            raise SystemExit("review-only packages cannot carry a transaction ID")
        package_scripts = []
        for name, content in (
            ("install.sh", "#!/bin/sh\necho 'REVIEW ONLY: installation is disabled' >&2\nexit 64\n"),
            ("rollback.sh", "#!/bin/sh\necho 'REVIEW ONLY: rollback is disabled' >&2\nexit 64\n"),
        ):
            script = output / name
            script.write_text(content)
            script.chmod(0o644)
            package_tools.append({"path": name, "sha256": digest(content.encode()), "mode": "disabled-review-stub"})
        (output / "REVIEW_ONLY.txt").write_text("Review artifact only. No installation or rollback is enabled.\n")
        package_tools.append({"path": "REVIEW_ONLY.txt", "sha256": digest((output / "REVIEW_ONLY.txt").read_bytes())})
    else:
        package_script_dir = (root / args.package_script_dir).resolve() if args.package_script_dir else deploy_dir
        for name in ("install.sh", "rollback.sh"):
            if not (package_script_dir / name).is_file():
                raise SystemExit(f"Required package script is missing: {package_script_dir / name}")
        package_scripts = [package_script_dir / "install.sh", package_script_dir / "rollback.sh"]
        source_inputs.extend(package_scripts)
    metadata = {
        "package": f"hbnf-owner-pwa-local-v{version}",
        "sourceCommit": args.source_commit,
        "transactionId": args.transaction_id,
        "releaseDisposition": "REVIEW_ONLY_NOT_ADMITTED_NOT_UPLOADED_NOT_INSTALLED" if args.review_only else "INSTALLABLE_REQUIRES_EXISTING_ADMISSION",
        "packageTools": package_tools,
        "sourceInputs": [
            {
                "path": path.relative_to(root).as_posix(),
                "sha256": digest(path.read_bytes()),
                "size": path.stat().st_size,
            }
            for path in sorted(source_inputs)
        ],
        "builder": {
            "path": "scripts/hbnf_build_local_owner_pwa.py",
            "sha256": digest(Path(__file__).resolve().read_bytes()),
        },
        "rollbackBaseline": {
            "path": baseline.name,
            "sha256": digest(baseline.read_bytes()) if baseline.is_file() else None,
            "entries": len(baseline.read_text().splitlines()) if baseline.is_file() else None,
            "source": baseline_provenance,
        },
        "destination": "/www/mission-control-local/owner-pwa",
        "mode": "additive-static-subtree",
        "assets": [{"path": p.name, "sha256": digest(p.read_bytes()), "size": p.stat().st_size} for p in files],
        "cloudScoring": "remote-only; live results are fetched on demand and cached entries are labeled CACHED",
    }
    (output / "PACKAGE.json").write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n")

    if not args.review_only:
        for name in ("install.sh", "rollback.sh"):
            shutil.copy2(package_script_dir / name, output / name)
    if baseline.exists():
        shutil.copy2(baseline, output / baseline.name)

    if args.strict_source_binding:
        subprocess.run(
            ["node", str(args.source_locator.resolve()), "--verify-source-manifest", "--cart-root", str(root), "--manifest", str(output / "PACKAGE.json")],
            check=True,
        )

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
