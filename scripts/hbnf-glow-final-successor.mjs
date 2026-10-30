// One-time final continuation after the exact first two additive migrations
// were applied. Binds the verified two-migration production state and applies
// only the remaining CAS RPC migration before deploying the unchanged ZIP.
import {createHash} from 'node:crypto';
import {RELEASE,verifyExistingAuthority} from './hbnf-two-target-execution-core.mjs';
import {SUCCESSOR,PARTIAL_BASELINE_SQL} from './hbnf-glow-partial-successor.mjs';

export const FINAL=Object.freeze({
 id:`${RELEASE.id}-partial-guard-installed-20261030190022`,
 prior:{
  manifestId:'1b2Y87ihQ5OTlQ4-BbgJtTxzcmM6QK1gQ',manifestSha256:'279bc21040814c6506392c132cc515aa61aef46011f85bec94d73e770333650d',
  decisionId:'1HcdQziTpRF_LzSHclG1qEVqyzYGKN6Oi',decisionSha256:'551e78f95d0ecf6ccda1cfa3c0f01ca136790191b95d869d6e7690d334dba1e9',
  claimId:'1Gk1qXh2Xu14vZX-JrDLybWkV_bvLHUX2',claimSha256:'17cb471ee27c75d06a3f11229c763e30200b3e537b822052e03c7904e5ddea7f',
  githubClaimCommit:'a11cbbd7938adb837fa4487120ac8cf5d3ee14bd',
  failureId:'1RRb0ja61c1jVY_U7pZmLM_tpOVPFh8G4',failureSha256:'0e2ea0d12406be8611e35674986c2777c55be5ec302cde6b13fd621be7b5e6fb',
 },
 first:{version:'20261030175907',name:'20261029200450_hbnf_glow_atomic_week_sync',sha256:'740536e7046dc5592022a46b363d9e6e9e370a6f79f8b1ec8c3af87e30ba1e69'},
 second:{version:'20261030190022',name:'20261029203741_hbnf_league_state_server_revision_guard',sha256:'8521bc34fdaf7e3015c76c0d0f2f1bd6d1baf00d8dca7b262aec19b38e587b2d'},
 remaining:Object.freeze([{name:'20261030021038_hbnf_league_state_anon_cas_rpc.sql',sha256:'460a8bee8961ebd78968678d1690b7c4565f6a8785347e6c08f6cba4903739b7'}]),
 stateFingerprint:'947971e7511c917beffd3ae5aec6b441',
 triggers:Object.freeze([...SUCCESSOR.triggers,'zzz_hbnf_enforce_league_state_revision']),
 functions:Object.freeze([...SUCCESSOR.functions,{...SUCCESSOR.addedFunctions[0],serviceRoleExecute:true}]),
 finalFunction:Object.freeze({...SUCCESSOR.addedFunctions[1],serviceRoleExecute:true}),
 claimPath:`release-claims/${RELEASE.id}-partial-guard-installed-20261030190022.execution-claim.json`,
 manifestName:`${RELEASE.id}-partial-guard-installed-20261030190022.successor-admission.json`,
 priorFailureSha256:'0e2ea0d12406be8611e35674986c2777c55be5ec302cde6b13fd621be7b5e6fb',
 cartRoutes:SUCCESSOR.cartRoutes,
});

