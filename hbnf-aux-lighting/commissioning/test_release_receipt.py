#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,pathlib,tempfile,unittest
from validate_release_receipt import validate,validate_template

class ReleaseReceiptTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name)
        for name,data in (("candidate.bin",b"candidate image"),("rollback.bin",b"installed image"),("durable-rollback.bin",b"installed image"),("pre.bin",b"installed image"),("post.bin",b"candidate image")):
            (self.root/name).write_bytes(data)
        self.runtime={"version":"0.16.1","release":"aux-candidate","engine":"aux-r3","build_witness":"witness-v1"}
        (self.root/"runtime.json").write_text(json.dumps(self.runtime))
        h=lambda n:hashlib.sha256((self.root/n).read_bytes()).hexdigest()
        self.receipt={"schema":"hbnf-aux-release-receipt-v1","status":"COMPLETE","source":{"commit":"a"*40},
          "build":{"workflow_path":".github/workflows/build.yml","workflow_ref":"refs/heads/release","run_id":"123","run_url":"https://github.com/example/repo/actions/runs/123","toolchain":{"python":"3.12","platformio":"6.1.17","node":"20"},"pinned_inputs":{"wled_commit":"b"*40,"source_bundle_sha256":"c"*64,"wled_requirements_sha256":"d"*64,"aux_patch_sha256":"e"*64}},
          "candidate":{"filename":"candidate.bin","size":len(b"candidate image"),"sha256":h("candidate.bin"),"path":"candidate.bin"},
          "pre_install":{"release":"installed-v6","firmware_sha256":h("pre.bin"),"readback_evidence_ref":"https://drive.google.com/file/d/pre","firmware_image_path":"pre.bin"},
          "rollback":{"filename":"rollback.bin","size":len(b"installed image"),"sha256":h("rollback.bin"),"path":"rollback.bin","durable_location":"drive-file-id:rollback","durable_readback_path":"durable-rollback.bin"},
          "installation":{"timestamp":"2026-10-25T12:00:00Z","operator":"owner","action":"OTA_INSTALL","target_identity":"MAC:001122334455","durable_receipt_location":"drive-file-id:release-receipt","durable_receipt_readback_path":"receipt-copy.json"},
          "post_install":{"firmware_version":"0.16.1","release":self.runtime["release"],"engine":self.runtime["engine"],"build_witness":self.runtime["build_witness"],"firmware_sha256":h("post.bin"),"firmware_image_path":"post.bin","readback_evidence_ref":"https://drive.google.com/file/d/post","runtime_readback_path":"runtime.json","runtime_readback_sha256":h("runtime.json")},
          "acceptance":{"runtime":"PASS","physical_uv":"NOT_CHECKED","rollback":"NOT_NEEDED"},"evidence_refs":["https://github.com/example/repo/actions/runs/123","drive-file-id:release-receipt","drive-file-id:rollback"]}
        (self.root/"receipt.json").write_text(json.dumps(self.receipt,indent=2,sort_keys=True)+"\n")
        (self.root/"receipt-copy.json").write_bytes((self.root/"receipt.json").read_bytes())
    def tearDown(self):self.tmp.cleanup()
    def test_complete_exact_source_and_rollback_receipt_passes(self):
        self.assertEqual([],validate(self.receipt,self.root,self.root/"receipt.json"))
    def test_rollback_must_be_exact_prestate_and_durably_readable(self):
        self.receipt["rollback"]["sha256"]="0"*64
        self.assertTrue(validate(self.receipt,self.root,self.root/"receipt.json"))
    def test_candidate_postimage_hash_must_match(self):
        self.receipt["post_install"]["firmware_sha256"]="0"*64
        self.assertTrue(validate(self.receipt,self.root,self.root/"receipt.json"))
    def test_failed_candidate_requires_exact_verified_rollback_postimage(self):
        old={"version":"0.16.0","release":"installed-v6","engine":"aux-r3-v6","build_witness":"installed-witness"}
        old_path=self.root/"old-runtime.json";old_path.write_text(json.dumps(old))
        h=lambda n:hashlib.sha256((self.root/n).read_bytes()).hexdigest()
        self.receipt["installation"]["action"]="ROLLBACK_RESTORE"
        self.receipt["post_install"].update({"firmware_version":old["version"],"release":old["release"],"engine":old["engine"],"build_witness":old["build_witness"],"firmware_sha256":h("rollback.bin"),"firmware_image_path":"rollback.bin","runtime_readback_path":"old-runtime.json","runtime_readback_sha256":h("old-runtime.json")})
        self.receipt["acceptance"]={"runtime":"FAIL","physical_uv":"NOT_CHECKED","rollback":"RESTORED"}
        self._refresh_receipt_readback()
        self.assertEqual([],validate(self.receipt,self.root,self.root/"receipt.json"))
    def test_secret_fields_are_rejected(self):
        self.receipt["installation"]["access_token"]="redacted"
        self.assertTrue(validate(self.receipt,self.root,self.root/"receipt.json"))
    def test_secret_like_reference_is_rejected(self):
        self.receipt["evidence_refs"][0]="https://example.test/evidence?access_token=ghp_"+"x"*24
        self.assertTrue(validate(self.receipt,self.root,self.root/"receipt.json"))
    def _refresh_receipt_readback(self):
        p=self.root/"receipt.json";p.write_text(json.dumps(self.receipt,indent=2,sort_keys=True)+"\n");(self.root/"receipt-copy.json").write_bytes(p.read_bytes())
    def test_template_must_bind_source_and_candidate(self):
        fw=self.root/"candidate.bin";sha=hashlib.sha256(fw.read_bytes()).hexdigest()
        metrics={"github_sha":"a"*40,"github_run_id":"123","github_ref":"refs/heads/release","github_run_url":"https://github.com/example/repo/actions/runs/123","workflow_path":".github/workflows/build.yml","toolchain_python":"3.12","input_wled_commit":"x"}
        template={"schema":"hbnf-aux-release-receipt-v1","status":"INCOMPLETE","source":{"commit":"a"*40},
          "candidate":{"size":fw.stat().st_size,"sha256":sha},"build":{"run_id":"123","workflow_ref":"refs/heads/release","run_url":metrics["github_run_url"],"workflow_path":metrics["workflow_path"],"toolchain":{"python":"3.12"},"pinned_inputs":{"wled_commit":"x"}}}
        self.assertEqual([],validate_template(template,metrics,fw))
        template["source"]["commit"]="b"*40
        self.assertTrue(validate_template(template,metrics,fw))

if __name__=="__main__":unittest.main(verbosity=2)
