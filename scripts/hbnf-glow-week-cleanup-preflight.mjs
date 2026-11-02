// Offline review-only preflight of the Nov 3 rehearsal cleanup.
// A locally retained, already byte-verified private Drive snapshot supplies data;
// this module has no network calls, imports no production client and never writes.
// It can assemble a PENDING manifest ONLY with a fresh independent DB/Matrix/tag
// readback, exact snapshot, and explicit scoped owner approval evidence.
import {createHash} from 'node:crypto';
import {buildCleanupCandidate,canonicalJson,HBNF_GLOW_CLEANUP} from './hbnf-glow-week-cleanup.mjs';
const md5=s=>createHash('md5').update(s).digest('hex');
const sha=s=>createHash('sha256').update(s).digest('hex');
const fail=s=>{throw new Error(s)};
const isHex=(s,n)=>typeof s==='string'&&new RegExp('^[0-9a-f]{'+n+'}$').test(s);
const copy=x=>structuredClone(x);
export function prepareGlowCleanupReview({
 snapshotBytes,backup,sourceCommit,releaseId,readback=null,ownerApproval=null
}={}){
 const bytes=Buffer.from(snapshotBytes||[]);
 if(!backup?.driveFileId||!Number.isSafeInteger(backup.bytes)||backup.bytes!==bytes.length||
    !isHex(backup.sha256,64)||sha(bytes)!==backup.sha256||backup.downloadBackVerified!==true)
    fail('fresh private recovery snapshot and exact verified backup identity required');
 let snapshot;try{snapshot=JSON.parse(bytes.toString('utf8'))}catch{fail('private snapshot is not JSON')}
 if(snapshot?.id!==1||!snapshot.updated_at||!snapshot.state_json)fail('snapshot row identity/revision missing');
 if(!isHex(sourceCommit,40))fail('exact committed cleanup source identity missing');
 if(!/^[A-Za-z0-9._-]{20,80}$/.test(releaseId||''))fail('unique cleanup release ID missing');
 const root=snapshot.state_json,glow=root.glow,w=glow?.weeks?.[HBNF_GLOW_CLEANUP.weekDate];
 if(glow?.activeWeek!==HBNF_GLOW_CLEANUP.weekDate||!w||w.scoresLocked!==false)fail('wrong or locked week');
 const aliases=Object.keys(glow.playerAliases||{}).filter(k=>
   HBNF_GLOW_CLEANUP.testMarker.test(k)||HBNF_GLOW_CLEANUP.testMarker.test(String(glow.playerAliases[k]))).sort();
 const teams=w.cards?.flatMap(c=>c.players||[])||[];
 const counts={
   cards:w.cards?.length||0,teams:teams.length,playerRows:w.players?.length||0,
   enteredScores:(w.players||[]).reduce((a,p)=>a+(p.scores||[]).filter(v=>v!==null&&v!==undefined&&v!=='').length,0),
   testAliases:aliases.length
 };
 const cleaned=copy(root);
 if(!Array.isArray(w.cards)||!Array.isArray(w.players))fail('rehearsal cards/players absent');
 cleaned.glow.weeks[HBNF_GLOW_CLEANUP.weekDate].cards=[];
 cleaned.glow.weeks[HBNF_GLOW_CLEANUP.weekDate].players=[];
 for(const key of aliases)delete cleaned.glow.playerAliases[key];
 const operation={
   expectedCounts:counts,
   testAliasKeysMd5:md5(aliases.join('\n')),
   rehearsalPayloadSha256:sha(canonicalJson({cards:w.cards,players:w.players})),
   cleanedStateSha256:sha(canonicalJson(cleaned))
 };
 // Reuses exact accepted source safety checks, no partial-matching removal.
 const plan=buildCleanupCandidate(root,operation);
 if(sha(canonicalJson(plan.stateJson))!==operation.cleanedStateSha256)fail('source cleanup plan changed');
 const report={
   kind:'hbnf-glow-week-cleanup-preflight-v1',status:'REVIEW_ONLY',
   productionWrites:0,sourceCommit,releaseId,
   snapshot:{id:snapshot.id,updatedAt:snapshot.updated_at,
     bytes:bytes.length,sha256:sha(bytes),driveFileId:backup.driveFileId},
   operation,identityChecks:{
     allTeamsHaveTestMarker:teams.every(t=>[t.partner1,t.partner2].some(v=>HBNF_GLOW_CLEANUP.testMarker.test(String(v||'')))),
     allPlayersHaveTestMarker:w.players.every(p=>[p.name,p.partner1,p.partner2].some(v=>HBNF_GLOW_CLEANUP.testMarker.test(String(v||'')))),
     noFinalizedCards:w.cards.every(c=>c.finalized!==true)
   },
   blockers:[],pendingManifest:null
 };
 if(!readback){
   report.blockers.push('Fresh authenticated current league_state/Matrix/tag readback and server-side cleanedStateMd5 missing');
 }else{
   const row=readback.row||{},matrix=readback.matrix||{};
   const micros=v=>{const ms=Date.parse(v);const frac=String(v||'').match(/\\.(\\d{1,6})/)?.[1]||'';return Number.isFinite(ms)?ms*1000+Number((frac+'000000').slice(3,6)):null};
   const sameInstant=(a,b)=>micros(a)!==null&&micros(a)===micros(b);
   if(readback.projectId!==HBNF_GLOW_CLEANUP.projectId||row.id!==1||
      !sameInstant(row.updatedAt,snapshot.updated_at)||row.activeWeek!==HBNF_GLOW_CLEANUP.weekDate||
      row.cards!==counts.cards||row.teams!==counts.teams||
      row.playerRows!==counts.playerRows||Number(row.enteredScores)!==counts.enteredScores||
      row.testAliases!==counts.testAliases||row.testAliasKeysMd5!==operation.testAliasKeysMd5||
      row.scoresLocked!==false||!isHex(row.rowFingerprint,32)||!isHex(row.stateJsonMd5,32)||
      !isHex(readback.cleanedStateMd5,32)||matrix.autoLive!==false||
      matrix.queueFingerprint!==row.stateJsonMd5||
      !sameInstant(matrix.queueStateUpdatedAt,row.updatedAt)||
      !Number.isSafeInteger(matrix.cinematicEventCount)||readback.tagProjectionMatches!==true)
      fail('fresh exact DB/Matrix/tag revision or cleanup hash differs: no manifest issued');
   report.readback={projectId:readback.projectId,rowFingerprint:row.rowFingerprint,
     updatedAt:row.updatedAt,stateJsonMd5:row.stateJsonMd5,
     cleanedStateMd5:readback.cleanedStateMd5,queueFingerprint:matrix.queueFingerprint,
     queueStateUpdatedAt:matrix.queueStateUpdatedAt,tagProjectionMatches:true};
 }
 if(ownerApproval?.confirmed!==true||typeof ownerApproval.evidence!=='string'||
    !ownerApproval.evidence.trim()||
    ownerApproval.scope!=='remove only the verified rehearsal rows and aliases from the Nov 3 Glow week'){
   report.blockers.push('Explicit owner confirmation and scoped approval to delete only the identified rehearsal rows is missing');
 }
 if(report.blockers.length)return report;
 const row=readback.row,matrix=readback.matrix;
 report.pendingManifest={
   format:HBNF_GLOW_CLEANUP.format,releaseId,phase:'PENDING',oneTime:true,sourceCommit,
   ownerAuthorization:ownerApproval,
   target:{projectId:HBNF_GLOW_CLEANUP.projectId,table:HBNF_GLOW_CLEANUP.table,
      rowId:1,weekDate:HBNF_GLOW_CLEANUP.weekDate},
   baseline:{updatedAt:row.updatedAt,rowFingerprint:row.rowFingerprint,
      stateJsonMd5:row.stateJsonMd5,testAliasKeysMd5:operation.testAliasKeysMd5,
      matrixAutoLive:false,queueFingerprint:matrix.queueFingerprint,
      queueStateUpdatedAt:matrix.queueStateUpdatedAt,
      cinematicEventCount:matrix.cinematicEventCount,tagProjectionMatches:true},
   backup,operation:{...operation,cleanedStateMd5:readback.cleanedStateMd5},
   claims:Object.fromEntries(['admission','execution','restore'].map(k=>[
      k,'release-claims/'+releaseId+'.'+k+'-claim.json']))
 };
 report.status='PENDING_ADMISSION';
 return report;
}
