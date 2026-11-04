// November 3 UDisc-first recovery: LOCAL READ-ONLY audit of an official XLSX
// against a separately captured HBNF league_state snapshot. Does NOT write
// to Supabase, Cloudflare, UDisc, the cart or the source JSON.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {NOV3_LAYOUT,verifyNov3Layout,classifyNov3TestEntries,prepareNov3TestOnlyQuarantine} from './nov03-event-source.mjs';
import { parseUdiscWorkbook, buildGlowProposal, validateIdentityEvidence, prepareGlowWeekSync } from '../../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-sync-runner.mjs';

const EVENT_ID='hb-glow-doubles-tAP8Y5';
const DATE='2026-11-03';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>JSON.stringify(value);
const arr=value=>Array.isArray(value)?value:[];
const cloned=value=>JSON.parse(JSON.stringify(value));

export async function prepareNov3Reconciliation({root,revision,snapshot,decisions={}}) {
  const before=stable(root);
  const state=root?.state_json||root;
  const glow=state?.glow;
  const currentWeek=glow?.weeks?.[DATE];
  if (!glow || glow.activeWeek!==DATE || !currentWeek ||
      (Object.prototype.hasOwnProperty.call(currentWeek,'date') && currentWeek.date!==DATE))
    throw Error('NOV03_GLOW_WEEK_AND_ACTIVE_DATE_REQUIRED');
  if(!revision || typeof revision!=='string')throw Error('EXACT_SERVER_REVISION_REQUIRED');
  if(snapshot?.eventId!==EVENT_ID || snapshot?.weekDate!==DATE ||
      !Array.isArray(snapshot.rows))
    throw Error('UDISC_NOV03_EVENT_IDENTITY_OR_REAL_ROWS_REQUIRED');
  const layout=verifyNov3Layout();
  if(!snapshot.rows.length)
    return {status:'EMPTY_OFFICIAL_EXPORT_NO_IMPORT',eventId:EVENT_ID,weekDate:DATE,
      layout,serverRevision:revision,sourceRowCount:0,productionWrite:false};
  // A total-only export cannot create invented hole scores.
  if(snapshot.rows.some(row=>!Array.isArray(row.scores)||row.scores.length!==18 ||
      row.scores.some(value=>value!=='' && value!==null &&
        (!Number.isInteger(Number(value))||Number(value)<1||Number(value)>25))))
    throw Error('UDISC_VALID_HOLE_STROKES_REQUIRED');
  if(!snapshot.rows.some(row=>row.scores.some(value=>value!==''&&value!==null)))
    return {status:'NO_HOLE_SCORES_IN_EXPORT',eventId:EVENT_ID,weekDate:DATE,
      serverRevision:revision,productionWrite:false};
  if(currentWeek.scoresLocked || arr(currentWeek.cards).some(card=>card.finalized))
    return {status:'BLOCKED_LOCKED_WEEK',eventId:EVENT_ID,weekDate:DATE,
      serverRevision:revision,productionWrite:false};
  const tests=classifyNov3TestEntries(currentWeek);
  if(tests.contaminated){
    const plan=prepareNov3TestOnlyQuarantine({root,revision});
    if(stable(root)!==before)throw Error('READ_ONLY_SOURCE_STATE_MUTATED');
    return {status:'NOV03_QUARANTINE_REQUIRED_BEFORE_REAL_IMPORT',
      eventId:EVENT_ID,weekDate:DATE,layout,serverRevision:revision,
      testEntryIds:tests.ids,quarantineStatus:plan.status,
      originalWeekSha256:plan.oldWeekSha256||null,productionWrite:false};
  }
  const names=Object.values(glow.weeks).flatMap(week=>arr(week?.players)
    .flatMap(player=>[player.partner1,player.partner2])).filter(Boolean);
  const evidence=validateIdentityEvidence({aliases:glow.playerAliases||{},historicalNames:names,tagEvidence:[]});
  const model={eventId:EVENT_ID,snapshots:[snapshot]};
  const proposal=buildGlowProposal(model,evidence,decisions,{weekDate:DATE});
  const mappingIssues=proposal.issues||{};
  const identityReview=proposal.identityReview?.reviewedCrosswalk||[];
  if(mappingIssues.unresolvedIdentityCount || mappingIssues.duplicateCanonicalTeamRows) {
    if(stable(root)!==before)throw Error('READ_ONLY_SOURCE_STATE_MUTATED');
    return {status:'IDENTITY_REVIEW_REQUIRED',eventId:EVENT_ID,weekDate:DATE,
      serverRevision:revision,issues:mappingIssues,
      identityReview,productionWrite:false};
  }
  const prepared=await prepareGlowWeekSync(currentWeek,proposal,{aliases:evidence.aliases});
  if(stable(root)!==before)throw Error('READ_ONLY_SOURCE_STATE_MUTATED');
  if(!prepared.changed)return {status:'ALREADY_MATCHED',eventId:EVENT_ID,weekDate:DATE,
    serverRevision:revision,signature:prepared.signature,productionWrite:false};
  const proposed=prepared.week;
  for(const key of Object.keys(currentWeek)) {
    if(['cards','players','udiscSync','date','activeWeek'].includes(key))continue;
    if(stable(currentWeek[key])!==stable(proposed[key]))
      throw Error('PROTECTED_GLOW_FIELD_CHANGED:'+key);
  }
  const oldById=new Map(arr(currentWeek.players).map(p=>[String(p.id),p]));
  const nextById=new Map(arr(proposed.players).map(p=>[String(p.id),p]));
  for(const [id,old] of oldById) {
    if(!nextById.has(id))throw Error('RECONCILIATION_LOSES_PRIOR_PLAYER:'+id);
    const incoming=nextById.get(id);
    if(incoming.removed!==old.removed)throw Error('RECONCILIATION_CHANGES_REMOVAL_STATUS:'+id);
  }
  const priorCards=arr(currentWeek.cards),afterCards=arr(proposed.cards);
  for(const card of priorCards) {
    const next=afterCards.find(x=>String(x.id)===String(card.id));
    if(!next || arr(next.players).slice(0,arr(card.players).length)
       .some((p,i)=>String(p.id)!==String(card.players[i].id)))
      throw Error('RECONCILIATION_REORDERS_EXISTING_CARDS:'+card.id);
  }
  const changes=[];
  for(const player of arr(proposed.players)) {
    const old=oldById.get(String(player.id));
    for(let i=0;i<18;i++) {
      const from=String(old?.scores?.[i]??'').trim(),to=String(player?.scores?.[i]??'').trim();
      if(from!==to)changes.push({teamId:player.id,hole:i+1,existing:from,incoming:to});
      if(from && !to)throw Error('RECONCILIATION_REMOVES_SAVED_HOLE');
    }
  }
  const manualOverrides=arr(proposed.udiscSync?.latest?.manualOverrides);
  return {
    status:manualOverrides.length?'MANUAL_SCORE_CONFLICT_REVIEW_REQUIRED':'READY_FOR_SEPARATE_ADMITTED_CAS_REVIEW',
    eventId:EVENT_ID,weekDate:DATE,serverRevision:revision,
    sourceSignature:prepared.signature,teamCount:proposed.players.length,
    observedChanges:changes,manualOverrides,
    proposedWeek:cloned(proposed),proposedWeekSha256:digest(Buffer.from(stable(proposed))),
    preservedProtection:'Existing week scorecards, tags, historical scores, winner/ace/financial fields are never overwritten by this audit',
    productionWrite:false,
    requiresBeforeImport:['fresh same-week source/revision readback','exact owner-reviewed identity mappings',
      'release-admitted guarded hbnf_apply_udisc_glow_week CAS with one scoring writer',
      'independent post-CAS full-week readback and conflict-free acceptance']
  };
}

