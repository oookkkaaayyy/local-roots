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