const sha=b=>createHash('sha256').update(b).digest('hex');
const json=v=>Buffer.from(`${JSON.stringify(v,null,2)}\n`);
const fail=m=>{throw new Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fresh=(v,label,now=Date.now(),max=300000)=>{const t=Date.parse(v);if(!Number.isFinite(t)||t>now+30000||now-t>max)fail(`${label} missing, future-dated or stale`);};
function parse(bytes,expected,label){if(!Buffer.isBuffer(bytes)||sha(bytes)!==expected)fail(`${label} byte hash mismatch`);try{return JSON.parse(bytes.toString('utf8'));}catch{fail(`${label} is not JSON`);}}
function supabaseRows(r){const text=typeof r==='string'?r:(r?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');let outer;try{outer=JSON.parse(text);}catch{fail('Supabase MCP returned non-JSON final readback');}const raw=String(outer.result||''),m=[...raw.matchAll(/<\/untrusted-data-([^>]+)>/g)].at(-1);if(!m)fail('Supabase final readback omitted bounded result');const tag=`<untrusted-data-${m[1]}>`,i=raw.lastIndexOf(tag,m.index);if(i<0)fail('Supabase final readback has malformed data boundary');try{return JSON.parse(raw.slice(i+tag.length,m.index).trim());}catch{fail('Supabase final readback data block is invalid JSON');}}
function checkFns(actual,expected){const map=new Map((actual||[]).map(f=>[f.name,f]));if(map.size!==expected.length)fail('installed function inventory count mismatch');for(const e of expected){const a=map.get(e.name);if(!a||Object.entries(e).some(([k,v])=>a[k]!==v))fail(`installed function evidence mismatch: ${e.name}`);}}
function checkGrants(s){for(const role of ['anon','authenticated'])for(const priv of ['SELECT','INSERT','UPDATE'])if(s?.legacyGrants?.[role]?.[priv]!==true)fail(`legacy league_state grant lost: ${role}.${priv}`);}

export function validateFinalBaseline({cloudflare:c,supabase:s,now=Date.now(),maxAgeMs=300000}={}){
 if(c?.worker!=='hbnf'||c.versionId!==RELEASE.baseline||c.percentage!==100||c.rollbackRetained!==true||c.cronRemoved!==true||c.pollingDisabled!==true||c.staticAssetsOnly!==true||c.assetHashUnavailable!==true||c.activeCustomDomain!==true||c.glowRouteCovered!==true)fail('Cloudflare v343, rollback, Cron, poll, domain or route baseline mismatch');
 fresh(c.capturedUtc,'Cloudflare baseline',now,maxAgeMs);if((c.schedules||[]).length)fail('Cloudflare schedules are not empty');
 const cart=(c.routeOwners||[]).filter(x=>x.pattern.includes('hbnf-cart')).sort((a,b)=>a.pattern.localeCompare(b.pattern));if(!same(cart,[...FINAL.cartRoutes].sort((a,b)=>a.pattern.localeCompare(b.pattern))))fail('Cart route owners changed');
 if(s?.projectId!==RELEASE.database||s.rlsEnabled!==true||s.stateFingerprint!==FINAL.stateFingerprint||s.revisionTriggerPresent!==true)fail('Supabase identity/data/trigger baseline mismatch');fresh(s.serverTime,'Supabase baseline',now,maxAgeMs);
 const expectedLedger=[{version:FINAL.first.version,name:FINAL.first.name},{version:FINAL.second.version,name:FINAL.second.name}];if(!same(s.migrationLedger,expectedLedger))fail('Supabase partial migration ledger does not match the exact two applied provider versions/names');
 checkFns(s.functionEvidence,FINAL.functions);if(!same([...(s.triggers||[])].sort(),[...FINAL.triggers].sort()))fail('preserved triggers/revision trigger mismatch');checkGrants(s);return true;
}

export function createFinalSupabaseProvider({executeSql,applyMigration,projectId=RELEASE.database}={}){
 if(typeof executeSql!=='function'||typeof applyMigration!=='function'||projectId!==RELEASE.database)fail('final Supabase read/apply adapters must be fixed to the admitted project');let initialFingerprint=null,attempts=0;
 const read=async()=>{const rows=supabaseRows(await executeSql({project_id:RELEASE.database,query:PARTIAL_BASELINE_SQL}));if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.state)fail('final Supabase readback is not one state row');const s=rows[0].state;initialFingerprint??=s.stateFingerprint;if(s.stateFingerprint!==initialFingerprint)fail('league_state data changed during final migration');return{projectId:RELEASE.database,...s};};
 return{async read(){return read();},async applyExactMigration({name,sha256,sql}){const m=FINAL.remaining[attempts];if(!m||m.name!==name||m.sha256!==sha256||!Buffer.isBuffer(sql)||sha(sql)!==m.sha256)fail('final execution may apply only the exact remaining migration once');attempts++;const r=await applyMigration({project_id:RELEASE.database,name:name.replace(/\.sql$/,''),query:sql.toString('utf8')});if(r?.isError===true)fail('Supabase rejected the final exact migration');return r;},async verifyInstalled(){return{...await read(),legacyGrantsPreserved:true,functionsAndTriggerVerified:true};}};
}

function verifyPredecessor(e){
 const identity=verifyExistingAuthority(e.authority);
 const firstFailure=parse(e.firstFailure,SUCCESSOR.failureSha256,'original partial execution failure');
 const firstAttempt=parse(e.firstAttempt,SUCCESSOR.attemptSha256,'original partial execution attempt');
 if(firstFailure.dbMigrationsAttempted!==1||firstFailure.workerMutated!==false)fail('original failed attempt identity differs');
 if(firstAttempt.executionClaim?.driveId!==SUCCESSOR.priorExecutionClaimId||firstAttempt.executionClaim?.sha256!==SUCCESSOR.priorExecutionClaimSha256)fail('original consumed claim differs');
 const priorManifest=parse(e.priorSuccessorManifest,FINAL.prior.manifestSha256,'prior successor manifest');
 const priorDecision=parse(e.priorSuccessorDecision,FINAL.prior.decisionSha256,'prior successor decision');
 const priorClaim=parse(e.priorSuccessorClaim,FINAL.prior.claimSha256,'prior successor claim');
 const priorFailure=parse(e.priorSuccessorFailure,FINAL.prior.failureSha256,'prior successor failure receipt');
 if(priorManifest.successorId!==SUCCESSOR.id||priorManifest.gateSourceCommit!=='a4705be0676fea48956730ce0e53d8c6792d6adb'||priorManifest.candidateSha256!==RELEASE.candidate)fail('prior successor manifest source/candidate mismatch');
 if(priorDecision.status!=='SUCCESSOR_ADMISSION_PASS'||priorDecision.manifestSha256!==FINAL.prior.manifestSha256||priorDecision.manifestDriveId!==FINAL.prior.manifestId)fail('prior successor decision mismatch');
 if(priorClaim.successorId!==SUCCESSOR.id||priorClaim.manifestSha256!==FINAL.prior.manifestSha256||priorClaim.oneTime!==true)fail('prior successor claim mismatch');
 if(priorFailure.successorId!==SUCCESSOR.id||priorFailure.workerMayHaveChanged!==false||priorFailure.remainingMigrationAttempts!==1||priorFailure.error!=='installed function evidence mismatch: hbnf_enforce_league_state_revision')fail('prior failed attempt is not the preserved one-migration validator failure');
 return {identity,priorManifest,priorDecision,priorClaim,priorFailure};
}

export async function admitFinalSuccessor({evidence,readbacks,storage,executionLock,gateSourceCommit,clock=()=>new Date().toISOString()}={}){
 if(!/^[0-9a-f]{40}$/.test(gateSourceCommit||''))fail('exact committed final-successor source identity required');
 const predecessor=verifyPredecessor(evidence);validateFinalBaseline({...readbacks,now:Date.now()});
 for(const [label,o,names] of [['Drive',storage,['putOnce','download']],['GitHub claim',executionLock,['createExclusive','read']]])for(const n of names)if(typeof o?.[n]!=='function')fail(`${label} adapter lacks ${n}`);
 const base={format:'hbnf-glow-final-partial-baseline-admission-v1',successorId:FINAL.id,releaseId:RELEASE.id,applicationSourceCommit:RELEASE.source,gateSourceCommit,candidateSha256:RELEASE.candidate,rollbackSha256:RELEASE.rollback,oneTime:true,
  previousSuccessor:{id:SUCCESSOR.id,manifestDriveId:FINAL.prior.manifestId,manifestSha256:FINAL.prior.manifestSha256,decisionDriveId:FINAL.prior.decisionId,decisionSha256:FINAL.prior.decisionSha256,executionClaimDriveId:FINAL.prior.claimId,executionClaimSha256:FINAL.prior.claimSha256,executionClaimCommit:FINAL.prior.githubClaimCommit,failureDriveId:FINAL.prior.failureId,failureSha256:FINAL.prior.failureSha256},
  originalAuthority:{...predecessor.identity,failedAttemptDriveId:SUCCESSOR.attemptDriveId,failedAttemptSha256:SUCCESSOR.attemptSha256,initialFailureDriveId:SUCCESSOR.failureDriveId,initialFailureSha256:SUCCESSOR.failureSha256,consumedExecutionClaimDriveId:SUCCESSOR.priorExecutionClaimId,consumedExecutionClaimSha256:SUCCESSOR.priorExecutionClaimSha256},
  cloudflareBaseline:readbacks.cloudflare,supabasePartialBaseline:{projectId:RELEASE.database,serverTime:readbacks.supabase.serverTime,migrationLedger:readbacks.supabase.migrationLedger,stateFingerprint:readbacks.supabase.stateFingerprint,revisionTriggerPresent:true,triggers:readbacks.supabase.triggers,functions:readbacks.supabase.functionEvidence,legacyGrants:readbacks.supabase.legacyGrants,rlsEnabled:true},
  migrationPlan:{alreadyApplied:[{...FINAL.first,action:'verify only; never reapply'},{...FINAL.second,action:'verify only; never reapply'}],remaining:FINAL.remaining.map(x=>({...x,action:'apply once'}))},
  ownerAuthorization:{driveId:'1au6vCaUdEjsc3HSGyQRq2iwNv5qmJnlI',scope:'unchanged original approval; exact same candidate; only the one remaining originally approved migration',pollingDisabled:true},
  recovery:{rollbackDriveId:'16ILHuKGKxbll0kpagHS5UFu3xtxUttZz',rollbackSha256:RELEASE.rollback,worker:'restore v343 and explicitly set triggers.crons=[]',database:'retain only additive migrations actually applied; no down migration or manual ledger edit'},
  acceptancePlan:[{id:'remaining-supabase-migration',scope:FINAL.remaining[0].name,description:'Apply only migration 3; verify exact installed function body/ACL, provider-assigned ledger name/version, prior two migrations, legacy grants and unchanged league_state.',method:'Apply exact admitted SQL once, then read provider ledger/schema/ACL/data fingerprint independently.',expectedOutcome:'All three approved migrations appear exactly once; the first two retain their existing versions; no score/data or legacy grant changes.'},{id:'cloudflare-worker',scope:'Worker hbnf and Glow routes',description:'Deploy exact approved static candidate, preserve 46-asset scope and current route owners.',method:'Fresh authenticated v343 readback, exact ZIP deploy, full provider version/asset/routing readback.',expectedOutcome:'Candidate 100%; 43 unchanged assets, Glow modified, two helpers added; v343 rollback retained; Cart routes unchanged.'},{id:'polling-disabled',scope:'UDisc scheduled access',description:'Leave automatic data requests disabled.',method:'Read Worker secret/bindings and candidate config.',expectedOutcome:'UDISC_GLOW_ACCESS_APPROVED absent/false; no event credentials configured; no UDisc requests.'},{id:'durable-closeout',scope:'same two targets and this one-time admission',description:'Store and independently retrieve exact closeout and rollback evidence.',method:'Upload closeout and download back byte-for-byte.',expectedOutcome:'Receipt binds this manifest, this new claim, installed CF/Supabase identities and exact prior rollback.'}],
  createdUtc:clock()};
 const pending=json({...base,status:'PENDING',phase:'PENDING_DURABLE_ADMISSION'});
 const claim=json({format:'hbnf-glow-final-successor-execution-claim-v1',successorId:FINAL.id,releaseId:RELEASE.id,manifestSha256:sha(pending),candidateSha256:RELEASE.candidate,rollbackSha256:RELEASE.rollback,baselineWorkerVersion:RELEASE.baseline,baselineLedger:readbacks.supabase.migrationLedger,remaining:FINAL.remaining,oneTime:true});
 const lock=await executionLock.createExclusive(FINAL.claimPath,claim);if(lock?.created!==true||!lock.id||!Buffer.from(await executionLock.read(lock.id)).equals(claim))fail('final successor execution claim already exists or failed independent GitHub readback');
 const stored=await storage.putOnce(FINAL.manifestName,pending);if(!stored?.id||stored.durable!==true||!Buffer.from(await storage.download(stored.id)).equals(pending))fail('final successor manifest failed durable byte-identical Drive download-back');
 const decision=json({format:'hbnf-glow-final-successor-admission-decision-v1',successorId:FINAL.id,releaseId:RELEASE.id,status:'FINAL_SUCCESSOR_ADMISSION_PASS',manifestDriveId:stored.id,manifestSha256:sha(pending),manifestBytes:pending.length,executionClaimRef:lock.id,candidateSha256:RELEASE.candidate,sourceCommit:RELEASE.source,gateSourceCommit,targets:['hbnf',RELEASE.database],productionMutationAuthorizedByExistingApproval:true,recordedUtc:clock()});
 const decisionStored=await storage.putOnce(`${FINAL.id}.admission-decision.json`,decision);if(!decisionStored?.id||decisionStored.durable!==true||!Buffer.from(await storage.download(decisionStored.id)).equals(decision))fail('final successor decision failed durable download-back');
 const claimStored=await storage.putOnce(`${FINAL.id}.execution-claim.json`,claim);if(!claimStored?.id||claimStored.durable!==true||!Buffer.from(await storage.download(claimStored.id)).equals(claim))fail('final successor claim preservation failed durable download-back');
 return {status:'FINAL_SUCCESSOR_ADMISSION_PASS',admission:{...base,status:'FINAL_SUCCESSOR_ADMISSION_PASS',manifestDriveId:stored.id,manifestSha256:sha(pending),manifestBytesLocal:pending,decisionDriveId:decisionStored.id,decisionSha256:sha(decision),decisionBytesLocal:decision,claim:{...JSON.parse(claim),githubRef:lock.id,driveId:claimStored.id,sha256:sha(claim),bytes:claim}}};
}

function checkAfterMigration(s){
 checkGrants(s);if(s.projectId!==RELEASE.database||s.stateFingerprint!==FINAL.stateFingerprint||s.revisionTriggerPresent!==true)fail('state/revision-trigger readback changed after final migration');
 const ledger=s.migrationLedger||[];if(ledger.length!==3||ledger.filter(x=>x.name===FINAL.first.name&&x.version===FINAL.first.version).length!==1||ledger.filter(x=>x.name===FINAL.second.name&&x.version===FINAL.second.version).length!==1||ledger.filter(x=>x.name===FINAL.remaining[0].name.replace(/\.sql$/,'')).length!==1||ledger.some(x=>!/^[0-9]{14}$/.test(x.version)))fail('final provider ledger does not contain exactly the three approved migrations');
 const last=ledger.find(x=>x.name===FINAL.remaining[0].name.replace(/\.sql$/,''));if([FINAL.first.version,FINAL.second.version].includes(last.version))fail('third migration reused an existing provider version');
 checkFns(s.functionEvidence,[...FINAL.functions,FINAL.finalFunction]);if(!same([...(s.triggers||[])].sort(),[...FINAL.triggers].sort()))fail('final trigger inventory mismatch');return last;
}

export async function executeFinalSuccessor({evidence,admission,providers,storage,executionLock,currentGateSourceCommit,clock=()=>new Date().toISOString()}={}){
 verifyPredecessor(evidence);const mb=admission?.manifestBytesLocal;
 if(admission?.status!=='FINAL_SUCCESSOR_ADMISSION_PASS'||admission.gateSourceCommit!==currentGateSourceCommit||!Buffer.isBuffer(mb)||sha(mb)!==admission.manifestSha256||!Buffer.from(await storage.download(admission.manifestDriveId)).equals(mb))fail('final admission manifest/source missing, altered or not remotely retrievable');
 if(!Buffer.isBuffer(admission.claim?.bytes)||sha(admission.claim.bytes)!==admission.claim.sha256||!Buffer.from(await storage.download(admission.claim.driveId)).equals(admission.claim.bytes))fail('final execution claim failed remote Drive byte check');
 if(!Buffer.from(await executionLock.read(admission.claim.githubRef)).equals(admission.claim.bytes))fail('atomic GitHub claim readback mismatch');
 if(!Buffer.isBuffer(admission.decisionBytesLocal)||sha(admission.decisionBytesLocal)!==admission.decisionSha256||!Buffer.from(await storage.download(admission.decisionDriveId)).equals(admission.decisionBytesLocal))fail('final admission decision failed remote Drive byte check');
 const [c0,s0]=await Promise.all([providers.cloudflare.read(),providers.supabase.read()]);validateFinalBaseline({cloudflare:c0,supabase:s0});
 if(c0.versionId!==admission.cloudflareBaseline.versionId||s0.stateFingerprint!==admission.supabasePartialBaseline.stateFingerprint||!same(s0.migrationLedger,admission.supabasePartialBaseline.migrationLedger)||!same(c0.routeOwners,admission.cloudflareBaseline.routeOwners)||!same(c0.schedules,admission.cloudflareBaseline.schedules)||c0.activeCustomDomain!==admission.cloudflareBaseline.activeCustomDomain)fail('fresh pre-mutation target differs from admitted partial baseline');
 let attemptStarted=false,appliedMigration={name:FINAL.remaining[0].name,sha256:FINAL.remaining[0].sha256,state:'NOT_STARTED'},workerMayHaveChanged=false;
 try{
  const m=evidence.authority.migrationBytes[2];if(m.name!==FINAL.remaining[0].name||sha(m.bytes)!==FINAL.remaining[0].sha256)fail('exact remaining SQL hash/name mismatch');
  attemptStarted=true;appliedMigration.state='REQUESTED';await providers.supabase.applyExactMigration({name:m.name,sha256:FINAL.remaining[0].sha256,sql:m.bytes});appliedMigration.state='PROVIDER_APPLY_RETURNED';
  const s=await providers.supabase.read(),row=checkAfterMigration(s);appliedMigration={name:m.name,sha256:FINAL.remaining[0].sha256,providerVersion:row.version,state:'VERIFIED'};
  const db=await providers.supabase.verifyInstalled({remaining:FINAL.remaining,legacyGrants:true,stateUnchanged:true});checkAfterMigration(db);
  const cf=await providers.cloudflare.read();if(cf.versionId!==c0.versionId||cf.percentage!==100||cf.rollbackRetained!==true||cf.cronRemoved!==true||cf.pollingDisabled!==true||cf.activeCustomDomain!==true||!same(cf.routeOwners,c0.routeOwners)||!same(cf.schedules,c0.schedules))fail('Cloudflare baseline/routes/Cron drifted before deployment');fresh(cf.capturedUtc,'immediate pre-deploy Cloudflare readback');
  workerMayHaveChanged=true;const deployed=await providers.cloudflare.deployExact({zip:evidence.authority.candidate,sha256:RELEASE.candidate,keepPollingDisabled:true});if(!deployed?.versionId)fail('deployment did not return full Worker version');
  const final=await providers.cloudflare.read();if(final.versionId!==deployed.versionId||final.percentage!==100||final.pollingDisabled!==true||final.rollbackRetained!==true||final.activeCustomDomain!==true)fail('deployed Worker provider identity/polling/rollback check failed');
  const assets=await providers.cloudflare.verifyDeployed({versionId:deployed.versionId,expectedAssetDelta:{same:43,modified:['glow.html'],added:['glow-save-sync.mjs','league-state-cas.mjs']},legacyReadOnly:true});if(assets?.passed!==true||assets.assetCount+assets.externallyRoutedAssetCount!==46)fail('candidate 46-asset and legacy-route acceptance failed');
  const closeout={format:'hbnf-glow-final-successor-two-target-closeout-v1',successorId:FINAL.id,releaseId:RELEASE.id,manifestDriveId:admission.manifestDriveId,manifestSha256:admission.manifestSha256,admissionDecisionDriveId:admission.decisionDriveId,admissionDecisionSha256:admission.decisionSha256,executionClaimGithubRef:admission.claim.githubRef,executionClaimSha256:admission.claim.sha256,candidateSha256:RELEASE.candidate,applicationSourceCommit:RELEASE.source,gateSourceCommit:admission.gateSourceCommit,rollbackSha256:RELEASE.rollback,cloudflare:{worker:'hbnf',versionId:deployed.versionId,percentage:100,rollbackVersion:RELEASE.baseline,rollbackRetained:final.rollbackRetained,pollingDisabled:final.pollingDisabled,activeCustomDomain:final.activeCustomDomain,routeOwners:final.routeOwners,schedules:final.schedules,assets},supabase:{projectId:RELEASE.database,alreadyApplied:[{...FINAL.first,reapplied:false},{...FINAL.second,reapplied:false}],appliedMigration:appliedMigration,stateFingerprint:db.stateFingerprint,legacyGrantsPreserved:true,functionsAndTriggerVerified:true},acceptance:{leagueStateUnchanged:true,cartRoutesUnchanged:true,udiscPollingNotActivated:true,rollbackRetained:true},status:'INSTALLED_CLOSEOUT_PASS',recordedUtc:clock()};
  const bytes=json(closeout),stored=await storage.putOnce(`${FINAL.id}.closeout.json`,bytes);if(!stored?.id||stored.durable!==true||!Buffer.from(await storage.download(stored.id)).equals(bytes))fail('same-manifest closeout failed durable download-back');return{status:'INSTALLED_CLOSEOUT_PASS',driveId:stored.id,sha256:sha(bytes),bytes:bytes.length,closeout};
 }catch(error){let recovery='NOT_REQUIRED',workerRestored=false;if(workerMayHaveChanged){try{await providers.cloudflare.restoreV343({versionId:RELEASE.baseline,sha256:RELEASE.rollback,removeCron:true});const r=await providers.cloudflare.read();if(r.versionId!==RELEASE.baseline||r.percentage!==100||r.cronRemoved!==true)fail('v343/Cron recovery readback mismatch');workerRestored=true;recovery='V343_RESTORED_CRON_REMOVED';}catch(e){recovery=`ROLLBACK_UNVERIFIED:${e.message}`;}}
  const failed={format:'hbnf-glow-final-successor-execution-failure-v1',successorId:FINAL.id,releaseId:RELEASE.id,manifestDriveId:admission.manifestDriveId,manifestSha256:admission.manifestSha256,executionClaim:admission.claim.githubRef,remainingMigrationAttempts:attemptStarted?1:0,appliedMigration,additiveDatabaseMayRemain:attemptStarted,workerMayHaveChanged,workerRestored,recovery,error:String(error.message),recordedUtc:clock()};const bytes=json(failed),stored=await storage.putOnce(`${FINAL.id}.failure-${clock().replace(/\D/g,'')}.json`,bytes);if(!stored?.id||stored.durable!==true||!Buffer.from(await storage.download(stored.id)).equals(bytes))throw new AggregateError([error],'final successor failure receipt not durably verified');throw new Error(`FINAL SUCCESSOR FAILED; ${JSON.stringify({attempted:attemptStarted,appliedMigration,workerMayHaveChanged,workerRestored,recovery,driveId:stored.id,error:error.message})}`);
 }
}
