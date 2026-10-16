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
 const good={id:'future',physicalDisc:true,exactPlastic:true,namedDyes:true,measuredStartingColor:true,regionKnown:true,methodKnown:true,doseKnown:true,timeKnown:true,temperatureKnown:true,controlledColor:true,independentReplicate:true,isolatedABAB:true};
 assert.equal(qualifiesForNumeric(good,{overlap:true}),true);
 for(const field of ['physicalDisc','exactPlastic','namedDyes','measuredStartingColor','regionKnown','methodKnown','doseKnown','timeKnown','temperatureKnown','controlledColor','independentReplicate']){
  assert.equal(qualifiesForNumeric({...good,[field]:false}),false,field);
 }
 assert.equal(qualifiesForNumeric({...good,isolatedABAB:false},{overlap:true}),false);
 assert.equal(qualifiesForNumeric({...good,overlap:true,isolatedABAB:false}),false,'record overlap requires A/B/A+B without an explicit caller option');
 assert.equal(qualifiesForNumeric({...good,measuredStartingColor:false}),false,'unmeasured blank is not numeric evidence');
});
test('creator/session leakage blocks invalid claimed holdout',()=>{
 const all=data.records;
 assert.equal(assertDisjointSources(all.slice(0,3),all.slice(3)),true);
 assert.throws(()=>assertDisjointSources([all[0]],[{creatorGroup:all[0].creatorGroup}]),/leakage/);
 assert.throws(()=>assertDisjointSources([all[0]],[{source:all[0].source,creatorGroup:'other'}]),/URL leakage/);
});
test('benchmarks never silently train from product-color swatches or sampled web JPEG',()=>{
 const q=data.records.find(r=>r.id==='PCAD-PRODUCT-SWATCH');
 const k=data.records.find(r=>r.id==='KATERI-2025');
 assert.equal(qualifiesForNumeric(q),false);
 assert.equal(qualifiesForNumeric(k),false);
 assert.match(k.image,/2025PersonalDyeLibrary_1\.jpg/);
 assert.match(k.visualPlastic,/Innova Star/);
 assert.match(k.plasticSource,/owner identifies white Innova Star visually/);
 assert.match(k.handwrittenLabels,/dye\/color names/);
 assert.equal(k.exactPlastic,false,'visual identification is not original maker verification');
});

test('same source cannot be counted as separate creator groups',()=>{
 const first=data.records[0];
 const second={...first,id:'copy-source',creatorGroup:'second-label'};
 const report=auditEvidence({...data,records:[...data.records,second]});
 assert.ok(report.issues.some(item=>item.includes('Conflicting creator group')));
});
