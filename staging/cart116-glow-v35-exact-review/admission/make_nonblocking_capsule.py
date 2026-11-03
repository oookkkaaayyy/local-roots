#!/usr/bin/env python3
"""Surgical supersession of CART116 REVIEW_ONLY capsule; no installer or device operations."""
import hashlib,json,pathlib,zipfile,io,tarfile,datetime,os
base=pathlib.Path('/mnt/data')
old=base/'CART116-Controls-OverlayV1-Combined-REVIEW_ONLY-20261103.zip'
new=base/'CART116-Controls-OverlayV1-Combined-nonblocking-REVIEW_ONLY-20261103.zip'
latency=base/'cart116_native_qualification/latency_fix'
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(old.read_bytes())=='3f6e793e5e734d8f1f0bedd12a7dd635a81364b1ea9633b76ad64ace5b791b8a'
replacements={
 'candidate/opal/usr/lib/hbnf-glow-overlay-v1.sh':(latency/'hbnf-glow-overlay-v1.sh').read_bytes(),
 'candidate/opal/usr/lib/hbnf-matrix-relay':(latency/'hbnf-matrix-relay').read_bytes(),
}
extra={
 'tests/opal_nonblocking_native.test.mjs':(latency/'opal_nonblocking_native.test.mjs').read_bytes(),
 'evidence/native-pg17-deno-run-receipt.json':(json.dumps({
  'schema':'cart116-native-provider-run-receipt-v1',
  'pg17':{'run_id':41694282141,'run_status':'failure due to *following* Deno dependency resolver step', 'actual_PG17_step':'success','verified_claim':'native PostgreSQL 17.11 role, race, TTL, replay, Owner/fence and guarded rollback'},
  'deno':{'run_id':41694531461,'run_status':'success','native_8_tests':'8/8 pass','actual_deno_check':'candidate-source/matrix-relay.ts PASS', 'previous_pg_step':'skipped intentionally'},
  'nonblocking_opal':{'native_busybox_ash_tests':'10/10 PASS', 'native_ash_source_gate':False},
  'admission':{'nativeOverlayAdmitted':False,'auto_live':False,'device_mutated':False,'rollback_ready_only_if_live_preimage_uploaded':False},
  'source_head':'6d63724d9fd30325a1cdc6427fd3466b6abf4b95'
 },indent=2,sort_keys=True)+'\n').encode(),
}
for k,v in replacements.items():
 assert len(v)>1000 and b'HBNF_OVERLAY_V1_SOURCE_ADMITTED=false' in replacements['candidate/opal/usr/lib/hbnf-glow-overlay-v1.sh']
assert sha(replacements['candidate/opal/usr/lib/hbnf-matrix-relay'])=='e5a8ee13a9044ddb35697efc548731d4099480437f60d8600d7451baf0a65f96'
assert sha(replacements['candidate/opal/usr/lib/hbnf-glow-overlay-v1.sh'])=='03c936a1affb74dda502011da61ce0a9cd9197e1b6e551ccab9b404bff14a8a4'

