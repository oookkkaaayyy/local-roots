import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const file = process.env.HBNF_GLOW_HTML || 'source-snapshots/hbnf-worker-d1a5f936-20261024/public/glow.html';
const html = await readFile(file, 'utf8');

test('Glow requests server-confirmed Realtime readiness and catches up after reconnect', () => {
  assert.match(html, /replication_ready:true/);
  assert.match(html, /postgres_changes_options:\{wait:true\}/);
  assert.match(html, /\.subscribe\(status=>\{if\(status==='SUBSCRIBED'\)\{ctx\.pullRoot\(\)\}/);
  assert.match(html, /addEventListener\('online',\(\)=>\{if\(ctx\.supabaseClient\)ctx\.pullRoot\(\)\}\)/);
  assert.match(html, /visibilitychange[\s\S]*ctx\.pullRoot\(ctx\.state\)/);
});

test('clean remote Glow state is adopted without treating cached localStorage as an edit', () => {
  assert.doesNotMatch(html, /ctx\.hadLocalState&&!glowEqual\(ctx\.state,remoteBranch\)/);
  assert.match(html, /if\(ctx\.saveCoordinator\?\.hasPending\)\{ctx\.pendingRootState=remote;ctx\.saveCoordinator\.markConflict\(\);return false\}/);
});

test('focused fields defer remote state and apply it after blur without dropping real drafts', () => {
  assert.match(html, /if\(deferIfFocused&&shouldDeferRender\(\)\)\{ctx\.pendingRootState=remote;return false\}/);
  assert.match(html, /document\.addEventListener\('focusout',[\s\S]*setTimeout\(applyPendingRemoteState,0\)/);
  assert.match(html, /if\(ctx\.saveCoordinator&&ctx\.saveCoordinator\.hasPending\)\{ctx\.saveCoordinator\.markConflict\(\);return false\}/);
  assert.doesNotMatch(html, /focusout[^;]{0,500}clearPendingRemoteState\(\)/);
});

test('remote render does not create an unsent write draft', () => {
  assert.match(html, /ctx\.remoteSyncing=true;try\{localStorage\.setItem\(ctx\.localKey,JSON\.stringify\(ctx\.state\)\);if\(before!==hbnfStateHash\(ctx\.state\)\)ctx\.renderAll\(\)\}finally\{ctx\.remoteSyncing=false\}/);
  assert.match(html, /setGlowSaveStatus\('saved'\)/);
});
