import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCutSheet, deriveRules, CUT_SHEET } from '../src/lib/duCutSheet.mjs';

test('cut sheet is true size, fits the artwork width and lists every cell', () => {
  const s = buildCutSheet();
  assert.equal(s.widthMm, 190.5);
  assert.match(s.svg, /width="190.5mm"/);
  assert.equal(s.legend.length, CUT_SHEET.islandDiametersMm.length + CUT_SHEET.neckWidthsMm.length + CUT_SHEET.slitWidthsMm.length + CUT_SHEET.taperAnglesDeg.length);
  const maxX = 6 + (CUT_SHEET.islandDiametersMm.length - 1) * 28 + 20;
  assert.ok(maxX <= 190.5);
});

test('deriveRules uses the smallest size that passes along with every larger one, plus margin', () => {
  const r = deriveRules({
    islands: [{ value: 1.0, ok: false }, { value: 1.5, ok: true }, { value: 2.0, ok: true }, { value: 2.5, ok: true }],
    necks: [{ value: 0.4, ok: false }, { value: 0.6, ok: true }, { value: 0.8, ok: false }, { value: 1.0, ok: true }, { value: 1.2, ok: true }],
    slits: [{ value: 0.3, ok: false }, { value: 0.4, ok: true }, { value: 0.6, ok: true }],
  });
  assert.equal(r.islandMinDiameterMm, 1.8);
  assert.equal(r.whiteMinWidthMm, 1.2);
  assert.equal(r.blackMinWidthMm, 0.5);
});
