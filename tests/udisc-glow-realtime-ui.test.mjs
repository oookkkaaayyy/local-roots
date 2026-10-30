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
  assert.match(html, /ctx\.state=ctx\.normalize\(hbnfSyncClone\(branch\)\)/,
    'normalizing an authoritative read must never mutate the server-root snapshot used as the CAS baseline');
  assert.match(html, /ctx\.state=ctx\.normalize\(hbnfSyncClone\(remoteBranch\|\|ctx\.state\|\|null\)\)/,
    'deferred remote adoption must also normalize a copy of the authoritative branch');
});

test('focused fields defer remote state and apply it after blur without dropping real drafts', () => {
  assert.match(html, /if\(deferIfFocused&&shouldDeferRender\(\)\)\{ctx\.pendingRootState=remote;return false\}/);
  assert.match(html, /function applyPendingRemoteState\(\)\{if\(!ctx\.pendingRootState\)return false;if\(shouldDeferRender\(\)\)return false;/,
    'the deferred blur callback must recheck focus after focus has moved to the next score field, or it can redraw before the next keystroke');
  assert.match(html, /document\.addEventListener\('focusout',[\s\S]*setTimeout\(applyPendingRemoteState,0\)/);
  assert.match(html, /if\(ctx\.saveCoordinator&&ctx\.saveCoordinator\.hasPending\)\{ctx\.saveCoordinator\.markConflict\(\);return false\}/);
  assert.doesNotMatch(html, /focusout[^;]{0,500}clearPendingRemoteState\(\)/);
});

test('remote render does not create an unsent write draft', () => {
  assert.match(html, /ctx\.remoteSyncing=true;try\{localStorage\.setItem\(ctx\.localKey,JSON\.stringify\(ctx\.state\)\);if\(before!==hbnfStateHash\(ctx\.state\)\)ctx\.renderAll\(\)\}finally\{ctx\.remoteSyncing=false\}/);
  assert.match(html, /setGlowSaveStatus\('saved'\)/);
});

test('Skins confirms Realtime replication, recovers offline edits on reopen, and shows status outside collapsed controls', async () => {
  const skins = await readFile(new URL('../source-snapshots/hbnf-worker-d1a5f936-20261024/public/skins.html', import.meta.url), 'utf8');
  assert.match(skins, /config:\{broadcast:\{replication_ready:true\},postgres_changes_options:\{wait:true\}\}/);
  assert.match(skins, /payload\?\.message==='Replication connection established'[\s\S]*?ctx\.requestAuthoritativeCatchup\(\)/);
  assert.match(skins, /requestAuthoritativeCatchup\(\)\{if\(!ctx\.supabaseClient\)return Promise\.resolve\(\);if\(ctx\.catchupPromise\)return ctx\.catchupPromise/);
  assert.match(skins, /addEventListener\('online',\(\)=>ctx\.requestAuthoritativeCatchup\(\)\)/);
  assert.match(skins, /addEventListener\('focus',\(\)=>ctx\.requestAuthoritativeCatchup\(\)\)/);
  assert.match(skins, /visibilitychange',\(\)=>\{if\(document\.visibilityState==='visible'\)ctx\.requestAuthoritativeCatchup\(\)\}/);
  assert.match(skins, /incomingRevision&&ctx\.remoteUpdatedAt&&incomingRevision<=ctx\.remoteUpdatedAt/);
  assert.match(skins, /hbnf-sync-skins-pending-v1/);
  assert.match(skins, /pending\.baseBranchHash[\s\S]*?remoteHash===pending\.baseBranchHash/);
  assert.match(skins, /baseBranchState:hbnfSyncClone/);
  assert.match(skins, /mergeLeagueTree\(baseState,pendingState,authoritative\)/);
  assert.match(skins, /function skinsSemanticBranch\(value\)/);
  assert.match(skins, /const currentBranchHash=skinsSemanticBranch\(currentRoot&&currentRoot\[ctx\.branch\]\)/);
  assert.match(skins, /const incomingBranchHash=skinsSemanticBranch\(incoming&&incoming\[ctx\.branch\]\)/);
  assert.match(skins, /ctx\.lastRemoteBranchHash=skinsSemanticBranch\(remoteBranch\)/);
  assert.match(skins, /persistSkinsPendingDraft\(skinsSemanticBranch\(confirmedRoot[\s\S]*?,true\)/);
  assert.match(skins, /if\(alreadySaved\)[\s\S]*?removeItem\('hbnf-sync-skins-pending-v1'\)/);
  assert.match(skins, /<\/header>\s*<div class="sync-status-strip"><span class="pill" id="syncStatus" role="status" aria-live="polite">[\s\S]*?<\/div>\s*<main/);
  assert.match(skins, /rpc\('hbnf_save_league_state_v1'/);
});

test('Skins distinguishes its write-ahead recovery copy from ordinary local page storage', async () => {
  const skins = await readFile(new URL('../source-snapshots/hbnf-worker-d1a5f936-20261024/public/skins.html', import.meta.url), 'utf8');
  assert.match(skins, /localDraftStored:true,pendingDraftStored:true/);
  assert.match(skins, /ctx\.pendingDraftStored=true;return true\}catch\(e\)\{ctx\.pendingDraftStored=false/);
  assert.match(skins, /ctx\.localDraftStored=true;return true\}catch\(err\)\{ctx\.localDraftStored=false/);
  assert.match(skins, /ctx\.localDraftStored===false\|\|ctx\.pendingDraftStored===false\?'Cloud save failed and device draft could not be stored/);
});