with zipfile.ZipFile(old) as zin:
 assert zin.testzip() is None
 data={n:zin.read(n) for n in zin.namelist()}
 prior_names=set(data)
 old_manifest=json.loads(data['MANIFEST.PENDING.json'])
 assert prior_names.isdisjoint(set(extra))
 for k,v in replacements.items():
  assert sha(data[k])!=sha(v)
  data[k]=v
 data.update(extra)
 manifest=old_manifest
 manifest['source'] = {**manifest.get('source',{}),'controls_branch_head':'6d63724d9fd30325a1cdc6427fd3466b6abf4b95', 'change_receipt':'nonblocking single-loop Glow TTL/Owner preemption source-only correction'}
 manifest['admission']['blocks']=[s for s in manifest['admission']['blocks'] if 'native PostgreSQL' not in s and 'Native Deno Edge' not in s and 'Foreground single-shot' not in s]
 manifest['admission']['blocks'] += [
  'Native PostgreSQL 17.11 race/permissions PASS run 41694282141 and Deno 2.9.8 check/tests PASS run 41694531461, but no isolated full firmware/iPad physical acceptance',
  'Nonblocking native BusyBox ash tests 10/10 PASS; actual Opal loop/Owner priority latency remains physically unverified',
  'Installed Opal main preimage SHA256/permissions/active service not captured; current device baseline, MATRIX ps60 fx and AUX 24 vs 22 remain unknown/unresolved',
  'Exact compiled Edge provider postimage SHA/download-back and manifest-bound one-time approval absent'
 ]
 manifest['admission']['apply_allowed']=False
 manifest['admission']['nativeOverlayAdmitted']=False
 manifest['admission']['auto_live']=False
 manifest['admission']['owner_authorization']=None
 manifest['admission']['transaction_id']=None
 manifest['admission']['edge_compiled_provider_sha256']=None
 manifest['admission']['new_sql_applied']=False
 manifest['admission']['device_mutation_allowed']=False
 manifest['admission']['opality']='NO_INSTALLED_OPAL_MAIN_PROOF'
 manifest['native_qualification']={
  'pg17_run_41694282141':'PASS exact PG step native DB17.11',
  'deno_run_41694531461':'PASS native Deno 2.9.8 8/8 + deno check',
  'nonblocking_busybox_ash':'PASS 10/10 hermetic; no device contact',
  'physical_field_acceptance':False,
 }
 manifest['files']={k:{'bytes':len(v),'sha256':sha(v)} for k,v in sorted(data.items()) if k not in ('MANIFEST.PENDING.json','SHA256SUMS.txt','README-REVIEW_ONLY.txt')}
 data['MANIFEST.PENDING.json']=(json.dumps(manifest,sort_keys=True,indent=2)+'\n').encode()
 data['README-REVIEW_ONLY.txt']=(
  'CART116 Nov03 Controls Track A exact combined nonblocking capsule. PENDING/NO-GO.\n'
  'Supersedes previous 937490-byte reviewer capsule ONLY for the two Opal relay scripts.\n'
  'New Git head: 6d63724d9fd30325a1cdc6427fd3466b6abf4b95.\n'
  'Native PG17 run 41694282141 exact DB test step PASS. Deno 2 run 41694531461 SUCCESS 8/8 + typecheck.\n'
  'New Opal hermetic native BusyBox test 10/10 PASS. No physical device acceptance.\n'
  'Both source admission gates STILL FALSE; no installer, no rollback authorization, no production changes.\n'
  'Device installed Opal relay preimage/current Matrix ps60 effect/AUX 24 vs 22 unknown.\n'
  'Use only with later immutable, same-manifest, freshly admitted and owner-authorized release.\n'
 ).encode()
 data['SHA256SUMS.txt']=(''.join(f'{sha(data[k])}  {k}\n' for k in sorted(data) if k!='SHA256SUMS.txt')).encode()
 def info(n):
  zi=zipfile.ZipInfo(n,date_time=(2026,11,3,12,0,0))
  zi.compress_type=zipfile.ZIP_DEFLATED
  zi.external_attr=(0o100600<<16)
  zi.create_system=3
  return zi
 with zipfile.ZipFile(new,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as zout:
  for k in sorted(data):zout.writestr(info(k),data[k])
with zipfile.ZipFile(new) as z:
 assert z.testzip() is None
 sums=z.read('SHA256SUMS.txt').decode().splitlines()
 for row in sums:
  hashval,key=row.split('  ',1);assert sha(z.read(key))==hashval,(key,hashval)
 original=zipfile.ZipFile(old)
 changed=[n for n in original.namelist() if original.read(n)!=z.read(n)]
 assert set(changed)<=set(replacements)|{'MANIFEST.PENDING.json','README-REVIEW_ONLY.txt','SHA256SUMS.txt'}
 targetnames=[n for n in z.namelist() if n.startswith('candidate/opal/')]
 assert len(targetnames)==9
 assert sha(z.read('rollback/owner-v120-exact.tar.gz'))=='d717ab5d5cd29c90a4ab1a4b9041b9d8ad21314d47916b8607a051f173cd15e9'
 assert sha(z.read('rollback/external-local-transport-original.js'))=='51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a'
 assert sha(z.read('rollback/opal-original-relay-source'))=='bfadd048c73a8f88929223ce32cc32e971c83ac2ef26bc33c48a8233f8756cc2'
 print(json.dumps({'file':str(new),'bytes':new.stat().st_size,'sha256':sha(new.read_bytes()),'entry_count':len(z.namelist()),'verified_sums':len(sums),'nine_target_count':len(targetnames),'prior_members_changed':changed,'new_members':sorted(set(z.namelist())-prior_names),'status':'NO_GO_PENDING'},indent=2))
