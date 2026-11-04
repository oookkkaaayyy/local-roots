import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const path of ['glow.html','skins.html']){
 const actual=fs.readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
 const start=actual.indexOf('function bagTagEventsSinceSeason(events,start){');
 const end=actual.indexOf('function tagEventsToApply(events){',start);
 test(path+' uses current-season-only tag event replay without deleting historical source rounds',()=>{
  assert(start>=0&&end>start);
  const fn=vm.runInNewContext(actual.slice(start,end)+'\nbagTagEventsSinceSeason');
  const records=[{date:'2026-10-20',id:'oldSkins'},{date:'2026-11-03',id:'newGlow'}];
  assert.deepEqual(JSON.parse(JSON.stringify(fn(records,'2026-11-03'))),[records[1]]);
  assert.deepEqual(JSON.parse(JSON.stringify(fn(records,''))),records);
  assert.throws(()=>fn(records,'BAD'),/Invalid bag-tag season start date/);
  assert(actual.includes('tagEventsToApply(bagTagEventsSinceSeason(events,cfg.seasonStartDate))'));
  assert(actual.includes('tagEventsToApply(bagTagEventsSinceSeason(events,normalizeBagTagsConfig(root).seasonStartDate))'));
  assert(actual.includes('const blockers=(cfg&&cfg.manualEventBlockers'));
 });
}


import {prepareNov3TagSeasonReset} from '../scripts/hbnf-parent-release/nov03-event-source.mjs';

const oldSeasonOwners=[
 ['rusty','Rusty',1],['andrew','Andrew',2],['fox','Fox',5],
 ['jason','Jason',6],['quiotee','Quiotee',7],['dylan','Dylan',8],
 ['matt','Matt',10],['karl','Karl',15],['danny','Danny',16]
].map(([player_key,player_name,tag_number])=>({player_key,player_name,tag_number}));
const oldAvailable=[{tag_number:14,source:'Manual correction',
 notes:'Released by manual tag update',updated_at:'2026-10-28T00:51:11.782725Z'}];

test('Nov3 new tag season plans all three exact owners and clears stale available #14 without touching audit history',()=>{
 const owners=structuredClone(oldSeasonOwners),available=structuredClone(oldAvailable);
 const plan=prepareNov3TagSeasonReset({authorityRevision:9,currentOwners:owners,currentAvailableTags:available});
 assert.equal(plan.status,'EXACT_NEW_SEASON_RESET_READY_FOR_SEPARATE_ADMITTED_TRANSACTION');
 assert.equal(plan.productionWrite,false);
 assert.equal(plan.expectedAuthorityRevision,9);
 assert.deepEqual(plan.proposedCurrentOwners.map(p=>[p.player_key,p.tag_number]),[['matt',1],['jason',2],['andrew',3]]);
 assert.deepEqual(plan.proposedAvailableTags,[]);
 assert.deepEqual(plan.priorOwnersArchive,oldSeasonOwners);
 assert.deepEqual(plan.priorAvailableTagsArchive,oldAvailable);
 assert.equal(plan.legacyRoundsAndFinalizations,'PRESERVE_UNCHANGED');
 assert.equal(plan.rootBagTagsMetadata.seasonStartDate,'2026-11-03');
 assert.deepEqual(owners,oldSeasonOwners);
 assert.deepEqual(available,oldAvailable);
});
test('Nov3 tag reset fails closed on missing, changed or newly sold available tag pool',()=>{
 const args={authorityRevision:9,currentOwners:oldSeasonOwners};
 assert.equal(prepareNov3TagSeasonReset(args).productionWrite,false);
 assert.equal(prepareNov3TagSeasonReset({...args,currentAvailableTags:[]}).status,'BLOCKED_AVAILABLE_TAG_POOL_PREIMAGE_DRIFT');
 assert.equal(prepareNov3TagSeasonReset({...args,currentAvailableTags:[{...oldAvailable[0],source:'Other'}]}).status,'BLOCKED_AVAILABLE_TAG_POOL_PREIMAGE_DRIFT');
 assert.equal(prepareNov3TagSeasonReset({...args,currentAvailableTags:[...oldAvailable,{tag_number:20,source:'sold'}]}).status,'BLOCKED_AVAILABLE_TAG_POOL_PREIMAGE_DRIFT');
 assert.equal(prepareNov3TagSeasonReset({...args,currentAvailableTags:oldAvailable,authorityRevision:10}).status,'BLOCKED_TAG_SEASON_AUTHORITY_OR_FINALIZATION_CHANGED');
 assert.equal(prepareNov3TagSeasonReset({...args,currentAvailableTags:oldAvailable,alreadyFinalized:true}).status,'BLOCKED_TAG_SEASON_AUTHORITY_OR_FINALIZATION_CHANGED');
 assert.equal(prepareNov3TagSeasonReset({...args,currentAvailableTags:oldAvailable,currentOwners:oldSeasonOwners.slice(1)}).status,'BLOCKED_TAG_SEASON_PREIMAGE_DRIFT');
});


