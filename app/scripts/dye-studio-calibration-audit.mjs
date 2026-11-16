#!/usr/bin/env node
// Read-only local audit of an owner-exported calibration JSON. This is NOT
// perceptual ΔE, colorimetry, verified physical accuracy, or pigment tuning.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const hex=(s)=>typeof s==='string'&&/^#[0-9a-fA-F]{6}$/.test(s);
export function rgbDistance(a,b){
 if(!hex(a)||!hex(b))return null;
 const aa=[1,3,5].map(i=>parseInt(a.slice(i,i+2),16));
 const bb=[1,3,5].map(i=>parseInt(b.slice(i,i+2),16));
 return Math.hypot(...aa.map((n,i)=>n-bb[i]));
}
export function auditCalibrationExport(data){
 if(!data||data.version!==1||!Array.isArray(data.records))throw Error('Expected version 1 Dye Studio calibration export');
 const eligible=[],omissions={missingPreview:0,notVerified:0,incompleteRecipe:0};
 for(const r of data.records){
  if(!r||typeof r!=='object')continue;
  if(!hex(r.previewHexAtCapture)||r.previewEvidence!=='displayed_unvalidated'||!hex(r.measuredHex)){
   omissions.missingPreview++;continue;
  }
  if(!['verified','validated'].includes(r.status)||!(Number(r.repeatCount)>=2)){
   omissions.notVerified++;continue;
  }
  if(!r.processKey||typeof r.processKey!=='string'||!r.method||r.region!=='opaque-overall'){
   omissions.incompleteRecipe++;continue;
  }
  eligible.push({method:r.method,profile:r.profileId||'unknown',distance:rgbDistance(r.measuredHex,r.previewHexAtCapture)});
 }
 const groups=new Map();
 for(const row of eligible){
  const key=row.method+' / '+row.profile;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(row.distance);
 }
 const results=[...groups].map(([group,distances])=>({
  group,samples:distances.length,
  meanRgbDistance:Number((distances.reduce((a,b)=>a+b,0)/distances.length).toFixed(2)),
  maxRgbDistance:Number(Math.max(...distances).toFixed(2))
 })).sort((a,b)=>a.group.localeCompare(b.group));
 return {
  totalRecords:data.records.length,
  comparableRecords:eligible.length,
  omitted:omissions,
  groups:results,
  measurementStatus:'UNCALIBRATED_RGB_ONLY_NOT_PHYSICAL_ACCURACY',
  note:'Counts only records flagged verified/validated with two repeats, matching process and a saved daylight preview. This does not establish calibrated camera color, actual pigment prediction accuracy, or independent specimen validation.'
 };
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 if(process.argv.length!==3)throw Error('Usage: node app/scripts/dye-studio-calibration-audit.mjs <local-export.json>');
 const data=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8'));
 process.stdout.write(JSON.stringify(auditCalibrationExport(data),null,2)+'\n');
}
