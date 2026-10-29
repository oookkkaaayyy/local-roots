import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
BUILDER_PATH = ROOT / "package-validation" / "build-release-packages.py"
SPEC = importlib.util.spec_from_file_location("hbnf_release_builder", BUILDER_PATH)
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


class WorkerPackageClosureTests(unittest.TestCase):
    def fixture(self, root: Path) -> SimpleNamespace:
        paths = []
        for line in (ROOT / "package-validation" / "LOCAL_ASSET_SHA256SUMS").read_text().splitlines():
            _, name = line.split(maxsplit=1)
            paths.append(name.strip())
        for name in paths + ["public/glow-save-sync.mjs"]:
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"test asset\n")

        (root / "src").mkdir(exist_ok=True)
        (root / "src/index.js").write_text("import './worker.mjs';\n")
        (root / "src/worker.mjs").write_text("import '../worker-private/reconcile.mjs';\n")
        (root / "worker-private").mkdir(exist_ok=True)
        (root / "worker-private/reconcile.mjs").write_text("import './parser.mjs';\n")
        (root / "worker-private/parser.mjs").write_text("export const parse = () => true;\n")
        (root / "database").mkdir(exist_ok=True)
        (root / "database/20261028_udisc_glow_atomic_week_sync.sql").write_text((ROOT / "database/20261028_udisc_glow_atomic_week_sync.sql").read_text())
        (root / "wrangler.jsonc").write_text(json.dumps({"name":"test","assets":{"directory":"./public"}}))
        (root / "package.json").write_text(json.dumps({"name":"test","private":True}))
        (root / "package-lock.json").write_text(json.dumps({"name":"test","lockfileVersion":3,"packages":{"":{"name":"test"}}}))
        manifest = root / "package-validation/LOCAL_ASSET_SHA256SUMS"
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text("".join(f"{'0'*64}  {name}\n" for name in paths))
        repo = Path(tempfile.mkdtemp(prefix="hbnf-package-fixture-"))
        migration_dir = repo / "supabase" / "migrations"
        migration_dir.mkdir(parents=True)
        canonical = migration_dir / "20261029200450_hbnf_glow_atomic_week_sync.sql"
        canonical.write_text((ROOT / "database" / "20261028_udisc_glow_atomic_week_sync.sql").read_text())
        return SimpleNamespace(candidate_root=root, active_version="baseline-test", repo_root=repo)

    def test_success_package_contains_private_import_closure_not_public_review_modules(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "source"
            root.mkdir()
            args = self.fixture(root)
            package = Path(tmp) / "candidate.zip"
            BUILDER.build(args, "candidate", root, "e089-test", package, args.repo_root)
            with zipfile.ZipFile(package) as archive:
                names = set(archive.namelist())
                manifest = json.loads(archive.read("PACKAGE_MANIFEST.json"))
            self.assertIn("worker-private/reconcile.mjs", names)
            self.assertIn("worker-private/parser.mjs", names)
            self.assertIn("public/glow-save-sync.mjs", names)
            self.assertIn("database/20261029200450_hbnf_glow_atomic_week_sync.sql", names)
            self.assertNotIn("public/udisc-glow-reconcile.mjs", names)
            self.assertNotIn("public/udisc-glow-preview.mjs", names)
            public_assets = [name for name in names if name.startswith("public/")]
            self.assertEqual(len(public_assets), 45)
            self.assertEqual({item["path"] for item in manifest["files"]}, names - {"PACKAGE_MANIFEST.json"})

    def test_package_rejects_migration_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            root = repo / "source-snapshots" / "snapshot"
            migration_dir = repo / "supabase" / "migrations"
            root.mkdir(parents=True)
            migration_dir.mkdir(parents=True)
            args = self.fixture(root)
            args.repo_root = repo
            canonical = migration_dir / "20261029200450_hbnf_glow_atomic_week_sync.sql"
            canonical.write_text("select different;\n")
            with self.assertRaisesRegex(SystemExit, "differs from the reviewed snapshot"):
                BUILDER.build(args, "candidate", root, "e089-test", Path(tmp) / "candidate.zip", args.repo_root)

    def test_missing_transitive_worker_import_fails_instead_of_false_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "source"
            root.mkdir()
            args = self.fixture(root)
            (root / "worker-private/parser.mjs").unlink()
            with self.assertRaisesRegex(SystemExit, "unresolved relative imports"):
                BUILDER.build(args, "candidate", root, "e089-test", Path(tmp) / "candidate.zip", args.repo_root)

    def test_worker_private_logic_matches_browser_review_helpers(self):
        for name in ("udisc-glow-preview.mjs", "udisc-glow-reconcile.mjs"):
            self.assertEqual(
                (ROOT / "worker-private" / name).read_bytes(),
                (ROOT / "public" / name).read_bytes(),
                f"Worker-private {name} has drifted from the reviewed source",
            )


if __name__ == "__main__":
    unittest.main()
