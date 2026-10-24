import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("control_v113",ROOT/"scripts/hbnf_control.py")
control=importlib.util.module_from_spec(spec); spec.loader.exec_module(control)


class OwnerPwaV113ProfileTests(unittest.TestCase):
    def setUp(self):
        control.OWNER_PWA_V113_PROFILE_CACHE=None

    def test_exact_ui_candidate_and_v112_recovery_are_pinned(self):
        profile=control._owner_pwa_profile({"candidate_profile":control.OWNER_PWA_V113_PROFILE})
        self.assertEqual(profile["candidate_commit"],"53221bbc83fc6f8ebbbd3dd2d931284eae298dfa")
        self.assertEqual(profile["transaction_id"],"OWNER-PWA-LOCAL-V113-UI-20261024-01")
        self.assertEqual(profile["candidate_sha256"],"60509839edb902f25546878094d0b39f7d8ce78ca54e99d23e66d84deb41155a")
        self.assertEqual(profile["artifacts"]["rollback_companion_zip"],"a24f480aa5dd9cdfc8fe5c415b277f4605db1c506054b8c9e5918bd03ccf62b6")
        self.assertEqual(len(profile["candidate_hashes"]),18)
        self.assertEqual(len(profile["baseline_served_hashes"]),21)
        self.assertEqual(len(profile["baseline_filesystem_hashes"]),26)
        self.assertEqual(profile["new_paths"],("owner-pwa/hbnf-faded-phosphor.png",))

    def test_changed_uploaded_artifact_receipt_fails_closed(self):
        original=control.OWNER_PWA_V113_DRIVE_READBACK_SHA256
        try:
            control.OWNER_PWA_V113_DRIVE_READBACK_SHA256="0"*64
            with self.assertRaisesRegex(ValueError,"evidence is missing or changed"):
                control._owner_pwa_profile({"candidate_profile":control.OWNER_PWA_V113_PROFILE})
        finally:
            control.OWNER_PWA_V113_DRIVE_READBACK_SHA256=original
            control.OWNER_PWA_V113_PROFILE_CACHE=None

    def test_admission_recognizes_candidate_but_requires_fresh_preflight(self):
        state=control.load(ROOT/"config/HBNF_CONTROL_STATE.json")
        manifest={"schema":control.OWNER_PWA_TRANSACTION_SCHEMA,"stage":"OWNER_PWA_LIVE_APPROVED",
            "outcome":"PASS","candidate_profile":control.OWNER_PWA_V113_PROFILE}
        errors=control.owner_pwa_admission_errors(state,manifest)
        self.assertTrue(any("fresh Owner PWA live preflight did not pass" in e for e in errors))
        self.assertFalse(any("invalid Owner PWA candidate profile" in e for e in errors))


if __name__=="__main__": unittest.main()
