"""Focused cryptographic/contract tests; signer created only in temp TEST ONLY fixtures."""
import base64, hashlib, importlib.util, io, json, os, pathlib, shutil, subprocess, sys, tempfile, unittest, zipfile

HERE = pathlib.Path(__file__).resolve().parents[1]
MODPATH = HERE / "release/c9_phase1a_approval.py"
spec = importlib.util.spec_from_file_location("c9approval", MODPATH)
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
SCRIPT = HERE / "release/c9-six-file-opal.CANDIDATE.sh"
NAMES = [
 ("/www/mission-control-local/local-transport.js", "local-transport.js"),
 ("/www/mission-control-local/owner-pwa/hbnf-cart-local.js", "hbnf-cart-local.js"),
 ("/www/mission-control-local/owner-pwa/hbnf-cart.js", "hbnf-cart.js"),
 ("/www/mission-control-local/owner-pwa/hbnf-cart.html", "hbnf-cart.html"),
 ("/www/mission-control-local/owner-pwa/.hbnf-payload.sha256", ".hbnf-payload.sha256"),
 ("/www/mission-control-local/owner-pwa/.hbnf-package-version", ".hbnf-package-version"),
]
sha = lambda b: hashlib.sha256(b).hexdigest()

class AdmissionTests(unittest.TestCase):
 def setUp(self):
  self.tmp = tempfile.TemporaryDirectory(prefix="c9-approval-test-"); self.d = pathlib.Path(self.tmp.name)
  self.priv = self.d/"TEST_ONLY_signer"; self.pub = self.d/"TEST_ONLY_signer.pub"
  subprocess.run(["ssh-keygen","-q","-t","ed25519","-N","","-f",str(self.priv),"-C","TEST ONLY NEVER LIVE"],check=True)
  self.docp=self.d/"decision.json"; self.sigp=self.d/"decision.json.sig"
  self.txb=self.d/"six.tsv"; rows=[]; self.old={}; self.new={}
  for dest,name in NAMES:
   old=("old:"+name).encode(); new=("new:"+name).encode(); self.old[dest]=sha(old); self.new[dest]=sha(new)
   rows.append("\t".join((dest,name,self.old[dest],self.new[dest],"644")))
  self.tsv=("\n".join(rows)+"\n").encode(); self.txb.write_bytes(self.tsv)
  self.zipb=b"TEST ONLY CANDIDATE"; self.rollback=b"TEST ONLY ROLLBACK"
  self.tx="c9-phase1a-"+"a"*32
  fp=subprocess.check_output(["ssh-keygen","-lf",str(self.pub),"-E","sha256"],text=True).split()[1]
  self.man={"exact_source":{"branch":"review/cart116-glow-canonical-intent-20261103","head_qualified_native":"1"*40},
            "c9_phase1a_opal_transaction_candidate_20261105":{"source_candidate_commit":"2"*40,
             "independent_original_21_file_rollback_sha256":sha(self.rollback),
             "phase1a_admission":{"scope":mod.SCOPE,"transaction_id":self.tx,"status":"OWNER_SIGNATURE_REQUIRED",
              "rollback_sha256":sha(self.rollback)}},
            "opal_c9_current_authenticated_inventory_20261105":{"six_current_preimage_sha256_by_path":dict(self.old)},
            "dora_c9_paired_owner_release_20261105":{"changed_targets":[{"target":dest,"candidate_sha256":self.new[dest]} for dest,_ in NAMES]},
            "transaction":{"source_gate_change_admitted":False,"manifest_specific_one_time_id":self.tx,
             "c9_approval_key_fingerprint":fp,"c9_approval_key_der_sha256":sha(mod.ssh_public_der(self.pub)),
             "independent_release_backup_download_verified":True,
             "independent_release_backup_evidence":{"source":"#116 comment 6674667836","drive_id":"1K98BkzHGzKjmmt_fWBDS30jc4SbE3_tB",
              "bytes":849344,"sha256":sha(self.rollback)}}}
  self.manb=json.dumps(self.man,sort_keys=True,separators=(",",":")).encode()
  installer_hash=sha(SCRIPT.read_bytes())
  zbuf=io.BytesIO()
  with zipfile.ZipFile(zbuf,"w",zipfile.ZIP_DEFLATED) as z:
   z.writestr("REVIEW_RECEIPT.json",json.dumps({"disposition":"REVIEW_ONLY_NOT_INSTALLABLE_NO_ADMISSION_RECEIPT",
    "manifest_sha256":sha(self.manb),"six_targets_sha256":sha(self.tsv),"source_gate_admitted":False}))
   z.writestr("candidate/ADMISSION.PENDING.json",self.manb)
   for dest,name in NAMES: z.writestr("candidate/"+name, ("new:"+name).encode())
   z.writestr("release/c9-six-file-opal-preflight.REVIEW_ONLY.sh",b"review")
   z.writestr("release/c9-six-file-opal.CANDIDATE.sh",SCRIPT.read_bytes())
   z.writestr("six.tsv",self.tsv)
  self.zipb=zbuf.getvalue()
  self.installed=dict(self.old)
  self.doc={"schema":"hbnf-c9-phase1a-owner-release-v1","scope":mod.SCOPE,"operation":"install-six-owner-pwa-files-only",
   "manifest_sha256":sha(self.manb),"six_tsv_sha256":sha(self.tsv),"candidate_zip_sha256":sha(self.zipb),
   "rollback_sha256":sha(self.rollback),"transaction_id":self.tx,
   "source_branch":self.man["exact_source"]["branch"],"source_commit":self.man["c9_phase1a_opal_transaction_candidate_20261105"]["source_candidate_commit"],
   "approval_key_fingerprint":fp,"approval_key_der_sha256":sha(mod.ssh_public_der(self.pub)),"targets":mod.rows(self.tsv),
   "verifier_script_sha256":installer_hash,"review_snapshot_manifest_sha256":sha(self.manb),
   "original_r6_preservation":"NO_MATRIX_OR_AUX_FIRMWARE_OR_CONFIGURATION_WRITES",
   "excluded_live_scopes":["C8_EDGE_SQL","SCORING","UV","AUX_FIRMWARE","MATRIX_FIRMWARE","ROUTER_NETWORKING"],
   "recovery_limitations":{"ubifs_process_reentry_restore":"PASS_ACTUAL_ROUTER","abrupt_power_loss":"NOT_TESTED",
    "partial_active_file_restore":"NOT_FAULT_INJECTED","owner_accepted_bounded_risk":True}}
  self.docb=json.dumps(self.doc,sort_keys=True,separators=(",",":")).encode(); self.docp.write_bytes(self.docb)
  subprocess.run(["ssh-keygen","-Y","sign","-f",str(self.priv),"-n",mod.NAMESPACE,str(self.docp)],check=True,stdout=subprocess.DEVNULL)
  self.orig=mod.EXPECTED_ROLLBACK; mod.EXPECTED_ROLLBACK=sha(self.rollback)
 def tearDown(self):
  mod.EXPECTED_ROLLBACK=self.orig; self.tmp.cleanup()
 def check(self,doc=None,manifest=None,tsv=None,zipb=None,rollback=None,installed=None,fp=None):
  mod.verify_contract(doc or self.doc,manifest or self.manb,tsv or self.tsv,zipb or self.zipb,
                      rollback or self.rollback,installed or self.installed,fp or self.doc["approval_key_fingerprint"])
 def test_valid_test_only_signature_and_contract(self):
  self.check(); mod.verify_native(self.docp,self.sigp,self.pub,"test-only")
  out=self.d/"capsule";mod.make_capsule(self.docp,self.sigp,self.pub,out)
  self.assertEqual((out/"C9_APPROVAL_PUBKEY.der").stat().st_size,44)
  pub=base64.b64decode((out/"C9_APPROVAL_USIGN_PUBKEY").read_text().splitlines()[1],validate=True)
  sig=base64.b64decode((out/"C9_APPROVAL_USIGN_SIGNATURE").read_text().splitlines()[1],validate=True)
  self.assertEqual(len(pub),42);self.assertEqual(len(sig),74)
  self.assertEqual(pub[:2],b"Ed");self.assertEqual(sig[:2],b"Ed")
  self.assertEqual(pub[2:10],sig[2:10])
  self.assertEqual(pub[10:],mod.ssh_public_der(self.pub)[-32:])
  self.assertEqual(sig[10:],mod.parse_sshsig(self.sigp)[1])
 def test_unsigned_forged_signature_rejected(self):
  bad=self.d/"bad.sig";bad.write_text("self populated PASS\n")
  with self.assertRaises(ValueError): mod.parse_sshsig(bad)
  altered=self.d/"altered.json";altered.write_bytes(self.docb+b" ")
  with self.assertRaises(ValueError): mod.verify_native(altered,self.sigp,self.pub,"test-only")
 def test_wrong_manifest_digest_rejected(self):
  d=dict(self.doc);d["manifest_sha256"]="0"*64
  with self.assertRaises(ValueError): self.check(doc=d)
 def test_wrong_transaction_rejected(self):
  d=dict(self.doc);d["transaction_id"]="other-transaction"
  with self.assertRaises(ValueError): self.check(doc=d)
 def test_wrong_source_scope_and_commit_rejected(self):
  for field,value in (("scope","C8"),("source_commit","0"*40)):
   d=dict(self.doc);d[field]=value
   with self.assertRaises(ValueError): self.check(doc=d)
 def test_altered_candidate_and_wrong_six_digest_rejected(self):
  with self.assertRaises(ValueError): self.check(zipb=self.zipb+b"altered")
  d=dict(self.doc);d["six_tsv_sha256"]="0"*64
  with self.assertRaises(ValueError): self.check(doc=d)
 def test_wrong_rollback_and_installed_preimage_rejected(self):
  with self.assertRaises(ValueError): self.check(rollback=self.rollback+b"altered")
  live=dict(self.installed);live[next(iter(live))]="f"*64
  with self.assertRaises(ValueError): self.check(installed=live)
 def test_candidate_downloadback_must_be_byte_equal(self):
  c=self.d/"candidate.zip";b=self.d/"download-back.zip";c.write_bytes(self.zipb);b.write_bytes(self.zipb)
  self.assertEqual(mod.verify_downloadback(c,b,"1"*25),sha(self.zipb))
  b.write_bytes(self.zipb+b"changed")
  with self.assertRaises(ValueError):mod.verify_downloadback(c,b,"1"*25)
 def test_changed_postimage_and_missing_independent_approval_rejected(self):
  d=dict(self.doc);d["targets"]=[dict(x) for x in self.doc["targets"]];d["targets"][0]["postimage_sha256"]="0"*64
  with self.assertRaises(ValueError): self.check(doc=d)
  m=json.loads(self.manb);m["transaction"]["c9_approval_key_fingerprint"]=None
  mb=json.dumps(m,sort_keys=True,separators=(",",":")).encode()
  with self.assertRaises(ValueError): self.check(manifest=mb)
 def test_pending_or_broad_admission_rejected(self):
  for tx in ({"source_gate_change_admitted":False,"manifest_specific_one_time_id":None},
             {"source_gate_change_admitted":True,"manifest_specific_one_time_id":"c9-test-transaction-0001"}):
   m=dict(self.man);m["transaction"]=tx;mb=json.dumps(m,sort_keys=True,separators=(",",":")).encode()
   with self.assertRaises(ValueError): self.check(manifest=mb)
 def test_unpinned_wrong_signer_rejected_by_native_verifier(self):
  other=self.d/"other";subprocess.run(["ssh-keygen","-q","-t","ed25519","-N","","-f",str(other)],check=True)
  with self.assertRaises(ValueError): mod.verify_native(self.docp,self.sigp,pathlib.Path(str(other)+".pub"),"wrong")
 def test_test_signers_cannot_become_live_roots_of_trust(self):
  script=SCRIPT.read_text()
  pinned="ccbe5481c51750f93a4fb79724d97516bc6fe1a9812cb0068d53c285414605a9"
  self.assertNotEqual(sha(mod.ssh_public_der(self.pub)),pinned)
  self.assertIn("C9_OWNER_KEY_DER_SHA256="+pinned,script)
  self.assertIn('[ "$(docfield \'@.approval_key_der_sha256\')" = "$C9_OWNER_KEY_DER_SHA256" ]',script)
  self.assertIn('[ "$(jsonfield \'@.transaction.c9_approval_key_der_sha256\')" = "$C9_OWNER_KEY_DER_SHA256" ]',script)
 def test_replay_identifier_refused_by_consumed_registry(self):
  registry=self.d/"registry";registry.mkdir();(registry/"consumed").write_text("burned")
  self.assertTrue((registry/"consumed").exists())
  # Installer's existing apply guard refuses any extant transaction registry.
  text=SCRIPT.read_text();self.assertIn('[ ! -e "$REGISTRY" ] && [ ! -L "$REGISTRY" ] || exit 87',text)
 def test_missing_verifier_tool_fails_before_any_target_write(self):
  with tempfile.TemporaryDirectory(prefix="cart116-c9-rehearsal-admission-",dir="/tmp") as td:
   root=pathlib.Path(td); cand=root/"candidate";cand.mkdir(); rows=[]; before={}
   for dest,name in NAMES:
    target=root/dest.lstrip("/");target.parent.mkdir(parents=True,exist_ok=True)
    old=("pre:"+name).encode();new=("post:"+name).encode();target.write_bytes(old);before[target]=old
    (cand/name).write_bytes(new);rows.append("\t".join((dest,name,sha(old),sha(new),"644")))
   tsv=root/"six.tsv";tsv.write_text("\n".join(rows)+"\n")
   for f in ("ADMISSION.PENDING.json","C9_RELEASE_APPROVAL.json","C9_APPROVAL_MESSAGE.bin","C9_APPROVAL_SIGNATURE.raw","C9_APPROVAL_PUBKEY.der","C9_CANDIDATE.zip"):
    (cand/f).write_bytes(b"fixture")
   bindir=root/"bin";bindir.mkdir()
   for cmd in "ls df cp mv mkdir cmp awk sort cut wc chmod chown sync rm sed id".split():
    path=shutil.which(cmd)
    if path: (bindir/cmd).symlink_to(path)
   (bindir/"jsonfilter").write_text("#!/bin/sh\nexit 0\n");(bindir/"jsonfilter").chmod(0o755)
   (bindir/"sha256sum").write_text("#!/bin/sh\nexec /usr/bin/shasum -a 256 \"$@\"\n");(bindir/"sha256sum").chmod(0o755)
   env=dict(os.environ,PATH=str(bindir))
   p=subprocess.run(["/bin/sh",str(SCRIPT),"admission-check",str(root),str(tsv),str(cand),"c9-test-missing-openssl-0001"],env=env,capture_output=True,text=True)
   self.assertNotEqual(p.returncode,0);self.assertIn("MISSING_ADMISSION_VERIFIER:openssl",p.stderr)
   self.assertEqual({p:p.read_bytes() for p in before},before)
 def test_partial_swap_and_third_party_drift_guards_remain(self):
  p=subprocess.run([sys.executable,str(HERE/"tests/test_c9_opal_interrupted_recovery.py")],capture_output=True,text=True)
  self.assertEqual(p.returncode,0,p.stdout+p.stderr)
  p=subprocess.run([sys.executable,str(HERE/"tests/test_c9_opal_candidate_transaction.py")],capture_output=True,text=True)
  self.assertEqual(p.returncode,0,p.stdout+p.stderr)

if __name__=="__main__": unittest.main(verbosity=2)
