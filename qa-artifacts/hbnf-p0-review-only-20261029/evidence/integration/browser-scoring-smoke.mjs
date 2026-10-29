import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const project = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(project, '../..');
const candidate = path.join(path.resolve(process.env.HBNF_QA_CANDIDATE_DIR || path.join(workspace, 'qa-artifacts/hbnf-scoring-candidate')), 'public');
const cli = path.join(project, 'node_modules/.bin/supabase');
const status = JSON.parse(execFileSync(cli, [
  'status', '--output-format', 'json', '--workdir', project,
], { encoding: 'utf8', env: process.env }));
const apiUrl = status.env?.API_URL;
const anonKey = status.env?.ANON_KEY;
const serviceKey = status.env?.SERVICE_ROLE_KEY;
assert.ok(['ready', 'sleeping'].includes(status.readiness), `isolated Supabase stack must be available (current: ${status.readiness})`);
assert.equal(path.resolve(status.identity?.project_root || ''), project, 'stack must belong to the QA project');
assert.equal(new URL(apiUrl).hostname, '127.0.0.1', 'refuse non-local Supabase endpoints');
assert.ok(anonKey && serviceKey, 'local test keys must be available');

const restHeaders = { apikey: anonKey, authorization: `Bearer ${anonKey}` };
const tableUrl = `${apiUrl}/rest/v1/league_state`;
const fixtureWeek = '2099-01-06';
let preTestState;
const productionRequests = [];
const fixtureState = {
  glow: { weeks: {} },
  skins: {
    activeWeek: fixtureWeek,
    weeks: {
      [fixtureWeek]: {
        front: {
          cards: [{ id: 'qa-front-card', name: 'QA Front Card', playersText: 'QA Ada\nQA Ben\nQA Cy', winners: {} }],
          aceWinner: '',
        },
        back: {
          cards: [{ id: 'qa-back-card', name: 'QA Back Card', teamsText: 'QA Ada / QA Ben\nQA Cy / QA Dee', winners: {} }],
          aceWinner: '',
        },
        finalized: false,
        tagExchangeExceptions: {},
      },
    },
    deletedWeeks: {},
    restoredWeeks: {},
  },
  bagTags: {},
  __backups: [],
};

function stableFixture(value) {
  const copy = JSON.parse(JSON.stringify(value));
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node.id === 'string' && /^card_\d+_/.test(node.id)) node.id = node.id.replace(/^card_\d+_/, 'card_stable_');
    Object.values(node).forEach(visit);
  };
  visit(copy);
  return copy;
}

async function seedFixture() {
  preTestState = await readFixture();
  const response = await fetch(`${tableUrl}?id=eq.1`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ state_json: fixtureState, updated_at: new Date().toISOString() }),
  });
  assert.equal(response.ok, true, `fixture setup failed with HTTP ${response.status}`);
  const rows = await response.json();
  assert.equal(rows.length, 1, 'fixture setup must update the isolated id=1 row');
}

