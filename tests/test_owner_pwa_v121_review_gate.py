#!/usr/bin/env python3
"""Offline release-control checks for the pinned v1.0.21 REVIEW_ONLY package."""
import importlib.util, json, os, pathlib, shutil, tarfile, tempfile, time, unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("control",ROOT/"scripts/hbnf_control.py")
control=importlib.util.module_from_spec(spec); spec.loader.exec_module(control)
ARTIFACT_ROOT=pathlib.Path(os.environ.get("CART116_V121_ARTIFACT_ROOT",ROOT.parents[1]/"outputs"))
BUILD=ARTIFACT_ROOT/"a4-qualified-build-1"
CHECKPOINT=ARTIFACT_ROOT/"checkpoints"

def paths():
    return {"candidate_zip":BUILD/"hbnf-owner-pwa-local-v1.0.21.zip",
        "package_json":BUILD/"PACKAGE.json","payload_sums":BUILD/"PAYLOAD.SHA256SUMS",
        "rollback_zip":CHECKPOINT/"current-installed-owner-pwa-2026-10-31.tar.gz",
        "baseline_manifest":CHECKPOINT/"current-installed-owner-pwa-2026-10-31.manifest.json",
        "route":ARTIFACT_ROOT/"a4-candidate-to-v120-route.pending.json",
        "readback_receipt":ARTIFACT_ROOT/"a4-drive-readback-receipt.json"}

