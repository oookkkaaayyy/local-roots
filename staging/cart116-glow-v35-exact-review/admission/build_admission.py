#!/usr/bin/env python3
"""Generate a deterministic, explicitly non-admitted Cart116 nine-target release manifest.

This is NOT an installer, authorizer, actuator, or live acceptance oracle.
Only ground candidate and historic rollback bytes that actually exist.
"""
import hashlib, io, json, os, pathlib, tarfile, zipfile
from datetime import datetime, timezone

ROOT=pathlib.Path(os.environ.get('CART116_ARTIFACT_DIR','/mnt/data'))
CAPSULE=ROOT/'CART116-Controls-OverlayV1-Combined-REVIEW_ONLY-20261103.zip'
OUT=ROOT/'CART116-Controls-OverlayV1-Admission-PENDING-20261103.json'
KNOWN_SHA='3f6e793e5e734d8f1f0bedd12a7dd635a81364b1ea9633b76ad64ace5b791b8a'
SHA=lambda b: hashlib.sha256(b).hexdigest()
assert CAPSULE.is_file() and SHA(CAPSULE.read_bytes()) == KNOWN_SHA, 'capsule changed'
with zipfile.ZipFile(CAPSULE) as z:
    assert z.testzip() is None
    target_keys=sorted(x for x in z.namelist() if x.startswith('candidate/opal/') and not x.endswith('/'))
    assert len(target_keys)==9, len(target_keys)
    original=z.read('rollback/owner-v120-exact.tar.gz')
    assert SHA(original)=='d717ab5d5cd29c90a4ab1a4b9041b9d8ad21314d47916b8607a051f173cd15e9'
    with tarfile.open(fileobj=io.BytesIO(original),mode='r:gz') as tar:
        originals={f.name:tar.extractfile(f).read() for f in tar.getmembers() if f.isfile()}
    original_transport=z.read('rollback/external-local-transport-original.js')
    assert SHA(original_transport)=='51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a'
    existing_main=z.read('rollback/opal-original-relay-source')
    targets=[]
    for k in target_keys:
        target='/'+k.removeprefix('candidate/opal/')
        body=z.read(k)
        is_owner='/owner-pwa/' in target
        old_bytes=originals.get('owner-pwa/'+target.split('/owner-pwa/',1)[1]) if is_owner else (original_transport if target.endswith('/local-transport.js') else None)
        # The 2026-11-02 installed receipt is historical. An archived preimage
        # must NEVER be represented as freshly read, even if hash is known.
        targets.append({
            'target':target,
            'candidate_zip_member':k,
            'candidate_sha256':SHA(body),
            'candidate_bytes':len(body),
            'archived_v120_preimage_sha256':SHA(old_bytes) if old_bytes is not None else None,
            'archived_v120_preimage_bytes':len(old_bytes) if old_bytes is not None else None,
            'fresh_authenticated_installed_preimage_sha256':None,
            'fresh_authenticated_installed_mode_owner':None,
            'preimage_download_back_verified':False,
            'restore_byte_source':('rollback/owner-v120-exact.tar.gz' if is_owner else
                'rollback/external-local-transport-original.js' if target.endswith('/local-transport.js') else
                'rollback/opal-original-relay-source (NOT installed identity)' if target.endswith('/hbnf-matrix-relay') else
                'prove path absent before installation; otherwise independent backup required'),
            'rollback_mode':('restore exact existing live file from transaction-specific readback' if not target.endswith('hbnf-glow-overlay-v1.sh') else 'remove ONLY when verified absent in fresh preimage'),
        })
    assert any(t['target']=='/usr/lib/hbnf-matrix-relay' for t in targets)
    assert SHA(existing_main)=='bfadd048c73a8f88929223ce32cc32e971c83ac2ef26bc33c48a8233f8756cc2'