async function restoreFixture() {
  if (!preTestState) return;
  const response = await fetch(`${tableUrl}?id=eq.1`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ state_json: preTestState.state_json, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Local fixture restore failed with HTTP ${response.status}.`);
  const restored = await readFixture();
  assert.deepEqual(stableFixture(restored.state_json), stableFixture(preTestState.state_json), 'test must restore the pre-test isolated fixture, ignoring runtime-only generated card IDs');
}

async function readFixture() {
  const response = await fetch(`${tableUrl}?id=eq.1&select=id,state_json,updated_at`, { headers: restHeaders });
  assert.equal(response.ok, true, `independent readback failed with HTTP ${response.status}`);
  const rows = await response.json();
  assert.equal(rows.length, 1);
  return rows[0];
}
async function waitForRemoteState(predicate, description, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await readFixture();
    if (predicate(last.state_json)) return last;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`${description} was not independently visible in isolated server readback; last updated_at=${last?.updated_at}`);
}
async function readLocalRows(table, select = '*') {
  const response = await fetch(`${apiUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}`, { headers: restHeaders });
  assert.equal(response.ok, true, `isolated ${table} read failed with HTTP ${response.status}`);
  return response.json();
}

const mime = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
};
let supabaseBundle;
const server = createServer(async (req, res) => {
  try {
    const requestPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (requestPath === '/config.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end(`window.APP_CONFIG = ${JSON.stringify({ SUPABASE_URL: apiUrl, SUPABASE_ANON_KEY: anonKey })};`);
      return;
    }
    if (requestPath === '/__qa/supabase.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end(supabaseBundle);
      return;
    }
    const relative = requestPath === '/' ? '/skins.html' : requestPath;
    const resolved = path.resolve(candidate, `.${relative}`);
    if (!resolved.startsWith(candidate + path.sep)) { res.writeHead(403).end(); return; }
    const info = await stat(resolved);
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(resolved)] || 'application/octet-stream' });
    createReadStream(resolved).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
});

await seedFixture();
supabaseBundle = await readFile(path.join(project, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), 'utf8');
const htmlPath = path.join(candidate, 'skins.html');
const htmlHash = createHash('sha256').update(await readFile(htmlPath)).digest('hex');
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const appUrl = `http://127.0.0.1:${server.address().port}/skins.html`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.HBNF_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.HBNF_QA_CHROMIUM_EXECUTABLE } : {}),
});
const failures = [];
let coldPersistentContext = null;
let coldProfileDir = null;
function attachErrors(page) {
  page.on('pageerror', error => failures.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).hostname === 'phcpbvuqibyarpfrftgx.supabase.co') productionRequests.push(request.url());
  });
}
async function waitForSaved(page) {
  await page.waitForFunction(() => document.querySelector('#syncStatus')?.textContent?.includes('Saved to cloud'), null, { timeout: 15000 });
}
async function waitForFailure(page) {
  await page.waitForFunction(() => /Cloud not confirmed|Cloud unavailable|Conflict|recovery draft unavailable/i.test(document.querySelector('#syncStatus')?.textContent || ''), null, { timeout: 15000 });
}
async function setCheckbox(page, selector) {
  const check = page.locator(selector).first();
  await check.waitFor({ state: 'visible', timeout: 10000 });
  const playerId = await check.getAttribute('data-id');
  await check.check();
  return playerId;
}
const outcomes = {};

