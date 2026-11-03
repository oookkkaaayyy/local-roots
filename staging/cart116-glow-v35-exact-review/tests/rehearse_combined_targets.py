#!/usr/bin/env python3
"""Offline-only, fail-closed nine-target staged apply/restore on fake filesystem.
No network calls, credentials, SSH, real device, production SQL or installer.
"""
from __future__ import annotations
import hashlib, json, shutil, tarfile, tempfile
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
SHA = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
FROZEN = {
  'owner_tar': 'd717ab5d5cd29c90a4ab1a4b9041b9d8ad21314d47916b8607a051f173cd15e9',
  'owner_transport_before': '51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a',
  'owner_transport_after': 'ae6fc45f833bce652aa4844501df4d79ed19c135fcf22507995ee772b29930d7',
  'matrix_main_old_sha1': '76247371aa2c0c1b70703b4a0f18b88b25218a15',
  'matrix_main_new_sha1': '8a929fbb792824dd0fca06d41caf2e1d5a35591f',
}
import subprocess
blob=lambda p: subprocess.check_output(['git','hash-object',str(p)],text=True).strip()
NEW_OWNER = ['.hbnf-package-version','.hbnf-payload.sha256',
             'hbnf-cart-features.js','hbnf-cart-local.js','hbnf-cart.html','hbnf-cart.js']
def extract_owner(target):
    with tarfile.open(BASE/'rollback/v120-owner-pwa-exact.tar.gz') as t:
        for m in t.getmembers():
            if not (m.name=='owner-pwa' or m.name.startswith('owner-pwa/')) or m.issym() or m.islnk():
                raise AssertionError('unsafe backup entry')
        t.extractall(target,filter='data')
def owner_regular(folder):
    return {p.name: SHA(p) for p in (folder/'owner-pwa').iterdir() if p.is_file()}
def legacy_script():
    txt=(BASE/'opal/hbnf-matrix-relay').read_text()
    start=txt.index('while :; do\n # ONE Controls-owned Opal relay process.')
    anchor='\n if ! snapshot; then sleep 5; continue; fi'
    end=txt.index(anchor, start)
    original=txt[:start]+'while :; do'+txt[end:]
    assert hashlib.sha1(b'blob '+str(len(original.encode())).encode()+b'\0'+original.encode()).hexdigest()==FROZEN['matrix_main_old_sha1']
    assert blob(BASE/'opal/hbnf-matrix-relay')==FROZEN['matrix_main_new_sha1']
    return original

