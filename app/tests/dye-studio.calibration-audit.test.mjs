import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCalibrationExport,rgbDistance} from '../scripts/dye-studio-calibration-audit.mjs';

const example=(overrides={})=>({
 schemaVersion:6,method:'acetone-direct',profileId:'innova_star',
 processKey:'verified-recipe',region:'opaque-overall',
 measuredHex:'#030400',previewHexAtCapture:'#000000',
 previewEvidence:'displayed_unvalidated',status:'verified',repeatCount:2,
 ...overrides
});
test('measured to displayed preview is ordinary RGB distance only',()=>{
 assert.equal(rgbDistance('#030400','#000000'),5);
 assert.equal(rgbDistance('#000000','#ffffff'),Number(Math.sqrt(3*255*255).toFixed(12)));
 assert.equal(rgbDistance('invalid','#000000'),null);
});
test('source-qualified aggregate does not use undocumented or uncertain records',()=>{
 const records=[
  example(),example({measuredHex:'#000000'}),
  example({previewHexAtCapture:null}),
  example({repeatCount:1}),
  example({processKey:''}),
  example({status:'experimental',repeatCount:3})
 ];
 const x=auditCalibrationExport({version:1,records});
 assert.equal(x.totalRecords,6);assert.equal(x.comparableRecords,2);
 assert.deepEqual(x.omitted,{missingPreview:1,notVerified:2,incompleteRecipe:1});
 assert.deepEqual(x.groups,[{group:'acetone-direct / innova_star',samples:2,meanRgbDistance:2.5,maxRgbDistance:5}]);
 assert.equal(x.measurementStatus,'UNCALIBRATED_RGB_ONLY_NOT_PHYSICAL_ACCURACY');
});
test('unknown or missing experimental evidence cannot yield a false physical score',()=>{
 const x=auditCalibrationExport({version:1,records:[example({previewHexAtCapture:null})]});
 assert.equal(x.comparableRecords,0);assert.deepEqual(x.groups,[]);
 assert.throws(()=>auditCalibrationExport({version:2,records:[]}),/version 1/);
 assert.throws(()=>auditCalibrationExport({version:1}),/version 1/);
});
