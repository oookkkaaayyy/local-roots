import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const fn = readFileSync(resolve(process.cwd(), 'supabase/functions/du-stencil-gen/index.ts'), 'utf8');
const panel = readFileSync(resolve(process.cwd(), 'app/src/components/DuSpendPanel.tsx'), 'utf8');
const page = readFileSync(resolve(process.cwd(), 'app/src/pages/DuAdminPage.tsx'), 'utf8');

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
