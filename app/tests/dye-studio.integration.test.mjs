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
  assert.match(studio,/schemaVersion:6,method:activeMethod\(\),methodsKey:methodKey\(a\),defaultPassCount:activePassCount\(\)/);
  assert.match(studio,/r\.schemaVersion===6&&r\.methodsKey===methodKey\(a\)/);
  assert.match(studio,/Method: \$\{\$\("methodSelect"\)/);
  assert.doesNotMatch(studio,/r\.schemaVersion===2/);
  assert.match(studio,/Per-block methods change warnings and evidence ranking, NOT the numerical preview/);
});

test('direct-paint pass count is persisted and does not silently reuse old calibration', () => {
  assert.match(studio,/id="passCount" type="number" min="1" max="12"/);
  assert.match(studio,/passCount:activePassCount\(\)/);
  assert.match(studio,/"passCount"\)\.value=String\(clamp\(Math\.round\(\+s\.passCount\|\|1\),1,12\)\)/);
  assert.match(studio,/Default passes for new blocks: \$\{activePassCount\(\)\}/);
  assert.match(studio,/clamp\(Math\.round\(\+l\.passes\|\|1\),1,12\)/);
  assert.match(studio,/schemaVersion:6,method:activeMethod\(\),methodsKey:methodKey\(a\),defaultPassCount:activePassCount\(\)/);
});

test('recordFor refuses mismatched per-dye carrier, pass count, base or schema', () => {
  const start=studio.indexOf('function recordFor(a){'),end=studio.indexOf('\n\nlet viewMode=',start);
  assert.ok(start>=0 && end>start,'recordFor extraction');
  const snippet=studio.slice(start,end);
  let base='#FFFFFF',defaultPasses=1;
  const records=[{
    schemaVersion:6,profileId:'innova_star',comboKey:'1',methodsKey:'["acetone-direct"]',
    baseHex:'#FFFFFF',transmissionHex:'#FFFFFF',daylightScene:'outdoor',
    processKey:'specific-recipe',method:'acetone-direct',region:'opaque-overall',
    measuredHex:'#123456',status:'verified',repeatCount:2
  }];
  const env={calibrationRecords:records,activeProfileId:'innova_star',viewMode:'daylight',
    profile:()=>({id:'innova_star'}),isTranslucentProfile:()=>false,
    activeRecipeKey:()=> 'specific-recipe',$:()=>({get value(){return base}}),
    currentTransmissionHex:()=> '#FFFFFF',daylightScene:'outdoor',
    comboKey:a=>String(a[0].passes),methodKey:a=>JSON.stringify(a.map(l=>l.method)),validHex:s=>s.length===7,
    activeMethod:()=> 'acetone-direct',activePassCount:()=>defaultPasses};
  const recordFor=Function('env','with(env){'+snippet+';return recordFor;}')(env);
  assert.equal(recordFor([{passes:1,method:'acetone-direct'}])?.measuredHex,'#123456');
  assert.equal(recordFor([{passes:1,method:'floetrol-stencil'}]),null);
  assert.equal(recordFor([{passes:2,method:'acetone-direct'}]),null);
  defaultPasses=2;
  assert.equal(recordFor([{passes:1,method:'acetone-direct'}])?.measuredHex,'#123456');
  base='#FEFFFF';assert.equal(recordFor([{passes:1,method:'acetone-direct'}]),null);
  base='#FFFFFF';records[0].repeatCount=1;
  assert.equal(recordFor([{passes:1,method:'acetone-direct'}]),null);
  records[0].repeatCount=2;records[0].status='experimental';
  assert.equal(recordFor([{passes:1,method:'acetone-direct'}]),null);
  records[0].status='verified';records[0].schemaVersion=5;
  assert.equal(recordFor([{passes:1,method:'acetone-direct'}]),null);
});

test('independent dye-block method and pass count change calibration identity', () => {
  const start=studio.indexOf('function methodForDyeLayer(l){');
  const end=studio.indexOf('function activeMethod()',start);
  assert.ok(start>=0&&end>start,'method and combo key extractable');
  const fns=Function('clamp','activeMethod',studio.slice(start,end)+';return {comboKey,methodKey,methodForDyeLayer}')(
    (x,lo,hi)=>Math.max(lo,Math.min(hi,x)),()=> 'acetone-direct');
  const a=[{name:'ProChem Onyx',hex:'#101010',strength:100,passes:1,method:'acetone-direct'}];
  assert.ok(fns.comboKey(a)!==fns.comboKey([{...a[0],passes:3}]));
  assert.ok(fns.comboKey(a)!==fns.comboKey([{...a[0],method:'floetrol-stencil'}]));
  assert.ok(fns.methodKey(a)!==fns.methodKey([{...a[0],method:'worm-dip'}]));
  assert.equal(fns.methodForDyeLayer({name:'UV Blast Green'}),'worm-dip');
  assert.match(studio,/id="layerPasses" type="number" min="1" max="12"/);
  assert.match(studio,/id="layerMethod" class="model-select"/);
  assert.match(studio,/l\.method=\$\("layerMethod"\)\.value/);
  assert.match(studio,/layers=deepCopy\(s\.layers\|\|\[\]\)\.map/);
  assert.match(studio,/Per-block counts:/);
});

test('direct-application research is source labeled without pretending measured colors', () => {
  assert.match(studio,/QA-AC-01/);
  assert.match(studio,/QA-AC-02/);
  assert.match(studio,/QA-AC-03/);
  assert.match(studio,/QA-WD-04/);
  assert.match(studio,/QA-AC-05/);
  assert.match(studio,/QA-AC-06/);
  assert.match(studio,/QA-AC-07/);
  assert.match(studio,/Of 58 provisional records/);
  assert.match(studio,/no measured numeric color data/);
  assert.match(studio,/Manufacturer starting guidance is 1\/2 tsp powder/);
  assert.match(studio,/potential adhesive softening and blurred edges/);
  assert.match(studio,/One brush pass can leave visible streaks/);
  assert.match(studio,/Multiple direct-acetone passes may deepen color but are NOT a validated linear multiplier/);
});

test('source method matching evaluates the actual dye block rather than the project default', () => {
  assert.match(studio,/const matchingLayers=layers\.filter\(l=>evidenceDyeFamilyMatches/);
  assert.match(studio,/const comparableLayers=matchingLayers\.length\?matchingLayers:layers/);
  assert.match(studio,/comparableLayers\.some\(l=>methodForDyeLayer\(l\)===observedMethod\)/);
  assert.match(studio,/MIXED APPLICATION METHODS/);
  assert.match(studio,/FORMULATION MISMATCH/);
  assert.match(studio,/Per-block methods change warnings and evidence ranking/);
});

test('studio uses the existing Local Roots palette without duplicate conflicting theme overrides', () => {
  assert.match(studio,/id="du-brand-integration-theme"/);
  assert.match(studio,/--panel:#fff8ee/);
  assert.match(studio,/--accent:#a7623a/);
  assert.match(studio,/\.canvas-shell\{background:linear-gradient\(145deg,#eadac5,#f7f0e4\)\}/);
  assert.doesNotMatch(studio,/id="local-roots-studio-visual-integration"/);
});
