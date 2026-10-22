import importlib.util
import pathlib
import subprocess
import tempfile
import unittest


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


if __name__ == "__main__":
    unittest.main()
