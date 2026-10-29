import hashlib
import json
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class OpalUvBuildEvidenceTests(unittest.TestCase):
    def test_old_synthetic_readbacks_are_explicitly_invalid(self):
        for version in ("1.0.30", "1.0.31"):
            path = ROOT / "staging/coordinated-backend/opal" / f"owner-local-control-local-commissioning-v{version}" / "LIVE-BASELINE-READBACK.json"
            receipt = json.loads(path.read_text())
            self.assertEqual(receipt["status"], "INVALID_SYNTHETIC_NOT_DEVICE_CAPTURE")
            self.assertEqual(receipt["managedFiles"], 0)
            self.assertNotIn("PASS", path.read_text())

    def test_next_packages_embed_expectations_not_fabricated_live_readbacks(self):
        for path in (
            ROOT / "scripts/hbnf_build_owner_local_uv_lock_v130.py",
            ROOT / "scripts/hbnf_build_owner_local_uv_lock_v131.py",
        ):
            source = path.read_text()
            self.assertIn("BASELINE-EXPECTED.json", source)
            self.assertIn("PENDING_PREINSTALL_READBACK", source)
            self.assertIn("liveReadbackRequiredAtAdmission", source)
            self.assertNotIn("observedAtUtc", source)
            self.assertNotIn("LIVE-BASELINE-READBACK.json", source)

    def test_exact_rollback_archives_match_all_twenty_pinned_files(self):
        for version in ("1.0.30", "1.0.31"):
            directory = ROOT / "staging/coordinated-backend/opal" / f"owner-local-control-local-commissioning-v{version}"
            manifest = (directory / "BASELINE_FILES.SHA256SUMS").read_text().splitlines()
            self.assertEqual(len(manifest), 20)
            with zipfile.ZipFile(directory / "ROLLBACK_BASELINE.zip") as archive:
                for line in manifest:
                    digest, name = line.split("  ", 1)
                    self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), digest)

    def test_installer_admission_binds_candidate_rollback_target_and_live_hash(self):
        for version in ("1.0.30", "1.0.31"):
            install = (ROOT / "staging/coordinated-backend/opal" / f"owner-local-control-local-commissioning-v{version}" / "install.sh").read_text()
            for required in (
                "candidate package mismatch",
                "rollback package mismatch",
                "rollback download-back hash mismatch",
                "installed baseline identity mismatch",
                "live 20-file installed baseline does not match admitted rollback",
            ):
                self.assertIn(required, install)


if __name__ == "__main__":
    unittest.main()
