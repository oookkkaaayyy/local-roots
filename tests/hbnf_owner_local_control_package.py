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
EXPECTED_ROLLBACK = "51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a"
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
                prefix = "hbnf-owner-local-control-v1.0.13/"
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
                self.assertIn(prefix + "uv_hardware_profile.json", names)
                self.assertIn(prefix + "uv_runtime.lua", names)
                for path in ("vendor/resty/sha.lua", "vendor/resty/sha256.lua", "vendor/resty/string.lua", "vendor/resty/LICENSE.txt"):
                    self.assertIn(prefix + path, names)
                manifest = json.loads(package.read(prefix + "PACKAGE-MANIFEST.json"))
                self.assertEqual(manifest["sourceCommit"], source)
                self.assertEqual(manifest["rollbackTransportSha256"], EXPECTED_ROLLBACK)
                self.assertEqual(manifest["bundledLuaSha256"]["commit"], "ac0967a020e7d05475ae53808ebf685232fe1c1d")
                self.assertEqual(manifest["bundledLuaSha256"]["version"], "0.17")
                self.assertEqual(manifest["rollbackTransportSourceCommit"], manifest["baseCommit"])
                self.assertEqual(manifest["rollbackTransportSourcePath"], "staging/coordinated-backend/opal/mission-control-local/local-transport.js")
                self.assertTrue(manifest["ownerAcceptedNetworkExposure"]["owner_accepted"])
                self.assertEqual(manifest["ownerAcceptedNetworkExposure"]["observation_status"], "NOT_TESTED")
                self.assertFalse(manifest["ownerAcceptedNetworkExposure"]["isolation_test_required_for_admission"])
                transport_sha = hashlib.sha256(package.read(prefix + "local-transport.js")).hexdigest()
                self.assertEqual(manifest["installedTransportSha256"], transport_sha)
                owner_http_sha = hashlib.sha256(package.read(prefix + "owner-http-transport.js")).hexdigest()
                self.assertEqual(manifest["ownerPwaTransportSha256"], owner_http_sha)
                policy_spec = package.read(prefix + "uv_policy_spec.json")
                self.assertEqual(hashlib.sha256(policy_spec).hexdigest(), manifest["files"]["uv_policy_spec.json"])
                self.assertEqual(json.loads(policy_spec)["schema"], "hbnf-aux-uv-policy-spec-v1")
                profile = package.read(prefix + "uv_hardware_profile.json")
                self.assertEqual(hashlib.sha256(profile).hexdigest(), manifest["files"]["uv_hardware_profile.json"])
                profile_data = json.loads(profile)
                self.assertFalse(profile_data["verified"])
                self.assertTrue(all(value is False for value in profile_data["runtimeGates"].values()))
                self.assertTrue(all(value is False for value in profile_data["commissioningGates"].values()))
                runtime_lua = package.read(prefix + "uv_runtime.lua").decode()
                self.assertIn('key ~= "hardwareReady"', runtime_lua)
                self.assertIn('identity.uvBuildProfile ~= "uv-follow-output-capable-v1"', runtime_lua)
                self.assertEqual(manifest["rollbackTransportSha256"], EXPECTED_ROLLBACK)
                sums = package.read(prefix + "SHA256SUMS").decode()
                self.assertIn(f"{transport_sha}  local-transport.js", sums)
                self.assertIn(f"{owner_http_sha}  owner-http-transport.js", sums)


if __name__ == "__main__":
    unittest.main()
