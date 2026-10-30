// HBNF Glow release-control core. Injection-only: this module has no production
// credentials, provider network calls, or implicit install command.
import { createHash } from 'node:crypto';

export const RELEASE = Object.freeze({
  id: 'hbnf-glow-d68334f67026',
  source: '7c5598133c2ed7d78f08bb57f704f95cb735b7c8',
  candidate: 'a3ef09676caf0a39d53cc269ed8863cf2705708c528641cf94cd47dd49d58dc7',
  baseline: '3b019c24-0288-4c0d-bcc2-46cb6028d0f6',
  rollback: '29d3c6c2aa9038063c659a5361b932ce2c9819a481fd020b5172701450dc477a',
  database: 'phcpbvuqibyarpfrftgx',
  originalManifest: '862ec5e974b4a6cd908222fabf922fb5e0a933bb5656f4896a727850d773bf88',
  parent: '31b095c84ba8a6bedbae7f2ca023b079b9f4b116d62d5989d6c88a23baa7436e',
  parentId: '1JsTUYjiqak3CLpvjnlbeHOZ1kGO25hOd',
  claim: '9607b7d50b675d0a559dfc9efcb4f91cbcb4fe6eaf91d8c678aa3221c5267262',
  decision: '9887b33fbdd2aed590aa2784d3a0675e8fc5a75b7cce589ca3e25a5639bb007b',
  approval: 'a46d957eff68eeba05994d44519c9072e87adbebf1da23a37125807c4bca294d',
  migrations: Object.freeze([
    ['20261029200450_hbnf_glow_atomic_week_sync.sql','740536e7046dc5592022a46b363d9e6e9e370a6f79f8b1ec8c3af87e30ba1e69'],
    ['20261029203741_hbnf_league_state_server_revision_guard.sql','8521bc34fdaf7e3015c76c0d0f2f1bd6d1baf00d8dca7b262aec19b38e587b2d'],
    ['20261030021038_hbnf_league_state_anon_cas_rpc.sql','460a8bee8961ebd78968678d1690b7c4565f6a8785347e6c08f6cba4903739b7'],
  ]),
});
const digest = x => createHash('sha256').update(x).digest('hex');
const bad = s => { throw new Error(s); };
const json = x => Buffer.from(`${JSON.stringify(x, null, 2)}\n`);
function exactRecord(bytes, hash, label) {
  if (!Buffer.isBuffer(bytes) || digest(bytes) !== hash) bad(`${label} immutable bytes or SHA-256 mismatch`);
  try { return JSON.parse(bytes.toString('utf8')); } catch { bad(`${label} JSON invalid`); }
}

