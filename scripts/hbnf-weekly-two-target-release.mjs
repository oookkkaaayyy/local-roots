// Candidate-specific successor to the consumed HBNF two-target release gate.
// All provider writes occur inside runWeeklyGlowRelease after one durable,
// byte-verified parent manifest and a unique execution claim.
import {createHash} from 'node:crypto';

export const WEEKLY_RELEASE = Object.freeze({
  id: 'hbnf-glow-weekly-20261030-44612c09677f-partial-20261031-assets-rootfix',
  runtimeSource: '44612c09677f59b84bece7de655af7bb011b51e7',
  candidate: '0b51b7ecdfeced01cc73bee96dff8085f2f1f9529df48223fa4f7185c7d15b4c',
  candidateBytes: 5015699,
  rollbackVersion: '08633e43-dbaa-4421-a072-5af56f75d4b7',
  rollback: 'a3ef09676caf0a39d53cc269ed8863cf2705708c528641cf94cd47dd49d58dc7',
  rollbackBytes: 5029798,
  worker: 'hbnf',
  project: 'phcpbvuqibyarpfrftgx',
  account: 'e3bc6b78f1104fa0c2a01245084594cf',
  migration: '20261031054752_hbnf_udisc_glow_event_bindings.sql',
  migrationSha256: 'dbcf993694c054f3ea45de721258b5822c1c45042415309437a94ae583deaf8c',
  migrationBytes: 2269,
  expectedMigrationVersion: '20261031082937',
  migrationRollback: 'DROP TABLE public.hbnf_udisc_glow_event_bindings;',
  migrationRollbackSha256: '30359675987363ed48a8377b6fd88be9e65b5cf81bbb1d6cbf3c42469f13950c',
  assets: 46,
  bindings: Object.freeze([
    {date:'2026-11-03',id:'hb-glow-doubles-tAP8Y5',start:'2026-11-04T01:30:00Z',end:'2026-11-04T07:30:00Z'},
    {date:'2026-11-10',id:'hb-glow-doubles-af85rU',start:'2026-11-11T01:30:00Z',end:'2026-11-11T07:30:00Z'},
    {date:'2026-11-17',id:'hb-glow-doubles-C1mFl8',start:'2026-11-18T01:30:00Z',end:'2026-11-18T07:30:00Z'},
  ]),
});

const digest = b => createHash('sha256').update(b).digest('hex');
const fail = message => { throw new Error(message); };
const jsonBytes = v => Buffer.from(`${JSON.stringify(v,null,2)}\n`);
const canonicalValue = v => Array.isArray(v) ? v.map(canonicalValue) : v && typeof v==='object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalValue(v[k])])) : v;
export const sameJson = (a,b) => JSON.stringify(canonicalValue(a))===JSON.stringify(canonicalValue(b));
function fresh(e, label, now, age) {
  const t=Date.parse(e?.capturedAt);
  if(!Number.isFinite(t)||t>now+30_000||now-t>age) fail(`${label} readback missing, future-dated, or stale`);
}
function exactBytes(bytes, hash, size, label) {
  if(!Buffer.isBuffer(bytes)||bytes.length!==size||digest(bytes)!==hash) fail(`${label} exact bytes/hash mismatch`);
}
function verifyWorkerBaseline(w) {
  if(w?.worker!==WEEKLY_RELEASE.worker||w.versionId!==WEEKLY_RELEASE.rollbackVersion||w.trafficPercent!==100||w.rollbackRetained!==true||w.assets!==WEEKLY_RELEASE.assets||w.customDomainEnabled!==true||w.glowRouteCovered!==true||w.cartRoutesUnchanged!==true) fail('Cloudflare baseline/rollback/routing evidence mismatch');
  if(w.cron?.length!==1||w.cron[0]!=='* * * * *') fail('baseline Cron differs from the admitted one-minute schedule');
}
function verifyDatabaseBaseline(s, expected) {
  if(s?.projectId!==WEEKLY_RELEASE.project||!expected?.stateFingerprint||s.stateFingerprint!==expected.stateFingerprint||s.activeWeek!==expected.activeWeek||s.nov3WeekExists!==expected.nov3WeekExists) fail('Supabase project or manifest-bound league state differs');
  if(expected.migrationPresent===true){
    const rows=(s.migrationLedger||[]).filter(m=>m.name==='hbnf_udisc_glow_event_bindings');
    if(s.bindingTableExists!==true||s.migrationPresent!==true||rows.length!==1||rows[0].version!==expected.migrationVersion||s.rlsEnabled!==true||s.serviceRoleOnly!==true||!sameJson(s.bindings,expected.bindings)) fail('pre-applied migration baseline, provider ledger version, permissions, or event bindings differ');
  }else if(s.bindingTableExists!==false||s.migrationPresent!==false) fail('unexpected migration/table state for this admission');
  for(const name of ['hbnf_apply_udisc_glow_week','hbnf_record_udisc_glow_sync_status']) if(!s.functions?.includes(name)) fail(`pre-existing Glow function missing: ${name}`);
  if(s.legacyAnonWriteGrants!==true||s.matrixAndTagTriggersPreserved!==true) fail('legacy grants or Matrix/tag triggers are not preserved');
}

