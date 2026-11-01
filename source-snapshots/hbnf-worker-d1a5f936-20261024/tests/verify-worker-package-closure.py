import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from types import SimpleNamespace
from unittest.mock import patch

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
        for name in paths + ["public/glow-save-sync.mjs", "public/league-state-cas.mjs"]:
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
        (root / "database/20261029203741_hbnf_league_state_server_revision_guard.sql").write_text((ROOT / "database/20261029203741_hbnf_league_state_server_revision_guard.sql").read_text())
        (root / "database/20261030021038_hbnf_league_state_anon_cas_rpc.sql").write_text((ROOT / "database/20261030021038_hbnf_league_state_anon_cas_rpc.sql").read_text())
        (root / "wrangler.jsonc").write_text(json.dumps({"name":"test","assets":{"directory":"./public"}}))
        (root / "package.json").write_text(json.dumps({"name":"test","private":True}))
        (root / "package-lock.json").write_text(json.dumps({"name":"test","lockfileVersion":3,"packages":{"":{"name":"test"}}}))
        manifest = root / "package-validation/LOCAL_ASSET_SHA256SUMS"
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text("".join(f"{'0'*64}  {name}\n" for name in paths))
        repo = root.parents[1]
        migration_dir = repo / "supabase" / "migrations"
        migration_dir.mkdir(parents=True, exist_ok=True)
        canonical = migration_dir / "20261029200450_hbnf_glow_atomic_week_sync.sql"
        canonical.write_text((ROOT / "database" / "20261028_udisc_glow_atomic_week_sync.sql").read_text())
        revision = migration_dir / "20261029203741_hbnf_league_state_server_revision_guard.sql"
        revision.write_text((ROOT / "database" / "20261029203741_hbnf_league_state_server_revision_guard.sql").read_text())
        rpc = migration_dir / "20261030021038_hbnf_league_state_anon_cas_rpc.sql"
        rpc.write_text((ROOT / "database" / "20261030021038_hbnf_league_state_anon_cas_rpc.sql").read_text())
        (repo / "package-validation").mkdir(parents=True, exist_ok=True)
        (repo / "package-validation/LOCAL_ASSET_SHA256SUMS").write_text(
            "".join(f"{'0'*64}  {name}\n" for name in paths)
        )
        baseline_archive = repo / "baseline.zip"
        baseline_archive.write_bytes(b"test baseline archive")
        return SimpleNamespace(
            candidate_root=repo,
            active_version="baseline-test",
            repo_root=repo,
            baseline_version=BUILDER.EXPECTED_BASELINE_VERSION,
            baseline_sha256=BUILDER.EXPECTED_BASELINE_SHA256,
            baseline_archive=baseline_archive,
            rollback_sha256=BUILDER.EXPECTED_BASELINE_SHA256,
            rollback_bytes=baseline_archive.stat().st_size,
            toolchain_root=repo,
        )

    def build_fixture(self, args, source: Path, output: Path) -> None:
        paths = [
            line.split(maxsplit=1)[1].strip().lstrip("*")
            for line in (ROOT / "package-validation" / "LOCAL_ASSET_SHA256SUMS").read_text().splitlines()
        ]
        assets = {name: b"baseline asset\n" for name in paths}
        assets.update({"public/glow-save-sync.mjs": b"helper\n", "public/league-state-cas.mjs": b"helper\n"})
        lineage = {name: {"source": "test", "sha256": BUILDER.sha256(data)} for name, data in assets.items()}
        with patch.object(BUILDER, "assert_commit_file"), \
             patch.object(BUILDER, "asset_files", return_value=(assets, lineage)), \
             patch.object(BUILDER.subprocess, "check_output", return_value="test-builder-commit\n"):
            BUILDER.build(args, "candidate", source, "e089-test", output, args.repo_root)

    def test_success_package_contains_private_import_closure_not_public_review_modules(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo" / "source-snapshots" / "snapshot"
            root.mkdir(parents=True)
            args = self.fixture(root)
            package = Path(tmp) / "candidate.zip"
            self.build_fixture(args, root, package)
            with zipfile.ZipFile(package) as archive:
                names = set(archive.namelist())
                manifest = json.loads(archive.read("PACKAGE_MANIFEST.json"))
            self.assertIn("worker-private/reconcile.mjs", names)
            self.assertIn("worker-private/parser.mjs", names)
            self.assertIn("public/glow-save-sync.mjs", names)
            self.assertIn("database/20261029200450_hbnf_glow_atomic_week_sync.sql", names)
            self.assertIn("database/20261029203741_hbnf_league_state_server_revision_guard.sql", names)
            self.assertIn("database/20261030021038_hbnf_league_state_anon_cas_rpc.sql", names)
            self.assertIn("public/league-state-cas.mjs", names)
            self.assertNotIn("public/udisc-glow-reconcile.mjs", names)
            self.assertNotIn("public/udisc-glow-preview.mjs", names)
            public_assets = [name for name in names if name.startswith("public/")]
            self.assertEqual(len(public_assets), 46)
            self.assertEqual({item["path"] for item in manifest["files"]}, names - {"PACKAGE_MANIFEST.json"})

    def test_package_rejects_migration_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            root = repo / "source-snapshots" / "snapshot"
            migration_dir = repo / "supabase" / "migrations"
            root.mkdir(parents=True)
            migration_dir.mkdir(parents=True, exist_ok=True)
            args = self.fixture(root)
            args.repo_root = repo
            canonical = migration_dir / "20261029200450_hbnf_glow_atomic_week_sync.sql"
            canonical.write_text("select different;\n")
            revision = migration_dir / "20261029203741_hbnf_league_state_server_revision_guard.sql"
            revision.write_text((ROOT / "database" / "20261029203741_hbnf_league_state_server_revision_guard.sql").read_text())
            rpc = migration_dir / "20261030021038_hbnf_league_state_anon_cas_rpc.sql"
            rpc.write_text((ROOT / "database" / "20261030021038_hbnf_league_state_anon_cas_rpc.sql").read_text())
            paths = [
                line.split(maxsplit=1)[1].strip().lstrip("*")
                for line in (ROOT / "package-validation" / "LOCAL_ASSET_SHA256SUMS").read_text().splitlines()
            ]
            assets = {name: b"baseline asset\n" for name in paths}
            assets.update({"public/glow-save-sync.mjs": b"helper\n", "public/league-state-cas.mjs": b"helper\n"})
            lineage = {name: {"source": "test", "sha256": BUILDER.sha256(data)} for name, data in assets.items()}
            with patch.object(BUILDER, "assert_commit_file"), \
                 patch.object(BUILDER, "asset_files", return_value=(assets, lineage)), \
                 patch.object(BUILDER.subprocess, "check_output", return_value="test-builder-commit\n"), \
                 self.assertRaisesRegex(SystemExit, "differs from the reviewed snapshot"):
                BUILDER.build(args, "candidate", root, "e089-test", Path(tmp) / "candidate.zip", args.repo_root)

    def test_missing_transitive_worker_import_fails_instead_of_false_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo" / "source-snapshots" / "snapshot"
            root.mkdir(parents=True)
            args = self.fixture(root)
            (root / "worker-private/parser.mjs").unlink()
            with self.assertRaisesRegex(SystemExit, "unresolved relative imports"):
                self.build_fixture(args, root, Path(tmp) / "candidate.zip")

    def test_worker_private_logic_matches_browser_review_helpers(self):
        for name in ("udisc-glow-preview.mjs", "udisc-glow-reconcile.mjs"):
            self.assertEqual(
                (ROOT / "worker-private" / name).read_bytes(),
                (ROOT / "public" / name).read_bytes(),
                f"Worker-private {name} has drifted from the reviewed source",
            )


if __name__ == "__main__":
    unittest.main()
