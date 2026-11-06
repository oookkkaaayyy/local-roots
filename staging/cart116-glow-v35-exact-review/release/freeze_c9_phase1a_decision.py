#!/usr/bin/env python3
"""Freeze one canonical, unsigned C9 Phase1A owner-decision document.

This produces no authorization. It refuses unless source, final same-manifest
state, candidate ZIP, rollback bytes and fresh installed preimages agree.
"""
import argparse, hashlib, json, pathlib, subprocess, sys, zipfile
from c9_phase1a_approval import verify_contract

STAGE = pathlib.Path(__file__).resolve().parents[1]
SCOPE = "C9_PHASE1A_OWNER_PWA_SIX_FILES_ONLY"
ROLLBACK = "d717ab5d5cd29c90a4ab1a4b9041b9d8ad21314d47916b8607a051f173cd15e9"
sha = lambda b: hashlib.sha256(b).hexdigest()

def main():
 p=argparse.ArgumentParser()
 p.add_argument("--manifest",type=pathlib.Path,required=True)
 p.add_argument("--candidate-zip",type=pathlib.Path,required=True)
 p.add_argument("--candidate-download-back",type=pathlib.Path,required=True)
 p.add_argument("--candidate-drive-id",required=True)
 p.add_argument("--rollback",type=pathlib.Path,required=True)
 p.add_argument("--installed-preimages",type=pathlib.Path,required=True)
 p.add_argument("--source-root",type=pathlib.Path,required=True)
 p.add_argument("--output",type=pathlib.Path,required=True)
 a=p.parse_args()
 mb=a.manifest.read_bytes();m=json.loads(mb);tx=m["transaction"]
 c=m["c9_phase1a_opal_transaction_candidate_20261105"]; admission=c.get("phase1a_admission",{})
 if m["state"] not in ("PENDING_NOT_INSTALLABLE", "PENDING_NOT_INSTALLABLE_NO_LIVE_MUTATION"):
  raise ValueError("unexpected original manifest state")
 if tx.get("source_gate_change_admitted") is not False or tx.get("trusted_admission_receipt") is not None:
  raise ValueError("global source admission must remain closed")
 if not tx.get("manifest_specific_one_time_id") or admission.get("transaction_id") != tx["manifest_specific_one_time_id"]:
  raise ValueError("same-manifest transaction ID missing or mismatched")
 if admission.get("scope") != SCOPE or admission.get("status") != "OWNER_SIGNATURE_REQUIRED":
  raise ValueError("C9 scope is not frozen for owner signature")
 if not tx.get("c9_approval_key_fingerprint") or not tx.get("c9_approval_key_der_sha256"):
  raise ValueError("owner approval key not pinned in original Controls manifest")
 if tx.get("independent_release_backup_download_verified") is not True or sha(a.rollback.read_bytes()) != ROLLBACK:
  raise ValueError("exact independently retained 21-file rollback unavailable")
 zbytes=a.candidate_zip.read_bytes(); rowsbytes=None
 if not a.candidate_drive_id or len(a.candidate_drive_id)<20 or a.candidate_download_back.read_bytes()!=zbytes:
  raise ValueError("independent private Drive candidate download-back mismatch")
 with zipfile.ZipFile(a.candidate_zip) as z:
  if z.testzip() is not None: raise ValueError("candidate ZIP CRC failure")
  rowsbytes=z.read("six.tsv")
  if z.read("candidate/ADMISSION.PENDING.json") != mb: raise ValueError("candidate review snapshot differs from final original manifest")
  script=z.read("release/c9-six-file-opal.CANDIDATE.sh")
  source_script=(a.source_root/"staging/cart116-glow-v35-exact-review/release/c9-six-file-opal.CANDIDATE.sh").read_bytes()
  if script != source_script: raise ValueError("candidate installer differs from reviewed source")
 installed=json.loads(a.installed_preimages.read_bytes())
 targets=[]
 for line in rowsbytes.decode().splitlines():
  dest,name,old,new,mode=line.split("\t")
  if installed.get(dest) != old: raise ValueError("fresh installed preimage mismatch: "+dest)
  with zipfile.ZipFile(a.candidate_zip) as z:
   if sha(z.read("candidate/"+name)) != new: raise ValueError("candidate postimage mismatch: "+dest)
  targets.append({"target":dest,"name":name,"preimage_sha256":old,"postimage_sha256":new,"mode":mode})
 if len(targets)!=6: raise ValueError("expected exactly six targets")
 source_head=subprocess.check_output(["git","-C",str(a.source_root),"rev-parse","HEAD"],text=True).strip()
 script_path=a.source_root/"staging/cart116-glow-v35-exact-review/release/c9-six-file-opal.CANDIDATE.sh"
 limits=admission.get("recovery_limitations",{})
 if limits.get("ubifs_process_reentry_restore")!="PASS_ACTUAL_ROUTER" or limits.get("abrupt_power_loss")!="NOT_TESTED" or limits.get("partial_active_file_restore")!="NOT_FAULT_INJECTED":
  raise ValueError("recovery limitations must be explicit and accurate")
 doc={"schema":"hbnf-c9-phase1a-owner-release-v1","scope":SCOPE,"operation":"install-six-owner-pwa-files-only",
  "transaction_id":tx["manifest_specific_one_time_id"],"source_branch":m["exact_source"]["branch"],
  "source_commit":c["source_candidate_commit"],"verifier_source_commit":source_head,
  "verifier_script_sha256":sha(script_path.read_bytes()),"manifest_sha256":sha(mb),
  "review_snapshot_manifest_sha256":sha(mb),"six_tsv_sha256":sha(rowsbytes),
  "candidate_zip_sha256":sha(zbytes),"candidate_drive_id":a.candidate_drive_id,
  "rollback_sha256":ROLLBACK,"targets":targets,
  "approval_key_fingerprint":tx["c9_approval_key_fingerprint"],
  "approval_key_der_sha256":tx["c9_approval_key_der_sha256"],
  "original_r6_preservation":"NO_MATRIX_OR_AUX_FIRMWARE_OR_CONFIGURATION_WRITES",
  "excluded_live_scopes":["C8_EDGE_SQL","SCORING","UV","AUX_FIRMWARE","MATRIX_FIRMWARE","ROUTER_NETWORKING"],
  "recovery_limitations":limits}
 verify_contract(doc,mb,rowsbytes,zbytes,a.rollback.read_bytes(),installed,tx["c9_approval_key_fingerprint"])
 out=json.dumps(doc,indent=2,sort_keys=True)+"\n"
 a.output.write_text(out,encoding="utf-8")
 print(json.dumps({"decision":str(a.output),"bytes":len(out.encode()),"sha256":sha(out.encode()),
  "transaction_id":doc["transaction_id"],"candidate_zip_sha256":doc["candidate_zip_sha256"],
  "manifest_sha256":doc["manifest_sha256"],"status":"UNSIGNED_OWNER_REVIEW_REQUIRED"},sort_keys=True))

if __name__=="__main__":
 try: main()
 except (OSError,ValueError,KeyError,subprocess.CalledProcessError,zipfile.BadZipFile) as e:
  print("C9_DECISION_FREEZE_REFUSED:",str(e),file=sys.stderr);sys.exit(2)
