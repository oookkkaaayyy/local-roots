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
    def test_stacked_cart_source_paths_trigger_release_ci(self):
        workflow = (ROOT / ".github/workflows/hbnf-coordinated-release-ci.yml").read_text()
        pull_request = workflow.split("  pull_request:\n", 1)[1].split(
            "  workflow_dispatch:\n", 1
        )[0]
        self.assertNotIn("    branches:", pull_request)
        self.assertIn("    paths:\n", pull_request)
        for action in ("opened", "synchronize", "reopened", "edited"):
            self.assertIn(f"      - {action}", pull_request, action)
        for path in (
            ".github/workflows/hbnf-coordinated-release-ci.yml",
            "scripts/hbnf_candidate_bundle.py",
            "tests/test_hbnf_candidate_bundle.py",
            "tests/hbnf_owner_pwa_package.mjs",
        ):
            self.assertIn(f"      - '{path}'", pull_request, path)

    def test_pr_base_edits_run_scoped_gates_without_running_for_text_edits(self):
        workflow = (ROOT / ".github/workflows/hbnf-coordinated-release-ci.yml").read_text()
        source_gates = workflow.split("  source-gates:\n", 1)[1].split(
            "  candidate-artifact:\n", 1
        )[0]
        self.assertIn("github.event.action != 'edited'", source_gates)
        self.assertIn("github.event.changes.base != null", source_gates)

    def test_pull_request_never_uploads_and_candidate_upload_is_fail_closed(self):
        workflow = (ROOT / ".github/workflows/hbnf-coordinated-release-ci.yml").read_text()
        jobs = workflow.split("jobs:\n", 1)[1]
        source_gates, candidate = jobs.split("  candidate-artifact:\n", 1)
        self.assertNotIn("actions/upload-artifact@", source_gates)
        self.assertIn("if: github.event_name == 'workflow_dispatch' && inputs.publish_candidate", candidate)
        self.assertIn("needs: source-gates", candidate)
        self.assertIn('if [[ "$EXPECTED_COMMIT_SHA" != "$GITHUB_SHA" ]]', candidate)
        self.assertIn('if [[ "$ARTIFACT_CAPACITY_CONFIRMED" != "true" ]]', candidate)
        self.assertIn("retention-days: 7", candidate)

    def test_generated_node_modules_are_excluded_but_source_symlinks_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source_root = root / "staging/coordinated-backend"
            source_root.mkdir(parents=True)
            (source_root / "index.ts").write_text("source")
            target = root / "dependency-target"
            target.write_text("generated dependency")
            generated = source_root / "node_modules/.deno/dep"
            generated.parent.mkdir(parents=True)
            generated.symlink_to(target)

            old_root, old_files, old_dirs = bundle.ROOT, bundle.FILES, bundle.RECURSIVE_DIRS
            bundle.ROOT = root
            bundle.FILES = ()
            bundle.RECURSIVE_DIRS = (("staging/coordinated-backend", "staging/coordinated-backend"),)
            try:
                self.assertEqual(bundle.collect_files(), {"staging/coordinated-backend/index.ts": b"source"})
                (source_root / "source-link").symlink_to(target)
                with self.assertRaisesRegex(ValueError, "symlinks are not allowed"):
                    bundle.collect_files()
            finally:
                bundle.ROOT, bundle.FILES, bundle.RECURSIVE_DIRS = old_root, old_files, old_dirs

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
            self.assertIn("staging/coordinated-backend/hbnf-cart-control/deno.json", expected_files)
            self.assertIn("staging/coordinated-backend/hbnf-cart-control/deno.lock", expected_files)
            self.assertFalse(any("/node_modules/" in name for name in expected_files))
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

