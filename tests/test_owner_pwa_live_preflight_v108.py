import ast
import contextlib
import io
import json
import pathlib
import runpy
import sys
import subprocess
import tempfile
import urllib.error
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/hbnf_owner_pwa_live_preflight_v108.py"
CHANGE_RECORD = ROOT / "evidence/engineering-governance/20261021-owner-pwa-live-preflight-aggregate.json"
RECOVERY_RECEIPT = ROOT / "evidence/owner-pwa-recovery-install-result-20261021-C5CFAEC3.json"


class OwnerPwaLivePreflightV108Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SCRIPT.read_text()
        tree = ast.parse(cls.source)
        remote_assignment = next(
            node for node in ast.walk(tree)
            if isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "remote" for target in node.targets)
        )
        cls.remote = ast.literal_eval(remote_assignment.value.func.value)

    def test_live_ubus_release_tuple_uses_stable_fields(self):
        # Match the owner's raw ubus representation: escaped slash and NBSP description.
        raw = r'''{"model":"GL-SFT1200","board_name":"glinet,gl-sft1200","kernel":"4.14.90","release":{"distribution":"OpenWrt","version":"LEDE","target":"siflower\/sf19a28-fullmask","description":"OpenWrt\u00a018.06"}}'''
        parsed = json.loads(raw)
        self.assertEqual(parsed["release"]["target"], "siflower/sf19a28-fullmask")
        self.assertEqual(parsed["release"]["description"], "OpenWrt\u00a018.06")
        self.assertIn("DISTRIB_TARGET='siflower/sf19a28-fullmask'", self.remote)
        self.assertIn('"distribution"[[:space:]]*:[[:space:]]*"OpenWrt"', self.remote)
        self.assertIn('"version"[[:space:]]*:[[:space:]]*"LEDE"', self.remote)
        self.assertNotIn('"target": "siflower/sf19a28-fullmask"', self.remote)
        self.assertNotIn('"description": "OpenWrt 18.06"', self.remote)
        self.assertNotIn("DISTRIB_DESCRIPTION=", self.remote)

    def test_remote_checks_accumulate_instead_of_stopping_at_first_failure(self):
        self.assertIn("set -u", self.remote)
        self.assertNotIn("set -eu", self.remote)
        self.assertIn("FAILURES=$((FAILURES + 1))", self.remote)
        self.assertIn("OPAL_PREFLIGHT=FAIL", self.remote)
        self.assertIn("sha256sum -c - <<'BASELINE_MANIFEST'", self.remote)
        self.assertIn('(cd "$TARGET" && sha256sum -c -', self.remote)
        self.assertIn('if result is not None and result.returncode:', self.source)
        self.assertIn('blockers.append("served baseline', self.source)
        self.assertIn('blockers.append("candidate-only URL', self.source)
        self.assertIn('if blockers:', self.source)
        self.assertLess(self.source.index('if blockers:'), self.source.index('with receipt_path.open("x"'))
        self.assertIn('["git", "show", f"{source_commit}:{relative}"]', self.source)
        self.assertIn('candidate source input differs from pinned commit', self.source)
        shell = self.remote.replace("__MANIFEST__", "")
        shell_check = subprocess.run(["sh", "-n"], input=shell, text=True, capture_output=True)
        self.assertEqual(shell_check.returncode, 0, shell_check.stderr)

    def test_release_identity_does_not_rely_on_ubus_formatting_metadata(self):
        for key in ('"model"', '"board_name"', '"kernel"', '"distribution"', '"version"'):
            self.assertIn(key, self.remote)
        self.assertIn("DISTRIB_ID='OpenWrt'", self.remote)
        self.assertIn("DISTRIB_RELEASE='LEDE'", self.remote)
        self.assertIn("DISTRIB_TARGET='siflower/sf19a28-fullmask'", self.remote)

    def test_pre_recovery_path_absence_is_not_reported_as_current_state(self):
        record = json.loads(CHANGE_RECORD.read_text())
        evidence = record["evidence"]
        observation = evidence["prior_path_observation"]
        receipt = json.loads(RECOVERY_RECEIPT.read_text())
        self.assertEqual(observation["classification"], "STALE_PRE_RECOVERY")
        self.assertFalse(observation["asserts_current_device_state"])
        self.assertEqual(observation["superseded_by"]["path"], str(RECOVERY_RECEIPT.relative_to(ROOT)))
        self.assertEqual(observation["superseded_by"]["sha256"], "7edd8ad72ea2de63234b410743cef648865e1f48c9e2d8f31dd1909860bf2806")
        self.assertEqual(receipt["status"], "PASS")
        self.assertEqual(receipt["owner_pwa_version"], "1.0.5")
        self.assertEqual(receipt["installed_manifest_entries"], 24)
        self.assertIs(receipt["served_hashes_verified"], True)
        self.assertIs(receipt["rollback_available"], True)
        self.assertEqual(evidence["fresh_live_preflight"], "NOT_RUN")

    def test_failed_preflight_reports_source_and_network_blockers_without_receipt(self):
        with tempfile.TemporaryDirectory(prefix=".test-owner-pwa-preflight-", dir=ROOT / "evidence") as temp:
            receipt = pathlib.Path(temp) / "failed-preflight.json"
            real_run = subprocess.run

            def fake_run(command, *args, **kwargs):
                if command and command[0] == "git":
                    return real_run(command, *args, **kwargs)
                if command and command[0] == "ssh":
                    return subprocess.CompletedProcess(command, 1)
                return real_run(command, *args, **kwargs)

            stdout, stderr = io.StringIO(), io.StringIO()
            with mock.patch.object(sys, "argv", [str(SCRIPT), "--receipt", str(receipt)]), \
                 mock.patch("subprocess.run", side_effect=fake_run), \
                 mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("offline fixture")), \
                 contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                with self.assertRaises(SystemExit):
                    runpy.run_path(str(SCRIPT), run_name="__main__")
            output = stdout.getvalue() + stderr.getvalue()
            self.assertIn("candidate source input differs from pinned commit", output)
            self.assertGreaterEqual(output.count("candidate source input differs from pinned commit"), 6)
            self.assertIn("SSH/remote exit 1", output)
            self.assertIn("served baseline readback failed", output)
            self.assertFalse(receipt.exists(), "failed preflight must not leave a pass receipt")


if __name__ == "__main__":
    unittest.main()