/**
 * Build an *isolated* one-transaction review of the real Nov03 week.
 * A qualified QI preimage is archived, not deleted; the authentic UDisc
 * result is projected only against a CLONE of the quarantined week.
 * No live write, admission, settlement, or UDisc organizer attestation.
 */
export async function prepareNov3AtomicRecoveryReview({root,revision,snapshot,decisions={},sourceProof={}}) {
  const untouched=stable(root);
  if(!snapshot?.rows?.length)throw Error('NONEMPTY_SCORED_EXPORT_REQUIRED');
  const original=prepareNov3TestOnlyQuarantine({root,revision});
  if(original.status!=='SOURCE_QUALIFIED_QUARANTINE_REVIEW_ONLY')
    return {status:'QUARANTINE_PREIMAGE_NOT_ADMITTED',quarantineStatus:original.status,
      serverRevision:revision,productionWrite:false};
  const staging=cloned(root),stageState=staging?.state_json||staging;
  const stageWeek=stageState.glow.weeks[DATE];
  stageWeek.players=[];
  stageWeek.cards[0].players=[];
  if(stable(stageWeek)!==stable(original.proposedWeek))
    throw Error('QUARANTINE_STAGE_MISMATCH');
  const projected=await prepareNov3Reconciliation({root:staging,revision,snapshot,decisions});
  if(stable(root)!==untouched)throw Error('ATOMIC_REVIEW_MUTATED_ORIGINAL_ROOT');
  const originalXlsxVerified=sourceProof.originalBytesRead===true &&
    sourceProof.sha256==='29ed49f19ee3b9c9cb8b12043e9beeb111b0c156ac3cc89a90a9dc54669f86f8' &&
    sourceProof.byteCount===22424;
  const ready=projected.status==='READY_FOR_SEPARATE_ADMITTED_CAS_REVIEW';
  // Live Nov03 has all 18 scorecardText.holePars blank. Leaving that intact
  // would publish an incorrect relative-to-par leaderboard despite 72 valid
  // strokes. Admit only the exact owner-provided PAR59 event-hole layout.
  let completedWeek=null;
  if(ready){
    completedWeek=cloned(projected.proposedWeek);
    const existing=completedWeek.scorecardText?.holePars;
    if(!existing||typeof existing!=='object'||Array.isArray(existing))
      throw Error('NOV03_PAR_LAYOUT_PREIMAGE_REQUIRED');
    const official=Object.fromEntries(NOV3_LAYOUT.holes.map(h=>[String(h[0]),String(h[4])]));
    for(const [key,value] of Object.entries(existing)){
      if(!(key in official) || (String(value??'').trim()!=='' &&
          String(value).trim()!==official[key]))
        throw Error('NOV03_PAR_LAYOUT_PREIMAGE_CONFLICT:'+key);
    }
    completedWeek.scorecardText={...completedWeek.scorecardText,holePars:official};
    if(Object.values(official).reduce((sum,v)=>sum+Number(v),0)!==59)
      throw Error('NOV03_PAR_LAYOUT_SUM_INVALID');
  }
  return {
    status:ready?'ATOMIC_NOV03_SCORE_PROPOSAL_REVIEW_ONLY':'ATOMIC_NOV03_IMPORT_REVIEW_BLOCKED',
    eventId:EVENT_ID,weekDate:DATE,serverRevision:revision,
    originalWeekSha256:original.oldWeekSha256,
    quarantinedWeekSha256:original.newWeekSha256,
    preservedRehearsalArchive:original.sourceArchive,
    quarantinedIds:original.sourceArchive.players.map(p=>p.id),
    changedPaths:['glow.weeks.2026-11-03.cards[0].players',
                  'glow.weeks.2026-11-03.players',
                  ...(ready?['glow.weeks.2026-11-03.udiscSync',
                    'glow.weeks.2026-11-03.scorecardText.holePars']:[])],
    officialSource:{claimedSha256:sourceProof.sha256||null,
      originalXlsxVerified,organizerEventBinding:'NOT_IN_XLSX_REQUIRE_EXTERNAL_PROOF',
      exportedStartTime:'DO_NOT_EQUATE_WITH_LOCAL_5_30_PM_EVENT_START'},
    projectedStatus:projected.status,projectedWeek:completedWeek,
    projectedWeekSha256:completedWeek?digest(Buffer.from(stable(completedWeek))):null,
    projectedSummary:ready?{teams:projected.teamCount,changes:projected.observedChanges.length}:null,
    identityReview:projected.identityReview||null,
    issues:projected.issues||null,
    preconditions:['fresh one-time CAS revision and complete unchanged root preimage',
      'original organizer XLSX bytes independently verified and durably retained',
      'official tAP8Y5 event, round-one layout 150408 and team provenance confirmed',
      'explicit reviewed eight-username canonical crosswalk',
      'entire source and rollback downloaded back and same-manifest release admitted',
      'one atomic replacement of only proven Nov03 QI rows, CAS ACK and independent readback',
      'no money, ace, payout, ranking or tag mutation without separate evidence'],
    productionWrite:false,admission:'NOT_ADMITTED'
  };
}

