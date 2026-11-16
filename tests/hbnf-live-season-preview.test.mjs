import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/hbnf-live-season-preview.html', import.meta.url), 'utf8');
test('preview clearly uses sample data and never claims a live feed', () => {
  assert.match(source, /SAMPLE DATA/);
  assert.match(source, /Preview only · No live score connection/);
  assert.match(source, /Example standings · finals only/);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|supabase|localStorage)\s*\(/i);
});
test('same-site HBNF navigation links are read-only', () => {
  for (const path of ['/glow.html','/skins.html','/hbnf-cart.html']) {
    assert.ok(source.includes(`href="${path}"`), path);
  }
  assert.doesNotMatch(source, /https?:\/\//);
  assert.doesNotMatch(source, /sendCommand|applyTag|saveScore|patchScore|PUT\s*\(/i);
});
test('both tabs expose accessible panels and hash-preserving browser navigation', () => {
  for (const view of ['live','season']) {
    assert.match(source, new RegExp(`id="tab-${view}" role="tab" aria-controls="pane-${view}"`));
    assert.match(source, new RegExp(`id="pane-${view}" role="tabpanel"`));
  }
  assert.match(source, /window\.addEventListener\('hashchange',fromHash\)/);
  assert.match(source, /e\.key==='ArrowRight'\|\|e\.key==='ArrowLeft'/);
  assert.match(source, /location\.hash=next/);
});
test('display labels include live freshness, official-only seasonal counts and rank ties', () => {
  assert.match(source, /Score age/);
  assert.match(source, /Stale · 5:01/);
  assert.match(source, /Partial season/);
  assert.match(source, /Example live standings/);
  assert.match(source, /Example season Glow standings/);
  assert.match(source, /Example season Skins standings/);
  assert.match(source, /<td class="position">1<\/td><td>Player A<\/td>/);
  assert.match(source, /<td class="position">1<\/td><td>Player B<\/td>/);
});
