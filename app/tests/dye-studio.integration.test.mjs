import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const dAndU = read('../src/pages/DyedUnattachedPage.tsx');
const shell = read('../src/components/Shell.tsx');
const studio = read('../public/dye-studio/index.html');

test('nested route preserves D&U navigation and forwards to the same-origin studio app', () => {
  assert.match(app, /\/dyed-and-unattached\/dye-studio.*canonical:'\/dyed-and-unattached\/dye-studio'/);
  assert.match(app, /path==='\/dyed-and-unattached\/dye-studio'\)return <DyeStudioPage\/>/);
  assert.match(dAndU, /href="\/dyed-and-unattached\/dye-studio">Dye Studio<\/a>/);
  assert.match(shell, /path\.startsWith\(`\$\{href\}\/`\)/);
  assert.match(read('../src/pages/DyeStudioPage.tsx'), /window\.location\.replace\('\/dye-studio\/index\.html'\)/);
});

test('candidate retains designer controls and evidence limits', () => {
  for (const id of ['baseColor', 'layerList', 'undoBtn', 'redoBtn', 'saveProject', 'loadProject', 'copyRecipe', 'exportPng']) {
    assert.ok(studio.includes(`id="${id}"`), `missing designer control: ${id}`);
  }
  assert.match(studio, /No quantitative accuracy guarantee/);
  assert.match(studio, /preview is a model estimate, not an observed result/);
  assert.match(studio, /Two or more dye blocks physically overlap/);
});

test('owned Onyx remains distinct and mobile zoom remains available', () => {
  assert.match(studio, /"ProChem Onyx"/);
  assert.match(studio, /Unsupported historical product: iDye Poly Onyx/);
  assert.doesNotMatch(studio, /maximum-scale\s*=/i);
});
