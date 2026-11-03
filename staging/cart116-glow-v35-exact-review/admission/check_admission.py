#!/usr/bin/env python3
"""Source/archive integrity check; non-actuating and ALWAYS fail closed without trusted admission.

No SSH, HTTP, Supabase, WLED, filesystem install, or credential use.
Exit 0 = fully admitted (currently impossible from the PENDING record).
Exit 42 = intact review candidate but material admission blockers.
Exit 43 = corrupted/altered source or manifest.
"""
import argparse, hashlib, json, pathlib, sys, zipfile

p=argparse.ArgumentParser()
p.add_argument('--manifest',default='/mnt/data/CART116-Controls-OverlayV1-Admission-PENDING-20261103.json')
p.add_argument('--archive',default='/mnt/data/CART116-Controls-OverlayV1-Combined-REVIEW_ONLY-20261103.zip')
a=p.parse_args()
try:
 m=json.loads(pathlib.Path(a.manifest).read_text())
 archive=pathlib.Path(a.archive).read_bytes()
 sha=lambda b:hashlib.sha256(b).hexdigest()
 if sha(archive)!=m['candidate_archive']['sha256']:raise ValueError('archive hash changed')
 with zipfile.ZipFile(a.archive) as z:
  if z.testzip() is not None:raise ValueError('ZIP CRC changed')
  targets=m['nine_target_opal']
  if len(targets)!=9 or len({x['target'] for x in targets})!=9:raise ValueError('target count/identity changed')
  for target in targets:
   body=z.read(target['candidate_zip_member'])
   if len(body)!=target['candidate_bytes'] or sha(body)!=target['candidate_sha256']:
    raise ValueError('candidate byte hash changed: '+target['target'])
  if sha(z.read('rollback/owner-v120-exact.tar.gz'))!='d717ab5d5cd29c90a4ab1a4b9041b9d8ad21314d47916b8607a051f173cd15e9':
   raise ValueError('original rollback changed')
except (OSError,ValueError,KeyError,zipfile.BadZipFile) as exc:
 print('FAIL_INTEGRITY:',str(exc));sys.exit(43)

# The manifest is only supporting evidence. User-editable "PASS" values alone
# can NEVER grant device installation. Real admission must be authenticated,
# provider-owned and bound to a one-time record not presented by this checker.
unresolved=[]
for target in m['nine_target_opal']:
 if target['fresh_authenticated_installed_preimage_sha256'] is None:
  unresolved.append('missing_current_preimage:'+target['target'])
 if not target['preimage_download_back_verified']:
  unresolved.append('missing_durable_target_download_back:'+target['target'])
for key,value in m['hard_gates'].items():
 if key!='native_pg_and_deno' and value not in ('PASS','VERIFIED'):
  unresolved.append(key)
for field in ['manifest_specific_one_time_id','owner_approval_for_this_exact_postimage','trusted_admission_receipt']:
 if m['transaction'].get(field) is None:unresolved.append('missing_'+field)
if (not m['candidate_archive'].get('installable',False) or
    not m['transaction']['source_gate_change_admitted'] or
    m['edge']['candidate_source']['compiled_provider_candidate_sha256'] is None or
    not m['edge']['candidate_source']['independent_candidate_download_back']):
 unresolved.append('candidate_not_admitted')
if unresolved:
 print('FAIL_CLOSED_REVIEW_SOURCE_ONLY: archive integrity PASS; admission BLOCKED')
 for why in sorted(set(unresolved)):print('BLOCK',why)
 sys.exit(42)
print('FAIL_CLOSED: local evidence cannot independently attest one-time provider authorization')
sys.exit(42)
