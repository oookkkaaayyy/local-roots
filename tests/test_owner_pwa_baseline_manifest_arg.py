import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("owner_pwa_builder", ROOT / "scripts/hbnf_build_local_owner_pwa.py")
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


class BaselineManifestPathTests(unittest.TestCase):
    def test_default_keeps_version_local_baseline_resolution(self):
        actual = BUILDER.resolve_baseline_manifest(ROOT, "1.0.11", None)
        self.assertEqual(ROOT / "staging/coordinated-backend/opal/owner-pwa-local-v1.0.11/BASELINE.SHA256SUMS", actual)

    def test_explicit_prior_baseline_can_be_reused_for_successor(self):
        actual = BUILDER.resolve_baseline_manifest(
            ROOT, "1.0.11", pathlib.Path("staging/coordinated-backend/opal/owner-pwa-local-v1.0.10/BASELINE.SHA256SUMS")
        )
        self.assertEqual(ROOT / "staging/coordinated-backend/opal/owner-pwa-local-v1.0.10/BASELINE.SHA256SUMS", actual)
        self.assertTrue(actual.is_file())


if __name__ == "__main__":
    unittest.main()
