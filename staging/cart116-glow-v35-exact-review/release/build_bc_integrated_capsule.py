#!/usr/bin/env python3
"""Surgical deterministic B/C successor; no device/provider mutation or secrets.

Pins already independently Drive-downloadback-verified managed-service capsule;
changes exact accepted B import, R6 ps=-1 preimage guard plus Owner-text race
fail-closed gate; preserves 11 target paths, service, installer and rollbacks.
"""
from pathlib import Path
from zipfile import ZipFile,ZipInfo,ZIP_DEFLATED
import hashlib,argparse,json
SOURCE_SHA='0639a7c68628db88879a73772ec34433d60de0aff4f7fe28644559aff1a21c29'
OWNER_ORIG='d717ab5d5cd29c90a4ab1a4b9041b9d8ad21314d47916b8607a051f173cd15e9'
TRANS_ORIG='51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a'
SHA=lambda data:hashlib.sha256(data).hexdigest()
TIME=(2026,11,3,14,0,0)
def main(base,root,out):
    assert SHA(base.read_bytes())==SOURCE_SHA,'source archive changed: STOP'
    with ZipFile(base) as z:
        assert z.testzip() is None
        f={n:z.read(n) for n in z.namelist() if not n.endswith('/')}
    assert SHA(f['rollback/owner-v120-exact.tar.gz'])==OWNER_ORIG
    assert SHA(f['rollback/external-local-transport-original.js'])==TRANS_ORIG
    def rep(dst,src): f[dst]=(root/src).read_bytes()
    target_src={
      '/usr/lib/hbnf-glow-overlay-v1.sh':'opal/hbnf-glow-overlay-v1.sh',
      '/etc/init.d/hbnf-cart-glow-bridge':'opal/new-service/etc/init.d/hbnf-cart-glow-bridge',
      '/www/mission-control-local/owner-pwa/hbnf-cart-local.js':'opal/owner-v1201-7target/owner-pwa/hbnf-cart-local.js',
      '/www/mission-control-local/owner-pwa/.hbnf-payload.sha256':'opal/owner-v1201-7target/owner-pwa/.hbnf-payload.sha256'
    }
    targets=[]
    for line in (root/'release/TARGETS.PENDING.tsv').read_text().strip().splitlines():
        target,member,s,old,mode=line.split('\t')
        assert member.startswith('candidate/opal/') and target=='/'+member[len('candidate/opal/'):]
        assert mode in ('600','644','700','755')
        if target in target_src: rep(member,target_src[target])
        assert SHA(f[member])==s,(target,SHA(f[member]),s)
        targets.append(target)
    assert len(targets)==len(set(targets))==11 and len([t for t in targets if t.startswith('/www/')])==7
    assert '/etc/hbnf-cart-glow-bridge.conf' not in targets
    assert not any('bridge.conf' in x and 'example' not in x for x in f), 'secret-bearing config in archive'
    rep('candidate/backend/matrix-overlay-safe-review.mjs','candidate-source/matrix-overlay-safe-review.mjs')
    updates={
       'TARGETS.tsv':'release/TARGETS.PENDING.tsv',
       'release/MANIFEST.SNAPSHOT.PENDING.json':'release/MANIFEST.SNAPSHOT.PENDING.json',
       'release/README-MANAGED-SERVICE.md':'release/README-MANAGED-SERVICE.md',
       'release/BC_SOURCE_INTEGRATION_20261103.md':'release/BC_SOURCE_INTEGRATION_20261103.md',
       'tests/new_bridge_ci_contract.test.mjs':'tests/new_bridge_ci_contract.test.mjs',
       'tests/trackA-bc-final-integration.test.mjs':'tests/trackA-bc-final-integration.test.mjs',
       'tests/trackA-physical-geometry-change.test.mjs':'tests/trackA-physical-geometry-change.test.mjs',
       'release/build_bc_integrated_capsule.py':'release/build_bc_integrated_capsule.py',
       'evidence/BC_CHANGED_ONLY.log':'release/BC_CHANGED_ONLY.log'
    }
    for dst,src in updates.items():rep(dst,src)
    # This is the unchanged actual service install transaction; other target
    # hashes are enforced by the updated exact TSV in its preflight.
    assert f['release/cart116-opal-transaction.sh']==(root/'release/cart116-opal-transaction.sh').read_bytes()
    assert SHA(f['rollback/owner-v120-exact.tar.gz'])==OWNER_ORIG
    assert SHA(f['rollback/external-local-transport-original.js'])==TRANS_ORIG
    f['README-REVIEW_ONLY.txt']=(
      'CONTROLS #116 B/C source-integrated managed Glow bridge REVIEW_ONLY.\n'
      'Single NEW managed service, same 11 Opal targets and 7 Owner files.\n'
      'B: exact Safari12 transport cache pin. C: ps=-1 FX142 source qualified.\n'
      'Installed R6 Owner TEXT priority race is UNSAFE: original R6 can be\n'
      'preempted by a new Glow scoreboard; priority-patch BIN NOT built.\n'
      'HBNF Matrix brightness last observed 0, scoreboard would be black.\n'
      'All source/service/native priority admission flags remain FALSE.\n'
      'No deploy, install, firmware/UV action or live owner approval.\n'
      'See release/BC_SOURCE_INTEGRATION_20261103.md, TARGETS.tsv and\n'
      'same GitHub branch admission/ADMISSION.PENDING.json before release.\n'
    ).encode()
    f.pop('SHA256SUMS.txt',None)
    f['SHA256SUMS.txt']=''.join(f'{SHA(data)}  {n}\n' for n,data in sorted(f.items())).encode()
    with ZipFile(out,'w',compression=ZIP_DEFLATED,compresslevel=9,strict_timestamps=False) as z:
        for name,data in sorted(f.items()):
            i=ZipInfo(name,TIME);i.external_attr=0o100644<<16;i.compress_type=ZIP_DEFLATED
            z.writestr(i,data,compress_type=ZIP_DEFLATED,compresslevel=9)
    with ZipFile(out) as z:
        assert z.testzip() is None
        sums=z.read('SHA256SUMS.txt').decode().splitlines()
        assert len(sums)==len(f)-1
        for line in sums:
            h,name=line.split('  ',1);assert SHA(z.read(name))==h,name
        assert len([x for x in z.namelist() if x.startswith('candidate/opal/')])==11
    return {'archive_sha256':SHA(out.read_bytes()),'archive_bytes':out.stat().st_size,'total_entries':len(f),'internal_hashes_verified':len(f)-1,'opal_targets':11,'owner_targets':7,'firmware_patched':False,'live_install':False}
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--base',required=True,type=Path);ap.add_argument('--source-root',required=True,type=Path);ap.add_argument('--out',required=True,type=Path)
    a=ap.parse_args();print(json.dumps(main(a.base,a.source_root,a.out),indent=2))
