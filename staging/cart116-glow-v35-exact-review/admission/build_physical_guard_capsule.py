#!/usr/bin/env python3
"""Deterministic REVIEW_ONLY successor from pinned nonblocking Cart #116 source.
Never imports actual Cart private receipt, never writes to provider/device.
Usage: python build_physical_guard_capsule.py <original-review.zip> <local-modification-root> <output.zip>
"""
from pathlib import Path
import hashlib,io,json,sys,zipfile
BASE_SHA='71e6331f16d69c9379a932da6d3bd07bc1f497408d5508d8d82d8dc94b256af4'
OWNER_ROLLBACK='d717ab5d5cd29c90a4ab1a4b9041b9d8ad21314d47916b8607a051f173cd15e9'
sha=lambda b:hashlib.sha256(b).hexdigest()
base,local,out=map(Path,sys.argv[1:4]);assert sha(base.read_bytes())==BASE_SHA
with zipfile.ZipFile(base) as z:content={name:z.read(name) for name in z.namelist()}
assert sha(content['rollback/owner-v120-exact.tar.gz'])==OWNER_ROLLBACK
replacements={
 'candidate/backend/matrix-overlay-safe-review.mjs':local/'candidate/backend/matrix-overlay-safe-review.mjs',
 'candidate/backend/glow-overlay-v1-handler.mjs':local/'candidate/backend/glow-overlay-v1-handler.mjs',
 'candidate/opal/usr/lib/hbnf-glow-overlay-v1.sh':local/'candidate/opal/usr/lib/hbnf-glow-overlay-v1.sh',
 'candidate/opal/usr/libexec/hbnf-matrix-relay':local/'candidate/opal/usr/libexec/hbnf-matrix-relay',
 'candidate/opal/relay-startup-origin.mjs':local/'candidate/opal/relay-startup-origin.mjs',
 'evidence/trackA-physical-guard-changed-only.log':local/'admission/CAPSULE.CHANGED-ONLY.log',
 'tests/trackA-physical-geometry-change.test.mjs':local/'tests/trackA-physical-geometry-change.test.mjs',
 'evidence/startup-review.REVIEW_ONLY.md':local/'admission/CAPSULE.STARTUP-REVIEW.md',
}
old=content.pop('candidate/opal/usr/lib/hbnf-matrix-relay')
assert old==replacements['candidate/opal/usr/libexec/hbnf-matrix-relay'].read_bytes()
for key,p in replacements.items():content[key]=p.read_bytes()
content['README-REVIEW_ONLY.txt']+=(b'\nNOV03: Exact historical procd main target is /usr/libexec/hbnf-matrix-relay, not /usr/lib/hbnf-matrix-relay. No live main preimage known.\n'
  b'AUX 24 configured outputs = 22 RGB DDP GPIO16 + OFF PWM GPIO25/26; no PWM writes.\n'
  b'Matrix ps=-1/FX142 remains native renderer NOT PROVEN. NO INSTALL/ADMISSION.\n')
# This source-only ZIP never claims installed identities, permits no auto_live,
# and includes the same controlling manifest as the branch.
content['MANIFEST.PENDING.json']=(local/'admission/CAPSULE.SNAPSHOT.PENDING.json').read_bytes()
content.pop('SHA256SUMS.txt',None)
content['SHA256SUMS.txt']=(''.join(f'{sha(content[k])}  {k}\n' for k in sorted(content))).encode()
# Fixed metadata makes repeated builds byte-identical for the same source input.
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for key in sorted(content):
  item=zipfile.ZipInfo(key,date_time=(2026,11,3,19,55,0));item.compress_type=zipfile.ZIP_DEFLATED
  item.external_attr=(0o100644<<16);z.writestr(item,content[key],compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 lines=z.read('SHA256SUMS.txt').decode().splitlines()
 assert len(lines)==len(z.namelist())-1
 for line in lines:
  d,n=line.split('  ',1);assert sha(z.read(n))==d
 assert len([x for x in z.namelist() if x.startswith('candidate/opal/usr/') or x.startswith('candidate/opal/www/')])==9
 assert sha(z.read('rollback/owner-v120-exact.tar.gz'))==OWNER_ROLLBACK
 print(json.dumps({'archive':out.name,'size':out.stat().st_size,'sha256':sha(out.read_bytes()),'entries':len(z.namelist()),'hashes':len(lines),'nineTargets':9}))
