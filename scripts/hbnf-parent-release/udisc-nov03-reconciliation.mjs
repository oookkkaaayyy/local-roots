// November 3 UDisc-first recovery: LOCAL READ-ONLY audit of an official XLSX
// against a separately captured HBNF league_state snapshot. Does NOT write
// to Supabase, Cloudflare, UDisc, the cart or the source JSON.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
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
  if (!glow || glow.activeWeek!==DATE || !currentWeek || currentWeek.date!==DATE)
    throw Error('NOV03_GLOW_WEEK_AND_ACTIVE_DATE_REQUIRED');
  if(!revision || typeof revision!=='string')throw Error('EXACT_SERVER_REVISION_REQUIRED');
  if(snapshot?.eventId!==EVENT_ID || snapshot?.weekDate!==DATE ||
      !Array.isArray(snapshot.rows)||!snapshot.rows.length)
    throw Error('UDISC_NOV03_EVENT_IDENTITY_OR_REAL_ROWS_REQUIRED');
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
    preservedProtection:'Existing week scorecards, tags, historical scores, winner/ace/financial fields are never overwritten by this audit',
    productionWrite:false,
    requiresBeforeImport:['fresh same-week source/revision readback','exact owner-reviewed identity mappings',
      'release-admitted guarded hbnf_apply_udisc_glow_week CAS with one scoring writer',
      'independent post-CAS full-week readback and conflict-free acceptance']
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
 const snapshot=await parseUdiscWorkbook(arraybuffer,
   {eventId:EVENT_ID,weekDate:DATE,observedAt:new Date().toISOString()});
 const preview=await prepareNov3Reconciliation({root,revision,snapshot,decisions});
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