/**
 * Admission is PENDING until all source/package/rollback/provider bytes match
 * and the immutable parent manifest is independently downloaded from Drive.
 */
export async function admitWeeklyGlowRelease({manifest,manifestBytes,downloadedManifestBytes,durableManifest,artifactBytes,readbacks,now=Date.now(),maxAgeMs=300_000,priorClaims=[]}) {
  if(!manifest||manifest.format!=='hbnf-weekly-glow-release-admission-v1'||manifest.releaseId!==WEEKLY_RELEASE.id||manifest.phase!=='PENDING'||manifest.oneTime!==true) fail('candidate-specific parent manifest identity/phase invalid');
  if(!Buffer.from(manifestBytes||[]).equals(Buffer.from(downloadedManifestBytes||[]))||!Buffer.from(manifestBytes||[]).equals(jsonBytes(manifest))) fail('durable Drive manifest download-back is missing or not byte-identical');
  const manifestSha256=digest(Buffer.from(manifestBytes));
  if(durableManifest?.driveFileId==null||durableManifest.sha256!==manifestSha256||durableManifest.bytes!==manifestBytes.length||durableManifest.downloadBackVerified!==true) fail('parent manifest has not been durably stored and independently verified');
  if(priorClaims.some(x=>x.releaseId===WEEKLY_RELEASE.id)) fail('one-time admission/execution claim already exists; refusing replay');
  if(manifest.runtimeSourceCommit!==WEEKLY_RELEASE.runtimeSource||!/^[0-9a-f]{40}$/.test(manifest.gateSourceCommit||'')||manifest.workerTarget!==WEEKLY_RELEASE.worker||manifest.supabaseProject!==WEEKLY_RELEASE.project) fail('source or provider target mismatch');
  exactBytes(artifactBytes?.candidate,WEEKLY_RELEASE.candidate,WEEKLY_RELEASE.candidateBytes,'candidate');
  exactBytes(artifactBytes?.rollback,WEEKLY_RELEASE.rollback,WEEKLY_RELEASE.rollbackBytes,'v086 rollback');
  exactBytes(artifactBytes?.migration,WEEKLY_RELEASE.migrationSha256,WEEKLY_RELEASE.migrationBytes,'event-binding migration');
  if(manifest.candidate?.sha256!==WEEKLY_RELEASE.candidate||manifest.rollback?.versionId!==WEEKLY_RELEASE.rollbackVersion||manifest.rollback?.sha256!==WEEKLY_RELEASE.rollback||manifest.migration?.name!==WEEKLY_RELEASE.migration||manifest.migration?.sha256!==WEEKLY_RELEASE.migrationSha256||manifest.migration?.rollbackSha256!==WEEKLY_RELEASE.migrationRollbackSha256||manifest.migration?.order!==1||manifest.assetCount!==46||manifest.assetDelta?.unchanged!==46||manifest.assetDelta?.modified?.length!==0||manifest.assetDelta?.added?.length!==0) fail('manifest candidate, rollback, exact migration/rollback, or 46-asset preservation binding mismatch');
  const prior=manifest.supersedes;
  if(manifest.migration?.alreadyApplied!==true||manifest.migration?.recordedVersion!==manifest.supabaseBaseline?.migrationVersion||prior?.previousReleaseId!=='hbnf-glow-weekly-20261030-44612c09677f-partial-20261031'||prior?.previousManifestDriveId!=='1OAk_oQuFsghx-FojxU0e4Og0H5-Nz5ii'||prior?.previousManifestSha256!=='5592addad875500475e73a87fb6f5144db35867e1cf52d2d49296b031525b88e'||prior?.previousAdmissionDecisionDriveId!=='1b1fcqJpJ9DxQlavNyqg94XejbuA2t82x'||prior?.previousAdmissionDecisionSha256!=='032b8576f8af62118ec634d36405bbcac8fb12b2222eb2ea47d8c4034550a9a7'||prior?.previousExecutionClaimDriveId!=='1NlFd4EFhFjB7sUr4sfTVVgByYJ9xfZq6'||prior?.previousExecutionClaimSha256!=='5f672173fb86840bcaf6bee2c0e95da3790038735635a08275a00146e62d044e'||prior?.previousFailureReceiptDriveId!=='1SG1fgdTi1VHxzTUkOTGkshBRtwzOQnt-'||prior?.previousFailureReceiptSha256!=='3ace1d33ce606f407a0955b50fa9b5344b92bc08465dec87cfa5e8c567c2dff6') fail('asset-root successor is not bound to the independently recorded prior attempt');
  const cf=readbacks?.cloudflare,sb=readbacks?.supabase;fresh(cf,'Cloudflare',now,maxAgeMs);fresh(sb,'Supabase',now,maxAgeMs);verifyWorkerBaseline(cf);verifyDatabaseBaseline(sb,manifest.supabaseBaseline);
  if(!Array.isArray(manifest.acceptanceCriteria)||manifest.acceptanceCriteria.length<5||manifest.acceptanceCriteria.some(c=>c.status!=='PENDING'||!c.scope||!c.description||!c.method||!c.expectedOutcome)) fail('admission acceptance criteria are incomplete or not PENDING');
  return Object.freeze({status:'ADMISSION_PASS',releaseId:WEEKLY_RELEASE.id,manifestSha256,manifestDriveFileId:durableManifest.driveFileId,gateSourceCommit:manifest.gateSourceCommit,runtimeSourceCommit:WEEKLY_RELEASE.runtimeSource,candidateSha256:WEEKLY_RELEASE.candidate,rollbackSha256:WEEKLY_RELEASE.rollback,migrationSha256:WEEKLY_RELEASE.migrationSha256,migrationAlreadyInstalled:manifest.migration.alreadyApplied===true,cloudflareVersion:cf.versionId,supabaseProject:sb.projectId,supabaseBaseline:Object.freeze({...manifest.supabaseBaseline}),admittedAt:new Date(now).toISOString()});
}

