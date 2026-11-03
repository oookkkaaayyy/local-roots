import json, os, pathlib, subprocess, sys, tempfile, unittest

HERE=pathlib.Path(os.environ.get('CART116_ARTIFACT_DIR','/mnt/data'))
MAN=HERE/'CART116-Controls-OverlayV1-Admission-PENDING-20261103.json'
CAP=HERE/'CART116-Controls-OverlayV1-Combined-REVIEW_ONLY-20261103.zip'
CHECK=HERE/'cart116_native_qualification/check_admission.py'

class ManifestQualification(unittest.TestCase):
 def check(self, manifest=MAN, archive=CAP):
  return subprocess.run([sys.executable,str(CHECK),'--manifest',str(manifest),'--archive',str(archive)],capture_output=True,text=True)
 def test_all_nine_targets_grounded(self):
  m=json.loads(MAN.read_text());self.assertEqual(len(m['nine_target_opal']),9)
  self.assertEqual(len(set(x['target'] for x in m['nine_target_opal'])),9)
  self.assertEqual(sum(1 for x in m['nine_target_opal'] if x['fresh_authenticated_installed_preimage_sha256'] is None),9)
 def test_intact_package_still_no_go(self):
  x=self.check();self.assertEqual(x.returncode,42,x.stderr);self.assertIn('candidate_not_admitted',x.stdout)
 def test_false_gates_not_accepted_as_device_success(self):
  with tempfile.TemporaryDirectory() as d:
   m=json.loads(MAN.read_text());m['hard_gates']={k:'PASS' for k in m['hard_gates']};m['transaction']['owner_approval_for_this_exact_postimage']='forged';m['candidate_archive']['installable']=True
   x=pathlib.Path(d)/'man.json';x.write_text(json.dumps(m));p=self.check(x);self.assertEqual(p.returncode,42,p.stdout)
 def test_changed_candidate_hash_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   m=json.loads(MAN.read_text());m['nine_target_opal'][0]['candidate_sha256']='0'*64
   x=pathlib.Path(d)/'man.json';x.write_text(json.dumps(m));p=self.check(x);self.assertEqual(p.returncode,43,p.stdout)
 def test_zip_tamper_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   x=pathlib.Path(d)/'tampered.zip';b=bytearray(CAP.read_bytes());b[-60]^=1;x.write_bytes(b)
   p=self.check(archive=x);self.assertEqual(p.returncode,43,p.stdout)

if __name__=='__main__':unittest.main()
