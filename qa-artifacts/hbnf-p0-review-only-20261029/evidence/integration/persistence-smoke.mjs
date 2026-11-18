import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(project, 'node_modules/.bin/supabase');
const statusText = execFileSync(cli, [
  'status', '--output-format', 'json', '--workdir', project,
], { encoding: 'utf8', env: process.env });
const status = JSON.parse(statusText);
if (!['ready', 'sleeping'].includes(status.readiness)) throw new Error(`Isolated Supabase stack is not available (${status.readiness}).`);

const apiUrl = status.env?.API_URL;
const anonKey = status.env?.ANON_KEY;
if (!apiUrl || new URL(apiUrl).hostname !== '127.0.0.1' || !anonKey ||
    path.resolve(status.identity?.project_root || '') !== project) {
  throw new Error('Refusing to run: local Supabase endpoint or anonymous test key is missing.');
}

const tableUrl = `${apiUrl}/rest/v1/league_state`;
const headers = { apikey: anonKey, authorization: `Bearer ${anonKey}` };
async function readRow() {
  const response = await fetch(`${tableUrl}?id=eq.1&select=id,state_json,updated_at`, { headers });
  if (!response.ok) throw new Error(`Local PostgREST read failed with HTTP ${response.status}.`);
  const rows = await response.json();
  if (rows.length !== 1 || rows[0].id !== 1 || !rows[0].state_json?.skins) {
    throw new Error('Local PostgREST did not return the isolated league_state fixture.');
  }
  return rows[0];
}
async function conditionalWrite(row, state, revision) {
  const nextUpdatedAt = new Date(Date.now() + revision * 1000).toISOString();
  const url = new URL(tableUrl);
  url.searchParams.set('id', 'eq.1');
  url.searchParams.set('updated_at', `eq.${row.updated_at}`);
  url.searchParams.set('select', 'id,state_json,updated_at');
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ state_json: state, updated_at: nextUpdatedAt }),
  });
  if (!response.ok) throw new Error(`Local conditional write failed with HTTP ${response.status}.`);
  return response.json();
}

const original = await readRow();
const originalState = structuredClone(original.state_json);
const state1 = structuredClone(originalState);
state1.__hbnfQa = { run: 'local-persistence-smoke', revision: 1 };
let ack = await conditionalWrite(original, state1, 1);
if (ack.length !== 1 || ack[0].state_json.__hbnfQa?.revision !== 1) {
  throw new Error('First conditional write did not return the semantically acknowledged JSONB row.');
}
const read1 = await readRow();
if (read1.state_json.__hbnfQa?.revision !== 1) throw new Error('Independent readback missed first save.');

const state2 = structuredClone(read1.state_json);
state2.__hbnfQa.revision = 2;
ack = await conditionalWrite(read1, state2, 2);
if (ack.length !== 1 || ack[0].state_json.__hbnfQa?.revision !== 2) {
  throw new Error('Second conditional write did not receive a server acknowledgment.');
}
const staleBaseline = await readRow();
const competing = structuredClone(staleBaseline.state_json);
competing.__hbnfQa.revision = 3;
const competingAck = await conditionalWrite(staleBaseline, competing, 3);
if (competingAck.length !== 1) throw new Error('Competing writer did not receive its acknowledgment.');
const staleAttempt = await conditionalWrite(staleBaseline, state2, 4);
if (staleAttempt.length !== 0) throw new Error('Stale compare-and-swap unexpectedly overwrote the newer row.');
const finalRow = await readRow();
if (finalRow.state_json.__hbnfQa?.revision !== 3) throw new Error('Concurrent-write protection did not preserve the competing value.');

// Restore the neutral fixture after the isolated test, preserving its schema and row.
await conditionalWrite(finalRow, originalState, 5);
const restored = await readRow();
if (restored.state_json.__hbnfQa) throw new Error('Isolated fixture cleanup did not restore the original JSONB.');

console.log(JSON.stringify({
  status: 'PASS',
  environment: 'isolated-local-supabase',
  runtime: status.runtime,
  readiness: status.readiness,
  postgrestRead: 'PASS',
  conditionalAckAndIndependentReadback: 'PASS',
  twoConsecutiveSaves: 'PASS',
  compareAndSwapConflictNoOverwrite: 'PASS',
  fixtureRestored: 'PASS',
  fixtureWeek: restored.state_json.skins.activeWeek,
}, null, 2));