function assertTargetUnchanged(cf,sb,admission) {
  if(cf?.versionId!==admission.cloudflareVersion||cf.trafficPercent!==100||cf.rollbackRetained!==true) fail('Cloudflare baseline changed at mutation boundary');
  const b=admission.supabaseBaseline;
  if(sb?.projectId!==admission.supabaseProject||sb.bindingTableExists!==b?.bindingTableExists||sb.migrationPresent!==b?.migrationPresent||sb.stateFingerprint!==b?.stateFingerprint||sb.activeWeek!==b?.activeWeek||sb.nov3WeekExists!==b?.nov3WeekExists) fail('Supabase baseline changed at mutation boundary');
  if(b.migrationPresent===true){const rows=(sb.migrationLedger||[]).filter(m=>m.name==='hbnf_udisc_glow_event_bindings');if(rows.length!==1||rows[0].version!==b.migrationVersion||!sameJson(sb.bindings,b.bindings))fail('pre-applied migration changed at the execution boundary');}
}
function verifyPostMigration(s, baseline) {
  if(s?.projectId!==WEEKLY_RELEASE.project||s.bindingTableExists!==true||s.migrationPresent!==true||s.migrationName!=='hbnf_udisc_glow_event_bindings'||s.rlsEnabled!==true||s.serviceRoleOnly!==true||s.stateFingerprint!==baseline?.stateFingerprint||s.activeWeek!==baseline?.activeWeek||s.nov3WeekExists!==baseline?.nov3WeekExists||s.legacyAnonWriteGrants!==true||s.matrixAndTagTriggersPreserved!==true) fail('post-migration Supabase readback failed its schema/data/grant checks');
  const bindings=s.bindings||[];
  if(!sameJson(bindings,WEEKLY_RELEASE.bindings)||baseline?.bindings&&!sameJson(bindings,baseline.bindings)) fail('post-migration event IDs, dates, or windows differ from admitted values');
  const migrationRows=(s.migrationLedger||[]).filter(m=>m.name==='hbnf_udisc_glow_event_bindings');
  if(migrationRows.length!==1||!/^\d{14}$/.test(String(migrationRows[0].version||''))||baseline?.migrationVersion&&migrationRows[0].version!==baseline.migrationVersion) fail('provider migration ledger did not record exactly one expected provider-versioned migration');
}

