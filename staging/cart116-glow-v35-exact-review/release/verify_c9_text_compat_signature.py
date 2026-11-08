#!/usr/bin/env python3
"""Verify the fresh exact owner signature and stage the one-file Opal capsule."""
import argparse,hashlib,json,pathlib,sys,zipfile,subprocess
from c9_phase1a_approval import verify_native,make_capsule,ssh_public_der
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--decision',type=pathlib.Path,required=True);p.add_argument('--signature',type=pathlib.Path,required=True);p.add_argument('--public-key',type=pathlib.Path,required=True);p.add_argument('--candidate-zip',type=pathlib.Path,required=True);p.add_argument('--download-back',type=pathlib.Path,required=True);p.add_argument('--rollback',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--drive-id',required=True);p.add_argument('--source-root',type=pathlib.Path,required=True);a=p.parse_args()
 doc=json.loads(a.decision.read_bytes());zbytes=a.candidate_zip.read_bytes();mbytes=None
 head=subprocess.check_output(['git','-C',str(a.source_root),'rev-parse','HEAD'],text=True).strip()
 script=a.source_root/'staging/cart116-glow-v35-exact-review/release/c9-six-file-opal.CANDIDATE.sh'
 if doc['verifier_source_commit']!=head or doc['verifier_script_sha256']!=sha(script.read_bytes()):raise ValueError('verifier source commit or installer bytes mismatch')
 if a.download_back.read_bytes()!=zbytes or len(a.drive_id)<20:raise ValueError('candidate Drive download-back mismatch')
 if sha(zbytes)!=doc['candidate_zip_sha256'] or doc['candidate_drive_id']!=a.drive_id:raise ValueError('candidate identity differs from frozen decision')
 if sha(a.rollback.read_bytes())!=doc['rollback_sha256']:raise ValueError('exact target rollback mismatch')
 with zipfile.ZipFile(a.candidate_zip) as z:
  if z.testzip() is not None:raise ValueError('candidate ZIP integrity error')
  mbytes=z.read('ADMISSION.PENDING.json'); rows=z.read('target.tsv');receipt=json.loads(z.read('REVIEW_RECEIPT.json'))
  if sha(z.read('rollback/hbnf-cart-features.js'))!=doc['rollback_sha256']:raise ValueError('packaged rollback member mismatch')
  candidate_sha=sha(z.read('candidate/hbnf-cart-features.js'))
 m=json.loads(mbytes);tx=m['transaction'];r=m['c9_text_compat_followup_20261108'];target=r['target']
 fp=subprocess.check_output(['ssh-keygen','-lf',str(a.public_key),'-E','sha256'],text=True).split()[1]
 if sha(ssh_public_der(a.public_key))!=tx['c9_approval_key_der_sha256'] or fp!=tx['c9_approval_key_fingerprint']:raise ValueError('signing key differs from the pinned Controls owner key')
 if tx['source_gate_change_admitted'] is not False or tx['trusted_admission_receipt'] is not None:raise ValueError('broad gate must remain closed')
 if doc['transaction_id']!=tx['manifest_specific_one_time_id'] or doc['transaction_id']!=r['transaction_id']:raise ValueError('transaction mismatch')
 if doc['scope']!=r['scope'] or doc['source_commit']!=r['source_commit'] or doc['manifest_sha256']!=sha(mbytes):raise ValueError('scope/source/manifest mismatch')
 if doc['approval_key_der_sha256']!=tx['c9_approval_key_der_sha256'] or doc['approval_key_fingerprint']!=tx['c9_approval_key_fingerprint']:raise ValueError('key pin mismatch')
 if doc['target_tsv_sha256']!=sha(rows) or rows.decode().splitlines()!=[target['path']+'\t'+target['name']+'\t'+target['preimage_sha256']+'\t'+target['postimage_sha256']+'\t644']:raise ValueError('target binding mismatch')
 if doc['rollback_sha256']!=target['rollback_sha256'] or doc['rollback_archive_sha256']!=target['rollback_archive_sha256']:raise ValueError('rollback binding mismatch')
 if doc['targets']!=[{'target':target['path'],'name':target['name'],'preimage_sha256':target['preimage_sha256'],'postimage_sha256':target['postimage_sha256'],'mode':'644'}]:raise ValueError('signed target record mismatch')
 if candidate_sha!=target['postimage_sha256']:raise ValueError('candidate feature bytes mismatch')
 if receipt['transaction_id']!=doc['transaction_id'] or receipt['source_gate_change_admitted'] is not False:raise ValueError('review receipt mismatch')
 verify_native(a.decision,a.signature,a.public_key,'oookkkaaayyy')
 a.output.mkdir(mode=0o700,parents=True,exist_ok=False);make_capsule(a.decision,a.signature,a.public_key,a.output)
 with zipfile.ZipFile(a.candidate_zip) as z:(a.output/'hbnf-cart-features.js').write_bytes(z.read('candidate/hbnf-cart-features.js'))
 (a.output/'ADMISSION.PENDING.json').write_bytes(mbytes);(a.output/'target.tsv').write_bytes(rows);(a.output/'C9_CANDIDATE.zip').write_bytes(zbytes)
 print('C9_SAFARI12_EXACT_OWNER_SIGNATURE_AND_ONE_FILE_CONTRACT_VERIFIED')
if __name__=='__main__':
 try:main()
 except (OSError,ValueError,KeyError,zipfile.BadZipFile) as e:print('C9_TEXT_COMPAT_ADMISSION_REFUSED:',e,file=sys.stderr);sys.exit(2)
