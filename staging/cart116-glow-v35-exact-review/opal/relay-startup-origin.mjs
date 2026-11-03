/**
 * Cart #116 Track A review-only installed-service identity guard.
 * Consumes a read-only, redacted inventory collected by the established Mac
 * SSH authority; never shells out, starts procd, or installs a daemon.
 * A source pathname being ABSENT is not evidence that no other relay runs.
 */
export const HISTORICAL_SKINS_PATHS = Object.freeze([
  '/usr/libexec/hbnf-skins-relay',
  '/usr/lib/hbnf-skins-relay-core.sh',
  '/etc/init.d/hbnf-skins-relay'
]);
export const HISTORICAL_MISPATH = '/usr/lib/hbnf-matrix-relay';
export const PROPOSED_GLOW_PATHS = Object.freeze([
  '/usr/libexec/hbnf-matrix-relay',
  '/usr/lib/hbnf-glow-overlay-v1.sh'
]);
const validSha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const fail=(reason,details={})=>({admitted:false,canReplaceExistingRelay:false,sourceOnly:true,reason,...details});

export function assessRelayRuntimeOrigin(inventory) {
  const {files,services,processes,sessionId}=inventory??{};
  if(!files||typeof files!=='object'||!Array.isArray(services)||
     !Array.isArray(processes)||typeof sessionId!=='string'||!sessionId.trim())
    return fail('authenticated_complete_runtime_inventory_missing');
  for(const p of [...HISTORICAL_SKINS_PATHS,...PROPOSED_GLOW_PATHS]) {
    const f=files[p];
    if(!f||!['regular','absent','symlink','other'].includes(f.kind))
      return fail('runtime_path_not_inventoried',{path:p});
    if(f.kind==='regular'&&(!validSha(f.sha256)||!Number.isInteger(f.mode)||
       typeof f.owner!=='string'))return fail('runtime_preimage_not_bound',{path:p});
    if(f.kind==='symlink'||f.kind==='other')return fail('runtime_path_ambiguous',{path:p});
  }
  const unknown=[];
  for(const p of processes) {
    if(!Number.isSafeInteger(p?.pid)||p.pid<1||typeof p?.exePath!=='string'||
       typeof p?.service!=='string')return fail('runtime_process_identity_incomplete');
    if(/(hbnf|relay|opal|matrix|skins)/i.test(p.exePath+' '+p.service))unknown.push(p);
  }
  // The physical nine-target capture inspected the wrong proposed main path
  // (/usr/lib/...), not the historical procd executable (/usr/libexec/...).
  // Do not infer service provenance from a filename or historical procd order.
  if(files['/usr/libexec/hbnf-matrix-relay'].kind==='absent'||
     files['/usr/lib/hbnf-glow-overlay-v1.sh'].kind==='absent')
    return fail('new_relay_paths_absent_origin_not_verified',{
      observedPotentialRelayProcesses:unknown.length,
      integration:'one_existing_relay_loop_only_no_new_service_or_daemon'});
  if(unknown.length!==1)return fail('single_existing_relay_owner_not_proven',{
    observedPotentialRelayProcesses:unknown.length});
  const owner=unknown[0];
  if(owner.exePath!=='/usr/libexec/hbnf-matrix-relay'||
     !services.some(s=>s?.name==='hbnf-matrix-relay'&&s?.pid===owner.pid&&s?.enabled===true))
    return fail('process_init_pair_does_not_identify_candidate',{
      observedPotentialRelayProcesses:unknown.length});
  // Even an exact runtime match is not permission to install: manifest/source
  // hashes, rollback, service config, SQL/Edge and physical field gates remain.
  return fail('same_loop_runtime_identified_requires_release_admission',{
    observedPotentialRelayProcesses:1,candidatePid:owner.pid});
}