export function verifyExistingAuthority({manifest, parent, admissionClaim, decision, approval, candidate, rollback, migrationBytes}) {
  const m = exactRecord(manifest, RELEASE.originalManifest, 'original manifest');
  const p = exactRecord(parent, RELEASE.parent, 'parent admission');
  const c = exactRecord(admissionClaim, RELEASE.claim, 'admission claim');
  const d = exactRecord(decision, RELEASE.decision, 'admission decision');
  const a = exactRecord(approval, RELEASE.approval, 'owner authorization');
  if ([m,p,c,d,a].some(v => v.releaseId !== RELEASE.id)) bad('release IDs differ');
  if (p.sourceCommit !== RELEASE.source || p.candidateSha256 !== RELEASE.candidate || p.oneTime !== true) bad('parent does not match admitted source/candidate');
  if (c.manifestSha256 !== RELEASE.parent || c.manifestDriveFileId !== RELEASE.parentId) bad('existing admission claim is not bound to the original parent');
  if (d.status !== 'ADMISSION_PASS' || d.parentManifestSha256 !== RELEASE.parent || d.parentManifestDriveFileId !== RELEASE.parentId || d.productionMutationAuthorized !== false) bad('existing decision not a valid separate-authorization admission');
  if (a.approvalType !== 'explicit-user-message-current-chat' || a.admission?.parentSha256 !== RELEASE.parent || a.candidate?.sha256 !== RELEASE.candidate || a.productionMutationAlreadyExecuted !== false) bad('exact owner approval is absent or mismatched');
  if (digest(candidate) !== RELEASE.candidate || digest(rollback) !== RELEASE.rollback) bad('candidate or rollback differs from exact approved bytes');
  if (!Array.isArray(migrationBytes) || migrationBytes.length !== 3) bad('exact three migrations required');
  for (let i=0;i<3;i++) {
    const [name,hash] = RELEASE.migrations[i];
    if (migrationBytes[i]?.name !== name || !Buffer.isBuffer(migrationBytes[i]?.bytes) || digest(migrationBytes[i].bytes) !== hash) bad(`migration ${i+1} not exact or ordered`);
  }
  return {
    releaseId: RELEASE.id,
    source: RELEASE.source,
    candidateSha256: RELEASE.candidate,
    rollbackSha256: RELEASE.rollback,
    databaseProject: RELEASE.database,
    migrationHashes: RELEASE.migrations.map(([name,sha256])=>({name,sha256})),
    admissionManifestSha256: RELEASE.originalManifest,
    parentSha256: RELEASE.parent,
    admissionClaimSha256: RELEASE.claim,
    decisionSha256: RELEASE.decision,
    approvalSha256: RELEASE.approval,
  };
}
function cfBaseline(c) {
  if (c?.worker !== 'hbnf' || c.versionId !== RELEASE.baseline || c.percentage !== 100 || c.rollbackRetained !== true || c.pollingDisabled !== true) bad('Cloudflare live baseline/rollback/disabled-poll mismatch');
  if (c.cronRemoved !== true || c.assetHashUnavailable !== true || c.staticAssetsOnly !== true) bad('Cloudflare Cron/static-only baseline evidence is missing; installed asset hash remains unavailable');
  if (c.glowRouteCovered !== true) bad('the admitted HBNF Worker does not own the Glow page and helper routes');
}
function dbBaseline(s) {
  if (s?.projectId !== RELEASE.database || s.tableExists !== true || s.rlsEnabled !== true || !Array.isArray(s.migrations) || s.migrations.length !== 0) bad('Supabase live baseline/migration mismatch');
  for (const role of ['anon','authenticated']) for(const priv of ['SELECT','INSERT','UPDATE']) {
    if (s.grants?.[role]?.[priv] !== true) bad(`Supabase legacy grant missing: ${role}.${priv}`);
  }
  for(const name of ['hbnf_matrix_vnext_capture_after_state_change','hbnf_project_current_tags_into_league_state','trg_hbnf_matrix_sync']) {
    if (!s.triggers?.includes(name)) bad(`Supabase prior trigger missing: ${name}`);
  }
  if ((s.candidateFunctions || []).length !== 0) bad('Supabase proposed RPC already installed');
}
async function roundTrip(store, name, value) {
  const data=json(value);
  const x=await store.putOnce(name,data);
  if (!x?.id || x.durable !== true) bad(`${name} not durably stored in the approved provider`);
  if (!Buffer.from(await store.download(x.id)).equals(data)) bad(`${name} independent remote download-back mismatch`);
  return { id:x.id,sha256:digest(data),bytes:data.length };
}
async function verifyFresh({cloudflare,supabase}, providers) {
  const [c,s]=await Promise.all([providers.cloudflare.read(),providers.supabase.read()]);
  cfBaseline(c);dbBaseline(s);
  if (cloudflare && cloudflare !== c.versionId) bad('Cloudflare baseline changed during gate');
  if (supabase && supabase !== s.projectId) bad('Supabase baseline changed during gate');
  return {cloudflare:c,supabase:s};
}

