import test from 'node:test';
import assert from 'node:assert/strict';
import {stencilBleedRisk,plasticUptake,soakHours,PLASTIC_UPTAKE_RATING} from '../scripts/dye-studio-stencil-workflow.mjs';

test('acetone on contact paper is the highest default screening risk', () => {
  const a = stencilBleedRisk({medium:'acetone',stencil:'contact-paper'});
  const b = stencilBleedRisk({medium:'acetone',stencil:'vinyl-removable'});
  assert.ok(a.score > b.score);
  assert.deepEqual(a.factors, ['acetone-adhesive']);
  assert.equal(a.level, 'medium');
});
test('heat, open edges and bubbles escalate to high', () => {
  const r = stencilBleedRisk({medium:'acetone',stencil:'contact-paper',hotBath:true,edgesSmoothed:false,bubblesRemoved:false});
  assert.equal(r.level, 'high');
  assert.ok(r.factors.includes('heat-edge-lift') && r.factors.includes('air-bubbles') && r.factors.includes('edge-unsealed'));
});
test('wax resist ignores solvent and heat factors', () => {
  assert.equal(stencilBleedRisk({medium:'acetone',stencil:'wax-resist',hotBath:true}).factors.length, 0);
});
test('unknown inputs are rejected', () => {
  assert.throws(() => stencilBleedRisk({medium:'x',stencil:'vinyl-removable'}), /medium/);
  assert.throws(() => stencilBleedRisk({medium:'lotion',stencil:'x'}), /stencil/);
});
test('plastic uptake ratings are bounded and unknown is null', () => {
  for (const v of Object.values(PLASTIC_UPTAKE_RATING)) assert.ok(v >= 1 && v <= 5);
  assert.equal(plasticUptake('Innova Star'), 5);
  assert.equal(plasticUptake('Unknown'), null);
});
test('translucent soak time doubles', () => {
  assert.equal(soakHours(12, {translucent:true}), 24);
  assert.equal(soakHours(12), 12);
  assert.throws(() => soakHours(0), /positive/);
});