/** One executor owns the actual API migration call and Worker stage/deploy. */
export async function runWeeklyGlowRelease({admission,admissionDecision,manifest,artifactBytes,providers,storage,ledger,clock=()=>new Date().toISOString()}) {
  if(admission?.status!=='ADMISSION_PASS'||admission.releaseId!==WEEKLY_RELEASE.id||admission.manifestSha256!==digest(jsonBytes(manifest))||admission.gateSourceCommit!==manifest.gateSourceCommit) fail('valid candidate-specific ADMISSION_PASS is required');
  for(const [name,obj,methods] of [['Supabase',providers?.supabase,['read','applyExactMigration']],['Cloudflare',providers?.cloudflare,['read','stageExact','deployStaged','verifyDeployed','restoreBaseline']],['Drive',storage,['putOnce','download']],['one-time claim',ledger,['createExclusive','read']]]) for(const method of methods) if(typeof obj?.[method]!=='function') fail(`${name} execution adapter missing ${method}`);
  exactBytes(artifactBytes?.candidate,WEEKLY_RELEASE.candidate,WEEKLY_RELEASE.candidateBytes,'candidate');exactBytes(artifactBytes?.rollback,WEEKLY_RELEASE.rollback,WEEKLY_RELEASE.rollbackBytes,'rollback');exactBytes(artifactBytes?.migration,WEEKLY_RELEASE.migrationSha256,WEEKLY_RELEASE.migrationBytes,'migration');
  const manifestBytes=jsonBytes(manifest),manifestSha256=digest(manifestBytes);
  if(manifestSha256!==admission.manifestSha256) fail('execution parent manifest differs from admitted bytes');
  if(admission.manifestDriveFileId==null||!Buffer.from(await storage.download(admission.manifestDriveFileId)).equals(manifestBytes)) fail('admitted parent manifest is not independently retrievable byte-for-byte at execution time');
  const decisionRecord=admissionDecision?.record,decisionBytes=Buffer.from(admissionDecision?.bytes||[]);
  if(!decisionRecord||decisionRecord.format!=='hbnf-weekly-glow-admission-decision-v1'||decisionRecord.releaseId!==WEEKLY_RELEASE.id||decisionRecord.status!=='ADMISSION_PASS'||decisionRecord.manifestSha256!==manifestSha256||!admissionDecision.driveFileId||digest(decisionBytes)!==admissionDecision.sha256||!Buffer.from(await storage.download(admissionDecision.driveFileId)).equals(decisionBytes)) fail('durable admission decision is missing, mismatched, or not independently retrievable');
  const claim=Buffer.from(`${JSON.stringify({format:'hbnf-weekly-glow-execution-claim-v1',releaseId:WEEKLY_RELEASE.id,manifestSha256,admissionDecisionDriveId:admissionDecision.driveFileId,admissionDecisionSha256:admissionDecision.sha256,candidateSha256:WEEKLY_RELEASE.candidate,baselineVersion:WEEKLY_RELEASE.rollbackVersion,claimedAt:clock()},null,2)}\n`);
  const lock=await ledger.createExclusive(`${WEEKLY_RELEASE.id}.execution-claim`,claim);
  if(lock?.created!==true||!lock.id||!Buffer.from(await ledger.read(lock.id)).equals(claim)) fail('unique execution claim is unavailable/replayed or its independent readback differs');
  const stored=await storage.putOnce(`${WEEKLY_RELEASE.id}.execution-claim.json`,claim);
  if(!stored?.id||!Buffer.from(await storage.download(stored.id)).equals(claim)) fail('execution claim durable download-back failed');
  let migrationMutationPerformed=false,migrationVerified=false,stage=null,workerDeployAttempted=false;
  const receipts=[];
  try {
    const [cf0,sb0]=await Promise.all([providers.cloudflare.read(),providers.supabase.read()]);assertTargetUnchanged(cf0,sb0,admission);
    let sb1;
    if(admission.migrationAlreadyInstalled){sb1=sb0;verifyPostMigration(sb1,admission.supabaseBaseline);migrationVerified=true;}
    else {const migrationResult=await providers.supabase.applyExactMigration({projectId:WEEKLY_RELEASE.project,name:WEEKLY_RELEASE.migration,sha256:WEEKLY_RELEASE.migrationSha256,query:artifactBytes.migration.toString('utf8'),rollback:WEEKLY_RELEASE.migrationRollback,rollbackSha256:WEEKLY_RELEASE.migrationRollbackSha256});if(migrationResult?.applied!==true)fail('Supabase Management API did not confirm the exact migration');migrationMutationPerformed=true;sb1=await providers.supabase.read();verifyPostMigration(sb1,admission.supabaseBaseline);migrationVerified=true;}
    const cf1=await providers.cloudflare.read();
    if(cf1.versionId!==WEEKLY_RELEASE.rollbackVersion||cf1.trafficPercent!==100||cf1.rollbackRetained!==true) fail('Cloudflare baseline drifted after migration; Worker staging aborted');
    stage=await providers.cloudflare.stageExact({candidate:artifactBytes.candidate,sha256:WEEKLY_RELEASE.candidate,sourceCommit:WEEKLY_RELEASE.runtimeSource,requireSecret:'SUPABASE_SERVICE_ROLE_KEY',approvedAccessVariable:'true'});
    if(!stage?.versionId||stage.trafficPercent!==0||stage.sourceCommit!==WEEKLY_RELEASE.runtimeSource||stage.candidateSha256!==WEEKLY_RELEASE.candidate||stage.approvalVariable!=='true'||stage.requiredSecretPresent!==true||stage.cron?.length!==1||stage.cron[0]!=='* * * * *') fail('staged Worker version is not exact, secret-complete, cron-preserving, and at zero traffic');
    const cf2=await providers.cloudflare.read();if(cf2.versionId!==WEEKLY_RELEASE.rollbackVersion||cf2.trafficPercent!==100||cf2.rollbackRetained!==true) fail('Cloudflare baseline changed before Worker activation');
    workerDeployAttempted=true;
    const deployed=await providers.cloudflare.deployStaged(stage.versionId,100);
    if(deployed?.versionId!==stage.versionId||deployed?.trafficPercent!==100) fail('Worker deployment did not activate only the staged candidate at 100%');
    const [cf3,sb3]=await Promise.all([providers.cloudflare.read(),providers.supabase.read()]);
    if(cf3.versionId!==stage.versionId||cf3.trafficPercent!==100||cf3.rollbackRetained!==true||cf3.candidateSha256!==WEEKLY_RELEASE.candidate||cf3.assetCount!==46||cf3.assetsUnchanged!==true||cf3.approvalVariable!=='true'||cf3.requiredSecretPresent!==true||cf3.cron?.length!==1||cf3.cron[0]!=='* * * * *') fail('deployed Worker identity, bindings, schedule, or assets failed readback');
    verifyPostMigration(sb3,admission.supabaseBaseline);
    const routeVerification=await providers.cloudflare.verifyDeployed({versionId:stage.versionId,candidateSha256:WEEKLY_RELEASE.candidate,expectedAssets:46});
    if(routeVerification?.passed!==true||routeVerification?.versionId!==stage.versionId||routeVerification?.assetCount!==46||routeVerification?.glowRouteCovered!==true||routeVerification?.cartRoutesUnchanged!==true) fail('deployed version, 46 assets, or route ownership verification failed');
    const receipt={format:'hbnf-weekly-glow-two-target-closeout-v1',releaseId:WEEKLY_RELEASE.id,manifestSha256,manifestDriveId:admission.manifestDriveFileId,admissionDecisionDriveId:admissionDecision.driveFileId,admissionDecisionSha256:admissionDecision.sha256,executionClaimDriveId:stored.id,executionClaimGithubRef:lock.ref||null,gateSourceCommit:WEEKLY_RELEASE.gateSourceCommit||manifest.gateSourceCommit,sourceCommit:WEEKLY_RELEASE.runtimeSource,candidateSha256:WEEKLY_RELEASE.candidate,rollback:{workerVersion:WEEKLY_RELEASE.rollbackVersion,sha256:WEEKLY_RELEASE.rollback},cloudflare:{worker:WEEKLY_RELEASE.worker,versionId:cf3.versionId,trafficPercent:100,rollbackRetained:cf3.rollbackRetained,assetCount:cf3.assetCount,assetsUnchanged:cf3.assetsUnchanged,cron:cf3.cron,pollingGuardsVerified:true},supabase:{projectId:sb3.projectId,migration:sb3.migrationLedger.find(m=>m.name==='hbnf_udisc_glow_event_bindings'),bindingRows:sb3.bindings,stateFingerprint:sb3.stateFingerprint,activeWeek:sb3.activeWeek,nov3WeekExists:sb3.nov3WeekExists,legacyAnonWriteGrants:sb3.legacyAnonWriteGrants},acceptance:manifest.acceptanceCriteria.map(c=>({id:c.id,status:'PASS',evidence:c.evidenceRef||`provider-readback:${clock()}`})),status:'INSTALLED_CLOSEOUT_PASS',closedAt:clock()};
    const bytes=jsonBytes(receipt),file=await storage.putOnce(`${WEEKLY_RELEASE.id}.closeout.json`,bytes);
    if(!file?.id||!Buffer.from(await storage.download(file.id)).equals(bytes)) fail('same-manifest closeout was not durably stored and independently downloaded byte-identically');
    return {status:receipt.status,receiptDriveId:file.id,receiptSha256:digest(bytes),receiptBytes:bytes.length,workerVersion:cf3.versionId,migrationLedger:receipt.supabase.migration};
  } catch(error) {
    let cloudflareAfter=null,supabaseAfter=null;
    try{[cloudflareAfter,supabaseAfter]=await Promise.all([providers.cloudflare.read(),providers.supabase.read()]);}catch{}
    if(workerDeployAttempted&&cloudflareAfter?.versionId!==WEEKLY_RELEASE.rollbackVersion) {
      try{await providers.cloudflare.restoreBaseline({versionId:WEEKLY_RELEASE.rollbackVersion,rollbackBytes:artifactBytes.rollback,rollbackSha256:WEEKLY_RELEASE.rollback,cron:['* * * * *']});cloudflareAfter=await providers.cloudflare.read();}catch{}
    }
    const observedMigration=(supabaseAfter?.migrationPresent===true)||(supabaseAfter?.migrationLedger||[]).some(m=>m.name==='hbnf_udisc_glow_event_bindings');
    const failure={format:'hbnf-weekly-glow-execution-failure-v1',releaseId:WEEKLY_RELEASE.id,manifestSha256,executionClaimId:lock.id,migrationMutationPerformed,migrationVerified,workerStageVersion:stage?.versionId||null,workerDeployAttempted,observedWorkerVersion:cloudflareAfter?.versionId||'UNKNOWN',observedMigration,partialState:(migrationMutationPerformed||observedMigration)?'MIGRATION_PRESENT; WORKER STATE AS READ BACK':'NO_DATABASE_MIGRATION_CONFIRMED',error:String(error?.message||error),failedAt:clock()};
    try{const bytes=jsonBytes(failure),file=await storage.putOnce(`${WEEKLY_RELEASE.id}.failure.json`,bytes);if(!file?.id||!Buffer.from(await storage.download(file.id)).equals(bytes))throw new Error('failure evidence download-back mismatch');}catch(storeError){throw new AggregateError([error,storeError],'release failed and durable failure receipt could not be verified');}
    throw new Error(`REVIEW_ONLY partial release state recorded: ${failure.partialState}; ${failure.error}`);
  }
}

