// One-time continuation for the already-authorized Glow release after its
// first additive migration landed under Supabase's provider-assigned version.
// Imports are inert; mutations are only possible through explicit adapters.
import {createHash} from 'node:crypto';
import {verifyExistingAuthority, RELEASE} from './hbnf-two-target-execution-core.mjs';

export const SUCCESSOR = Object.freeze({
  id: `${RELEASE.id}-partial-20261030175907`,
  failureSha256: '2109b2ed3c5c7b0683ecfeaa5ae360c690064bb4990cbcc13f23d32683fdb8af',
  failureDriveId: '1M3VINwmCGgE1oUXehuxY0CL4ZcEFt-OT',
  attemptSha256: 'fe702421067f93676a195a54c90aed3b0f3d0e7c56f5d2ff929dd2cb5c43a78a',
  attemptDriveId: '1Dd2DfNs9JLxWBCZEfiR2GURBO2Pv6PsE',
  priorExecutionClaimId: '1lpqS9dWelHa3cQYw_pdFe19Q9BksiOzT',
  priorExecutionClaimSha256: 'c07ce09fb4dce7bb2e77af4c5d3510eaf4a099b716fbfd9deb7295aefc50b0b0',
  migration1: Object.freeze({version:'20261030175907',name:'20261029200450_hbnf_glow_atomic_week_sync',file:'20261029200450_hbnf_glow_atomic_week_sync.sql',sha256:'740536e7046dc5592022a46b363d9e6e9e370a6f79f8b1ec8c3af87e30ba1e69'}),
  stateFingerprint: '947971e7511c917beffd3ae5aec6b441',
  triggers: Object.freeze(['hbnf_matrix_vnext_capture_after_state_change','hbnf_project_current_tags_into_league_state','trg_hbnf_matrix_sync']),
  functions: Object.freeze([
    Object.freeze({name:'hbnf_apply_udisc_glow_week',args:'p_week_date text, p_expected_week jsonb, p_replacement_week jsonb, p_expected_active_week jsonb',owner:'postgres',bodyMd5:'76fba211af95b4ccd91e4059fff8f910',bodyChars:3184,securityDefiner:true,anonExecute:false,authenticatedExecute:false,serviceRoleExecute:true}),
    Object.freeze({name:'hbnf_record_udisc_glow_sync_status',args:'p_week_date text, p_expected_active_week text, p_attempted_at timestamp with time zone, p_error_code text',owner:'postgres',bodyMd5:'cf67edfcba513f936ea6bb4a59f31be7',bodyChars:2481,securityDefiner:true,anonExecute:false,authenticatedExecute:false,serviceRoleExecute:true}),
  ]),
  addedFunctions: Object.freeze([
    Object.freeze({name:'hbnf_enforce_league_state_revision',args:'',owner:'postgres',bodyMd5:'b524b7fd3a0af410615cc261fe93d3a7',bodyChars:177,securityDefiner:false,anonExecute:false,authenticatedExecute:false,serviceRoleExecute:false}),
    Object.freeze({name:'hbnf_save_league_state_v1',args:'p_expected_updated_at timestamp with time zone, p_state_json jsonb',owner:'postgres',bodyMd5:'8bf371de3aff3355071345b59a50397e',bodyChars:808,securityDefiner:true,anonExecute:true,authenticatedExecute:true,serviceRoleExecute:false}),
  ]),
  cartRoutes: Object.freeze([{pattern:'hbnightflyers.com/guest/hbnf-cart/*',script:'hbnf-cart2-private-stage-20261010'},{pattern:'hbnightflyers.com/hbnf-cart*',script:'hbnf-cart2-private-stage-20261010'}]),
  remaining: Object.freeze(RELEASE.migrations.slice(1).map(([name,sha256])=>Object.freeze({name,sha256}))),
  claimPath: `release-claims/${RELEASE.id}-partial-20261030175907.execution-claim.json`,
  manifestName: `${RELEASE.id}-partial-20261030175907.successor-admission.json`,
});

