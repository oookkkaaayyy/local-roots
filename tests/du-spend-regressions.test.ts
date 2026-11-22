import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const fn = readFileSync(new URL('../supabase/functions/du-stencil-gen/index.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../app/src/components/DuSpendPanel.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/src/pages/DuAdminPage.tsx', import.meta.url), 'utf8');

test('stencil generation records cost per row and enforces a dollar cap for visitors', () => {
  assert.match(fn, /MONTH_USD_CAP=10/);
  assert.match(fn, /cost_usd:rc\(cost\(j\.usage\)\)/);
  assert.match(fn, /spendMonth\(\)>=MONTH_USD_CAP/);
  assert.match(fn, /x-peek"\)==="log"\)\{if\(!adm\)return J\(\{error:"forbidden"\}/);
});

test('admin spend panel shows a cost column and is wired into the admin tabs', () => {
  assert.match(panel, /<th scope="col">Cost<\/th>/);
  assert.match(page, /DuSpendPanel deviceToken=\{deviceToken\}/);
  assert.match(page, /setAdminView\('spend'\)/);
});

test('admin has direct downloads for submission photos and gallery images', () => {
  assert.match(page, /download=\{photo\.original_filename/);
  assert.match(page, /Download \{role\.label\.toLowerCase\(\)\}/);
});