/** Real Management API adapter. Credential is read only inside the process and never logged. */
export function createSupabaseManagementAdapter({token=process.env.SUPABASE_ACCESS_TOKEN,fetchImpl=fetch,readBaseline,readInstalled}={}) {
  if(typeof token!=='string'||!token.trim()) fail('SUPABASE_ACCESS_TOKEN with database:write/database_migrations_write permission is unavailable');
  async function readSnapshot(){
    async function querySql(query){
      const response=await fetchImpl(`https://api.supabase.com/v1/projects/${WEEKLY_RELEASE.project}/database/query/read-only`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({query})});
      if(!response.ok){const e=await response.json().catch(()=>({}));fail(`Supabase read-only baseline query returned HTTP ${response.status}${e?.message?`: ${String(e.message).slice(0,240)}`:''}`);}
      const body=await response.json();const rows=Array.isArray(body)?body:body?.result;const row=Array.isArray(rows)?(rows[0]?.readback||rows[0]):(body?.readback||null);
      if(!row||typeof row!=='object')fail('Supabase read-only query response omitted state evidence');return row;
    }
    const tableCheck=await querySql("select to_regclass('public.hbnf_udisc_glow_event_bindings') is not null as exists");
    const tableExists=tableCheck.exists===true;
    const rlsExpr=tableExists?"(select c.relrowsecurity from pg_catalog.pg_class c where c.oid=to_regclass('public.hbnf_udisc_glow_event_bindings'))":"false";
    const roleExpr=tableExists?`has_table_privilege('service_role','public.hbnf_udisc_glow_event_bindings','SELECT') and has_table_privilege('service_role','public.hbnf_udisc_glow_event_bindings','INSERT') and has_table_privilege('service_role','public.hbnf_udisc_glow_event_bindings','UPDATE') and has_table_privilege('service_role','public.hbnf_udisc_glow_event_bindings','DELETE') and not has_table_privilege('anon','public.hbnf_udisc_glow_event_bindings','SELECT') and not has_table_privilege('anon','public.hbnf_udisc_glow_event_bindings','INSERT') and not has_table_privilege('anon','public.hbnf_udisc_glow_event_bindings','UPDATE') and not has_table_privilege('anon','public.hbnf_udisc_glow_event_bindings','DELETE') and not has_table_privilege('authenticated','public.hbnf_udisc_glow_event_bindings','SELECT') and not has_table_privilege('authenticated','public.hbnf_udisc_glow_event_bindings','INSERT') and not has_table_privilege('authenticated','public.hbnf_udisc_glow_event_bindings','UPDATE') and not has_table_privilege('authenticated','public.hbnf_udisc_glow_event_bindings','DELETE')`:"false";
    const bindingsExpr=tableExists?`coalesce((select jsonb_agg(jsonb_build_object('date',event_date::text,'id',event_id,'start',to_char(window_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'end',to_char(window_end at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')) order by event_date) from public.hbnf_udisc_glow_event_bindings),'[]'::jsonb)`:"'[]'::jsonb";
    const snapshotSql=`select jsonb_build_object(
      'projectId','${WEEKLY_RELEASE.project}',
      'bindingTableExists',${tableExists},
      'rlsEnabled',${rlsExpr},
      'serviceRoleOnly',${roleExpr},
      'stateFingerprint',(select md5(to_jsonb(ls)::text) from public.league_state ls where ls.id=1),
      'activeWeek',(select state_json #>> '{glow,activeWeek}' from public.league_state where id=1),
      'nov3WeekExists',coalesce((select coalesce(state_json #> '{glow,weeks}','{}'::jsonb) ? '2026-11-03' from public.league_state where id=1),false),
      'functions',coalesce((select jsonb_agg(p.proname order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('hbnf_apply_udisc_glow_week','hbnf_record_udisc_glow_sync_status')),'[]'::jsonb),
      'legacyAnonWriteGrants',has_table_privilege('anon','public.league_state','INSERT') and has_table_privilege('anon','public.league_state','UPDATE') and has_table_privilege('authenticated','public.league_state','INSERT') and has_table_privilege('authenticated','public.league_state','UPDATE'),
      'matrixAndTagTriggersPreserved',(select count(distinct t.tgname)=3 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='league_state' and t.tgname in ('hbnf_matrix_vnext_capture_after_state_change','hbnf_project_current_tags_into_league_state','trg_hbnf_matrix_sync')),
      'bindings',${bindingsExpr}
    ) as readback`;
    const [state,migrationResponse]=await Promise.all([
      querySql(snapshotSql),
      fetchImpl(`https://api.supabase.com/v1/projects/${WEEKLY_RELEASE.project}/database/migrations`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}}),
    ]);
    if(!migrationResponse.ok){const e=await migrationResponse.json().catch(()=>({}));fail(`Supabase migration-ledger read returned HTTP ${migrationResponse.status}${e?.message?`: ${String(e.message).slice(0,240)}`:''}`);}
    const ledgerBody=await migrationResponse.json();const ledger=Array.isArray(ledgerBody)?ledgerBody:ledgerBody?.migrations;
    if(!Array.isArray(ledger))fail('Supabase Management API migration ledger response is malformed');
    const migrationLedger=ledger.map(m=>({version:String(m.version||''),name:String(m.name||'')}));
    const targetRows=migrationLedger.filter(m=>m.name==='hbnf_udisc_glow_event_bindings');
    return {...state,migrationLedger,migrationPresent:targetRows.length>0,migrationName:targetRows[0]?.name||null,capturedAt:new Date().toISOString()};
  }
  readBaseline??=readSnapshot;readInstalled??=readSnapshot;
  if(typeof readBaseline!=='function'||typeof readInstalled!=='function') fail('Supabase authenticated readback adapters are required');
  return {
    read:readBaseline,
    async applyExactMigration({projectId,name,sha256:expected,query,rollback}) {
      if(projectId!==WEEKLY_RELEASE.project||name!==WEEKLY_RELEASE.migration||digest(Buffer.from(query))!==expected||expected!==WEEKLY_RELEASE.migrationSha256) fail('Management API migration request is outside exact admitted scope');
      if(rollback!==WEEKLY_RELEASE.migrationRollback||digest(Buffer.from(rollback))!==WEEKLY_RELEASE.migrationRollbackSha256) fail('Management API rollback SQL differs from the exact admitted table removal');
      const migrationName=name.replace(/^\d{14}_/,'').replace(/\.sql$/,'');
      const response=await fetchImpl(`https://api.supabase.com/v1/projects/${WEEKLY_RELEASE.project}/database/migrations`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({name:migrationName,query,rollback})});
      if(!response.ok) fail(`Supabase Management API migration returned HTTP ${response.status}`);
      return {applied:true,status:response.status};
    },
    readInstalled,
  };
}

export {digest as sha256, jsonBytes as canonicalManifestBytes};