export async function prepareNov3FromFiles({xlsxFile,stateFile,decisionsFile,reportFile}) {
 if(!xlsxFile||!stateFile)throw Error('OFFICIAL_XLSX_AND_PRIVATE_STATE_SNAPSHOT_REQUIRED');
 const raw=await readFile(xlsxFile);
 if(raw.length<22||raw.length>12*1024*1024||raw[0]!==0x50||raw[1]!==0x4b)
   throw Error('UDISC_XLSX_ARCHIVE_REQUIRED');
 const stateRaw=await readFile(stateFile);
 const rawState=JSON.parse(stateRaw.toString('utf8'));
 const root=Array.isArray(rawState)?rawState[0]:rawState;
 const revision=root?.updated_at||root?.updatedAt;
 if(!revision)throw Error('PRIVATE_STATE_SNAPSHOT_REVISION_REQUIRED');
 const decisions=decisionsFile?JSON.parse(await readFile(decisionsFile,'utf8')):{};
 if(!decisions || Array.isArray(decisions) || typeof decisions!=='object')
   throw Error('OWNER_REVIEW_DECISIONS_OBJECT_REQUIRED');
 const arraybuffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
 let snapshot;
 try{snapshot=await parseUdiscWorkbook(arraybuffer,
   {eventId:EVENT_ID,weekDate:DATE,observedAt:new Date().toISOString()});}
 catch(err){
   if(err?.code!=='EMPTY_EXPORT_NO_SCORES' && err?.message!=='UDisc workbook has no results.')throw err;
   snapshot={eventId:EVENT_ID,weekDate:DATE,rows:[]};
 }
 const proof={sha256:digest(raw),byteCount:raw.length,originalBytesRead:true};
 const week=(root?.state_json||root)?.glow?.weeks?.[DATE];
 const preview=snapshot.rows.length && classifyNov3TestEntries(week).contaminated
   ?await prepareNov3AtomicRecoveryReview({root,revision,snapshot,decisions,sourceProof:proof})
   :await prepareNov3Reconciliation({root,revision,snapshot,decisions});
 const receipt={...preview,udiscXlsxSha256:digest(raw),stateSnapshotSha256:digest(stateRaw),
   stateSnapshotBytes:stateRaw.length,sourceProvenance:'Official organizer XLSX, locally opened read-only'};
 if(reportFile)await writeFile(reportFile,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 return receipt;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const [xlsxFile,stateFile,decisionsFile,reportFile]=process.argv.slice(2);
 try {
   const receipt=await prepareNov3FromFiles({xlsxFile,stateFile,decisionsFile,reportFile});
   console.log(JSON.stringify(receipt,null,2));
 }catch(e){console.error(String(e?.message||'RECONCILIATION_BLOCKED'));process.exitCode=1;}
}