import {prepareNov3AtomicTagReset,prepareNov3TagResetUndo} from '../scripts/hbnf-parent-release/nov03-tag-reset-sql.mjs';
const admittedFixture={
 expectedLeagueUpdatedAt:'2026-11-04 07:30:01.546079+00',
 expectedRootMd5:'a4fb5d8606f7f6a7a7ae1e96026e78af',
 authorityRevision:9,currentOwners:oldSeasonOwners,currentAvailableTags:oldAvailable,
 verifiedBackupReceipt:'original-manifest-downloadback-SHA256-verified-01'
};

test('T1 SQL requires exact rev9 / nine holders / available14 / fresh root CAS and remote backup receipt',()=>{
 const missing=prepareNov3AtomicTagReset({
  ...admittedFixture,verifiedBackupReceipt:undefined
 });
 assert.equal(missing.status,'VERIFIED_DURABLE_PREIMAGE_BACKUP_RECEIPT_REQUIRED');
 assert.equal(missing.productionWrite,false);
 const badRoot=prepareNov3AtomicTagReset({...admittedFixture,expectedRootMd5:'000'});
 assert.equal(badRoot.status,'FRESH_EXACT_LEAGUE_STATE_REVISION_AND_MD5_REQUIRED');
 const changedAvailable=prepareNov3AtomicTagReset({...admittedFixture,currentAvailableTags:[]});
 assert.equal(changedAvailable.status,'BLOCKED_AVAILABLE_TAG_POOL_PREIMAGE_DRIFT');
 const changedAuthority=prepareNov3AtomicTagReset({...admittedFixture,authorityRevision:10});
 assert.equal(changedAuthority.status,'BLOCKED_TAG_SEASON_AUTHORITY_OR_FINALIZATION_CHANGED');
 const live=prepareNov3AtomicTagReset(admittedFixture);
 assert.equal(live.status,'REVIEW_ONLY_SQL_PREPARED_NOT_ADMITTED');
 assert.equal(live.productionWrite,false);
 assert.equal(live.expectedAuthorityRevision,9);
 assert.deepEqual(live.proposedOwners.map(x=>x.tag_number),[1,2,3]);
 assert.deepEqual(live.proposedAvailable,[]);
 assert.equal(live.expectedPostConditions.authorityRevision,10);
 assert.equal(live.preservesPriorRounds,true);
 assert.equal(live.requiresFreshPostS1Readback,true);
});
test('T1 prepared SQL is one bounded atomic transaction with exact source/identity guards and mirror assertion',()=>{
 const sql=prepareNov3AtomicTagReset(admittedFixture).applySql;
 assert.equal(sql.startsWith('BEGIN;\nDO $hbnf_t1_reset$'),true);
 assert.equal(sql.endsWith('$hbnf_t1_reset$;\nCOMMIT;'),true);
 for(const marker of [
  'public.league_state WHERE id=1 FOR UPDATE',
  'public.hbnf_tag_authority_state WHERE id=1 FOR UPDATE',
  'LOCK TABLE public.hbnf_current_tag_entries,public.hbnf_current_available_tags',
  "a4fb5d8606f7f6a7a7ae1e96026e78af",
  "T1_ROOT_OR_TAG_REVISION_CONFLICT",
  "T1_EXACT_OLD_TAG_OWNERS_OR_AVAILABLE_14_CHANGED",
  "T1_NEW_SEASON_ALREADY_HAS_TAG_ACTIVITY",
  "T1_SEASON_RESET_ALREADY_STARTED_OR_REPLAY",
  "T1_MATRIX_AUTO_LIVE_REQUIRES_COORDINATED_REVIEW",
  'seasonResetAudit','priorOwners','priorAvailableTags','priorBagTags',
  'durableBackupReceipt','DELETE FROM public.hbnf_current_tag_entries;',
  'DELETE FROM public.hbnf_current_available_tags;',
  "('matt','Matt',1,clock_timestamp())",
  "('jason','Jason',2,clock_timestamp())",
  "('andrew','Andrew',3,clock_timestamp())",
  'seasonStartDate','T1_CANONICAL_MIRROR_MISMATCH',
  'T1_OLD_AVAILABLE_14_STILL_PRESENT','T1_UNRELATED_SCORING_HISTORY_CHANGED',
  "UPDATE public.hbnf_tag_authority_state SET revision=revision+1"
 ])assert.ok(sql.includes(marker),'Missing T1 admission element: '+marker);
 assert.doesNotMatch(sql,/UPDATE public\.hbnf_round_tag_entries|DELETE FROM public\.hbnf_round_tag_entries/);
 assert.doesNotMatch(sql,/UPDATE public\.hbnf_round_tag_finalizations|DELETE FROM public\.hbnf_round_tag_finalizations/);
 assert.doesNotMatch(sql,/INSERT INTO public\.hbnf_current_available_tags/);
 assert.equal((sql.match(/\bCOMMIT;/g)||[]).length,1,'exactly one commit');
});
test('T1 post-commit undo is guarded by fresh postimage, restores archive, preserves score branches and increments revision',()=>{
 const invalid=prepareNov3TagResetUndo({
  expectedLeagueUpdatedAt:admittedFixture.expectedLeagueUpdatedAt,
  expectedRootMd5:admittedFixture.expectedRootMd5,
  expectedAuthorityRevision:9
 });
 assert.equal(invalid.status,'VERIFIED_EXACT_POST_RESET_PREIMAGE_REQUIRED_FOR_UNDO');
 const out=prepareNov3TagResetUndo({
  expectedLeagueUpdatedAt:'2026-11-04T21:40:12.222Z',
  expectedRootMd5:'11111111111111111111111111111111',
  expectedAuthorityRevision:10
 });
 assert.equal(out.status,'REVIEW_ONLY_UNDO_SQL_PREPARED_NOT_ADMITTED');
 assert.equal(out.productionWrite,false);
 const sql=out.undoSql;
 assert.equal(sql.startsWith('BEGIN;\nDO $hbnf_t1_undo$'),true);
 assert.equal(sql.endsWith('$hbnf_t1_undo$;\nCOMMIT;'),true);
 for(const marker of ['T1_UNDO_POSTIMAGE_CHANGED','T1_UNDO_ARCHIVE_MISSING_OR_INVALID',
 'T1_UNDO_CANONICAL_TAG_DRIFT','priorOwners','priorAvailableTags','priorBagTags',
 'jsonb_to_recordset','T1_UNDO_SCORE_BRANCH_DRIFT','T1_UNDO_MIRROR_DIFFERENCE',
 "revision=revision+1","WHERE id=1 AND revision=10"])
  assert.ok(sql.includes(marker),'Missing guarded recovery element: '+marker);
 assert.doesNotMatch(sql,/revision=9/,'undo must not rewind CAS revision');
 assert.equal((sql.match(/\bCOMMIT;/g)||[]).length,1);
});
