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
from urllib.parse import urlsplit
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
    "hbnf-faded-phosphor.png",
    "hbnf-cart-icon-180.png",
    "hbnf-cart-icon-192.png",
    "hbnf-cart-icon-512.png",
    "hbnf-guest-qr.png",
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def resolve_baseline_manifest(root: Path, package_version: str, explicit_path: Path | None) -> Path:
    """Use a specified prior baseline, or preserve the legacy version-local default."""
    if explicit_path is None:
        return root / f"staging/coordinated-backend/opal/owner-pwa-local-v{package_version}/BASELINE.SHA256SUMS"
    candidate = explicit_path if explicit_path.is_absolute() else root / explicit_path
    return candidate.resolve()


def verify_clean_source(root: Path, expected_commit) -> str:
    head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    if expected_commit and expected_commit != head:
        raise SystemExit(f"--source-commit does not match clean checkout HEAD ({head})")
    if subprocess.check_output(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=all"], text=True).strip():
        raise SystemExit("strict source binding requires a clean checkout before packaging")
    branch = subprocess.check_output(["git", "-C", str(root), "branch", "--show-current"], text=True).strip()
    if not branch:
        raise SystemExit("strict source binding requires a named integrated branch")
    return head


def verify_source_inputs(root: Path, commit: str, paths: list[Path]) -> None:
    for path in paths:
        relative = path.relative_to(root).as_posix()
        try:
            committed = subprocess.check_output(["git", "-C", str(root), "show", f"{commit}:{relative}"])
        except subprocess.CalledProcessError as exc:
            raise SystemExit(f"source input is absent from pinned commit: {relative}") from exc
        if committed != path.read_bytes():
            raise SystemExit(f"working source input differs from pinned commit: {relative}")


def verify_payload_references(payload: Path) -> None:
    html = (payload / "hbnf-cart.html").read_text()
    references = re.findall(r"(?:src|href)=['\"]([^'\"]+)['\"]", html, re.I)
    for reference in references:
        parsed = urlsplit(reference)
        if parsed.scheme or parsed.netloc or not parsed.path or parsed.path.startswith("/") or parsed.path.startswith("#"):
            continue
        target = (payload / parsed.path).resolve()
        if payload.resolve() not in target.parents or not target.is_file():
            raise SystemExit(f"packaged Owner PWA references a missing or unsafe local asset: {reference}")
    for script in payload.glob("*.js"):
        source = script.read_text()
        for reference in re.findall(r"(?:\bfrom\s*|\bimport\s*\()\s*['\"](\.[^'\"]+)['\"]", source):
            target = (script.parent / urlsplit(reference).path).resolve()
            if payload.resolve() not in target.parents or not target.is_file():
                raise SystemExit(f"packaged JavaScript references a missing or unsafe module: {script.name} -> {reference}")
    for stylesheet in payload.glob("*.css"):
        source = stylesheet.read_text()
        for reference in re.findall(r"url\(\s*['\"]?([^)'\"]+)['\"]?\s*\)", source, re.I):
            parsed = urlsplit(reference)
            if parsed.scheme or parsed.netloc or reference.startswith("/") or not parsed.path:
                continue
            target = (stylesheet.parent / parsed.path).resolve()
            if payload.resolve() not in target.parents or not target.is_file():
                raise SystemExit(f"packaged stylesheet references a missing or unsafe asset: {stylesheet.name} -> {reference}")


def verify_javascript(payload: Path) -> None:
    for script in sorted(payload.glob("*.js")):
        checked = subprocess.run(["node", "--check", str(script)], capture_output=True, text=True)
        if checked.returncode:
            detail = (checked.stderr or checked.stdout).strip()
            raise SystemExit(f"Packaged JavaScript failed syntax validation ({script.name}): {detail[-1200:]}")


def verify_live_readback_baseline(receipt_path: Path, baseline: Path, package_dir: Path, expected_version: str,
                                 archive_override: Path | None = None) -> dict:
    """Bind a directly served baseline to its exact retained package, without overstating filesystem evidence."""
    try:
        receipt = json.loads(receipt_path.read_text())
        package = json.loads((package_dir / "PACKAGE.json").read_text())
        payload_manifest = (package_dir / "PAYLOAD.SHA256SUMS").read_bytes()
        rollback = (package_dir / "rollback.sh").read_bytes()
        install = (package_dir / "install.sh").read_bytes()
        package_baseline = (package_dir / "BASELINE.SHA256SUMS").read_bytes()
        package_sha_line = (package_dir / "PACKAGE.SHA256").read_text().strip()
        archive = archive_override or package_dir / f"hbnf-owner-pwa-local-v{expected_version}.zip"
        archive_bytes = archive.read_bytes()
    except (OSError, ValueError) as exc:
        raise SystemExit("Live readback, exact baseline package, or required package component is missing") from exc

    package_sha = package_sha_line.split()[0] if len(package_sha_line.split()) == 2 else ""
    device = receipt.get("device_identity")

    if (receipt.get("schema") != "hbnf-owner-pwa-live-readback-v1" or receipt.get("status") != "PASS" or
            receipt.get("runtime_version") != expected_version or
            receipt.get("baseline_manifest_sha256") != digest(baseline.read_bytes()) or
            receipt.get("baseline_package_sha256") != digest(archive_bytes) or
            package_sha != digest(archive_bytes) or
            package_sha_line != f"{package_sha}  {archive.name}" or
            receipt.get("source_commit") != package.get("sourceCommit") or
            receipt.get("transaction_id") != package.get("transactionId") or
            package.get("package") != f"hbnf-owner-pwa-local-v{expected_version}" or
            receipt.get("served_payload_hashes_verified") is not True or
            receipt.get("observed_expected_path_count") != 20 or
            receipt.get("observed_expected_paths_http_200") is not True or
            receipt.get("payload_manifest_sha256") != digest(payload_manifest.replace(b"owner-pwa/", b"")) or
            receipt.get("rollback_artifact_available") is not True or
            not isinstance(device, dict) or device.get("ip") != "192.168.77.1" or
            "94:83:c4:98:78:93" not in device.get("arp", "")):
        raise SystemExit("Live readback does not bind the exact retained Owner PWA package and 20 expected HTTP paths")

    baseline_by_name = {}
    for line in baseline.read_text().splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([^/]+)", line)
        if not match or match.group(2) in baseline_by_name:
            raise SystemExit("Direct-readback baseline manifest is malformed or contains duplicate/nonlocal paths")
        baseline_by_name[match.group(2)] = match.group(1)
    served = receipt.get("installed_sha256_by_path")
    http_status = receipt.get("http_status_by_path")
    if not isinstance(served, dict) or not isinstance(http_status, dict) or len(baseline_by_name) != 20:
        raise SystemExit("Direct-readback receipt must cover exactly 20 manifest entries")
    if set(http_status) != {"owner-pwa/" + name for name in baseline_by_name} or any(status != 200 for status in http_status.values()):
        raise SystemExit("Direct-readback HTTP status set differs from its exact 20-file manifest")
    if any(served.get("owner-pwa/" + name) != sha for name, sha in baseline_by_name.items()):
        raise SystemExit("Direct-readback content hashes differ from its exact 20-file manifest")

    expected_markers = {
        ".hbnf-package-marker": digest(b"hbnf-owner-pwa-local-v1\n"),
        ".hbnf-package-version": digest((expected_version + "\n").encode()),
        ".hbnf-payload.sha256": digest(payload_manifest.replace(b"owner-pwa/", b"")),
        ".hbnf-rollback.sh": digest(rollback),
    }
    if any(baseline_by_name.get(name) != sha for name, sha in expected_markers.items()):
        raise SystemExit("Direct-readback package markers do not match exact package and rollback bytes")

    payload_by_name = {}
    for line in payload_manifest.decode().splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  owner-pwa/(.+)", line)
        if not match or match.group(2) in payload_by_name:
            raise SystemExit("Retained baseline payload manifest is malformed or duplicated")
        payload_by_name[match.group(2)] = match.group(1)
    package_assets = {item.get("path"): item.get("sha256") for item in package.get("assets", [])}
    with zipfile.ZipFile(archive) as zf:
        if (zf.read("PACKAGE.json") != (package_dir / "PACKAGE.json").read_bytes() or
                zf.read("BASELINE.SHA256SUMS") != package_baseline or
                zf.read("PAYLOAD.SHA256SUMS") != payload_manifest or
                zf.read("install.sh") != install or
                zf.read("rollback.sh") != rollback):
            raise SystemExit("Retained baseline ZIP differs from its package manifest, installer, rollback, or checksum inputs")
        for name, sha in payload_by_name.items():
            if digest(zf.read("owner-pwa/" + name)) != sha:
                raise SystemExit("Retained baseline ZIP payload differs from its manifest: " + name)
    if len(payload_by_name) != 16 or package_assets != payload_by_name:
        raise SystemExit("Retained baseline package must bind exactly the 16 verified Owner PWA payload files")

    return {
        "path": receipt_path.as_posix(),
        "sha256": digest(receipt_path.read_bytes()),
        "runtimeVersion": expected_version,
        "observedExpectedHttpPaths": 20,
        "servedPayloadHashesVerified": 16,
        "filesystemEntryCount": receipt.get("filesystem_entry_count", "NOT_CHECKED"),
        "filesystemCompleteness": receipt.get("filesystem_completeness", "REQUIRES_FRESH_INSTALLER_PREFLIGHT"),
        "deviceSidePriorRollbackCopy": receipt.get("device_side_prior_rollback_copy", "NOT_CHECKED"),
        "rollbackArtifactAvailable": True,
        "installerMustVerifyExactDirectoryAndCreateFreshRollbackBeforeSwap": True,
    }


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
    parser.add_argument("--rollback-baseline-readback-receipt", type=Path)
    parser.add_argument("--rollback-baseline-package-dir", type=Path,
        help="prior exact package whose successful install result supplies the installed Owner PWA payload hashes")
    parser.add_argument("--rollback-baseline-package", type=Path,
        help="exact prior installable ZIP to include as a nested recovery companion")
    parser.add_argument("--rollback-baseline-package-drive-file-id",
        help="approved private-vault identity for an exact baseline ZIP stored outside source control")
    parser.add_argument("--release-slice", choices=("cart-owner-pwa-ui-v1.0.13",),
        help="label an owner-approved independent UI slice without claiming scoring acceptance")
    parser.add_argument("--rollback-baseline-owner-pwa-version", default="1.0.8")
    parser.add_argument("--rollback-baseline-manifest", type=Path,
        help="explicit existing installed-tree manifest; defaults to the version-local manifest")
    args = parser.parse_args()
    if not re.fullmatch(r"\d+\.\d+\.\d+", args.package_version):
        raise SystemExit("--package-version must be a semantic x.y.z version")
    if args.review_only and not args.strict_source_binding:
        raise SystemExit("--review-only requires --strict-source-binding")
    root = args.source_root.resolve()
    baseline_manifest = resolve_baseline_manifest(root, args.package_version, args.rollback_baseline_manifest)
    if args.rollback_baseline_manifest and not baseline_manifest.is_file():
        raise SystemExit("explicit rollback baseline manifest is missing")
    if args.strict_source_binding:
        if not args.source_locator:
            raise SystemExit("--strict-source-binding requires the existing --source-locator checker")
        args.source_commit = verify_clean_source(root, args.source_commit)
        source_paths = [root / "scripts/hbnf_build_local_owner_pwa.py"] + [root / "hbnf-final-controller" / name for name in ASSETS]
        source_paths.append(root / "hbnf-final-controller/hbnf-cart-manifest.webmanifest")
        source_paths.append(root / "firmware/phase2/integration-r6/usermod/hbnf_home_screen_icon.h")
        source_paths.append(args.source_locator.resolve())
        if args.rollback_baseline_manifest:
            try:
                baseline_manifest.relative_to(root)
            except ValueError as exc:
                raise SystemExit("strict source binding requires the explicit rollback manifest inside the checkout") from exc
            source_paths.append(baseline_manifest)
        if args.rollback_baseline_readback_receipt:
            source_paths.append((root / args.rollback_baseline_readback_receipt).resolve())
        if args.rollback_baseline_package_dir:
            prior_dir = (root / args.rollback_baseline_package_dir).resolve()
            source_paths.extend(prior_dir / name for name in (
                "PACKAGE.json", "PACKAGE.SHA256", "PAYLOAD.SHA256SUMS", "install.sh", "rollback.sh",
                "BASELINE.SHA256SUMS",
            ))
            if not args.rollback_baseline_package_drive_file_id:
                source_paths.append(prior_dir / f"hbnf-owner-pwa-local-v{args.rollback_baseline_owner_pwa_version}.zip")
        package_scripts_root = ((root / args.package_script_dir).resolve() if args.package_script_dir
                                else root / f"staging/coordinated-backend/opal/owner-pwa-local-v{args.package_version}")
        source_paths.extend(package_scripts_root / name for name in ("install.sh", "rollback.sh"))
        if args.rollback_baseline_package:
            prior_zip = args.rollback_baseline_package if args.rollback_baseline_package.is_absolute() else root / args.rollback_baseline_package
            prior_zip = prior_zip.resolve()
            try:
                prior_zip.relative_to(root)
            except ValueError:
                if not args.rollback_baseline_package_drive_file_id:
                    raise SystemExit("strict source binding requires the exact rollback package inside the checkout")
            else:
                source_paths.append(prior_zip)
        verify_source_inputs(root, args.source_commit, source_paths)
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
    if removed > 1 or 'navigator.serviceWorker.register' in html:
        raise SystemExit("Owner PWA contains duplicate or malformed service-worker registration blocks")
    html, removed = re.subn(r'<nav class="quick-links local-control-entry"[\s\S]*?</nav>', "", html)
    if removed > 1 or 'class="quick-links local-control-entry"' in html:
        raise SystemExit("Owner PWA contains duplicate or malformed old local-controller shortcuts")
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
        verify_javascript(payload)

    manifest_source = json.loads((source / "hbnf-cart-manifest.webmanifest").read_text())
    manifest_source["id"] = "./hbnf-cart.html"
    manifest_source["start_url"] = "./hbnf-cart.html?local-owner=" + args.source_commit[:12]
    manifest_source["scope"] = "./"
    manifest_source["icons"] = [
        {"src": "./hbnf-cart-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "./hbnf-cart-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
    ]
    (payload / "hbnf-cart-manifest.webmanifest").write_text(json.dumps(manifest_source, indent=2) + "\n")
    if args.strict_source_binding:
        verify_payload_references(payload)

    files = sorted(p for p in payload.iterdir() if p.is_file())
    checksums = "".join(f"{digest(path.read_bytes())}  owner-pwa/{path.name}\n" for path in files)
    (output / "PAYLOAD.SHA256SUMS").write_text(checksums)
    source_inputs = [source / name for name in ASSETS]
    source_inputs.append(source / "hbnf-cart-manifest.webmanifest")
    if args.rollback_baseline_manifest:
        source_inputs.append(baseline_manifest)
    if args.strict_source_binding:
        source_inputs.append(Path(__file__).resolve())
        source_inputs.append(root / "firmware/phase2/integration-r6/usermod/hbnf_home_screen_icon.h")
        source_inputs.append(args.source_locator.resolve())
        if args.rollback_baseline_readback_receipt:
            source_inputs.append((root / args.rollback_baseline_readback_receipt).resolve())
    deploy_dir = root / f"staging/coordinated-backend/opal/owner-pwa-local-v{version}"
    baseline = baseline_manifest
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
    baseline_package_path = None
    if args.rollback_baseline_package:
        baseline_package_path = args.rollback_baseline_package if args.rollback_baseline_package.is_absolute() else root / args.rollback_baseline_package
        baseline_package_path = baseline_package_path.resolve()
        if not baseline_package_path.is_file():
            raise SystemExit("Exact rollback companion package is missing")
        if args.rollback_baseline_package_dir and not args.rollback_baseline_package_drive_file_id:
            expected_prior = (root / args.rollback_baseline_package_dir).resolve() / f"hbnf-owner-pwa-local-v{args.rollback_baseline_owner_pwa_version}.zip"
            if baseline_package_path != expected_prior:
                raise SystemExit("Rollback companion must be the exact ZIP inside the verified prior package directory")
        elif args.rollback_baseline_package_dir and args.rollback_baseline_package_drive_file_id:
            if not re.fullmatch(r"[A-Za-z0-9_-]{20,}", args.rollback_baseline_package_drive_file_id):
                raise SystemExit("Private-vault rollback package identity is malformed")
        if baseline_package_path.is_relative_to(root) and not args.rollback_baseline_package_drive_file_id:
            source_inputs.append(baseline_package_path)
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
    baseline_readback = None
    if args.rollback_baseline_readback_receipt:
        receipt_path = (root / args.rollback_baseline_readback_receipt).resolve()
        if not receipt_path.is_file():
            raise SystemExit("Owner PWA installed-baseline readback receipt is missing")
        receipt = json.loads(receipt_path.read_text())
        if receipt.get("schema") == "hbnf-owner-pwa-live-readback-v1":
            if not args.rollback_baseline_package_dir:
                raise SystemExit("Direct live readback requires the exact retained baseline package")
            prior_dir = (root / args.rollback_baseline_package_dir).resolve()
            baseline_readback = verify_live_readback_baseline(
                receipt_path, baseline, prior_dir, args.rollback_baseline_owner_pwa_version,
                baseline_package_path if args.rollback_baseline_package_drive_file_id else None
            )
            baseline_readback["path"] = receipt_path.relative_to(root).as_posix()
            installed = receipt.get("installed_sha256_by_path", {})
        elif receipt.get("schema") == "hbnf-owner-pwa-install-result-v1":
            if (not args.rollback_baseline_package_dir or receipt.get("status") != "PASS" or
                    receipt.get("step") != "install_owner_pwa" or receipt.get("install_exit") != 0 or
                    receipt.get("runtime_version") != args.rollback_baseline_owner_pwa_version or
                    receipt.get("rollback_retained") is not True or
                    receipt.get("health_checks", {}).get("content_hash_all_17") is not True):
                raise SystemExit("Successful install result or exact prior package is missing for the selected Owner PWA baseline")
            prior_dir = (root / args.rollback_baseline_package_dir).resolve()
            prior_package = json.loads((prior_dir / "PACKAGE.json").read_text())
            prior_zip = prior_dir / ("hbnf-owner-pwa-local-v" + args.rollback_baseline_owner_pwa_version + ".zip")
            if not prior_zip.is_file():
                prior_zip = next(prior_dir.glob("hbnf-owner-pwa-local-v*.zip"), None)
            prior_sha = (prior_dir / "PACKAGE.SHA256").read_text().split()[0]
            if (not prior_zip or not prior_zip.is_file() or digest(prior_zip.read_bytes()) != prior_sha or
                    prior_package.get("sourceCommit") != receipt.get("source_commit") or
                    prior_package.get("transactionId") != receipt.get("transaction_id")):
                raise SystemExit("Prior package identity or ZIP hash does not match the successful installed-version receipt")
            with zipfile.ZipFile(prior_zip) as prior_archive:
                if json.loads(prior_archive.read("PACKAGE.json")) != prior_package:
                    raise SystemExit("Prior package ZIP manifest differs from its reviewed local manifest")
                prior_payload = prior_archive.read("PAYLOAD.SHA256SUMS")
                if prior_payload != (prior_dir / "PAYLOAD.SHA256SUMS").read_bytes():
                    raise SystemExit("Prior package ZIP payload manifest differs from its local copy")
                prior_rollback = prior_archive.read("rollback.sh")
                if prior_rollback != (prior_dir / "rollback.sh").read_bytes():
                    raise SystemExit("Prior package ZIP rollback differs from its local copy")
                prior_zip_assets = {}
                for prior_asset in prior_package.get("assets", []):
                    name = prior_asset.get("path")
                    if not isinstance(name, str):
                        raise SystemExit("Prior package asset path is malformed")
                    prior_zip_assets[name] = digest(prior_archive.read("owner-pwa/" + name))
            installed_payload_manifest = prior_payload.replace(b"owner-pwa/", b"")
            baseline_by_name = {}
            for line in baseline.read_text().splitlines():
                match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
                if not match or match.group(2) in baseline_by_name:
                    raise SystemExit("Installed Owner PWA baseline manifest is malformed or contains duplicate paths")
                baseline_by_name[match.group(2)] = match.group(1)
            installed = receipt.get("installed_sha256_by_path", {})
            prior_assets = {item.get("path"): item.get("sha256") for item in prior_package.get("assets", [])}
            payload_assets = {}
            for line in prior_payload.decode().splitlines():
                match = re.fullmatch(r"([0-9a-f]{64})  owner-pwa/(.+)", line)
                if not match:
                    raise SystemExit("Prior package payload manifest is malformed")
                payload_assets[match.group(2)] = match.group(1)
            if len(payload_assets) != 16 or prior_assets != payload_assets:
                raise SystemExit("Prior package manifest and 16-file payload set do not agree")
            for name, expected in payload_assets.items():
                if prior_zip_assets.get(name) != expected:
                    raise SystemExit("Prior package ZIP payload does not match its manifest: " + name)
                if installed.get("owner-pwa/" + name) != expected or baseline_by_name.get(name) != expected:
                    raise SystemExit("Installed Owner PWA payload hashes do not match the exact successful install result: " + name)
            marker_hashes = {
                ".hbnf-package-marker": digest(b"hbnf-owner-pwa-local-v1\n"),
                ".hbnf-package-version": digest((args.rollback_baseline_owner_pwa_version + "\n").encode()),
                ".hbnf-payload.sha256": digest(installed_payload_manifest),
                ".hbnf-rollback.sh": digest(prior_rollback),
            }
            if any(baseline_by_name.get(name) != expected for name, expected in marker_hashes.items()) or len(baseline_by_name) != 20:
                raise SystemExit("Four installed package markers do not match the prior package's exact installer/rollback bytes")
            baseline_readback = {
                "path": receipt_path.relative_to(root).as_posix(),
                "sha256": digest(receipt_path.read_bytes()),
                "runtimeVersion": args.rollback_baseline_owner_pwa_version,
                "installedRegularFiles": 20,
                "servedPayloadHashesVerified": 16,
                "remainingFourMarkerHashes": "Derived from the exact prior install script, payload manifest, version marker, and rollback script; fresh live preflight must recheck every file",
            }
        else:
            if (receipt.get("status") != "PASS" or receipt.get("runtime_version") != args.rollback_baseline_owner_pwa_version or
                    receipt.get("installed_file_count") != 20 or receipt.get("rollback_retained") is not True or
                    receipt.get("health_checks", {}).get("content_hash_all_17") is not True):
                raise SystemExit("Installed-baseline readback does not verify the exact 20-file Owner PWA tree")
            installed = receipt.get("installed_sha256_by_path", {})
        manifest_by_name = {}
        for line in baseline.read_text().splitlines():
            match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
            if match:
                manifest_by_name[match.group(2)] = match.group(1)
        payload_pairs = 0
        for name, expected in manifest_by_name.items():
            if name in {".hbnf-package-marker", ".hbnf-package-version", ".hbnf-payload.sha256", ".hbnf-rollback.sh"}:
                continue
            if installed.get("owner-pwa/" + name) != expected:
                raise SystemExit(f"Installed readback payload hash does not match the v1.0.8 baseline: {name}")
            payload_pairs += 1
        if payload_pairs != 16 or len(manifest_by_name) != 20:
            raise SystemExit("Installed readback must match all 16 payload files in the exact 20-file baseline")
        if baseline_readback is None:
            baseline_readback = {
                "path": receipt_path.relative_to(root).as_posix(),
                "sha256": digest(receipt_path.read_bytes()),
                "runtimeVersion": args.rollback_baseline_owner_pwa_version,
                "installedRegularFiles": 20,
                "servedPayloadHashesVerified": 16,
                "remainingFourMarkerHashes": "Bound by exact baseline manifest and freshly verified by installer before any swap",
            }
    if args.transaction_id:
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9-]{7,100}", args.transaction_id):
            raise SystemExit("--transaction-id must be a bounded uppercase transaction identifier")
    if args.release_slice and (version != "1.0.13" or args.review_only or not args.transaction_id):
        raise SystemExit("The Cart UI release slice requires an installable v1.0.13 package with a transaction identity")

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
        "releaseSlice": ({
            "id": args.release_slice,
            "scope": "Owner PWA interface and existing client-side command feedback only; no scoring logic, backend, score data, Matrix projection, or device settings",
            "scoringOrder1": "OPEN_NOT_CLAIMED",
            "T4T5": "UNCHANGED_AND_STILL_REQUIRE_ALL_EXISTING_ACCEPTANCE",
        } if args.release_slice else None),
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
            "installedReadback": baseline_readback,
            "packageArchive": ({
                "path": "ROLLBACK_BASELINE.zip",
                "sourcePath": ("drive:" + args.rollback_baseline_package_drive_file_id
                    if args.rollback_baseline_package_drive_file_id else baseline_package_path.relative_to(root).as_posix()),
                "driveFileId": args.rollback_baseline_package_drive_file_id,
                "sha256": digest(baseline_package_path.read_bytes()),
                "size": baseline_package_path.stat().st_size,
            } if baseline_package_path else None),
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
    if baseline_package_path:
        shutil.copy2(baseline_package_path, output / "ROLLBACK_BASELINE.zip")
        (output / "ROLLBACK_BASELINE.SHA256").write_text(
            f"{digest(baseline_package_path.read_bytes())}  ROLLBACK_BASELINE.zip\n"
        )

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