@unittest.skipUnless((BUILD/"hbnf-owner-pwa-local-v1.0.21.zip").is_file(),"provide preserved A4 artifacts via CART116_V121_ARTIFACT_ROOT")
class OwnerPwaV121ReviewGate(unittest.TestCase):
    def test_exact_candidate_and_v120_rollback_verify_offline(self):
        artifact_paths=paths()
        self.assertEqual(control.OWNER_PWA_V121_CANDIDATE_SHA256,control.sha256_file(artifact_paths["candidate_zip"]))
        self.assertEqual(control.OWNER_PWA_V121_BASELINE_SHA256,control.sha256_file(artifact_paths["rollback_zip"]))
        self.assertEqual(control.OWNER_PWA_V121_BASELINE_MANIFEST_SHA256,control.sha256_file(artifact_paths["baseline_manifest"]))
        blocked=control.owner_pwa_v121_artifact_errors(artifact_paths)
        self.assertEqual(["pending A4 route baseline manifest hash differs from the independently hashed v1.0.20 snapshot manifest"],blocked)
        profile=control._owner_pwa_profile({"candidate_profile":control.OWNER_PWA_V121_PROFILE})
        self.assertTrue(profile["review_only"])
        self.assertEqual(control.OWNER_PWA_V121_TRANSACTION_ID,profile["transaction_id"])
        self.assertEqual(18,len(profile["targets"]))

    def test_historical_profiles_remain_the_same_objects_and_values(self):
        self.assertEqual("owner-uv-v1.0.14",control.OWNER_PWA_V114_PROFILE)
        self.assertEqual("70435e5df3d9cfc0d68bbf88c99308960ef09b56",control.OWNER_PWA_V114_SOURCE_COMMIT)
        self.assertEqual("6c393c5dde6dc78ea16823922c0c2717ccc4ae88dd5fa9e4047efb2e71044a17",control.OWNER_PWA_V114_PACKAGE_SHA256)
        self.assertEqual("owner-ui-v1.0.13",control.OWNER_PWA_V113_PROFILE)
        self.assertEqual("recovery-v2-v1.0.8",control.OWNER_PWA_V108_PROFILE)

    def test_altered_bytes_missing_rollback_and_wrong_route_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            temp=pathlib.Path(tmp); altered=paths(); altered["candidate_zip"]=temp/"candidate.zip"
            shutil.copyfile(paths()["candidate_zip"],altered["candidate_zip"])
            altered["candidate_zip"].write_bytes(altered["candidate_zip"].read_bytes()+b"x")
            self.assertTrue(any("hash mismatch: candidate_zip" in e for e in control.owner_pwa_v121_artifact_errors(altered)))
            missing=paths(); missing["rollback_zip"]=temp/"missing.tar.gz"
            self.assertTrue(any("artifact hash mismatch: rollback_zip" in e for e in control.owner_pwa_v121_artifact_errors(missing)))
            wrong=paths(); wrong["route"]=temp/"route.json"
            doc=json.loads(paths()["route"].read_text()); doc["target"]["ip"]="192.0.2.1"
            wrong["route"].write_text(json.dumps(doc))
            self.assertTrue(any("artifact hash mismatch: route" in e for e in control.owner_pwa_v121_artifact_errors(wrong)))

    def test_downloadback_receipt_tampering_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            altered=paths(); altered["readback_receipt"]=pathlib.Path(tmp)/"receipt.json"
            receipt=json.loads(paths()["readback_receipt"].read_text())
            receipt["objects"][0]["readback"]="NOT_VERIFIED"
            altered["readback_receipt"].write_text(json.dumps(receipt))
            result=control.owner_pwa_v121_artifact_errors(altered)
            self.assertTrue(any("artifact hash mismatch: readback_receipt" in e for e in result),result)

    def test_exact_rollback_archive_recovers_inside_isolated_opal_fixture(self):
        manifest=json.loads(paths()["baseline_manifest"].read_text())
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)/"opal/www/mission-control-local"
            root.mkdir(parents=True)
            with tarfile.open(paths()["rollback_zip"],"r:gz") as archive:
                for member in archive.getmembers():
                    rel=pathlib.PurePosixPath(member.name)
                    self.assertFalse(rel.is_absolute() or ".." in rel.parts)
                    self.assertTrue(member.isdir() or member.isfile(),member.name)
                    target=root.joinpath(*rel.parts)
                    if member.isdir(): target.mkdir(parents=True,exist_ok=True)
                    else:
                        target.parent.mkdir(parents=True,exist_ok=True)
                        stream=archive.extractfile(member); self.assertIsNotNone(stream)
                        target.write_bytes(stream.read()); target.chmod(member.mode & 0o777)
            for item in manifest["entries"]:
                if item.get("type")!="regular": continue
                target=root/item["path"]
                self.assertEqual(item["sha256"],control.sha256_file(target),item["path"])
                self.assertEqual(int(item["mode"],8),target.stat().st_mode & 0o777,item["path"])

    def test_target_freshness_identity_replay_authorization_and_review_only_block(self):
        now=int(time.time())
        target={"captured_unix":now,"model":"GL-SFT1200","ip":"192.168.77.1",
            "base":"/www/mission-control-local","owner_dir":"/www/mission-control-local/owner-pwa",
            "installed_archive_sha256":control.OWNER_PWA_V121_BASELINE_SHA256,
            "installed_manifest_sha256":control.OWNER_PWA_V121_BASELINE_MANIFEST_SHA256,
            "filesystem_sha256_by_path":control.OWNER_PWA_V121_BASELINE_FILESYSTEM_HASHES,
            "served_sha256_by_path":control.OWNER_PWA_V121_SERVED_BASELINE_HASHES,
            "http_status_by_path":{p:200 for p in control.OWNER_PWA_V121_SERVED_BASELINE_HASHES},
            "mission_control_transport_sha256":control.OWNER_PWA_V121_CANDIDATE_HASHES["mission-control-local/local-transport.js"]}
        auth={"authorized":True,"transaction_id":control.OWNER_PWA_V121_TRANSACTION_ID,
            "candidate_sha256":control.OWNER_PWA_V121_CANDIDATE_SHA256,
            "rollback_sha256":control.OWNER_PWA_V121_BASELINE_SHA256,"target_ip":"192.168.77.1",
            "issued_unix":now,"expires_unix":now+600,"scope":[control.OWNER_PWA_STEP,"rollback_if_required"]}
        errs=control.owner_pwa_v121_admission_errors(paths(),target,auth,control.OWNER_PWA_V121_TRANSACTION_ID,now=now)
        self.assertTrue(any("REVIEW_ONLY" in e for e in errs),errs)
        self.assertTrue(any("pending A4 route baseline manifest hash differs" in e for e in errs),errs)
        cases=[
            (None,auth,(),"fresh exact Opal target evidence missing"),
            ({**target,"captured_unix":now-301},auth,(),"missing or stale"),
            ({**target,"ip":"192.0.2.1"},auth,(),"target identity or exact target paths mismatch"),
            ({**target,"filesystem_sha256_by_path":{}},auth,(),"filesystem readback does not match all 21"),
            (target,None,(),"Owner authorization missing"),
            (target,{**auth,"expires_unix":now-1},(),"authorization is missing, stale, expired"),
            (target,auth,(control.OWNER_PWA_V121_TRANSACTION_ID,),"wrong or replayed"),
            (target,{**auth,"candidate_sha256":"0"*64},(),"authorization binding mismatch: candidate_sha256"),
        ]
        for t,a,used,needle in cases:
            with self.subTest(needle=needle):
                result=control.owner_pwa_v121_admission_errors(paths(),t,a,control.OWNER_PWA_V121_TRANSACTION_ID,used,now=now)
                self.assertTrue(any(needle in e for e in result),result)

    def test_closeout_must_bind_exact_manifest_digest_and_cannot_admit(self):
        now=int(time.time()); manifest={"schema":control.OWNER_PWA_TRANSACTION_SCHEMA,"transaction_id":control.OWNER_PWA_V121_TRANSACTION_ID}
        target={"captured_unix":now,"model":"GL-SFT1200","ip":"192.168.77.1",
            "base":"/www/mission-control-local","owner_dir":"/www/mission-control-local/owner-pwa",
            "installed_archive_sha256":control.OWNER_PWA_V121_BASELINE_SHA256,
            "installed_manifest_sha256":control.OWNER_PWA_V121_BASELINE_MANIFEST_SHA256,
            "filesystem_sha256_by_path":control.OWNER_PWA_V121_BASELINE_FILESYSTEM_HASHES,
            "served_sha256_by_path":control.OWNER_PWA_V121_SERVED_BASELINE_HASHES,
            "http_status_by_path":{p:200 for p in control.OWNER_PWA_V121_SERVED_BASELINE_HASHES},
            "mission_control_transport_sha256":control.OWNER_PWA_V121_CANDIDATE_HASHES["mission-control-local/local-transport.js"]}
        auth={"authorized":True,"transaction_id":control.OWNER_PWA_V121_TRANSACTION_ID,
            "candidate_sha256":control.OWNER_PWA_V121_CANDIDATE_SHA256,
            "rollback_sha256":control.OWNER_PWA_V121_BASELINE_SHA256,"target_ip":"192.168.77.1",
            "issued_unix":now,"expires_unix":now+600,"scope":[control.OWNER_PWA_STEP,"rollback_if_required"]}
        good={"manifest_sha256":control.owner_pwa_admission_digest(manifest)}
        result=control.owner_pwa_v121_admission_errors(paths(),target,auth,control.OWNER_PWA_V121_TRANSACTION_ID,
            manifest=manifest,closeout=good,now=now)
        self.assertFalse(any("same manifest" in e for e in result)); self.assertTrue(any("REVIEW_ONLY" in e for e in result))
        bad={"manifest_sha256":"0"*64}
        result=control.owner_pwa_v121_admission_errors(paths(),target,auth,control.OWNER_PWA_V121_TRANSACTION_ID,
            manifest=manifest,closeout=bad,now=now)
        self.assertTrue(any("same manifest" in e for e in result))

    def test_existing_live_admission_entry_points_reject_review_profile(self):
        with self.assertRaisesRegex(ValueError,"review only"):
            control.issue_owner_pwa_admission({}, {"candidate_profile":control.OWNER_PWA_V121_PROFILE}, {}, now=1)
        state={"lifecycle_state":"PHASE2_INTEGRATING","phase2_implementation_authorized":True,
            "live_mutation_authorized":False,"execution_cursor":{}}
        manifest={"schema":control.OWNER_PWA_TRANSACTION_SCHEMA,"candidate_profile":control.OWNER_PWA_V121_PROFILE}
        self.assertTrue(any("REVIEW_ONLY" in e for e in control.owner_pwa_admission_errors(state,manifest,now=1)))

if __name__=="__main__": unittest.main(verbosity=2)
