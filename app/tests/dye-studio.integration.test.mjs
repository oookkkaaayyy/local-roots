import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const dAndU = read('../src/pages/DyedUnattachedPage.tsx');
const shell = read('../src/components/Shell.tsx');
const studio = read('../public/dyed-and-unattached/dye-studio/index.html');

test('nested route preserves D&U navigation and forwards to the same-origin studio app', () => {
  assert.match(app, /\/dyed-and-unattached\/dye-studio.*canonical:'\/dyed-and-unattached\/dye-studio'/);
  assert.match(app, /path==='\/dyed-and-unattached\/dye-studio'\)return <DyeStudioPage\/>/);
  assert.match(dAndU, /href="\/dyed-and-unattached\/dye-studio">Dye Studio<\/a>/);
  assert.match(shell, /path\.startsWith\(`\$\{href\}\/`\)/);
  assert.match(read('../src/pages/DyeStudioPage.tsx'), /window\.location\.replace\('\/dyed-and-unattached\/dye-studio\/index\.html'\)/);
});

test('candidate retains designer controls and evidence limits', () => {
  for (const id of ['baseColor', 'layerList', 'undoBtn', 'redoBtn', 'saveProject', 'loadProject', 'copyRecipe', 'exportPng']) {
    assert.ok(studio.includes(`id="${id}"`), `missing designer control: ${id}`);
  }
  assert.match(studio, /No quantitative accuracy guarantee/);
  assert.match(studio, /preview is a model estimate, not an observed result/);
  assert.match(studio, /Two or more dye blocks physically overlap/);
  assert.match(studio, /Primary workflow: dye applied directly in acetone-based color blocks/);
  assert.match(studio, /Secondary workflow: dye first mixed with hot water, then Floetrol/);
  assert.match(studio, /classifyObservedProcess/);
  assert.match(studio, /methodAnalog/);
  assert.doesNotMatch(studio, /HBNF full-strength Floetrol application with controlled heat/);
  assert.doesNotMatch(studio, /Photo-calibrated modeling for opaque and translucent discs/);
  assert.match(studio, /100% nominal model input/);
  assert.match(studio, /NOT a measured dye concentration or validated physical recipe/);
  assert.doesNotMatch(studio, /100% full-strength HBNF production recipe/);
});

test('owned Onyx remains distinct and mobile zoom remains available', () => {
  assert.match(studio, /"ProChem Onyx"/);
  assert.match(studio, /Unsupported historical product: iDye Poly Onyx/);
  assert.doesNotMatch(studio, /maximum-scale\s*=/i);
});

test('method classification does not confuse direct acetone with glue beds or painted stencil with beds', () => {
  assert.match(studio, /<option value="acetone-direct" selected>/);
  assert.match(studio, /<option value="floetrol-stencil">/);
  assert.match(studio, /<option value="acetone-glue-bed">/);
  assert.match(studio, /<option value="floetrol-bed">/);
  const start=studio.indexOf('function classifyObservedProcess(description){');
  const end=studio.indexOf('function evidenceScore(',start);
  assert.ok(start>=0 && end>start, 'method classifier missing');
  const classify=Function(studio.slice(start,end)+';return classifyObservedProcess')();
  const examples=[
    ['Clear glue; acetone','acetone-glue-bed'],
    ['Clear glue bed with acetone dye','acetone-glue-bed'],
    ['Floetrol painted on stencil','floetrol-stencil'],
    ['Floetrol with silicone','floetrol-unspecified'],
    ['Floetrol cells','floetrol-bed'],
    ['Lotion and worm dip','mixed-or-compound-process'],
    ['Floetrol dye','floetrol-unspecified'],
    ['Direct acetone brush painting','acetone-direct'],
    ['Quick Coat UV Blast worm dip','worm-dip'],
    ['Acetone','acetone-unspecified'],
    ['NR','unknown']
  ];
  for (const [description,expected] of examples) assert.equal(classify(description),expected,description);
});

test('recipe, history and calibrated records identify the selected application method', () => {
  assert.match(studio,/method:activeMethod\(\)/);
  assert.match(studio,/"methodSelect"\)\.value=s\.method\|\|"acetone-direct"/);
  assert.match(studio,/schemaVersion:5,method:activeMethod\(\),defaultPassCount:activePassCount\(\)/);
  assert.match(studio,/r\.schemaVersion===5&&r\.method===activeMethod\(\)/);
  assert.match(studio,/Method: \$\{\$\("methodSelect"\)/);
  assert.doesNotMatch(studio,/r\.schemaVersion===2/);
  assert.match(studio,/Selected method changes warnings and evidence ranking, NOT the numerical preview/);
});

