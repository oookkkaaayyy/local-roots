import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts/hbnf_candidate_bundle.py"
spec = importlib.util.spec_from_file_location("hbnf_candidate_bundle", MODULE_PATH)
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)


class CandidateBundleTest(unittest.TestCase):
    def test_exact_closed_manifest_and_reproducible_archive(self):
        source_commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()
        with tempfile.TemporaryDirectory() as temp:
            first = Path(temp) / "first.zip"
            second = Path(temp) / "second.zip"
            result = bundle.build(first, source_commit)
            bundle.build(second, source_commit)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertLessEqual(result["archive_bytes"], bundle.DEFAULT_MAX_BYTES)
            expected_files = bundle.collect_files()
            with zipfile.ZipFile(first) as archive:
                names = set(archive.namelist())
                prefix = f"{bundle.BUNDLE_NAME}/"
                members = {name[len(prefix):] for name in names if name.startswith(prefix)}
                self.assertEqual(
                    members,
                    set(expected_files) | {"SOURCE_COMMIT.txt", "PACKAGE_MANIFEST.json"},
                )
                manifest_bytes = archive.read(prefix + "PACKAGE_MANIFEST.json")
                manifest = json.loads(manifest_bytes)
                self.assertEqual(manifest["source_commit"], source_commit)
                declared = {record["path"]: record for record in manifest["files"]}
                self.assertEqual(set(declared), set(expected_files))
                for name, data in expected_files.items():
                    self.assertEqual(archive.read(prefix + name), data)
                    self.assertEqual(declared[name]["bytes"], len(data))
                    self.assertEqual(declared[name]["sha256"], hashlib.sha256(data).hexdigest())
                self.assertEqual(archive.read(prefix + "SOURCE_COMMIT.txt").decode(), source_commit + "\n")
            checksum = first.with_suffix(first.suffix + ".sha256").read_text().split()[0]
            self.assertEqual(checksum, hashlib.sha256(first.read_bytes()).hexdigest())
            self.assertEqual(
                first.with_suffix(first.suffix + ".manifest.json").read_bytes(),
                manifest_bytes,
            )

    def test_rejects_short_or_invalid_source_identity_and_size(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "candidate.zip"
            with self.assertRaisesRegex(ValueError, "full lowercase"):
                bundle.build(output, "abc")
            source_commit = "0" * 40
            with self.assertRaisesRegex(ValueError, "exceeds configured size limit"):
                bundle.build(output, source_commit, max_bytes=1)


if __name__ == "__main__":
    unittest.main()