manifest={
 'schema':'hbnf-cart116-controls-track-a-two-phase-admission-v1',
 'state':'PENDING_NOT_INSTALLABLE',
 'exact_source':{
    'repo':'oookkkaaayyy/local-roots',
    'branch':'review/cart116-glow-canonical-intent-20261103',
    'head_qualified_native':'51d9d50ec8bda9d8f59dd4f55d2d9173158afb5a',
    'matrix_track_c_head':'e2e0288e8d5db271a01fd0d4881456178fdac5bf',
    'networking_final_head':'ebff085103ed847328dc7ed06b0f69d8f63c6606',
    'edge_provider_original_source_tree':'74dd1d687de44eacb20eff8e3960d9129948ef88',
 },
 'candidate_archive':{'file_name':CAPSULE.name,'bytes':CAPSULE.stat().st_size,'sha256':KNOWN_SHA,
   'durable_drive_id':'1_MCchUrKTkme-1iVQhUg9sFwdJt4LJ4d','download_back_previously_verified':True,
   'installable':False,'hard_edge_admitted':False,'hard_opal_admitted':False},
 'nine_target_opal':targets,
 'edge':{
   'target_project_id':'phcpbvuqibyarpfrftgx','slug':'hbnf-cart-control',
   'provider_preimage':{'version':35,'ezbr_sha256':'377945d8c9c930420ac36febd304d2a4d5f632cbcc4c9e3467c8f440aaa04e73',
    'fresh_readback_source_count':10,'exact_github_rollback_source_parity':'10/10',
    'compiled_bundle_download_back':False},
   'candidate_source':{'entrypoint':'staging/cart116-glow-v35-exact-review/candidate-source/index.ts',
    'deno_check':'PASS_GITHUB_RUN_41694531461',
    'compiled_provider_candidate_sha256':None,'independent_candidate_download_back':False},
   'rollback':'restore verified provider v35 source bytes with same-manifest bundle; check provider version and sha on next readback',
 },
 'sql':{
   'production_preimage':'four_legacy_rpc_functions_overlay_v1_absent',
   'test':'PostgreSQL 17.11 native role/revision/fence/TTL/race/guarded-rollback PASS run 41694282141',
   'up_member':'candidate/backend/migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.sql',
   'down_member':'candidate/backend/migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.down.sql',
   'restore_guard':'abort inverse if any new overlay challenge not confirmed restored',
   'writes_league_state':False,
 },
 'firmware':{'matrix_flash':False,'aux_flash':False,'uv_switch':False,'auto_live':False},
 'transaction':{'manifest_specific_one_time_id':None,'owner_approval_for_this_exact_postimage':None,
   'trusted_admission_receipt':None,'source_gate_change_admitted':False,'owner_authorization_to_continue':'github-116-comment-6611941325',
   'release_owner':'Controls Track A only'},
 'hard_gates':{
  'exact_current_opal_main_and_all_other_eight_preimages':'MISSING',
  'expected_actual_opal_main_path':'UNVERIFIED',
  'fresh_device_matrix_ps60_effect_id_and_aux_parity':'MISSING',
  'aux_24_configured_vs_22_ddp':'UNRESOLVED_FAIL_CLOSED',
  'fresh_owner_priority_cloud_preemption_latency':'UNTESTED_21S_BLOCKING_HELPER',
  'independent_device_preimage_backup_downloadback':'MISSING',
  'compiled_edge_candidate_and_rollback_offprovider_downloadback':'MISSING',
  'single_unchanged_manifest_phase1_phase2_closeout':'PENDING',
  'one_time_owner_manifest_bound_authorization':'MISSING',
  'physical_owner_safari12_matrix_aux_acceptance':'NOT_CHECKED',
  'native_pg_and_deno':'PASS_SEPARATE_EXACT_SOURCE_RUNS',
 },
 'ordered_release':[
  {'order':1,'phase':'0_readback','action':'authenticate Opal target, list exact 9 paths and installed bytes/ownership, served 17 assets and current relay process; capture Matrix .10 and AUX .11 actual JSON state/info/config/build, ps60/fx and canonical Owner fence; abort on missing/mismatch/lockout'},
  {'order':2,'phase':'0_backup','action':'back up exact live Opal 9 preimages including symlink/absence state, all 21 Owner files, current enabled service config redacted; independent durable upload then download-back sha; preserve provider v35 source AND compiled release bytes'},
  {'order':3,'phase':'0_build','action':'pin all candidate 9 hashes, compiled Edge bundle and inverse SQL hashes; verify no drift, no live Cart pending overlay, recovery space and same-filesystem atomic staging; obtain one-time non-replayable approval binding frozen whole manifest'},
  {'order':4,'phase':'1_prepare','action':'stage SQL up + Edge candidate in recoverable transaction only if native/admission and rollback validated; preserve existing legacy Owner handlers; KEEP both native overlay hard gates FALSE'},
  {'order':5,'phase':'1_opal','action':'drain one relay loop, record its PID and previous service state; atomically stage exact nine target files with expected permissions, backups and independent disk readback; verify all expected old hashes immediately before swap'},
  {'order':6,'phase':'2_admit','action':'only if SAME approved manifest includes separately tested exact source gate true and compiled Edge bytes, admit one-use GLOW path; never set auto_live or re-enable destructive fx142/brightness full-state writer; fail closed otherwise'},
  {'order':7,'phase':'2_accept','action':'in ONE owner-observed session: iPad Mini 2 Safari12 start/reconnect, live GLOW visibility, Owner preempt during TTL without >accepted latency, id-specific ACK and expiry, exact WOWMAX preset/fx/energy/variation/motion/audio/brightness/Vibe/AUX DDP equality, preserved UV off'},
  {'order':8,'phase':'2_closeout','action':'independent actual served and provider hash readback, SQL challenge settled, archive receipt off-device and independently download back; mark success only on all criteria'},
 ],
 'failure_recovery':[
  {'at':'preflight any step','action':'STOP no mutation; preserve existing working Owner v1.0.20 and v35'},
  {'at':'SQL before actuation','action':'rollback SQL only when no unresolved challenge; restore Edge provider v35 from exact readback and verify hash'},
  {'at':'Opal any apply failure','action':'stop one relay, reapply exact captured live preimages in reverse order, verify all 9 hashes + 21 unrelated Owner files/HTTP responses, use original service state; persist lockout if uncertain'},
  {'at':'Matrix/AUX postactuation/field failure','action':'never force global Matrix/AUX restore over Owner priority; preserve lockout and stop automatic Glow; use owner-directed same-manifest recovery after readback; protect UV off'},
 ],
 'readback_acceptance':{
  'software':['21/21 Owner installed unchanged except approved six','9/9 exact changed target hashes','17/17 locally served HTTP assets','no stale queued command after reconnect','provider Edge candidate exact provider hash','v1 SQL challenge one-use and restorable','rollback exact byte equality and independent durable receipts'],
  'device':['Matrix exact MAC 704bca5b345c and R6 build','WOWMAX ps60 and both effect IDs equal foundation native effect','Matrix 534/2 segments AUX accepted DDP 22-active with resolved configured geometry','no AUX write or UV change','Owner overlay immediate precedence','GLOW visible with saved scores','native TTL autoexpires and restores exact baseline energy/variation/motion/audio/brightness/Vibe/palette'],
  'physical_checked':False},
 'installer_included':False,
 'backend_or_opal_mutated':False,
}
OUT.write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n')
print(f'{OUT.name} sha256={SHA(OUT.read_bytes())} bytes={OUT.stat().st_size} nine_targets={len(targets)} status={manifest["state"]}')
