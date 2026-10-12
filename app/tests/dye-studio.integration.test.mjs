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
    ['Floetrol with silicone','floetrol-bed'],
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
  assert.match(studio,/schemaVersion:3,method:activeMethod\(\)/);
  assert.match(studio,/r\.schemaVersion===3&&r\.method===activeMethod\(\)/);
  assert.match(studio,/Method: \$\{\$\("methodSelect"\)/);
  assert.doesNotMatch(studio,/r\.schemaVersion===2/);
  assert.match(studio,/Selected method changes warnings and evidence ranking, NOT the numerical preview/);
});
