#!/usr/bin/env python3
"""Deterministic successor builder. Never connects to devices or provider.

Requires the already separately durable/download-back verified Nov3 physical-
guard capsule. Retains all rollback files byte-for-byte; replaces only the
incorrect historical executable target and introduces the *new* service,
procd, no-argument credential provisioner, transaction, tests and receipts.
"""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import argparse, hashlib, json

PIN='a9ceea5442a2dac558638f2fde1ba3d40b3eacfc5ca6d5bbd415deb344eb2c49'
SHA=lambda b: hashlib.sha256(b).hexdigest()
FIXTIME=(2026,11,3,12,0,0)

def target_to_repo(member):
    p='candidate/opal/'
    assert member.startswith(p)
    rel=member[len(p):]
    if rel=='usr/libexec/hbnf-cart-glow-bridge':return 'opal/new-service/usr/libexec/hbnf-cart-glow-bridge'
    if rel=='usr/libexec/hbnf-cart-glow-provision':return 'opal/new-service/usr/libexec/hbnf-cart-glow-provision'
    if rel=='etc/init.d/hbnf-cart-glow-bridge':return 'opal/new-service/etc/init.d/hbnf-cart-glow-bridge'
    if rel=='usr/lib/hbnf-glow-overlay-v1.sh':return 'opal/hbnf-glow-overlay-v1.sh'
    assert rel.startswith('www/mission-control-local/')
    return 'opal/owner-v1201-7target/mission-control-local/'+rel[len('www/mission-control-local/'):]

def make(base,root,out):
    raw=base.read_bytes()
    assert SHA(raw)==PIN,'predecessor ZIP drift: abort'
    with ZipFile(base) as z:
        assert z.testzip() is None
        files={p:z.read(p) for p in z.namelist() if not p.endswith('/')}
    # Never carry legacy REPLACEMENT target into the new service review.
    files.pop('candidate/opal/usr/libexec/hbnf-matrix-relay',None)
    files.pop('candidate/opal/relay-startup-origin.mjs',None)
    files.pop('MANIFEST.PENDING.json',None)
    files.pop('README-REVIEW_ONLY.txt',None)
    files.pop('SHA256SUMS.txt',None)
    targets=(root/'release/TARGETS.PENDING.tsv').read_bytes()
    parsed=[]
    for line in targets.decode('utf-8').strip().split('\n'):
        t,member,expected_sha,pre,mode=line.split('\t')
        assert t=='/'+member.replace('candidate/opal/','')
        candidate=(root/target_to_repo(member)).read_bytes()
        assert SHA(candidate)==expected_sha,(t,SHA(candidate),expected_sha)
        files[member]=candidate
        parsed.append(t)
    assert len(parsed)==len(set(parsed))==11
    assert sum(t.startswith('/www/') for t in parsed)==7
    # No config value is ever a member of the candidate archive.
    assert 'candidate/opal/etc/hbnf-cart-glow-bridge.conf' not in files
    extras={
     'TARGETS.tsv':'release/TARGETS.PENDING.tsv',
     'release/cart116-opal-transaction.sh':'release/cart116-opal-transaction.sh',
     'release/README-MANAGED-SERVICE.md':'release/README-MANAGED-SERVICE.md',
     'release/APPROVAL.PENDING.example':'release/APPROVAL.PENDING.example',
     'release/MANIFEST.SNAPSHOT.PENDING.json':'release/MANIFEST.SNAPSHOT.PENDING.json',
     'release/PROVIDER_PREIMAGE_READBACK.json':'release/PROVIDER_PREIMAGE_READBACK.json',
     'tests/new_bridge_ci_contract.test.mjs':'tests/new_bridge_ci_contract.test.mjs',
     'tests/test_new_bridge_transaction.py':'tests/test_new_bridge_transaction.py',
     'evidence/NEW_SERVICE_CHANGED_ONLY.log':'release/NEW_SERVICE_CHANGED_ONLY.log'
    }
    for dest,src in extras.items():files[dest]=(root/src).read_bytes()
    assert SHA(files['rollback/owner-v120-exact.tar.gz'])=='d717ab5d5cd29c90a4ab1a4b9041b9d8ad21314d47916b8607a051f173cd15e9'
    assert SHA(files['rollback/external-local-transport-original.js'])=='51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a'
    for n in files:
        if 'relay.conf' in n and not n.endswith('conf.example'):raise ValueError('credential leak')
    summary=(
      'CART #116 NEW single managed outbound Glow bridge - SOURCE REVIEW ONLY.\n'
      '11 packaged Opal files + 1 separately root-provisioned credential target.\n'
      'No OWNER WebSocket mutation, no legacy full-state paired writer, no UV/PWM.\n'
      'The correct old /usr/libexec/hbnf-matrix-relay and init are ABSENT.\n'
      'New /usr/libexec/hbnf-cart-glow-bridge is a DIFFERENT service.\n'
      'Admission stays FALSE, matrix physical ps=-1 prevents native actuation.\n'
      'See release/README-MANAGED-SERVICE.md, TARGETS.tsv and controlling\n'
      'GitHub branch admission/ADMISSION.PENDING.json before any installation.\n'
    )
    files['README-REVIEW_ONLY.txt']=summary.encode()
    sums=''.join(SHA(data)+'  '+name+'\n' for name,data in sorted(files.items()))
    files['SHA256SUMS.txt']=sums.encode()
    with ZipFile(out,'w',compression=ZIP_DEFLATED,compresslevel=9,strict_timestamps=False) as z:
        for name,data in sorted(files.items()):
            zi=ZipInfo(name,FIXTIME)
            zi.external_attr=(0o100644<<16)
            zi.compress_type=ZIP_DEFLATED
            z.writestr(zi,data,compress_type=ZIP_DEFLATED,compresslevel=9)
    with ZipFile(out) as z:
        assert z.testzip() is None
        for row in z.read('SHA256SUMS.txt').decode().splitlines():
            h,n=row.split('  ',1)
            assert SHA(z.read(n))==h,n
        assert len([x for x in z.namelist() if x.startswith('candidate/opal/')])==11
    return {'sha256':SHA(out.read_bytes()),'bytes':out.stat().st_size,'entries':len(files),'verified_embedded_hashes':len(files)-1,'targets':11,'generated_config_target':1}

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--base',type=Path,required=True)
    ap.add_argument('--source-root',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    args=ap.parse_args()
    print(json.dumps(make(args.base,args.source_root,args.out),indent=2))