try {
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const pageA = await contextA.newPage();
  attachErrors(pageA);
  await pageA.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: supabaseBundle }));
  await pageA.route('https://fonts.googleapis.com/**', route => route.abort());
  await pageA.route('https://fonts.gstatic.com/**', route => route.abort());
  await pageA.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await waitForSaved(pageA);
  assert.equal(await pageA.locator('#weekSelect').inputValue(), fixtureWeek, 'app must select the fixture week from cloud');

  await pageA.locator('[data-page="setup"]').click();
  await pageA.locator('.card-text-input[data-round="front"]').first().fill('QA Ada\nQA Ben\nQA Cy');
  await waitForSaved(pageA);
  let remote = await readFixture();
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].front.cards[0].playersText, 'QA Ada\nQA Ben\nQA Cy');
  assert.deepEqual(remote.state_json.bagTags.players, [
    { tag: 2, name: 'QA Ada' }, { tag: 6, name: 'QA Cy' }, { tag: 10, name: 'QA Ben' },
  ], 'server-side tag projection must survive the acknowledged JSONB write');
  const queue = await readLocalRows('hbnf_matrix_vnext_live_queue', 'id,state_updated_at,status,fingerprint,last_error');
  assert.equal(queue.length, 1, 'local Matrix vNext trigger must enqueue the state change');
  assert.equal(queue[0].state_updated_at, remote.updated_at);
  assert.equal(queue[0].status, 'pending');
  assert.ok(queue[0].fingerprint, 'local queue must fingerprint the server JSONB state');
  const observations = await readLocalRows('hbnf_qa_matrix_trigger_observations', 'auto_live');
  assert.ok(observations.length >= 1, 'local Matrix sync trigger must have run');
  assert.ok(observations.every(row => row.auto_live === false), 'local Matrix live dispatch must remain disabled');
  outcomes.frontSetupReadback = 'PASS';
  outcomes.isolatedProductionTriggerProjections = 'PASS';

  const backInputs = pageA.locator('.back-team-input[data-round="back"]');
  await backInputs.nth(0).fill('QA Ada');
  await backInputs.nth(1).fill('QA Ben');
  await waitForSaved(pageA);
  remote = await readFixture();
  assert.match(remote.state_json.skins.weeks[fixtureWeek].back.cards[0].teamsText, /QA Ada/);
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].front.cards[0].playersText, 'QA Ada\nQA Ben\nQA Cy');
  outcomes.backSetupPreservesFront = 'PASS';

  await pageA.locator('[data-page="scorecards"]').click();
  const hole1Selector = '.skin-check[data-round="front"][data-hole="1"]';
  const winnerId = await setCheckbox(pageA, hole1Selector);
  await waitForSaved(pageA);
  remote = await readFixture();
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].front.cards[0].winners['1'], winnerId,
    'server must independently return the first saved winner');
  const winner2Id = await setCheckbox(pageA, '.skin-check[data-round="front"][data-hole="2"]');
  await waitForSaved(pageA);
  remote = await readFixture();
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].front.cards[0].winners['1'], winnerId);
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].front.cards[0].winners['2'], winner2Id,
    'second consecutive score must persist without replacing the first');
  outcomes.twoConsecutiveFrontSavesAndReadback = 'PASS';

  const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const pageB = await contextB.newPage();
  attachErrors(pageB);
  const realtimeFramesB = [];
  let resolveRealtimeReady;
  let rejectRealtimeReady;
  const realtimeReady = new Promise((resolve, reject) => {
    resolveRealtimeReady = resolve;
    rejectRealtimeReady = reject;
  });
  const realtimeTimeout = setTimeout(() => rejectRealtimeReady(new Error('Supabase Realtime subscription did not acknowledge within 15 seconds.')), 15000);
  pageB.on('websocket', socket => {
    if (!socket.url().includes('/realtime/v1/websocket')) return;
    socket.on('framereceived', frame => {
      const payload = typeof frame.payload === 'string' ? frame.payload : String(frame.payload);
      let decoded;
      try {
        decoded = JSON.parse(payload);
        realtimeFramesB.push(Array.isArray(decoded)
          ? {
              ref: decoded[1], topic: decoded[2], event: decoded[3], status: decoded[4]?.status,
              changes: decoded[4]?.response?.postgres_changes?.map(change => ({ event: change.event, schema: change.schema, table: change.table })),
            }
          : { event: decoded.event, status: decoded.payload?.status });
      } catch { realtimeFramesB.push({ frame: 'non-json' }); }
      const reply = Array.isArray(decoded) && decoded[3] === 'phx_reply' && decoded[4]?.status === 'ok';
      const joined = Array.isArray(decoded) && decoded[2] === 'realtime:skins-live';
      if (reply && joined) resolveRealtimeReady();
    });
  });
  await pageB.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: supabaseBundle }));
  await pageB.route('https://fonts.googleapis.com/**', route => route.abort());
  await pageB.route('https://fonts.gstatic.com/**', route => route.abort());
  await pageB.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await waitForSaved(pageB);
  await realtimeReady;
  clearTimeout(realtimeTimeout);
  assert.equal(await pageB.locator('#weekSelect').inputValue(), fixtureWeek);
  await pageB.locator('[data-page="scorecards"]').click();
  await pageB.locator(`${hole1Selector}:checked`).waitFor({ state: 'attached' });
  await pageB.locator('.skin-check[data-round="front"][data-hole="2"]:checked').waitFor({ state: 'attached' });
  outcomes.coldProfileReopen = 'PASS';

  const thirdWinner = await setCheckbox(pageA, '.skin-check[data-round="front"][data-hole="3"]');
  await waitForSaved(pageA);
  try {
    await pageB.waitForFunction(id => {
      const check = [...document.querySelectorAll('.skin-check[data-round="front"][data-hole="3"]')]
        .find(element => element.dataset.id === id);
      return !!check?.checked;
    }, thirdWinner, { timeout: 15000 });
  } catch (error) {
    const remoteAfterThird = await readFixture();
    const pageStatus = await pageB.locator('#syncStatus').textContent();
    const visibleHole3 = await pageB.locator('.skin-check[data-round="front"][data-hole="3"]').count();
    throw new Error(`Cross-profile Realtime failed; persisted=${remoteAfterThird.state_json.skins.weeks[fixtureWeek].front.cards[0].winners['3'] === thirdWinner}; status=${pageStatus}; visibleHole3=${visibleHole3}; frames=${JSON.stringify(realtimeFramesB)}; cause=${error.message}`);
  }
  outcomes.crossProfileRealtimeSync = 'PASS';

  await contextA.setOffline(true);
  const hole4 = await setCheckbox(pageA, '.skin-check[data-round="front"][data-hole="4"]');
  await waitForFailure(pageA);
  remote = await readFixture();
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].front.cards[0].winners['4'], undefined,
    'offline edit must not appear in cloud before retry');
  await contextA.setOffline(false);
  await setCheckbox(pageA, '.skin-check[data-round="front"][data-hole="5"]');
  await waitForSaved(pageA);
  remote = await readFixture();
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].front.cards[0].winners['4'], hole4,
    'offline draft must be retained and sent on successful retry');
  assert.ok(remote.state_json.skins.weeks[fixtureWeek].front.cards[0].winners['5']);
  outcomes.offlineDraftRetry = 'PASS';

  await pageA.route('**/rest/v1/league_state*', async route => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else {
      await route.continue();
    }
  });
  const conflictWinner = await setCheckbox(pageA, '.skin-check[data-round="front"][data-hole="6"]');
  await waitForFailure(pageA);
  assert.match(await pageA.locator('#syncStatus').textContent(), /Conflict/);
  assert.equal(await pageA.locator('.skin-check[data-round="front"][data-hole="6"]:checked').count(), 1,
    'a rejected CAS must retain the local draft');
  remote = await readFixture();
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].front.cards[0].winners['6'], undefined,
    'a rejected CAS must not write the attempted score');
  outcomes.uiCasConflictRetainsDraftNoOverwrite = conflictWinner ? 'PASS' : 'FAIL';
  assert.ok(conflictWinner);

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    serviceWorkers: 'block',
  });
  const mobilePage = await mobileContext.newPage();
  attachErrors(mobilePage);
  await mobilePage.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: supabaseBundle }));
  await mobilePage.route('https://fonts.googleapis.com/**', route => route.abort());
  await mobilePage.route('https://fonts.gstatic.com/**', route => route.abort());
  await mobilePage.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await waitForSaved(mobilePage);
  assert.equal(await mobilePage.locator('#weekSelect').inputValue(), fixtureWeek,
    'mobile startup must select the isolated cloud week');
  const mobileMetrics = await mobilePage.evaluate(() => ({
    innerWidth: window.innerWidth,
    viewportWidth: window.visualViewport?.width || null,
    narrowMedia: window.matchMedia('(max-width: 920px)').matches,
    switchDisplay: getComputedStyle(document.querySelector('.mobile-page-switch')).display,
    navDisplay: getComputedStyle(document.querySelector('.nav-row')).display,
  }));
  assert.ok(mobileMetrics.narrowMedia, `390px viewport must activate phone layout (${JSON.stringify(mobileMetrics)})`);
  assert.ok(await mobilePage.locator('.nav-btn[data-page="scorecards"]').isVisible(),
    `phone-sized view must expose scorecard navigation (${JSON.stringify(mobileMetrics)})`);
  await mobilePage.locator('.nav-btn[data-page="scorecards"]').tap();
  assert.ok(await mobilePage.locator('#frontScorecard').isVisible(),
    'phone navigation must open the Front 9 scorecard');
  assert.ok(await mobilePage.locator('#backScorecard').isVisible(),
    'phone navigation must preserve the Back 9 scorecard');
  const mobileWinner = await setCheckbox(mobilePage, '.skin-check[data-round="front"][data-hole="7"]');
  await waitForSaved(mobilePage);
  remote = await readFixture();
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].front.cards[0].winners['7'], mobileWinner,
    'phone-sized scoring edit must receive an independently read-back server ACK');
  const mobileDocumentWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(mobileDocumentWidth <= 391,
    `phone page must not create document-level horizontal overflow (width ${mobileDocumentWidth})`);
  outcomes.mobile390TouchScoringAndLayout = 'PASS';
  await mobileContext.close();

  const mobileReopenContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    serviceWorkers: 'block',
  });
  const mobileReopenPage = await mobileReopenContext.newPage();
  attachErrors(mobileReopenPage);
  await mobileReopenPage.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: supabaseBundle }));
  await mobileReopenPage.route('https://fonts.googleapis.com/**', route => route.abort());
  await mobileReopenPage.route('https://fonts.gstatic.com/**', route => route.abort());
  await mobileReopenPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await waitForSaved(mobileReopenPage);
  await mobileReopenPage.locator('.nav-btn[data-page="scorecards"]').tap();
  await mobileReopenPage.locator('.skin-check[data-round="front"][data-hole="7"]:checked')
    .waitFor({ state: 'attached' });
  assert.ok(await mobileReopenPage.locator('#backScorecard').isVisible(),
    'mobile cold reopen must retain access to Back 9');
  outcomes.mobileColdReopenAndServerReadback = 'PASS';
  await mobileReopenContext.close();

  // Verify Undo through the actual candidate code in a fresh isolated profile.
  const undoContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const undoPage = await undoContext.newPage();
  attachErrors(undoPage);
  await undoPage.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: supabaseBundle }));
  await undoPage.route('https://fonts.googleapis.com/**', route => route.abort());
  await undoPage.route('https://fonts.gstatic.com/**', route => route.abort());
  await undoPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await waitForSaved(undoPage);
  await undoPage.locator('[data-page="scorecards"]').click();
  const undoWinner = await setCheckbox(undoPage, '.skin-check[data-round="front"][data-hole="8"]');
  await waitForSaved(undoPage);
  remote = await readFixture();
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].front.cards[0].winners['8'], undoWinner,
    'Undo precondition must be acknowledged and read back from the isolated server');
  undoPage.on('dialog', dialog => dialog.accept());
  const undoResult = await undoPage.evaluate(() => hbnfUndoLast());
  assert.equal(undoResult, true, 'Undo must restore the previous scoring snapshot');
  remote = await waitForRemoteState(state => state.skins.weeks[fixtureWeek].front.cards[0].winners['8'] === undefined,
    'Undo-restored score');
  await waitForSaved(undoPage);
  outcomes.undoRestoresAndPersistsPreviousScore = 'PASS';
  await undoContext.close();

  // Exercise tag display/edit logic using the app's explicit test-only tag fixture.
  // This context is isolated from the production tag service and round records.
  const tagContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await tagContext.addInitScript(() => {
    const current = new Map([['qa ada', 2], ['qa ben', 6], ['qa cy', 10], ['qa dee', 12]]);
    const entries = new Map();
    const rows = participants => participants.map(person => ({
      round_date: '2099-01-06', event_type: 'skins', player_key: person.key,
      player_name: person.name, tag_number: current.get(person.key) || null,
      status: current.has(person.key) ? 'confirmed' : 'unknown', revision: 1,
    }));
    const currentRows = () => [...current].map(([key, tag]) => ({
      player_key: key,
      player_name: `QA ${key.slice(3).charAt(0).toUpperCase()}${key.slice(4)}`,
      tag_number: tag,
    }));
    window.HBNFTestTagFixture = {
      testOnly: true,
      loadRound: (_date, _event, people) => ({ entries: rows(people), available: [],
        currentEntries: currentRows(),
        currentAvailable: [] }),
      syncParticipants: (_date, _event, people) => ({ currentEntries: currentRows(), entries: rows(people) }),
      saveEntry: row => entries.set(row.player_key, row),
      setStatus: () => {},
    };
    window.__hbnfQaTagRows = entries;
  });
  const tagPage = await tagContext.newPage();
  attachErrors(tagPage);
  await tagPage.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: supabaseBundle }));
  await tagPage.route('https://fonts.googleapis.com/**', route => route.abort());
  await tagPage.route('https://fonts.gstatic.com/**', route => route.abort());
  await tagPage.goto(`${appUrl}?hbnf-test-fixture=1`, { waitUntil: 'domcontentloaded' });
  await waitForSaved(tagPage);
  await tagPage.locator('[data-page="scorecards"]').click();
  await tagPage.waitForFunction(() => !!window.HBNFRoundTags, null, { timeout: 15000 });
  await tagPage.evaluate(async () => window.HBNFRoundTags.ensureRound('2099-01-06'));
  await tagPage.waitForTimeout(1000);
  const tagFixtureReadiness = await tagPage.evaluate(() => ({
    url: location.href,
    week: document.querySelector('#weekSelect')?.value,
    loadedDate: window.HBNFRoundTags.getLoadedDate(),
    fixtureInstalled: window.HBNFTestTagFixture?.testOnly === true,
  }));
  assert.equal(tagFixtureReadiness.loadedDate, '2099-01-06',
    `Round Tags must load the synthetic fixture week (${JSON.stringify(tagFixtureReadiness)})`);
  assert.ok(await tagPage.evaluate(() => window.HBNFRoundTags.getDraftMap('2099-01-06')),
    'Round Tags must expose the loaded synthetic fixture week');
  const startingTags = await tagPage.evaluate(() => window.HBNFRoundTags.getCurrentMap());
  assert.equal(startingTags['QA Ada'], 2, `synthetic current tags should load (${JSON.stringify(startingTags)})`);
  assert.equal(startingTags['QA Ben'], 6, `synthetic current tags should load (${JSON.stringify(startingTags)})`);
  const tagEdit = await tagPage.evaluate(() => window.HBNFRoundTags.setDraftTag('QA Ada', '14'));
  assert.equal(tagEdit.ok, true, 'test-only Round Tags assignment should accept a participant tag edit');
  const editedTags = await tagPage.evaluate(() => window.HBNFRoundTags.getDraftMap('2099-01-06'));
  assert.equal(editedTags['QA Ada'], 14);
  assert.equal(await tagPage.evaluate(() => window.__hbnfQaTagRows.get('qa ada')?.tag_number), 14,
    'test-only tag edit must be captured by the isolated in-memory fixture');
  outcomes.roundTagDisplayAndTestOnlyEdit = 'PASS';
  await tagContext.close();

  // Verify payout, ace-pot, and standings projections from acknowledged neutral scores.
  const rulesContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const rulesPage = await rulesContext.newPage();
  attachErrors(rulesPage);
  await rulesPage.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: supabaseBundle }));
  await rulesPage.route('https://fonts.googleapis.com/**', route => route.abort());
  await rulesPage.route('https://fonts.gstatic.com/**', route => route.abort());
  await rulesPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await waitForSaved(rulesPage);
  await rulesPage.locator('[data-page="setup"]').click();
  await rulesPage.locator('#frontAceWinner').fill('QA Ada');
  await waitForSaved(rulesPage);
  remote = await readFixture();
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].front.aceWinner, 'QA Ada');
  const rulesView = await rulesPage.evaluate(() => {
    const season = computeSeason(standingsSkinState());
    const setup = document.querySelector('#setupPayoutSummary')?.innerText || '';
    setPage('standings');
    return { frontPlayers: calcWeek(getWeek()).frontCount, backPlayers: calcWeek(getWeek()).backCount,
      acePaid: season.totalAcePaid, acePot: season.acePot, ada: season.rows.find(row => row.name === 'QA Ada'),
      setup, standings: document.querySelector('#leaderboard')?.innerText || '' };
  });
  assert.equal(rulesView.frontPlayers, 3);
  assert.equal(rulesView.backPlayers, 4);
  assert.equal(rulesView.acePaid, 3, 'front ace should receive the accumulated three-player front pot');
  assert.equal(rulesView.acePot, 4, 'unclaimed back ace pot should carry four doubles-player contributions');
  assert.ok(rulesView.ada && rulesView.ada.acePayout === 3, 'standings should include the calculated ace payout');
  assert.match(rulesView.setup, /Ace pot/);
  assert.match(rulesView.standings, /QA Ada/);
  outcomes.frontBackPayoutAcePotAndStandings = 'PASS';
  await rulesContext.close();

  // Exercise the exact candidate through PostgREST across a forced close/reopen.
  const configurePage = async page => {
    await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: supabaseBundle }));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('https://fonts.gstatic.com/**', route => route.abort());
  };
  coldProfileDir = await mkdtemp(path.join(os.tmpdir(), 'hbnf-p0-cold-reopen-'));
  const coldOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, serviceWorkers: 'block', headless: true,
    ...(process.env.HBNF_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.HBNF_QA_CHROMIUM_EXECUTABLE } : {}) };
  coldPersistentContext = await chromium.launchPersistentContext(coldProfileDir, coldOptions);
  const coldContext = coldPersistentContext;
  const coldPage = await coldContext.newPage();
  attachErrors(coldPage);
  await configurePage(coldPage);
  await coldPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await waitForSaved(coldPage);
  await coldPage.locator('.nav-btn[data-page="scorecards"]').tap();
  await coldContext.setOffline(true);
  const coldWinner = await setCheckbox(coldPage, '.skin-check[data-round="front"][data-hole="9"]');
  await waitForFailure(coldPage);
  assert.equal(await coldPage.locator('#syncAlert').getAttribute('role'), 'status');
  assert.equal(await coldPage.locator('#syncAlert').getAttribute('aria-live'), 'polite');
  assert.equal(await coldPage.locator('#syncAlert').isVisible(), true, 'offline sync error must be visible outside collapsed controls');
  const coldMarker = await coldPage.evaluate(() => JSON.parse(localStorage.getItem('hbnf-sync-skins-pending-v1') || 'null'));
  assert.equal(coldMarker?.branchState?.weeks?.['2099-01-06']?.front?.cards?.[0]?.winners?.['9'], coldWinner,
    'the unacknowledged winner must be in the write-ahead device marker');
  await mkdir(path.join(project, 'reports/screenshots'), { recursive: true });
  await coldPage.screenshot({ path: path.join(project, 'reports/screenshots/hbnf-p0-iphone-390x844-offline-pending.png'), fullPage: true });
  await coldContext.close();
  coldPersistentContext = null;
  coldPersistentContext = await chromium.launchPersistentContext(coldProfileDir, coldOptions);
  const reopenedPage = await coldPersistentContext.newPage();
  attachErrors(reopenedPage);
  await configurePage(reopenedPage);
  await reopenedPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await reopenedPage.locator('.nav-btn[data-page="scorecards"]').tap();
  await reopenedPage.locator('.skin-check[data-round="front"][data-hole="9"]:checked').waitFor({ state: 'attached' });
  await waitForSaved(reopenedPage);
  remote = await waitForRemoteState(state => state.skins.weeks[fixtureWeek].front.cards[0].winners['9'] === coldWinner,
    'forced-close offline draft recovery');
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].front.cards[0].winners['9'], coldWinner);
  assert.equal(await reopenedPage.evaluate(() => localStorage.getItem('hbnf-sync-skins-pending-v1')), null,
    'only an independently read-back save may clear the device marker');
  outcomes.unacknowledgedOfflineEditForcedCloseReopenPostgrestReadback = 'PASS';
  await coldPersistentContext.close();
  coldPersistentContext = null;
  await rm(coldProfileDir, { recursive: true, force: true });
  coldProfileDir = null;

  // Successful UPDATE ACK plus failed independent GET must not be called Saved.
  const readbackContext = await browser.newContext({ viewport: { width: 430, height: 932 }, serviceWorkers: 'block' });
  const readbackPage = await readbackContext.newPage();
  attachErrors(readbackPage);
  await configurePage(readbackPage);
  let rejectNextIndependentReadback = false;
  await readbackPage.route('**/rest/v1/league_state*', async route => {
    const req = route.request();
    const params = new URL(req.url()).searchParams;
    if (req.method() === 'PATCH') {
      const response = await route.fetch();
      if (response.ok) rejectNextIndependentReadback = true;
      await route.fulfill({ response });
    } else if (req.method() === 'GET' && rejectNextIndependentReadback && params.get('select') === 'state_json,updated_at') {
      rejectNextIndependentReadback = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA forced readback outage' }) });
    } else await route.continue();
  });
  await readbackPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await waitForSaved(readbackPage);
  await readbackPage.locator('.nav-btn[data-page="scorecards"]').click();
  const readbackWinner = await setCheckbox(readbackPage, '.skin-check[data-round="back"][data-hole="10"]');
  await waitForFailure(readbackPage);
  remote = await readFixture();
  assert.equal(remote.state_json.skins.weeks[fixtureWeek].back.cards[0].winners['10'], readbackWinner,
    'database accepted the update despite the app follow-up GET failing');
  assert.ok(await readbackPage.evaluate(() => localStorage.getItem('hbnf-sync-skins-pending-v1')),
    'failed readback must retain a device recovery marker');
  assert.equal(await readbackPage.locator('#syncAlert').isVisible(), true);
  await readbackPage.reload({ waitUntil: 'domcontentloaded' });
  await readbackPage.locator('.nav-btn[data-page="scorecards"]').click();
  await readbackPage.locator('.skin-check[data-round="back"][data-hole="10"]:checked').waitFor({ state: 'attached' });
  await waitForSaved(readbackPage);
  assert.equal(await readbackPage.evaluate(() => localStorage.getItem('hbnf-sync-skins-pending-v1')), null,
    'reopen may clear the device draft after successful independent readback');
  outcomes.updateAckThenFailedReadbackAndReopen = 'PASS';
  await readbackContext.close();

  // Force localStorage quota failure while offline and check truthful recovery status.
  const quotaContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await quotaContext.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'hbnf-sync-skins-pending-v1') throw new DOMException('Quota exceeded by QA fixture', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  const quotaPage = await quotaContext.newPage();
  attachErrors(quotaPage);
  await configurePage(quotaPage);
  await quotaPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await waitForSaved(quotaPage);
  await quotaPage.locator('.nav-btn[data-page="scorecards"]').tap();
  await quotaContext.setOffline(true);
  await setCheckbox(quotaPage, '.skin-check[data-round="front"][data-hole="8"]');
  await waitForFailure(quotaPage);
  assert.match(await quotaPage.locator('#syncStatus').textContent(), /protected draft unavailable|recovery draft unavailable/i);
  assert.equal(await quotaPage.evaluate(() => localStorage.getItem('hbnf-sync-skins-pending-v1')), null);
  assert.equal(await quotaPage.locator('#syncAlert').isVisible(), true);
  outcomes.pendingMarkerQuotaFailureTruthfulOfflineStatus = 'PASS';
  await quotaContext.close();

  // Representative narrow/tablet layouts; wide tables may scroll internally.
  const viewportContext = await browser.newContext({ viewport: { width: 768, height: 1024 }, serviceWorkers: 'block' });
  const viewportPage = await viewportContext.newPage();
  attachErrors(viewportPage);
  await configurePage(viewportPage);
  await viewportPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await waitForSaved(viewportPage);
  for (const [width, height] of [[320, 740], [390, 844], [430, 932], [768, 1024], [1024, 1366]]) {
    await viewportPage.setViewportSize({ width, height });
    const metrics = await viewportPage.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
    assert.ok(metrics.documentWidth <= width + 1, `viewport must not create document-level horizontal overflow: ${JSON.stringify(metrics)}`);
  }
  assert.equal(await viewportPage.locator('#syncAlert').getAttribute('role'), 'status');
  assert.equal(await viewportPage.locator('#syncAlert').getAttribute('aria-live'), 'polite');
  await viewportPage.setViewportSize({ width: 768, height: 1024 });
  await viewportPage.screenshot({ path: path.join(project, 'reports/screenshots/hbnf-p0-ipad-768x1024-saved.png'), fullPage: true });
  outcomes.phoneTabletViewportAndAccessibleStatus = 'PASS (320, 390, 430, 768, 1024 CSS px)';

  // Reproduce Glow #147's stale full-root upsert against the same local row.
  const glowStaleRoot = structuredClone((await readFixture()).state_json);
  glowStaleRoot.glow ||= { weeks: {} };
  glowStaleRoot.glow.weeks['2099-01-06'] = { qaCrossWriter: 'stale-root-write' };
  const skinsBefore = await readFixture();
  const skinsWriteRoot = structuredClone(skinsBefore.state_json);
  skinsWriteRoot.skins.weeks[fixtureWeek].front.cards[0].winners['__qaCrossWriter'] = 'QA-Skins-CAS';
  const skinsWriteUrl = new URL(tableUrl);
  skinsWriteUrl.searchParams.set('id', 'eq.1');
  skinsWriteUrl.searchParams.set('updated_at', `eq.${skinsBefore.updated_at}`);
  skinsWriteUrl.searchParams.set('select', 'id,state_json,updated_at');
  const skinsWrite = await fetch(skinsWriteUrl, { method: 'PATCH', headers: { ...restHeaders, 'content-type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ state_json: skinsWriteRoot, updated_at: new Date().toISOString() }) });
  assert.equal(skinsWrite.ok, true, `isolated Skins CAS failed with HTTP ${skinsWrite.status}`);
  assert.equal((await skinsWrite.json()).length, 1, 'Skins write must receive a CAS acknowledgment before the Glow write');
  const glowWrite = await fetch(`${tableUrl}?on_conflict=id`, { method: 'POST', headers: { ...restHeaders, 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 1, state_json: glowStaleRoot, updated_at: new Date().toISOString() }) });
  assert.equal(glowWrite.ok, true, `isolated Glow upsert failed with HTTP ${glowWrite.status}`);
  const afterGlow = await readFixture();
  assert.equal(afterGlow.state_json.skins.weeks[fixtureWeek].front.cards[0].winners['__qaCrossWriter'], undefined,
    'stale Glow full-root upsert must reproduce the cross-writer Skins data-loss defect');
  assert.equal(afterGlow.state_json.glow.weeks['2099-01-06'].qaCrossWriter, 'stale-root-write');
  outcomes.glowIssue147StaleFullRootUpsertCrossWriterIntegrity = 'FAIL_CONFIRMED: stale Glow upsert erased an acknowledged Skins score in isolated PostgREST';
  await viewportContext.close();

  await contextB.close();
  await contextA.close();
  assert.deepEqual(failures, [], 'candidate page must not raise uncaught JavaScript errors');
  assert.deepEqual(productionRequests, [], 'test browser must not contact the production Supabase project');
  console.log(JSON.stringify({
    status: 'PASS',
    environment: 'isolated-local-supabase',
    browser: 'Chromium',
    appSourceSha256: htmlHash,
    fixtureWeek,
    productionRequests: productionRequests.length,
    fixtureRestored: true,
    overallScoringSafety: 'FAIL: Glow #147 whole-root write can erase valid Skins state',
    scenarios: outcomes,
  }, null, 2));
} finally {
  try { await restoreFixture(); }
  finally {
    if (coldPersistentContext) await coldPersistentContext.close().catch(() => {});
    if (coldProfileDir) await rm(coldProfileDir, { recursive: true, force: true });
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