test('direct-paint pass count is persisted and does not silently reuse old calibration', () => {
  assert.match(studio,/id="passCount" type="number" min="1" max="12"/);
  assert.match(studio,/passCount:activePassCount\(\)/);
  assert.match(studio,/"passCount"\)\.value=String\(clamp\(Math\.round\(\+s\.passCount\|\|1\),1,12\)\)/);
  assert.match(studio,/Default passes for new blocks: \$\{activePassCount\(\)\}/);
  assert.match(studio,/clamp\(Math\.round\(\+l\.passes\|\|1\),1,12\)/);
  assert.match(studio,/schemaVersion:5,method:activeMethod\(\),defaultPassCount:activePassCount\(\)/);
});

test('recordFor refuses mismatched per-block passes, method, base or schema', () => {
  const start=studio.indexOf('function recordFor(a){'),end=studio.indexOf('\n\nlet viewMode=',start);
  assert.ok(start>=0 && end>start, 'recordFor extractable');
  const snippet=studio.slice(start,end);
  let method='acetone-direct',base='#FFFFFF',defaultPasses=1;
  const records=[{
    schemaVersion:5,profileId:'innova_star',comboKey:'1',baseHex:'#FFFFFF',
    transmissionHex:'#FFFFFF',daylightScene:'outdoor',processKey:'specific-recipe',
    method:'acetone-direct',region:'opaque-overall',measuredHex:'#123456',status:'verified'
  }];
  const env={calibrationRecords:records,activeProfileId:'innova_star',viewMode:'daylight',
    profile:()=>({id:'innova_star'}),isTranslucentProfile:()=>false,
    activeRecipeKey:()=> 'specific-recipe',$:()=>({get value(){return base}}),
    currentTransmissionHex:()=> '#FFFFFF',daylightScene:'outdoor',
    comboKey:a=>String(a[0].passes),activeMethod:()=>method,activePassCount:()=>defaultPasses};
  const recordFor=Function('env','with(env){'+snippet+';return recordFor;}')(env);
  assert.equal(recordFor([{passes:1}])?.measuredHex,'#123456');
  method='floetrol-stencil';assert.equal(recordFor([{passes:1}]),null);
  method='acetone-direct';assert.equal(recordFor([{passes:2}]),null);
  defaultPasses=2;assert.equal(recordFor([{passes:1}])?.measuredHex,'#123456');
  base='#FEFFFF';assert.equal(recordFor([{passes:1}]),null);
  base='#FFFFFF';records[0].schemaVersion=4;assert.equal(recordFor([{passes:1}]),null);
});

test('different color-block passes produce distinct recipe calibration keys', () => {
  const start=studio.indexOf('function comboKey(a){'),end=studio.indexOf('function activeMethod()',start);
  assert.ok(start>=0 && end>start);
  const comboKey=Function('clamp',studio.slice(start,end)+';return comboKey')((x,lo,hi)=>Math.max(lo,Math.min(hi,x)));
  const a=[{name:'ProChem Onyx',hex:'#101010',strength:100,passes:1}];
  assert.ok(comboKey(a)!==comboKey([{...a[0],passes:3}]));
  assert.match(studio,/id="layerPasses" type="number" min="1" max="12"/);
  assert.match(studio,/l\.passes=clamp\(/);
  assert.match(studio,/layers=deepCopy\(s\.layers\|\|\[\]\)\.map/);
  assert.match(studio,/Per-block counts:/);
});

test('direct-application research is source labeled without pretending measured colors', () => {
  assert.match(studio,/QA-AC-01/);
  assert.match(studio,/QA-AC-02/);
  assert.match(studio,/QA-AC-03/);
  assert.match(studio,/QA-WD-04/);
  assert.match(studio,/Of 55 provisional records/);
  assert.match(studio,/no measured numeric color data/);
  assert.match(studio,/One brush pass can leave visible streaks/);
  assert.match(studio,/Multiple direct-acetone passes may deepen color but are NOT a validated linear multiplier/);
});
