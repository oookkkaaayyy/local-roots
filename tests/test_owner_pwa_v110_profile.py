"""Exact v1.0.10 package and baseline-bound admission checks."""
import copy
import importlib.util
import json
import pathlib
import time
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("control_v110",ROOT/"scripts/hbnf_control.py")
control=importlib.util.module_from_spec(spec); spec.loader.exec_module(control)

def fixture():
    now=int(time.time())
    state=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text())
    state["lifecycle_state"]="PHASE2_INTEGRATING"
    state["phase2_implementation_authorized"]=True
    state["live_mutation_authorized"]=False
    cursor=state["execution_cursor"]
    cursor.pop("owner_pwa_transaction",None); cursor.pop("owner_pwa_transaction_history",None)
    profile=control._owner_pwa_v110_profile()
    owner={"schema":"hbnf-owner-pwa-install-authorization-v1",
        "transaction_id":control.OWNER_PWA_V110_TRANSACTION_ID,
        "authorization_id":"OWNER-TEST-V110-UNIQUE",
        "source_message_ref":"unit-test-only authorization fixture",
        "scope":[control.OWNER_PWA_STEP,"rollback_if_required"],
        "nonce":"b"*64,"issued_unix":now,"expires_unix":now+600,
        "artifact_sha256_bindings":copy.deepcopy(profile["artifacts"])}
    receipt=ROOT/"evidence"/".owner-pwa-v110-test-auth.json"
    receipt.write_text(json.dumps({"schema":"hbnf-owner-pwa-explicit-authorization-receipt-v1",
        "owner_authorization":owner},sort_keys=True))
    pre={"schema":"hbnf-owner-pwa-live-preflight-v1","pass":True,"captured_unix":now,
        "target_ip":"192.168.77.1","served_sha256_by_path":copy.deepcopy(profile["baseline_served_hashes"]),
        "filesystem_sha256_by_path":copy.deepcopy(profile["baseline_filesystem_hashes"]),
        "baseline_http_status_by_path":{p:200 for p in profile["baseline_served_hashes"]},
        "new_path_preflight_by_path":{},
        "permissions":{"owner_files_regular_no_symlinks":True,"transport_regular_no_symlink":True,
            "root_install_available":True,"recovery_paths_clear":True},
        "device_identity":{"model":"GL-SFT1200","board":"glinet,gl-sft1200",
            "br_lan_mac":control.OWNER_PWA_RECOVERY_HISTORICAL_MAC,"kernel":"4.14.90",
            "firmware":"OpenWrt 18.06","firmware_release_id":"OpenWrt",
            "firmware_release":"LEDE","firmware_target":"siflower/sf19a28-fullmask"},
        "mission_control_sha256_by_path":copy.deepcopy(profile["mission_control_hashes"]),
        "rollback":{"baseline_zip_sha256":profile["artifacts"]["served_baseline_zip"],
            "baseline_manifest_sha256":control.OWNER_PWA_V110_BASELINE_MANIFEST_SHA256,
            "baseline_readback_sha256":control.OWNER_PWA_V110_BASELINE_READBACK_SHA256,
            "exact_backup_path_clear":True,"same_filesystem":True,"sha256sum_available":True}}
    manifest={"candidate_profile":control.OWNER_PWA_V110_PROFILE,
        "candidate_package_sha256":control.OWNER_PWA_V110_PACKAGE_SHA256,
        "package_path":"staging/coordinated-backend/opal/owner-pwa-local-v1.0.10/hbnf-owner-pwa-local-v1.0.10.zip",
        "drive_file_id":None,"candidate_commit":control.OWNER_PWA_V110_SOURCE_COMMIT,
        "target":{"model":"GL-SFT1200","ip":"192.168.77.1","base":"/www/mission-control-local",
            "owner_dir":"/www/mission-control-local/owner-pwa"},
        "allowed_paths":list(profile["targets"]),"candidate_sha256_by_path":copy.deepcopy(profile["candidate_hashes"]),
        "owner_authorization_receipt":{"path":receipt.relative_to(ROOT).as_posix(),"sha256":control.sha256_file(receipt)},
        "live_preflight":pre}
    return state,manifest,owner,profile,receipt

class OwnerPwaV110ProfileTests(unittest.TestCase):
    def test_exact_candidate_and_v109_baseline_are_pinned(self):
        p=control._owner_pwa_v110_profile()
        self.assertEqual(control.OWNER_PWA_V110_TRANSACTION_ID,p["transaction_id"])
        self.assertEqual(control.OWNER_PWA_V110_SOURCE_COMMIT,p["candidate_commit"])
        self.assertEqual(control.OWNER_PWA_V110_PACKAGE_SHA256,p["candidate_sha256"])
        self.assertEqual(17,len(p["candidate_hashes"]))
        self.assertEqual(17,len(p["baseline_served_hashes"]))
        self.assertEqual(21,len(p["baseline_filesystem_hashes"]))
        self.assertNotEqual(p["candidate_hashes"],p["baseline_served_hashes"])

    def test_fresh_exact_admission_uses_unique_authorization_and_keeps_firmware_closed(self):
        state,manifest,owner,p,receipt=fixture()
        try:
            admitted=control.issue_owner_pwa_admission(state,manifest,owner)
            self.assertEqual([],control.owner_pwa_admission_errors(state,admitted))
            self.assertEqual(p["artifacts"],admitted["artifact_sha256_bindings"])
            self.assertEqual(control.OWNER_PWA_V110_TRANSACTION_ID,
                state["execution_cursor"]["owner_pwa_transaction"]["transaction_id"])
            self.assertFalse(state["live_mutation_authorized"])
        finally:
            receipt.unlink(missing_ok=True)

    def test_admission_rejects_stale_or_mismatched_installed_baseline(self):
        state,manifest,owner,_p,receipt=fixture()
        try:
            manifest["live_preflight"]["filesystem_sha256_by_path"]["owner-pwa/.hbnf-package-version"]="0"*64
            with self.assertRaisesRegex(ValueError,"filesystem baseline differs"):
                control.issue_owner_pwa_admission(state,manifest,owner)
        finally:
            receipt.unlink(missing_ok=True)

if __name__=="__main__": unittest.main()
