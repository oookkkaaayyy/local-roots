from pathlib import Path
import importlib.util
import json
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("hbnf_control_v112",ROOT/"scripts/hbnf_control.py")
control=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=control
spec.loader.exec_module(control)

class OwnerPwaV112ProfileTests(unittest.TestCase):
    def test_candidate_and_installed_v111_rollback_are_exactly_bound(self):
        profile=control._owner_pwa_v112_profile()
        self.assertEqual(profile["candidate_commit"],"8d24f875f1dca2977259851bee5c3292c07bb5f6")
        self.assertEqual(profile["transaction_id"],"OWNER-PWA-LOCAL-V112-SHOW-SCORES-SYSTEM-20261022-01")
        self.assertEqual(profile["candidate_sha256"],"10343ed77688fd5a149fcf58f70f0c2904fe654e48c1d4d52e4d06f885f55a57")
        self.assertEqual(len(profile["candidate_hashes"]),17)
        self.assertEqual(len(profile["baseline_served_hashes"]),17)
        self.assertEqual(len(profile["baseline_filesystem_hashes"]),26)
        self.assertEqual(profile["artifacts"]["baseline_manifest"],"7ca405175fa7032d018d3d5f6f6adffc8a5c268d421a661b5be02f425931e348")

    def test_missing_fresh_admission_and_owner_authorization_fail_closed(self):
        state={}
        manifest={"schema":control.OWNER_PWA_TRANSACTION_SCHEMA,"candidate_profile":control.OWNER_PWA_V112_PROFILE}
        errors=control.owner_pwa_admission_errors(state,manifest,now=1792715000)
        self.assertTrue(errors)
        self.assertTrue(any("authorization" in error.lower() or "admission" in error.lower() for error in errors))

if __name__=="__main__": unittest.main()
