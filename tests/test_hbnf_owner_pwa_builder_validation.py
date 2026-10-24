import importlib.util
import hashlib
import json
import pathlib
import subprocess
import tempfile
import unittest
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("owner_pwa_builder", ROOT / "scripts/hbnf_build_local_owner_pwa.py")
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


class OwnerPwaBuilderValidationTests(unittest.TestCase):
    def test_dirty_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "-C", str(root), "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "baseline"], check=True)
            (root / "dirty.txt").write_text("uncommitted")
            with self.assertRaisesRegex(SystemExit, "clean checkout"):
                BUILDER.verify_clean_source(root, None)

    def test_changed_source_input_is_rejected_against_pinned_commit(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            source = root / "source.js"
            source.write_text("committed")
            subprocess.run(["git", "-C", str(root), "add", "source.js"], check=True)
            subprocess.run(["git", "-C", str(root), "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline"], check=True)
            commit = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
            source.write_text("mixed working source")
            with self.assertRaisesRegex(SystemExit, "differs from pinned commit"):
                BUILDER.verify_source_inputs(root, commit, [source])

    def test_malformed_packaged_javascript_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            payload = pathlib.Path(td)
            (payload / "bad.js").write_text("const x = {;")
            with self.assertRaisesRegex(SystemExit, "failed syntax validation"):
                BUILDER.verify_javascript(payload)

    def test_missing_html_asset_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            payload = pathlib.Path(td)
            (payload / "hbnf-cart.html").write_text('<img src="./missing.png">')
            with self.assertRaisesRegex(SystemExit, "missing or unsafe local asset"):
                BUILDER.verify_payload_references(payload)

    def test_missing_module_asset_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            payload = pathlib.Path(td)
            (payload / "hbnf-cart.html").write_text("<main></main>")
            (payload / "app.js").write_text('import {x} from "./missing.js";')
            with self.assertRaisesRegex(SystemExit, "missing or unsafe module"):
                BUILDER.verify_payload_references(payload)

    def make_live_baseline(self, root):
        package_dir = root / "package"
        package_dir.mkdir()
        assets = {f"asset-{index}.js": f"payload-{index}".encode() for index in range(16)}
        payload_manifest = "".join(
            f"{hashlib.sha256(data).hexdigest()}  owner-pwa/{name}\n" for name, data in sorted(assets.items())
        ).encode()
        rollback = b"#!/bin/sh\nrollback\n"
        install = b"#!/bin/sh\ninstall\n"
        package_baseline = b"baseline\n"
        package = {
            "package": "hbnf-owner-pwa-local-v1.0.12",
            "sourceCommit": "a" * 40,
            "transactionId": "OWNER-PWA-LOCAL-V112-TEST-20261024-01",
            "assets": [{"path": name, "sha256": hashlib.sha256(data).hexdigest()} for name, data in sorted(assets.items())],
        }
        package_bytes = (json.dumps(package) + "\n").encode()
        (package_dir / "PACKAGE.json").write_bytes(package_bytes)
        (package_dir / "PAYLOAD.SHA256SUMS").write_bytes(payload_manifest)
        (package_dir / "rollback.sh").write_bytes(rollback)
        (package_dir / "install.sh").write_bytes(install)
        (package_dir / "BASELINE.SHA256SUMS").write_bytes(package_baseline)
        archive_path = package_dir / "hbnf-owner-pwa-local-v1.0.12.zip"
        with zipfile.ZipFile(archive_path, "w") as archive:
            archive.writestr("PACKAGE.json", package_bytes)
            archive.writestr("PAYLOAD.SHA256SUMS", payload_manifest)
            archive.writestr("rollback.sh", rollback)
            archive.writestr("install.sh", install)
            archive.writestr("BASELINE.SHA256SUMS", package_baseline)
            for name, data in sorted(assets.items()):
                archive.writestr("owner-pwa/" + name, data)
        archive_sha = hashlib.sha256(archive_path.read_bytes()).hexdigest()
        (package_dir / "PACKAGE.SHA256").write_text(f"{archive_sha}  {archive_path.name}\n")

        marker_bytes = {
            ".hbnf-package-marker": b"hbnf-owner-pwa-local-v1\n",
            ".hbnf-package-version": b"1.0.12\n",
            ".hbnf-payload.sha256": payload_manifest.replace(b"owner-pwa/", b""),
            ".hbnf-rollback.sh": rollback,
        }
        baseline_entries = {name: hashlib.sha256(data).hexdigest() for name, data in {**assets, **marker_bytes}.items()}
        baseline_path = root / "BASELINE.SHA256SUMS"
        baseline_path.write_text("".join(f"{sha}  {name}\n" for name, sha in sorted(baseline_entries.items())))
        baseline_sha = hashlib.sha256(baseline_path.read_bytes()).hexdigest()
        receipt = {
            "schema": "hbnf-owner-pwa-live-readback-v1", "status": "PASS", "runtime_version": "1.0.12",
            "source_commit": package["sourceCommit"], "transaction_id": package["transactionId"],
            "device_identity": {"ip": "192.168.77.1", "arp": "? (192.168.77.1) at 94:83:c4:98:78:93 on en0"},
            "baseline_manifest_sha256": baseline_sha, "baseline_package_sha256": archive_sha,
            "payload_manifest_sha256": hashlib.sha256(payload_manifest.replace(b"owner-pwa/", b"")).hexdigest(),
            "served_payload_hashes_verified": True, "observed_expected_path_count": 20,
            "observed_expected_paths_http_200": True, "rollback_artifact_available": True,
            "filesystem_entry_count": "NOT_CHECKED", "filesystem_completeness": "REQUIRES_FRESH_INSTALLER_PREFLIGHT",
            "device_side_prior_rollback_copy": "NOT_CHECKED",
            "installed_sha256_by_path": {"owner-pwa/" + name: sha for name, sha in baseline_entries.items()},
            "http_status_by_path": {"owner-pwa/" + name: 200 for name in baseline_entries},
        }
        receipt_path = root / "READBACK.json"
        receipt_path.write_text(json.dumps(receipt))
        return receipt_path, baseline_path, package_dir, receipt

    def test_direct_live_readback_binds_exact_package_without_claiming_filesystem_completeness(self):
        with tempfile.TemporaryDirectory() as td:
            receipt, baseline, package, _ = self.make_live_baseline(pathlib.Path(td))
            result = BUILDER.verify_live_readback_baseline(receipt, baseline, package, "1.0.12")
            self.assertEqual(result["observedExpectedHttpPaths"], 20)
            self.assertEqual(result["filesystemEntryCount"], "NOT_CHECKED")
            self.assertEqual(result["deviceSidePriorRollbackCopy"], "NOT_CHECKED")
            self.assertTrue(result["installerMustVerifyExactDirectoryAndCreateFreshRollbackBeforeSwap"])

    def test_direct_live_readback_rejects_hash_or_status_mismatch(self):
        with tempfile.TemporaryDirectory() as td:
            receipt, baseline, package, payload = self.make_live_baseline(pathlib.Path(td))
            payload["installed_sha256_by_path"]["owner-pwa/asset-0.js"] = "0" * 64
            receipt.write_text(json.dumps(payload))
            with self.assertRaisesRegex(SystemExit, "content hashes differ"):
                BUILDER.verify_live_readback_baseline(receipt, baseline, package, "1.0.12")
            payload["installed_sha256_by_path"]["owner-pwa/asset-0.js"] = next(
                sha for name, sha in (line.split("  ", 1)[::-1] for line in baseline.read_text().splitlines()) if name == "asset-0.js"
            )
            payload["http_status_by_path"]["owner-pwa/asset-0.js"] = 404
            receipt.write_text(json.dumps(payload))
            with self.assertRaisesRegex(SystemExit, "HTTP status set"):
                BUILDER.verify_live_readback_baseline(receipt, baseline, package, "1.0.12")


if __name__ == "__main__":
    unittest.main()
