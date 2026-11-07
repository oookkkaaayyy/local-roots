import importlib.util
import json
import pathlib
import tempfile
import unittest
import zipfile

SCRIPT = pathlib.Path(__file__).parents[1] / "admission" / "c8_v35_source_restore.py"
spec = importlib.util.spec_from_file_location("c8_restore", SCRIPT)
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)


def good_readback():
    files = [{"name": name, "content": (restore.SOURCE / name).read_text()} for name in restore.EXPECTED_BLOBS]
    return {"project_id": restore.CONFIG["project_id"], "function_slug": restore.CONFIG["function_slug"],
            "status": "ACTIVE", "version": 36,
            "entrypoint_path": "/tmp/provider/source/index.ts", "import_map_path": "/tmp/provider/source/deno.json",
            "verify_jwt": False, "ezbr_sha256": "a" * 64, "files": files}


class SourceRestoreTests(unittest.TestCase):
    def test_capsule_is_deterministic_and_binds_provider_configuration(self):
        with tempfile.TemporaryDirectory() as td:
            a, b = pathlib.Path(td) / "a.zip", pathlib.Path(td) / "b.zip"
            restore.build(a); restore.build(b)
            self.assertEqual(a.read_bytes(), b.read_bytes())
            with zipfile.ZipFile(a) as z:
                self.assertEqual(set(z.namelist()), set(restore.EXPECTED_BLOBS) | {"RESTORE-CONTRACT.json"})
                contract = json.loads(z.read("RESTORE-CONTRACT.json"))
                self.assertEqual(contract["entrypoint_path"], "index.ts")
                self.assertEqual(contract["import_map_path"], "deno.json")
                self.assertIs(contract["verify_jwt"], False)
                self.assertIn("NOT_CLAIMED", contract["compiled_bundle_identity"])
                self.assertEqual(contract["files"]["deno.json"]["git_blob_sha1"], restore.EXPECTED_BLOBS["deno.json"])

    def test_exact_source_config_readback_passes_without_claiming_binary_identity(self):
        self.assertEqual(restore.verify_readback(good_readback()), [])

    def test_source_or_deployment_configuration_drift_fails_closed(self):
        readback = good_readback(); readback["files"][0]["content"] += "\n// drift"
        readback["verify_jwt"] = True
        readback["import_map_path"] = "missing.json"
        readback["version"] = 35
        errors = restore.verify_readback(readback)
        self.assertIn("SOURCE_BYTE_MISMATCH:index.ts", errors)
        self.assertIn("JWT_SETTING_MISMATCH", errors)
        self.assertIn("IMPORT_MAP_MISMATCH", errors)
        self.assertIn("RESTORE_VERSION_NOT_NEW", errors)

    def test_missing_compiled_digest_and_wrong_function_never_pass(self):
        readback = good_readback(); readback.pop("ezbr_sha256"); readback["function_slug"] = "other"
        errors = restore.verify_readback(readback)
        self.assertIn("COMPILED_DIGEST_MISSING", errors)
        self.assertIn("FUNCTION_MISMATCH", errors)


if __name__ == "__main__": unittest.main()
