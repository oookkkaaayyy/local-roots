import importlib.util, pathlib, tempfile, unittest, zipfile, json
SCRIPT=pathlib.Path(__file__).parents[1]/"release"/"build_c8_admission_capsule.py"
spec=importlib.util.spec_from_file_location("c8_capsule",SCRIPT)
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)

class C8CapsuleTests(unittest.TestCase):
 def test_exact_current_edge_sql_and_four_opal_targets_only(self):
  files=builder.source_files()
  self.assertEqual(len([n for n in files if n.startswith("edge/candidate/")]),15)
  self.assertEqual(len([n for n in files if n.startswith("edge/rollback-v35/")]),10)
  self.assertEqual(len([n for n in files if n.startswith("candidate/opal/")]),4)
  self.assertFalse(any(n.startswith("candidate/opal/www/") for n in files))
  info=json.loads(files["C8-PACKAGE.json"])
  self.assertEqual(info["c9_baseline"]["owner_marker"],"1.0.21-c9pair1")
  self.assertEqual(info["c9_baseline"]["pwa_targets_in_candidate"],0)
  self.assertFalse(info["live_install_authorized"])
  self.assertFalse(info["matrix_firmware_or_parity_uv_or_aux_firmware_included"])
 def test_capsule_is_byte_deterministic_and_internal_hashes_validate(self):
  with tempfile.TemporaryDirectory() as td:
   a=pathlib.Path(td)/"a.zip";b=pathlib.Path(td)/"b.zip"
   builder.build(a);builder.build(b);self.assertEqual(a.read_bytes(),b.read_bytes())
   with zipfile.ZipFile(a) as z:
    self.assertIsNone(z.testzip())
    self.assertFalse(any(n.startswith("candidate/opal/www/") for n in z.namelist()))
    for row in z.read("SHA256SUMS.txt").decode().splitlines():
     digest,name=row.split("  ",1);self.assertEqual(builder.sha(z.read(name)),digest)
 def test_source_drift_refuses_package(self):
  name="sql/20261103_cart_glow_overlay_v1_REVIEW_ONLY.sql";old=builder.EXPECTED_SQL[name]
  try:
   builder.EXPECTED_SQL[name]=(old[0],"0"*40)
   with self.assertRaisesRegex(ValueError,"SQL blob drift"):builder.source_files()
  finally:builder.EXPECTED_SQL[name]=old

if __name__=="__main__":unittest.main()