const hash=b=>createHash('sha256').update(b).digest('hex');
const json=v=>Buffer.from(`${JSON.stringify(v,null,2)}\n`);
const fail=m=>{throw new Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function parseRecord(bytes,expected,label){if(!Buffer.isBuffer(bytes)||hash(bytes)!==expected)fail(`${label} hash mismatch`);try{return JSON.parse(bytes.toString('utf8'));}catch{fail(`${label} is invalid JSON`);}}
function grants(s){for(const role of ['anon','authenticated'])for(const p of ['SELECT','INSERT','UPDATE'])if(s?.legacyGrants?.[role]?.[p]!==true)fail(`legacy grant lost: ${role}.${p}`);}

export const PARTIAL_BASELINE_SQL=`select jsonb_build_object(
 'projectId','phcpbvuqibyarpfrftgx','serverTime',now(),
 'rlsEnabled',coalesce((select relrowsecurity from pg_class where oid='public.league_state'::regclass),false),
 'migrationLedger',coalesce((select jsonb_agg(jsonb_build_object('version',version::text,'name',name) order by version) from supabase_migrations.schema_migrations where name in ('20261029200450_hbnf_glow_atomic_week_sync','20261029203741_hbnf_league_state_server_revision_guard','20261030021038_hbnf_league_state_anon_cas_rpc')),'[]'::jsonb),
 'functionEvidence',coalesce((select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'bodyMd5',md5(p.prosrc),'bodyChars',length(p.prosrc),'securityDefiner',p.prosecdef,'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'serviceRoleExecute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('hbnf_apply_udisc_glow_week','hbnf_record_udisc_glow_sync_status','hbnf_enforce_league_state_revision','hbnf_save_league_state_v1')),'[]'::jsonb),
 'revisionTriggerPresent',exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='league_state' and t.tgname='zzz_hbnf_enforce_league_state_revision' and not t.tgisinternal),
 'triggers',coalesce((select jsonb_agg(t.tgname order by t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='league_state' and not t.tgisinternal),'[]'::jsonb),
 'legacyGrants',jsonb_build_object('anon',jsonb_build_object('SELECT',has_table_privilege('anon','public.league_state','SELECT'),'INSERT',has_table_privilege('anon','public.league_state','INSERT'),'UPDATE',has_table_privilege('anon','public.league_state','UPDATE')),'authenticated',jsonb_build_object('SELECT',has_table_privilege('authenticated','public.league_state','SELECT'),'INSERT',has_table_privilege('authenticated','public.league_state','INSERT'),'UPDATE',has_table_privilege('authenticated','public.league_state','UPDATE'))),
 'stateFingerprint',(select md5(to_jsonb(ls)::text) from public.league_state ls where ls.id=1)
) as state`;

function parseMcpRows(r){const txt=typeof r==='string'?r:(r?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');let outer;try{outer=JSON.parse(txt)}catch{fail('Supabase returned non-JSON readback');}const raw=String(outer.result||''),cs=[...raw.matchAll(/<\/untrusted-data-([^>]+)>/g)],c=cs.at(-1);if(!c)fail('Supabase response omitted bounded result');const tag=`<untrusted-data-${c[1]}>`,i=raw.lastIndexOf(tag,c.index);if(i<0)fail('Supabase response has unpaired data boundary');try{return JSON.parse(raw.slice(i+tag.length,c.index).trim());}catch{fail('Supabase data block is invalid JSON');}}
function checkFresh(value,label,now,maxAge){const t=Date.parse(value);if(!Number.isFinite(t)||t>now+30_000||now-t>maxAge)fail(`${label} is missing, future-dated or stale`);}
function checkFunctionEvidence(actual,expected){const map=new Map((actual||[]).map(x=>[x.name,x]));for(const e of expected){const a=map.get(e.name);if(!a||Object.entries(e).some(([k,v])=>a[k]!==v))fail(`installed function evidence mismatch: ${e.name}`);}}

export function validateSuccessorBaseline({cloudflare:c,supabase:s,now=Date.now(),maxAgeMs=300_000}={}){
  if(c?.worker!=='hbnf'||c.versionId!==RELEASE.baseline||c.percentage!==100||c.rollbackRetained!==true||c.cronRemoved!==true||c.pollingDisabled!==true||c.staticAssetsOnly!==true||c.assetHashUnavailable!==true||c.activeCustomDomain!==true||c.glowRouteCovered!==true)fail('Cloudflare v343, rollback, Cron, polling or Custom Domain/Glow route baseline mismatch');
  checkFresh(c.capturedUtc,'Cloudflare readback',now,maxAgeMs);
  if((c.schedules||[]).length)fail('Cloudflare Cron is not empty');
  const cart=(c.routeOwners||[]).filter(x=>x.pattern.includes('hbnf-cart')).sort((a,b)=>a.pattern.localeCompare(b.pattern));
  if(!same(cart,[...SUCCESSOR.cartRoutes].sort((a,b)=>a.pattern.localeCompare(b.pattern))))fail('Cart route owner changed');
  if(s?.projectId!==RELEASE.database||s.rlsEnabled!==true||s.stateFingerprint!==SUCCESSOR.stateFingerprint||s.revisionTriggerPresent!==false)fail('Supabase project, RLS, state fingerprint or revision-trigger partial baseline mismatch');
  checkFresh(s.serverTime,'Supabase readback',now,maxAgeMs);
  if(!Array.isArray(s.migrationLedger)||s.migrationLedger.length!==1||s.migrationLedger[0].version!==SUCCESSOR.migration1.version||s.migrationLedger[0].name!==SUCCESSOR.migration1.name)fail('provider migration ledger does not match the one verified partial migration');
  if((s.functionEvidence||[]).length!==SUCCESSOR.functions.length)fail('unexpected function present in partial database baseline');
  checkFunctionEvidence(s.functionEvidence,SUCCESSOR.functions);
  if(!same([...(s.triggers||[])].sort(),[...SUCCESSOR.triggers].sort()))fail('league_state trigger baseline differs');
  grants(s);
  return true;
}

export function createPartialSupabaseProvider({executeSql,applyMigration,verifySql=executeSql,projectId=RELEASE.database}={}){
  if(typeof executeSql!=='function'||typeof applyMigration!=='function'||projectId!==RELEASE.database)fail('read/apply Supabase provider adapters are required and fixed to the admitted project');
  let dataFingerprint=null,next=0;
  const read=async()=>{const rows=parseMcpRows(await executeSql({project_id:RELEASE.database,query:PARTIAL_BASELINE_SQL}));if(!Array.isArray(rows)||rows.length!==1)fail('Supabase state readback is not singular');const s=rows[0].state;if(!s)fail('Supabase readback omitted state');dataFingerprint??=s.stateFingerprint;if(s.stateFingerprint!==dataFingerprint)fail('league_state changed during migration execution');return s;};
  return {
    async read(){return {projectId:RELEASE.database,...await read()};},
    async applyExactMigration({name,sha256,sql}){const m=SUCCESSOR.remaining[next];if(!m||m.name!==name||m.sha256!==sha256||!Buffer.isBuffer(sql)||hash(sql)!==m.sha256)fail(`only the two exact remaining ordered migrations may execute: ${name}`);const response=await applyMigration({project_id:RELEASE.database,name:name.replace(/\.sql$/,''),query:sql.toString('utf8')});if(response?.isError===true)fail(`Supabase apply failed for ${name}`);next++;return response;},
    async verifyInstalled(){return {projectId:RELEASE.database,...await read(),legacyGrantsPreserved:true,functionsAndTriggerVerified:true};},
  };
}

function verifyPredecessor(e){
  const identity=verifyExistingAuthority(e.authority);
  const failure=parseRecord(e.failureReceipt,SUCCESSOR.failureSha256,'prior failure receipt');
  const attempt=parseRecord(e.attemptEvidence,SUCCESSOR.attemptSha256,'prior attempt evidence');
  if(failure.format!=='hbnf-two-target-execution-failure-v1'||failure.releaseId!==RELEASE.id||failure.dbMigrationsAttempted!==1||failure.workerMutated!==false)fail('prior failure does not describe the one-migration partial state');
  if(attempt.format!=='hbnf-glow-install-attempt-evidence-v1'||attempt.releaseId!==RELEASE.id||attempt.candidateSha256!==RELEASE.candidate||attempt.rollbackSha256!==RELEASE.rollback||attempt.attemptedMigration?.name!==SUCCESSOR.migration1.file||attempt.attemptedMigration?.sha256!==SUCCESSOR.migration1.sha256||!Array.isArray(attempt.otherMigrationsApplied)||attempt.otherMigrationsApplied.length!==0||attempt.cloudflare?.candidateDeployed!==false)fail('prior attempt evidence differs from the recorded failed attempt');
  if(attempt.executionClaim?.driveId!==SUCCESSOR.priorExecutionClaimId||attempt.executionClaim?.sha256!==SUCCESSOR.priorExecutionClaimSha256||attempt.executionClaim?.remoteDownloadBack!=='PASS byte-identical')fail('prior consumed execution claim is not the exact preserved record');
  const approval=JSON.parse(e.authority.approval.toString('utf8'));
  const approved=approval.targets?.find(t=>t.provider==='supabase')?.migrations||[];
  if(!SUCCESSOR.remaining.every(x=>approved.includes(x.name))||approval.candidate?.sha256!==RELEASE.candidate)fail('original owner approval does not cover this narrowed exact continuation');
  return {identity,failure,attempt};
}

export async function admitPartialSuccessor({evidence,readbacks,storage,executionLock,gateSourceCommit,now=Date.now(),clock=()=>new Date(now).toISOString()}){
  if(!/^[0-9a-f]{40}$/.test(gateSourceCommit||''))fail('exact committed successor gate source identity is required');
  const {identity}=verifyPredecessor(evidence);
  validateSuccessorBaseline({...readbacks,now});
  for(const [label,o,methods] of [['Drive',storage,['putOnce','download']],['execution claim',executionLock,['createExclusive','read']]])for(const m of methods)if(typeof o?.[m]!=='function')fail(`${label} adapter missing ${m}`);
  const partial={projectId:RELEASE.database,serverTime:readbacks.supabase.serverTime,migrationLedger:readbacks.supabase.migrationLedger,firstMigrationSqlSha256:SUCCESSOR.migration1.sha256,functions:readbacks.supabase.functionEvidence,revisionTriggerPresent:false,triggers:readbacks.supabase.triggers,legacyGrants:readbacks.supabase.legacyGrants,rlsEnabled:true,stateFingerprint:readbacks.supabase.stateFingerprint};
  const base={format:'hbnf-partial-baseline-successor-admission-v1',successorId:SUCCESSOR.id,releaseId:RELEASE.id,applicationSourceCommit:RELEASE.source,gateSourceCommit,candidateSha256:RELEASE.candidate,rollbackSha256:RELEASE.rollback,oneTime:true,priorAdmission:{...identity,consumedExecutionClaimDriveId:SUCCESSOR.priorExecutionClaimId,consumedExecutionClaimSha256:SUCCESSOR.priorExecutionClaimSha256,failedReceiptDriveId:SUCCESSOR.failureDriveId,failureReceiptSha256:SUCCESSOR.failureSha256,attemptEvidenceDriveId:SUCCESSOR.attemptDriveId,attemptEvidenceSha256:SUCCESSOR.attemptSha256},cloudflareBaseline:readbacks.cloudflare,supabasePartialBaseline:partial,migrationPlan:{alreadyApplied:{...SUCCESSOR.migration1,action:'verify-only; never reapply'},remaining:SUCCESSOR.remaining.map(x=>({...x,action:'apply-once in order'}))},ownerAuthorization:{driveId:'1au6vCaUdEjsc3HSGyQRq2iwNv5qmJnlI',scope:'unchanged original approval; same candidate; only the two remaining approved migrations',pollingDisabled:true},acceptancePlan:[{id:'supabase-migrations',scope:'two remaining additive migrations',description:'Apply migration 2 then 3, preserve league_state and legacy grants, and verify installed function bodies, grants, triggers, provider-assigned ledger versions and independent readback.',method:'Apply each exact SQL hash once; query provider ledger/schema/functions/permissions after each; compare league_state fingerprint.',expectedOutcome:'Exactly migrations 2 and 3 recorded under provider-assigned versions; migration 1 remains untouched; unrelated data and direct-write permissions preserved.'},{id:'cloudflare-worker',scope:'HBNF Worker hbnf and its Glow routes',description:'Deploy the exact approved candidate and preserve all legacy assets/routes.',method:'Fresh authenticated target reread, exact candidate SHA deploy, provider version readback, public 46-asset route verification.',expectedOutcome:'Exact candidate active at 100%, 43 unchanged assets, Glow modified, two helpers added, Cart routing unchanged, v343 rollback retained.'},{id:'polling-disabled',scope:'UDisc scheduled source access',description:'Keep source access disabled until event configuration is separately verified.',method:'Confirm UDISC_GLOW_ACCESS_APPROVED absent/false, no event credentials/configuration, and no direct UDisc request occurs.',expectedOutcome:'No UDisc retrieval or sync during this installation.'},{id:'durable-closeout',scope:'Both provider targets and successor admission',description:'Verify installed target identities and retain same-manifest closeout.',method:'Write and independently download same-manifest closeout and rollback evidence.',expectedOutcome:'Closeout byte-identical in approved Drive location and references this successor manifest and atomic execution claim.'}],recovery:{rollbackDriveId:'16ILHuKGKxbll0kpagHS5UFu3xtxUttZz',rollbackSha256:RELEASE.rollback,worker:'restore v343 and explicitly set triggers.crons=[]',database:'retain only additive migrations actually applied; no down migration or ledger edit'},createdUtc:clock()};
  const manifestBytes=json({...base,phase:'PENDING_DURABLE_SUCCESSOR_ADMISSION',status:'PENDING'});
  const claim={format:'hbnf-partial-successor-execution-claim-v1',successorId:SUCCESSOR.id,releaseId:RELEASE.id,manifestSha256:hash(manifestBytes),candidateSha256:RELEASE.candidate,rollbackSha256:RELEASE.rollback,baselineVersion:RELEASE.baseline,partialLedgerVersion:SUCCESSOR.migration1.version,remaining:SUCCESSOR.remaining,oneTime:true};
  const claimBytes=json(claim),lock=await executionLock.createExclusive(SUCCESSOR.claimPath,claimBytes);
  if(lock?.created!==true||!lock.id||!Buffer.from(await executionLock.read(lock.id)).equals(claimBytes))fail('successor claim is replayed, nonexclusive or failed independent readback');
  const stored=await storage.putOnce(SUCCESSOR.manifestName,manifestBytes);
  if(!stored?.id||stored.durable!==true||!Buffer.from(await storage.download(stored.id)).equals(manifestBytes))fail('successor manifest not durably stored and independently downloaded byte-identically');
  const decision={format:'hbnf-partial-successor-admission-decision-v1',successorId:SUCCESSOR.id,releaseId:RELEASE.id,status:'SUCCESSOR_ADMISSION_PASS',manifestDriveId:stored.id,manifestSha256:hash(manifestBytes),manifestBytes:manifestBytes.length,executionClaimRef:lock.id,sourceCommit:RELEASE.source,candidateSha256:RELEASE.candidate,targets:['hbnf','phcpbvuqibyarpfrftgx'],productionMutationAuthorizedByExistingApproval:true,recordedUtc:clock()};
  const decisionBytes=json(decision),decisionStored=await storage.putOnce(`${SUCCESSOR.id}.successor-decision.json`,decisionBytes);
  if(!decisionStored?.id||decisionStored.durable!==true||!Buffer.from(await storage.download(decisionStored.id)).equals(decisionBytes))fail('successor admission decision not durably stored and independently downloaded byte-identically');
  const claimRecord=await storage.putOnce(`${SUCCESSOR.id}.execution-claim.json`,claimBytes);
  if(!claimRecord?.id||claimRecord.durable!==true||!Buffer.from(await storage.download(claimRecord.id)).equals(claimBytes))fail('successor execution claim not durably preserved and downloaded back');
  const admitted={...base,phase:'SUCCESSOR_ADMISSION_PASS',status:'SUCCESSOR_ADMISSION_PASS',manifestDriveId:stored.id,manifestSha256:hash(manifestBytes),manifestBytes:manifestBytes.length,manifestBytesLocal:manifestBytes,decisionDriveId:decisionStored.id,decisionSha256:hash(decisionBytes),decisionBytesLocal:decisionBytes,claim:{...claim,githubRef:lock.id,driveId:claimRecord.id,sha256:hash(claimBytes),bytes:claimBytes}};
  return {status:'SUCCESSOR_ADMISSION_PASS',admission:admitted};
}

function checkInstalledProgress(s,{expectedNames,revisionTrigger}){
  if(s?.projectId!==RELEASE.database||s.stateFingerprint!==SUCCESSOR.stateFingerprint)fail('league_state changed during additive migration');
  grants(s);
  const expectedLedger=[SUCCESSOR.migration1.name,...expectedNames.map(n=>n.replace(/\.sql$/,''))];
  if(!Array.isArray(s.migrationLedger)||s.migrationLedger.length!==expectedLedger.length||expectedLedger.some(n=>s.migrationLedger.filter(x=>x.name===n).length!==1))fail('provider ledger name/count mismatch after migration');
  if(s.migrationLedger.some(x=>!/^\d{14}$/.test(x.version)))fail('provider-assigned migration version is malformed');
  if(Boolean(s.revisionTriggerPresent)!==revisionTrigger)fail('server-owned revision trigger readback mismatch');
  const expectedFunctions=[...SUCCESSOR.functions,...(expectedNames.length?SUCCESSOR.addedFunctions.slice(0,expectedNames.length):[])];
  if((s.functionEvidence||[]).length!==expectedFunctions.length)fail('unexpected installed function count');
  checkFunctionEvidence(s.functionEvidence,expectedFunctions);
  const expectedTriggers=[...SUCCESSOR.triggers,...(revisionTrigger?['zzz_hbnf_enforce_league_state_revision']:[])].sort();
  if(!same([...(s.triggers||[])].sort(),expectedTriggers))fail('trigger names differ after migration');
  return s.migrationLedger;
}

export async function executePartialSuccessor({evidence,admission,providers,storage,executionLock,currentGateSourceCommit,clock=()=>new Date().toISOString()}){
  verifyPredecessor(evidence);
  const mb=admission?.manifestBytesLocal;
  if(admission?.status!=='SUCCESSOR_ADMISSION_PASS'||admission.gateSourceCommit!==currentGateSourceCommit||!Buffer.isBuffer(mb)||hash(mb)!==admission.manifestSha256||!Buffer.from(await storage.download(admission.manifestDriveId)).equals(mb))fail('admission manifest/source missing, altered or not remotely retrievable');
  if(!Buffer.isBuffer(admission.claim?.bytes)||hash(admission.claim.bytes)!==admission.claim.sha256||!Buffer.from(await storage.download(admission.claim.driveId)).equals(admission.claim.bytes))fail('successor execution claim missing, altered or not remotely retrievable');
  if(!executionLock?.read||!Buffer.from(await executionLock.read(admission.claim.githubRef)).equals(admission.claim.bytes))fail('atomic GitHub execution claim readback mismatch');
  if(!Buffer.isBuffer(admission.decisionBytesLocal)||hash(admission.decisionBytesLocal)!==admission.decisionSha256||!Buffer.from(await storage.download(admission.decisionDriveId)).equals(admission.decisionBytesLocal))fail('successor admission decision missing or not remotely retrievable');
  if(!providers?.cloudflare?.read||!providers.cloudflare.deployExact||!providers.cloudflare.restoreV343||!providers.cloudflare.verifyDeployed||!providers?.supabase?.read||!providers.supabase.applyExactMigration||!providers.supabase.verifyInstalled)fail('successor provider adapter incomplete');
  const [c0,s0]=await Promise.all([providers.cloudflare.read(),providers.supabase.read()]);
  validateSuccessorBaseline({cloudflare:c0,supabase:s0});
  if(c0.versionId!==admission.cloudflareBaseline.versionId||s0.stateFingerprint!==admission.supabasePartialBaseline.stateFingerprint)fail('fresh execution-boundary baseline differs from admitted manifest');
  if(!same(c0.routeOwners,admission.cloudflareBaseline.routeOwners)||!same(c0.schedules,admission.cloudflareBaseline.schedules)||c0.activeCustomDomain!==admission.cloudflareBaseline.activeCustomDomain)fail('Cloudflare route/domain/schedule identity differs from admitted manifest');
  let attempts=0,workerMayHaveChanged=false;const applied=[];
  try{
    for(let i=0;i<SUCCESSOR.remaining.length;i++){
      const x=SUCCESSOR.remaining[i],m=evidence.authority.migrationBytes[i+1];
      if(m.name!==x.name||hash(m.bytes)!==x.sha256)fail(`exact migration bytes mismatch: ${x.name}`);
      attempts++;await providers.supabase.applyExactMigration({name:x.name,sha256:x.sha256,sql:m.bytes});
      const s=await providers.supabase.read(),expected=[...applied.map(a=>a.name),x.name];
      const ledger=checkInstalledProgress(s,{expectedNames:expected,revisionTrigger:true});
      const row=ledger.find(y=>y.name===x.name.replace(/\.sql$/,''));if(!row||row.version===SUCCESSOR.migration1.version)fail(`provider-assigned migration version invalid for ${x.name}`);
      applied.push({name:x.name,providerVersion:row.version,sourceSha256:x.sha256});
    }
    const db=await providers.supabase.verifyInstalled({remaining:SUCCESSOR.remaining,legacyGrants:true,stateUnchanged:true});
    checkInstalledProgress(db,{expectedNames:SUCCESSOR.remaining.map(x=>x.name),revisionTrigger:true});
    const cf=await providers.cloudflare.read();
    if(cf.worker!=='hbnf'||cf.versionId!==c0.versionId||cf.percentage!==100||cf.rollbackRetained!==true||cf.cronRemoved!==true||cf.pollingDisabled!==true||cf.staticAssetsOnly!==true||cf.assetHashUnavailable!==true||cf.activeCustomDomain!==true||cf.glowRouteCovered!==true)fail('Cloudflare baseline changed or safety state differs before deployment');
    checkFresh(cf.capturedUtc,'Cloudflare pre-deploy readback',Date.now(),300_000);
    if(!same(cf.routeOwners,c0.routeOwners)||!same(cf.schedules,c0.schedules)||cf.activeCustomDomain!==c0.activeCustomDomain)fail('Cloudflare route/domain/schedule identity drifted during database migrations');
    workerMayHaveChanged=true;
    const deployed=await providers.cloudflare.deployExact({zip:evidence.authority.candidate,sha256:RELEASE.candidate,keepPollingDisabled:true});
    if(!deployed?.versionId)fail('Worker deploy omitted full version identity');
    const final=await providers.cloudflare.read();if(final.versionId!==deployed.versionId||final.percentage!==100||final.pollingDisabled!==true||final.rollbackRetained!==true)fail('installed Worker readback mismatch or polling active');
    const assets=await providers.cloudflare.verifyDeployed({versionId:deployed.versionId,expectedAssetDelta:{same:43,modified:['glow.html'],added:['glow-save-sync.mjs','league-state-cas.mjs']},legacyReadOnly:true});
    if(assets?.passed!==true||assets.assetCount+assets.externallyRoutedAssetCount!==46)fail('46-asset/route acceptance failed');
    const closeout={format:'hbnf-partial-successor-two-target-closeout-v1',successorId:SUCCESSOR.id,releaseId:RELEASE.id,manifestDriveId:admission.manifestDriveId,manifestSha256:admission.manifestSha256,admissionDecisionDriveId:admission.decisionDriveId,admissionDecisionSha256:admission.decisionSha256,executionClaimGithubRef:admission.claim.githubRef,executionClaimSha256:admission.claim.sha256,candidateSha256:RELEASE.candidate,applicationSourceCommit:RELEASE.source,gateSourceCommit:admission.gateSourceCommit,rollbackSha256:RELEASE.rollback,cloudflare:{worker:'hbnf',versionId:deployed.versionId,percentage:100,rollbackVersion:RELEASE.baseline,rollbackRetained:final.rollbackRetained,pollingDisabled:final.pollingDisabled,activeCustomDomain:final.activeCustomDomain,routeOwners:final.routeOwners,schedules:final.schedules,assets},supabase:{projectId:RELEASE.database,preexistingMigration:{name:SUCCESSOR.migration1.name,version:SUCCESSOR.migration1.version,reapplied:false},appliedMigrations:applied,stateFingerprint:db.stateFingerprint,legacyGrantsPreserved:true,functionsAndTriggerVerified:true},acceptance:{leagueStateUnchanged:true,cartRoutesUnchanged:true,udiscPollingNotActivated:true,rollbackRetained:true},status:'INSTALLED_CLOSEOUT_PASS',recordedUtc:clock()};
    const bytes=json(closeout),stored=await storage.putOnce(`${SUCCESSOR.id}.closeout.json`,bytes);
    if(!stored?.id||stored.durable!==true||!Buffer.from(await storage.download(stored.id)).equals(bytes))fail('same-manifest closeout failed durable download-back');
    return {status:'INSTALLED_CLOSEOUT_PASS',driveId:stored.id,sha256:hash(bytes),bytes:bytes.length,closeout};
  }catch(error){
    let recovery='NOT_REQUIRED',workerRestored=false;
    if(workerMayHaveChanged){try{await providers.cloudflare.restoreV343({versionId:RELEASE.baseline,sha256:RELEASE.rollback,removeCron:true});const r=await providers.cloudflare.read();if(r.versionId!==RELEASE.baseline||r.percentage!==100||r.cronRemoved!==true)fail('v343 or explicit Cron-removal readback failed');workerRestored=true;recovery='V343_RESTORED_CRON_REMOVED';}catch(e){recovery=`ROLLBACK_UNVERIFIED:${e.message}`;}}
    const failed={format:'hbnf-partial-successor-execution-failure-v1',successorId:SUCCESSOR.id,releaseId:RELEASE.id,manifestDriveId:admission.manifestDriveId,manifestSha256:admission.manifestSha256,executionClaim:admission.claim.githubRef,remainingMigrationAttempts:attempts,appliedMigrations:applied,additiveDatabaseMayRemain:attempts>0,workerMayHaveChanged,workerRestored,recovery,error:String(error.message),recordedUtc:clock()};
    const bytes=json(failed),stored=await storage.putOnce(`${SUCCESSOR.id}.failure-${clock().replace(/\D/g,'')}.json`,bytes);
    if(!stored?.id||stored.durable!==true||!Buffer.from(await storage.download(stored.id)).equals(bytes))throw new AggregateError([error],'successor failed and durable failure receipt did not verify; do not retry');
    throw new Error(`SUCCESSOR FAILED; attempted=${attempts}; recovery=${recovery}; failureDriveId=${stored.id}; ${error.message}`);
  }
}