// The caller must implement: authenticated, fresh readbacks; native provider
// mutation/rollback; exclusive durable Git-ref/CAS execution claim; and actual
// provider-remote Drive storage. No fake callbacks qualify a live release.
export async function runAdmittedHbnfExecution({evidence,providers,storage,executionLock,environment,clock=()=>new Date().toISOString()}) {
  const identity=verifyExistingAuthority(evidence);
  for (const [label,object,methods] of [
    ['Cloudflare',providers?.cloudflare,['read','deployExact','restoreV343','verifyDeployed']],
    ['Supabase',providers?.supabase,['read','applyExactMigration','verifyInstalled']],
    ['Drive',storage,['putOnce','download']],
    ['exclusive lock',executionLock,['createExclusive','read']],
  ]) for(const method of methods) if(typeof object?.[method]!=='function') bad(`${label} provider adapter missing ${method}`);
  if(environment?.wranglerLogWriteVerified!==true || environment?.scratchWriteVerified!==true) bad('Mac filesystem insufficiently writable for Wrangler/provider closeout');
  const first=await verifyFresh({},providers);
  // This must create a globally exclusive, immutable execution claim, not
  // recycle the existing one-time admission claim.
  const execution={format:'hbnf-execution-claim-v1',...identity,baselineVersion:RELEASE.baseline, approvalVerified:true};
  const lock=await executionLock.createExclusive(`${RELEASE.id}.execution-claim`,json(execution));
  if(lock?.created!==true || !lock.id) bad('execution claim is replayed, nonexclusive, or unavailable');
  if(!Buffer.from(await executionLock.read(lock.id)).equals(json(execution))) bad('exclusive execution claim not independently readable');
  await roundTrip(storage,`${RELEASE.id}.execution-claim.json`,execution);
  let dbMutations=0,workerMutated=false,workerRecovered=false;
  try {
    // First fresh checks belong AFTER the exclusive claim, immediately before mutation.
    await verifyFresh({cloudflare:first.cloudflare.versionId,supabase:first.supabase.projectId},providers);
    for(const [i,[name,sha]] of RELEASE.migrations.entries()) {
      dbMutations++; // attempted, including partial provider failure
      await providers.supabase.applyExactMigration({name,sha256:sha,sql:evidence.migrationBytes[i].bytes});
      const observed=await providers.supabase.read();
      if(observed.projectId!==RELEASE.database || !observed.migrations?.includes(name.replace(/\.sql$/,''))) bad(`migration ${name} did not appear in provider readback`);
    }
    const supabaseReadback=await providers.supabase.verifyInstalled({migrations:RELEASE.migrations.map(([n])=>n),legacyGrants:true,unrelatedDataPreserved:true});
    if(supabaseReadback?.projectId!==RELEASE.database || !Array.isArray(supabaseReadback?.migrations) || RELEASE.migrations.some(([name])=>!supabaseReadback.migrations.includes(name.replace(/\.sql$/,'')))) bad('Supabase install receipt lacks exact project/migration readback');
    // The Worker target is re-read after database installation and directly
    // before the second target is mutated; a drift leaves only additive DB
    // migrations and is recorded as a partial installation.
    const workerPreflight=await providers.cloudflare.read();
    if(workerPreflight.versionId!==first.cloudflare.versionId||workerPreflight.percentage!==100||workerPreflight.rollbackRetained!==true||workerPreflight.pollingDisabled!==true||workerPreflight.cronRemoved!==true||workerPreflight.assetHashUnavailable!==true||workerPreflight.staticAssetsOnly!==true||workerPreflight.glowRouteCovered!==true) bad('Cloudflare target changed or baseline/Cron/Glow-route evidence is missing after database migrations; aborting Worker deployment');
    workerMutated=true; // armed before remote request: provider may mutate then time out
    const deployed=await providers.cloudflare.deployExact({zip:evidence.candidate,sha256:RELEASE.candidate,keepPollingDisabled:true});
    if(!deployed?.versionId) bad('Worker deployment did not return a full version identity');
    const actual=await providers.cloudflare.read();
    if(actual.versionId!==deployed.versionId || actual.percentage!==100 || actual.pollingDisabled!==true || actual.rollbackRetained!==true || actual.glowRouteCovered!==true) bad('Worker deployment/readback, Glow route ownership, or disabled polling mismatch');
    const assetReadback=await providers.cloudflare.verifyDeployed({versionId:deployed.versionId,expectedAssetDelta:{same:43,modified:['glow.html'],added:['glow-save-sync.mjs','league-state-cas.mjs']},legacyReadOnly:true});
    if(assetReadback?.passed!==true || assetReadback.assetCount+assetReadback.externallyRoutedAssetCount!==46) bad('public assets and externally routed paths were not completely accounted for');
    const closeout={
      format:'hbnf-two-target-closeout-v1',...identity,executionLockId:lock.id,
      cloudflare:{worker:'hbnf',versionId:deployed.versionId,trafficPercent:100,rollbackVersionId:RELEASE.baseline,rollbackSha256:RELEASE.rollback,rollbackRetained:actual.rollbackRetained,customDomain:actual.activeCustomDomain,glowRouteCovered:actual.glowRouteCovered,routeOwners:actual.routeOwners,cronSchedules:actual.schedules,pollingDisabled:actual.pollingDisabled,assetReadback},
      supabase:{projectId:supabaseReadback.projectId,migrations:RELEASE.migrations.map(([name,sha256])=>({name:name.replace(/\.sql$/,''),sha256})),functions:supabaseReadback.candidateFunctions,grants:supabaseReadback.grants,triggers:supabaseReadback.triggers,leagueStateFingerprint:supabaseReadback.stateFingerprint,unrelatedDataPreserved:true},
      acceptance:{candidateBytesExact:true,sourceIdentityExact:true,allThreeMigrationsReadBack:true,legacyGrantsPreserved:true,leagueStateUnchanged:true,glowAssetsServed:true,cartRouteOwnershipUnchanged:true,pollingDisabled:true},
      status:'INSTALLED_CLOSEOUT_PASS',recordedUtc:clock(),
    };
    const receipt=await roundTrip(storage,`${RELEASE.id}.closeout.json`,closeout);
    return {status:'INSTALLED_CLOSEOUT_PASS',...receipt,workerVersionId:deployed.versionId};
  } catch (error) {
    let recovery='NOT_REQUIRED',currentCloudflare='UNKNOWN';
    if(workerMutated) {
      try {
        await providers.cloudflare.restoreV343({versionId:RELEASE.baseline,sha256:RELEASE.rollback,removeCron:true});
        const checked=await providers.cloudflare.read();
        if(checked.versionId!==RELEASE.baseline || checked.percentage!==100 || checked.cronRemoved!==true) bad('Worker rollback verification failed');
        workerRecovered=true;currentCloudflare=checked.versionId;recovery='V343_RESTORED_CRON_REMOVED';
      } catch(e) { recovery=`ROLLBACK_UNVERIFIED:${e.message}`; }
    }
    const failure={format:'hbnf-two-target-execution-failure-v1',...identity,executionLockId:lock.id,status:'FAILED_AFTER_EXECUTION_CLAIM',dbMigrationsAttempted:dbMutations,additiveDatabaseMayRemain:dbMutations>0,workerMutated,workerRecovered,recovery,currentCloudflare,error:String(error.message),recordedUtc:clock()};
    try {await roundTrip(storage,`${RELEASE.id}.execution-failed.json`,failure);} catch(e) {throw new AggregateError([error,e],'provider failure AND durable failure record unavailable; preserve evidence, no retry');}
    throw new Error(`HBNF RELEASE FAILED; ${dbMutations} migration(s) attempted; ${recovery}; ${error.message}`);
  }
}
