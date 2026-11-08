#!/usr/bin/env python3
"""Build the exact, one-file Safari 12 C9 candidate and unsigned decision."""
import argparse, hashlib, json, pathlib, subprocess, zipfile

STAGE=pathlib.Path(__file__).resolve().parents[1]
REPO=STAGE.parents[2]
MANIFEST=STAGE/'admission/ADMISSION.PENDING.json'
TARGET='/www/mission-control-local/owner-pwa/hbnf-cart-features.js'
REL='hbnf-cart-features.js'
OLD='db591fec335897c8448a5571799b4a6ce2b59889b1afeff8a08206532b470d4c'
NEW='6dba73caea3046217ee2d44ccabd04b7f601fa3b33bc924f686743cb175169cb'
ROLLBACK='d717ab5d5cd29c90a4ab1a4b9041b9d8ad21314d47916b8607a051f173cd15e9'
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser(); p.add_argument('--rollback',type=pathlib.Path,required=True);p.add_argument('--output-dir',type=pathlib.Path,required=True);p.add_argument('--candidate-drive-id',default='PENDING_DRIVE_UPLOAD');p.add_argument('--verifier-source-commit',required=True);a=p.parse_args()
 mbytes=MANIFEST.read_bytes();m=json.loads(mbytes);a.output_dir.mkdir(parents=True,exist_ok=True)
 rec=m['c9_text_compat_followup_20261108'];tx=m['transaction']
 if m['state']!='PENDING_NOT_INSTALLABLE_NO_LIVE_MUTATION' or tx['source_gate_change_admitted'] is not False or tx['trusted_admission_receipt'] is not None: raise ValueError('controlling source gate must remain closed')
 if tx['manifest_specific_one_time_id']!=rec['transaction_id'] or rec['status']!='OWNER_SIGNATURE_REQUIRED':raise ValueError('one-file manifest transaction mismatch')
 rb=a.rollback.read_bytes()
 if sha(rb)!=OLD or len(rb)!=53719:raise ValueError('exact current installed rollback mismatch')
 candidate=(STAGE/'opal/owner-v1201-7target/owner-pwa'/REL).read_bytes()
 if sha(candidate)!=NEW:raise ValueError('candidate postimage mismatch')
 rows=(TARGET+'\t'+REL+'\t'+OLD+'\t'+NEW+'\t644\n').encode('ascii')
 installer=(STAGE/'release/c9-six-file-opal.CANDIDATE.sh').read_bytes()
 entries={'ADMISSION.PENDING.json':mbytes,'target.tsv':rows,'candidate/'+REL:candidate,'rollback/'+REL:rb,'release/c9-six-file-opal.CANDIDATE.sh':installer,'release/build_c9_text_compat.py':pathlib.Path(__file__).read_bytes(),'release/verify_c9_text_compat_signature.py':(STAGE/'release/verify_c9_text_compat_signature.py').read_bytes(),'release/c9_phase1a_approval.py':(STAGE/'release/c9_phase1a_approval.py').read_bytes()}
 receipt={'schema':'cart116-c9-safari12-one-file-candidate-v1','disposition':'REVIEW_ONLY_OWNER_SIGNATURE_REQUIRED','transaction_id':rec['transaction_id'],'source_gate_change_admitted':False,'target':TARGET,'preimage_sha256':OLD,'postimage_sha256':NEW,'rollback_archive_sha256':ROLLBACK,'no_live_mutation':True}
 entries['REVIEW_RECEIPT.json']=(json.dumps(receipt,sort_keys=True,separators=(',',':'))+'\n').encode()
 zpath=a.output_dir/'C9_SAFARI12_TEXT_COMPAT_CANDIDATE.zip'
 with zipfile.ZipFile(zpath,'w',compression=zipfile.ZIP_STORED,allowZip64=False) as z:
  for n in sorted(entries):
   i=zipfile.ZipInfo(n,(2020,1,1,0,0,0));i.create_system=3;i.external_attr=((0o755 if n.endswith('.sh') else 0o644)<<16);z.writestr(i,entries[n])
 with zipfile.ZipFile(zpath) as z:
  if z.testzip() is not None or set(z.namelist())!=set(entries) or any(z.read(k)!=v for k,v in entries.items()):raise ValueError('ZIP byte/member readback mismatch')
 installer_sha=sha(installer)
 decision={'schema':'hbnf-c9-phase1a-owner-release-v1','scope':rec['scope'],'operation':'install-one-owner-pwa-text-compatibility-file-only','transaction_id':rec['transaction_id'],'source_branch':m['exact_source']['branch'],'source_commit':rec['source_commit'],'verifier_source_commit':a.verifier_source_commit,'verifier_script_sha256':installer_sha,'manifest_sha256':sha(mbytes),'review_snapshot_manifest_sha256':sha(mbytes),'target_tsv_sha256':sha(rows),'candidate_zip_sha256':sha(zpath.read_bytes()),'candidate_drive_id':a.candidate_drive_id,'rollback_sha256':OLD,'rollback_archive_sha256':ROLLBACK,'targets':[{'target':TARGET,'name':REL,'preimage_sha256':OLD,'postimage_sha256':NEW,'mode':'644'}],'approval_key_fingerprint':tx['c9_approval_key_fingerprint'],'approval_key_der_sha256':tx['c9_approval_key_der_sha256'],'original_r6_preservation':'NO_MATRIX_OR_AUX_FIRMWARE_OR_CONFIGURATION_WRITES','excluded_live_scopes':['C8_EDGE_SQL','SCORING','UV','AUX_FIRMWARE','MATRIX_FIRMWARE','ROUTER_NETWORKING'],'recovery_limitations':rec['recovery_limitations'],'status':'UNSIGNED_OWNER_REVIEW_REQUIRED'}
 dpath=a.output_dir/'C9_RELEASE_APPROVAL.json';dpath.write_text(json.dumps(decision,indent=2,sort_keys=True)+'\n')
 (a.output_dir/'target.tsv').write_bytes(rows);(a.output_dir/('rollback-'+REL)).write_bytes(rb);(a.output_dir/'ADMISSION.PENDING.json').write_bytes(mbytes)
 print(json.dumps({'candidate':str(zpath),'candidate_bytes':zpath.stat().st_size,'candidate_zip_sha256':sha(zpath.read_bytes()),'decision':str(dpath),'decision_sha256':sha(dpath.read_bytes()),'manifest_sha256':sha(mbytes),'target_tsv_sha256':sha(rows),'postimage_sha256':NEW,'rollback_sha256':OLD,'transaction_id':rec['transaction_id'],'status':decision['status']},sort_keys=True))
if __name__=='__main__':main()
