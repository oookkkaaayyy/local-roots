import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {auditEvidence,qualifiesForNumeric,assertDisjointSources} from '../scripts/dye-studio-evidence.mjs';
const data=JSON.parse(readFileSync(new URL('../../docs/dye-studio/source-admission-benchmark-v1.json',import.meta.url),'utf8'));
test('physical source benchmark has independent creator groups, original URLs and no invented calibration',()=>{
 const a=auditEvidence(data);
 assert.deepEqual(a.issues,[]);
 assert.equal(a.sources,6);
 assert.equal(a.independentSourceGroups,6);
 assert.equal(a.numericEligible,0);
 assert.equal(data.records.some(r=>r.id==='KATERI-2025'&&r.physicalDisc&&!r.exactPlastic),true);
 assert.equal(data.records.every(r=>r.use!=='numeric_candidate'),true);
});
test('real-data admission requires all methodological controls and an independent outcome',()=>{
 const good={id:'future',physicalDisc:true,exactPlastic:true,namedDyes:true,methodKnown:true,doseKnown:true,timeKnown:true,controlledColor:true,independentReplicate:true,isolatedABAB:true};
 assert.equal(qualifiesForNumeric(good,{overlap:true}),true);
 for(const field of ['physicalDisc','exactPlastic','namedDyes','methodKnown','doseKnown','timeKnown','controlledColor','independentReplicate']){
  assert.equal(qualifiesForNumeric({...good,[field]:false}),false,field);
 }
 assert.equal(qualifiesForNumeric({...good,isolatedABAB:false},{overlap:true}),false);
});
test('creator/session leakage blocks invalid claimed holdout',()=>{
 const all=data.records;
 assert.equal(assertDisjointSources(all.slice(0,3),all.slice(3)),true);
 assert.throws(()=>assertDisjointSources([all[0]],[{creatorGroup:all[0].creatorGroup}]),/leakage/);
});
test('benchmarks never silently train from product-color swatches or sampled web JPEG',()=>{
 const q=data.records.find(r=>r.id==='PCAD-PRODUCT-SWATCH');
 const k=data.records.find(r=>r.id==='KATERI-2025');
 assert.equal(qualifiesForNumeric(q),false);
 assert.equal(qualifiesForNumeric(k),false);
 assert.match(k.image,/2025PersonalDyeLibrary_1\.jpg/);
 assert.ok(k.unknown.includes('Disc polymer brand/family'));
});
