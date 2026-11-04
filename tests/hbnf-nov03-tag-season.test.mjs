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
