"""Exact v1.0.9 candidate profile and closed-by-default admission tests."""
import copy
import importlib.util
import json
import pathlib
import time
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("control_v109",ROOT/"scripts/hbnf_control.py")
control=importlib.util.module_from_spec(spec); spec.loader.exec_module(control)

def candidate_fixture(preserve_existing=False):
    now=int(time.time())
    state=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text())
    state["lifecycle_state"]="PHASE2_INTEGRATING"
    state["phase2_implementation_authorized"]=True
    state["live_mutation_authorized"]=False
    cursor=state.setdefault("execution_cursor",{})
    if not preserve_existing:
        cursor.pop("owner_pwa_transaction",None)
        cursor.pop("owner_pwa_transaction_history",None)
    profile=control._owner_pwa_profile({"candidate_profile":control.OWNER_PWA_V109_PROFILE})
    owner={"schema":"hbnf-owner-pwa-install-authorization-v1",
        "transaction_id":control.OWNER_PWA_V109_TRANSACTION_ID,
        "authorization_id":"OWNER-TEST-V109-ONE-INSTALL",
        "source_message_ref":"unit test only; exact candidate authorization fixture",
        "scope":[control.OWNER_PWA_STEP,"rollback_if_required"],
        "nonce":"a"*64,"issued_unix":now,"expires_unix":now+600,
        "artifact_sha256_bindings":copy.deepcopy(profile["artifacts"])}
    receipt_path=ROOT/"evidence"/".owner-pwa-v109-profile-test-auth.json"
    receipt_path.write_text(json.dumps({"schema":"hbnf-owner-pwa-explicit-authorization-receipt-v1",
        "owner_authorization":owner},sort_keys=True))
    preflight={"schema":"hbnf-owner-pwa-live-preflight-v1","pass":True,
        "captured_unix":now,"target_ip":"192.168.77.1",
        "served_sha256_by_path":copy.deepcopy(profile["baseline_served_hashes"]),
        "filesystem_sha256_by_path":copy.deepcopy(profile["baseline_filesystem_hashes"]),
        "baseline_http_status_by_path":{path:200 for path in profile["baseline_served_hashes"]},
        "new_path_preflight_by_path":{},
        "permissions":{"owner_files_regular_no_symlinks":True,"transport_regular_no_symlink":True,
            "root_install_available":True,"recovery_paths_clear":True},
        "device_identity":{"model":"GL-SFT1200","board":"glinet,gl-sft1200",
            "br_lan_mac":control.OWNER_PWA_RECOVERY_HISTORICAL_MAC,"kernel":"4.14.90",
            "firmware":"OpenWrt 18.06","firmware_release_id":"OpenWrt",
            "firmware_release":"LEDE","firmware_target":"siflower/sf19a28-fullmask"},
        "mission_control_sha256_by_path":copy.deepcopy(profile["mission_control_hashes"]),
        "rollback":{"baseline_zip_sha256":profile["artifacts"]["served_baseline_zip"],
            "baseline_manifest_sha256":control.OWNER_PWA_V109_BASELINE_MANIFEST_SHA256,
            "baseline_readback_sha256":control.OWNER_PWA_V109_BASELINE_READBACK_SHA256,
            "exact_backup_path_clear":True,"same_filesystem":True,"sha256sum_available":True}}
    manifest={"candidate_profile":control.OWNER_PWA_V109_PROFILE,
        "candidate_package_sha256":control.OWNER_PWA_V109_PACKAGE_SHA256,
        "package_path":"staging/coordinated-backend/opal/owner-pwa-local-v1.0.9/hbnf-owner-pwa-local-v1.0.9.zip",
        "drive_file_id":None,"candidate_commit":control.OWNER_PWA_V109_SOURCE_COMMIT,
        "target":{"model":"GL-SFT1200","ip":"192.168.77.1",
            "base":"/www/mission-control-local","owner_dir":"/www/mission-control-local/owner-pwa"},
        "allowed_paths":list(profile["targets"]),
        "candidate_sha256_by_path":copy.deepcopy(profile["candidate_hashes"]),
        "owner_authorization_receipt":{"path":receipt_path.relative_to(ROOT).as_posix(),
            "sha256":control.sha256_file(receipt_path)},
        "live_preflight":preflight}
    return state,manifest,owner,profile,receipt_path

