import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import unittest
import zipfile

REPO = Path(__file__).resolve().parents[3]
STAGE = Path(__file__).resolve().parents[1]
BUILDER = STAGE / "release/build_c9_phase1a_review.py"
MANIFEST = STAGE / "admission/ADMISSION.PENDING.json"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


class C9TextDiagnosticReviewPackageTest(unittest.TestCase):
    def test_exact_six_target_candidate_and_current_c9_rollback_are_review_only(self):
        outputs = [Path("/tmp") / f"cart116-c9-review-test-{os.getpid()}-{time.time_ns()}-{i}.zip" for i in range(2)]
        try:
            for output in outputs:
                subprocess.run(
                    ["python3", str(BUILDER), "--text-diagnostic-review", str(output)],
                    cwd=REPO,
                    check=True,
                    stdout=subprocess.DEVNULL,
                )
            package_bytes = outputs[0].read_bytes()
            self.assertEqual(package_bytes, outputs[1].read_bytes())
            manifest_bytes = MANIFEST.read_bytes()
            manifest = json.loads(manifest_bytes)
            release = manifest["dora_c9_paired_owner_release_20261105"]
            expected = {item["target"]: item for item in release["changed_targets"]}

            with zipfile.ZipFile(outputs[0]) as archive:
                self.assertIsNone(archive.testzip())
                names = set(archive.namelist())
                self.assertEqual(len(names), 17)
                self.assertEqual(archive.read("candidate/ADMISSION.PENDING.json"), manifest_bytes)
                receipt = json.loads(archive.read("REVIEW_RECEIPT.json"))
                self.assertEqual(receipt["disposition"], "REVIEW_ONLY_NOT_INSTALLABLE_NO_ADMISSION_RECEIPT")
                self.assertFalse(receipt["manifest_candidate_postimages_match"])
                self.assertFalse(receipt["source_gate_admitted"])
                self.assertIsNone(receipt["one_time_transaction_id"])
                self.assertTrue(receipt["base_transaction_consumed"])
                self.assertEqual(receipt["manifest_sha256"], sha(manifest_bytes))
                self.assertEqual(receipt["matching_full_21_file_rollback"]["sha256"], manifest["c9_phase1a_opal_transaction_candidate_20261105"]["independent_original_21_file_rollback_sha256"])

                rows = [line.split("\t") for line in archive.read("six.tsv").decode("ascii").splitlines()]
                self.assertEqual(len(rows), 6)
                for target, rel, preimage, postimage, mode in rows:
                    item = expected[target]
                    self.assertEqual(mode, "644")
                    self.assertEqual(preimage, item["candidate_sha256"])
                    self.assertEqual(sha(archive.read("rollback/" + rel)), preimage)
                    self.assertEqual(sha(archive.read("candidate/" + rel)), postimage)

                local = archive.read("candidate/hbnf-cart-local.js").decode()
                cart = archive.read("candidate/hbnf-cart.js").decode()
                html = archive.read("candidate/hbnf-cart.html").decode()
                transport_sha = sha(archive.read("candidate/local-transport.js"))
                local_sha = sha(archive.read("candidate/hbnf-cart-local.js"))
                cart_sha = sha(archive.read("candidate/hbnf-cart.js"))
                self.assertIn("local-transport.js?v=" + transport_sha[:16], local)
                self.assertIn("hbnf-cart-local.js?v=" + local_sha[:16], cart)
                self.assertIn("hbnf-cart.js?v=c9textdiag-" + cart_sha[:16], html)
                self.assertIn("local-connect-started", local)
                self.assertIn("matching-readback", archive.read("candidate/local-transport.js").decode())
                self.assertFalse(receipt["contains_owner_approval"])
                self.assertNotIn("C9 private signing", archive.read("REVIEW_RECEIPT.json").decode())
        finally:
            for output in outputs:
                output.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
