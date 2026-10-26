#!/usr/bin/env python3
"""Deterministic source/rollback binding test for the Opal package builder."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class OwnerLocalControlPackageTests(unittest.TestCase):
    def test_builder_rejects_abbreviated_source_commit(self):
        source = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
        from scripts.hbnf_build_owner_local_control_package import build

        with tempfile.TemporaryDirectory() as output:
            with self.assertRaisesRegex(ValueError, "full 40-character"):
                build(ROOT, Path(output), source[:7])

    def test_deterministic_package_binds_exact_source_and_rollback(self):
        source = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
        from scripts.hbnf_build_owner_local_control_package import build

        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            archive_a, sha_a = build(ROOT, Path(first), source)
            archive_b, sha_b = build(ROOT, Path(second), source)
            self.assertEqual(sha_a, sha_b)
            self.assertEqual(archive_a.read_bytes(), archive_b.read_bytes())
            with zipfile.ZipFile(archive_a) as package:
                names = package.namelist()
                prefix = "hbnf-owner-local-control-v1.0.7/"
                self.assertIn(prefix + "install.sh", names)
                self.assertIn(prefix + "matrix_topology.sh", names)
                self.assertIn(prefix + "aux_command_access.lua", names)
                self.assertIn(prefix + "revalidate.lua", names)
                self.assertIn(prefix + "local-transport.js", names)
                self.assertIn(prefix + "owner-http-transport.js", names)
                self.assertIn(prefix + "matrix_command_access.lua", names)
                self.assertIn(prefix + "uv_policy_access.lua", names)
                self.assertIn(prefix + "uv_status_access.lua", names)
                self.assertIn(prefix + "uv_policy_spec.json", names)
                manifest = json.loads(package.read(prefix + "PACKAGE-MANIFEST.json"))
                self.assertEqual(manifest["sourceCommit"], source)
                self.assertEqual(manifest["rollbackTransportSha256"], "a91e84c89a481739f9c47c619a1d3c5c35d690869c54159486d528d3863c746e")
                transport_sha = hashlib.sha256(package.read(prefix + "local-transport.js")).hexdigest()
                self.assertEqual(manifest["installedTransportSha256"], transport_sha)
                owner_http_sha = hashlib.sha256(package.read(prefix + "owner-http-transport.js")).hexdigest()
                self.assertEqual(manifest["ownerPwaTransportSha256"], owner_http_sha)
                policy_spec = package.read(prefix + "uv_policy_spec.json")
                self.assertEqual(hashlib.sha256(policy_spec).hexdigest(), manifest["files"]["uv_policy_spec.json"])
                self.assertEqual(json.loads(policy_spec)["schema"], "hbnf-aux-uv-policy-spec-v1")
                self.assertEqual(manifest["rollbackTransportSha256"], "a91e84c89a481739f9c47c619a1d3c5c35d690869c54159486d528d3863c746e")
                sums = package.read(prefix + "SHA256SUMS").decode()
                self.assertIn(f"{transport_sha}  local-transport.js", sums)
                self.assertIn(f"{owner_http_sha}  owner-http-transport.js", sums)


if __name__ == "__main__":
    unittest.main()