class OwnerPwaV109ProfileTests(unittest.TestCase):
    def test_exact_package_and_installed_baseline_are_pinned(self):
        profile=control._owner_pwa_profile({"candidate_profile":control.OWNER_PWA_V109_PROFILE})
        self.assertEqual(control.OWNER_PWA_V109_TRANSACTION_ID,profile["transaction_id"])
        self.assertEqual(control.OWNER_PWA_V109_SOURCE_COMMIT,profile["candidate_commit"])
        self.assertEqual(control.OWNER_PWA_V109_PACKAGE_SHA256,profile["candidate_sha256"])
        self.assertEqual(17,len(profile["candidate_hashes"]))
        self.assertEqual(17,len(profile["baseline_served_hashes"]))
        self.assertEqual(21,len(profile["baseline_filesystem_hashes"]))
        self.assertNotEqual(profile["candidate_hashes"],profile["baseline_served_hashes"])
        with self.assertRaisesRegex(ValueError,"unknown Owner PWA candidate profile"):
            control._owner_pwa_profile({"candidate_profile":"ux-v1.0.9-unpinned"})

    def test_exact_fresh_candidate_admission_keeps_global_mutation_closed(self):
        state,manifest,owner,profile,receipt=candidate_fixture()
        try:
            admitted=control.issue_owner_pwa_admission(state,manifest,owner)
            self.assertEqual([],control.owner_pwa_admission_errors(state,admitted))
            self.assertEqual(control.OWNER_PWA_V109_TRANSACTION_ID,
                state["execution_cursor"]["owner_pwa_transaction"]["transaction_id"])
            self.assertFalse(state["live_mutation_authorized"])
            self.assertEqual(profile["artifacts"],admitted["artifact_sha256_bindings"])
        finally:
            receipt.unlink(missing_ok=True)

    def test_issuing_v109_archives_the_completed_prior_transaction_unchanged(self):
        state,manifest,owner,_profile,receipt=candidate_fixture(preserve_existing=True)
        prior=copy.deepcopy(state["execution_cursor"]["owner_pwa_transaction"])
        try:
            admitted=control.issue_owner_pwa_admission(state,manifest,owner)
            history=state["execution_cursor"]["owner_pwa_transaction_history"]
            self.assertEqual(prior,history[-1]["prior_transaction"])
            self.assertEqual(control.OWNER_PWA_V109_TRANSACTION_ID,history[-1]["superseded_by"])
            self.assertEqual(control.OWNER_PWA_V109_TRANSACTION_ID,
                state["execution_cursor"]["owner_pwa_transaction"]["transaction_id"])
            self.assertEqual([],control.owner_pwa_admission_errors(state,admitted))
            self.assertFalse(state["live_mutation_authorized"])
        finally:
            receipt.unlink(missing_ok=True)

    def test_v109_install_completion_requires_exact_candidate_and_retained_rollback(self):
        state,manifest,owner,profile,auth_receipt=candidate_fixture()
        install_receipt=ROOT/"evidence"/".owner-pwa-v109-profile-test-install.json"
        try:
            admitted=control.issue_owner_pwa_admission(state,manifest,owner)
            control.reserve_owner_pwa_install(state,admitted)
            result={"schema":"hbnf-owner-pwa-install-result-v1",
                "transaction_id":control.OWNER_PWA_V109_TRANSACTION_ID,
                "step":control.OWNER_PWA_STEP,"status":"PASS",
                "installed_sha256_by_path":copy.deepcopy(profile["candidate_hashes"]),
                "served_sha256_by_path":copy.deepcopy(profile["candidate_hashes"]),
                "rollback_sha256":profile["artifacts"]["served_baseline_zip"],
                "rollback_retained":True,
                "health_checks":{"http_200_all_17":True,"content_hash_all_17":True,
                    "owner_route_content":True,"guest_unchanged":True,"skins_unchanged":True,
                    "firmware_unchanged":True,"aux_unchanged":True}}
            install_receipt.write_text(json.dumps(result,sort_keys=True))
            control.complete_owner_pwa_install(state,admitted,install_receipt)
            self.assertEqual("COMPLETE",state["execution_cursor"]["owner_pwa_transaction"]["status"])
            self.assertFalse(state["live_mutation_authorized"])
        finally:
            auth_receipt.unlink(missing_ok=True)
            install_receipt.unlink(missing_ok=True)

    def test_v109_rollback_requires_exact_v108_baseline_readback(self):
        state,manifest,owner,profile,auth_receipt=candidate_fixture()
        failure=ROOT/"evidence"/".owner-pwa-v109-profile-test-failure.json"
        rollback=ROOT/"evidence"/".owner-pwa-v109-profile-test-rollback.json"
        try:
            admitted=control.issue_owner_pwa_admission(state,manifest,owner)
            control.reserve_owner_pwa_install(state,admitted)
            failure.write_text(json.dumps({"schema":"hbnf-owner-pwa-install-result-v1",
                "transaction_id":control.OWNER_PWA_V109_TRANSACTION_ID,
                "step":control.OWNER_PWA_STEP,"status":"FAIL","failure_id":"test-failure"},sort_keys=True))
            control.record_owner_pwa_failure(state,admitted,failure)
            control.reserve_owner_pwa_rollback(state,admitted)
            result={"schema":"hbnf-owner-pwa-install-result-v1",
                "transaction_id":control.OWNER_PWA_V109_TRANSACTION_ID,
                "step":"rollback_if_required","status":"PASS",
                "served_sha256_by_path":copy.deepcopy(profile["baseline_served_hashes"]),
                "absent_path_status_by_path":{},
                "rollback_sha256":profile["artifacts"]["served_baseline_zip"]}
            rollback.write_text(json.dumps(result,sort_keys=True))
            control.complete_owner_pwa_rollback(state,admitted,rollback)
            self.assertEqual("ROLLED_BACK",state["execution_cursor"]["owner_pwa_transaction"]["status"])
            self.assertFalse(state["live_mutation_authorized"])
        finally:
            auth_receipt.unlink(missing_ok=True)
            failure.unlink(missing_ok=True)
            rollback.unlink(missing_ok=True)

    def test_v109_admission_rejects_absent_current_files_and_wrong_preservation_hash(self):
        state,manifest,owner,_profile,receipt=candidate_fixture()
        try:
            manifest["live_preflight"]["filesystem_sha256_by_path"].pop("owner-pwa/.hbnf-package-version")
            with self.assertRaisesRegex(ValueError,"filesystem baseline differs"):
                control.issue_owner_pwa_admission(state,manifest,owner)
        finally:
            receipt.unlink(missing_ok=True)

        state,manifest,owner,_profile,receipt=candidate_fixture()
        try:
            manifest["live_preflight"]["mission_control_sha256_by_path"]["mission-control-local/app.js"]="0"*64
            with self.assertRaisesRegex(ValueError,"Mission Control or local transport"):
                control.issue_owner_pwa_admission(state,manifest,owner)
        finally:
            receipt.unlink(missing_ok=True)

if __name__=="__main__":
    unittest.main()