def main():
    assert SHA(BASE/'rollback/v120-owner-pwa-exact.tar.gz')==FROZEN['owner_tar']
    assert SHA(BASE/'rollback/local-transport.js')==FROZEN['owner_transport_before']
    assert SHA(BASE/'candidate/mission-control-local/local-transport.js')==FROZEN['owner_transport_after']
    oldrelay=legacy_script()
    out=BASE/'rollback/hbnf-matrix-relay-original-source'
    out.write_text(oldrelay)
    assert blob(out)==FROZEN['matrix_main_old_sha1']
    criteria=[]
    with tempfile.TemporaryDirectory(prefix='cart116-nine-targets-') as tmp:
        root=Path(tmp);extract_owner(root)
        owner=root/'owner-pwa';mission=root/'mission-control-local';mission.mkdir();
        opal=root/'usr-lib';opal.mkdir()
        old_transport=mission/'local-transport.js';shutil.copy2(BASE/'rollback/local-transport.js',old_transport)
        mainfile=opal/'hbnf-matrix-relay';mainfile.write_text(oldrelay)
        helper=opal/'hbnf-glow-overlay-v1.sh'
        before=owner_regular(root);assert len(before)==21, len(before)
        assert SHA(old_transport)==FROZEN['owner_transport_before'];assert blob(mainfile)==FROZEN['matrix_main_old_sha1']
        assert not helper.exists()
        criteria.append('genuine_21_file_baseline_plus_external_and_relay_source_hashes')
        immutable=before.copy()
        # Validate all old bytes, not just filenames. The exact preserved tar is
        # the offline ground truth, not proof of a *fresh installed* Opal image.
        def preflight():
            assert owner_regular(root)==before, 'owner baseline drift'
            assert SHA(old_transport)==FROZEN['owner_transport_before'], 'transport baseline drift'
            assert blob(mainfile)==FROZEN['matrix_main_old_sha1'], 'main relay drift'
            assert not helper.exists(), 'unexpected overlay helper'
        preflight();criteria.append('preflight_exact_no_drift')
        # Prove staged preflight rejects drift before ANY candidate writes.
        changed=owner/'hbnf-cart-local.js';raw=changed.read_bytes();changed.write_bytes(raw+b'\nDRIFT\n')
        try:preflight()
        except AssertionError:criteria.append('drifted_target_rejected_before_mutation')
        else:raise AssertionError('drift guard incorrectly passed')
        changed.write_bytes(raw)
        preflight()
        # Simulated filesystem transaction; non-installing, independent of live targets.
        for name in NEW_OWNER:
            shutil.copy2(BASE/'candidate/owner-pwa'/name,owner/name)
        shutil.copy2(BASE/'candidate/mission-control-local/local-transport.js',old_transport)
        shutil.copy2(BASE/'opal/hbnf-matrix-relay',mainfile)
        shutil.copy2(BASE/'opal/hbnf-glow-overlay-v1.sh',helper)
        after=owner_regular(root)
        assert len(after)==21
        assert {n for n in after if after[n]!=before[n]}==set(NEW_OWNER)
        assert all(after[n]==SHA(BASE/'candidate/owner-pwa'/n) for n in NEW_OWNER)
        assert SHA(old_transport)==FROZEN['owner_transport_after'];assert blob(mainfile)==FROZEN['matrix_main_new_sha1']
        assert SHA(helper)==SHA(BASE/'opal/hbnf-glow-overlay-v1.sh')
        criteria.append('nine_target_staged_forward_hashes');criteria.append('unrelated_15_owner_files_unchanged')
        criteria.append('new_overlay_helper_still_hard_disabled') if 'HBNF_OVERLAY_V1_SOURCE_ADMITTED=false' in helper.read_text() else (_ for _ in ()).throw(AssertionError('unsafe enabled helper'))
        # Same exact offline source backup reverses all touched targets.
        shutil.rmtree(owner);extract_owner(root)
        shutil.copy2(BASE/'rollback/local-transport.js',old_transport)
        mainfile.write_text(oldrelay);helper.unlink()
        assert owner_regular(root)==immutable
        assert SHA(old_transport)==FROZEN['owner_transport_before'];assert blob(mainfile)==FROZEN['matrix_main_old_sha1']
        assert not helper.exists()
        criteria.append('nine_target_exact_reverse_and_helper_removed')
    down=(BASE/'migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.down.sql').read_text()
    assert 'unresolved_overlay_v1_challenge_requires_device_recovery' in down
    assert 'hbnf_cart_matrix_relay_' not in '\n'.join(line for line in down.splitlines() if line.lstrip().startswith('DROP'))
    criteria.append('sql_inverse_refuses_open_actuation_and_preserves_legacy_functions')
    assert len(criteria)==8
    report={'status':'OFFLINE_ONLY_PASS','criteria':criteria,'criteria_passed':len(criteria),
            'native_postgresql':'NOT_RUN','native_deno':'NOT_RUN','installed_target':'NOT_CONTACTED',
            'live_sql_or_edge_mutation':False,'opals_modified':False,'actuator_commands':0,
            'owner_authorization':None,'nativeOverlayAdmitted':False,'auto_live':False}
    print(json.dumps(report,sort_keys=True,indent=2))
    (BASE/'tests/rehearse_combined_receipt.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n')
if __name__=='__main__':main()
