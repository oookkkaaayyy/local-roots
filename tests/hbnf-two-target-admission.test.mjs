import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createGoogleDriveReleaseStore } from '../scripts/hbnf-drive-admission-store.mjs';
import { HBNF_ADMISSION, readCloudflareDeploymentEvidence, readSupabaseBaselineEvidence, runHbnfTwoTargetAdmission, validateHbnfTwoTargetAdmission, verifyDurableParentBytes, SUPABASE_READ_ONLY_QUERY } from '../scripts/hbnf-two-target-admission.mjs';

const repoRoot = process.cwd();
const artifactRoot = path.join(repoRoot, 'release-artifacts/v343-compat-7c559');
const now = Date.parse('2026-10-30T08:52:00.000Z');

function manifest() {
  return {
    format: 'hbnf-two-target-release-admission-v1', releaseId: HBNF_ADMISSION.releaseId,
    phase: 'PENDING', status: 'REVIEW_ONLY', oneTime: true,
    source: { repository: 'oookkkaaayyy/local-roots', branch: 'feature/udisc-glow-standings-prototype', commit: HBNF_ADMISSION.sourceCommit, packageBuilderCommit: HBNF_ADMISSION.sourceCommit },
    candidate: { path: 'HBNF-scoring-candidate.zip', bytes: 5029798, sha256: HBNF_ADMISSION.candidateSha256 },
    durableRecovery: {
      sourceBundle: { sha256: HBNF_ADMISSION.sourceBundleSha256, bytes: HBNF_ADMISSION.sourceBundleBytes, driveId: '16QS-_r8zHojhACZ2aM6yr13yg42awDTa' },
      candidate: { sha256: HBNF_ADMISSION.candidateSha256, bytes: HBNF_ADMISSION.candidateBytes, driveId: '1VzJMZOcigUiAPQan3Us3OUzzEJEFgcJy' },
      rollback: { sha256: HBNF_ADMISSION.rollbackSha256, bytes: HBNF_ADMISSION.rollbackBytes, driveId: '1lYcngC0-u2e_T0f4rMz12pVc9VXcLa6c' },
      qualificationEvidenceBundle: { sha256: HBNF_ADMISSION.evidenceSha256, bytes: HBNF_ADMISSION.evidenceBytes, independentDownloadBack: 'PASS' },
    },
    targets: [
      { kind: 'cloudflare-worker', target: 'hbnf', expectedBaselineVersion: HBNF_ADMISSION.cloudflareVersion,
        rollback: { path: 'HBNF-scoring-rollback.zip', bytes: HBNF_ADMISSION.rollbackBytes, sha256: HBNF_ADMISSION.rollbackSha256, cronRemoval: 'deploy rollback config with triggers.crons=[]' } },
      { kind: 'supabase-database', targetProject: HBNF_ADMISSION.supabaseProject, migrations: Object.entries(HBNF_ADMISSION.migrationHashes).map(([name, sha256]) => ({ path: `database/${name}`, sha256, bytes: 1 })) },
    ],
  };
}

function readbacks() {
  const versions = [{ version_id: HBNF_ADMISSION.cloudflareVersion, percentage: 100 }];
  const grants = [];
  for (const grantee of ['anon', 'authenticated', 'service_role']) for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) grants.push({ grantee, privilege });
  const snapshot = {
    serverTime: new Date(now).toISOString(), tableExists: true, rlsEnabled: true,
    columns: [{ column: 'id', type: 'bigint', nullable: 'NO' }, { column: 'state_json', type: 'jsonb', nullable: 'NO' }, { column: 'updated_at', type: 'timestamp with time zone', nullable: 'NO' }],
    grants,
    policies: [{ name: 'Public can read league_state', command: 'SELECT' }, { name: 'Public can update league_state', command: 'UPDATE' }, { name: 'Public can write league_state', command: 'INSERT' }],
    triggers: ['hbnf_matrix_vnext_capture_after_state_change', 'hbnf_project_current_tags_into_league_state', 'trg_hbnf_matrix_sync'].map(name => ({ name })),
    candidateMigrations: [],
  };
  const snapshotBytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
  return {
    cloudflare: {
      provider: 'cloudflare-api', endpoint: `https://api.cloudflare.com/client/v4/accounts/${HBNF_ADMISSION.cloudflareAccount}/workers/scripts/hbnf/deployments`,
      capturedAt: new Date(now).toISOString(), payload: { success: true, result: { deployments: [{ id: 'dep-1', versions }, { id: 'dep-previous', versions: [{ version_id: HBNF_ADMISSION.cloudflareVersion, percentage: 100 }] }] } },
    },
    supabase: {
      provider: 'supabase-readonly-api', endpoint: `https://api.supabase.com/v1/projects/${HBNF_ADMISSION.supabaseProject}/database/query/read-only`, projectId: HBNF_ADMISSION.supabaseProject, capturedAt: new Date(now).toISOString(),
      driveFileId: 'supabase-baseline-drive-file', snapshot, snapshotBytes: snapshotBytes.length, snapshotSha256: createHash('sha256').update(snapshotBytes).digest('hex'),
      payload: { admission_evidence: snapshot },
    },
  };
}

async function valid() {
  const m = manifest();
  for (const entry of m.targets[1].migrations) entry.bytes = (await readFile(path.join(repoRoot, 'supabase/migrations', path.basename(entry.path)))).length;
  return validateHbnfTwoTargetAdmission({ manifest: m, readbacks: readbacks(), repoRoot, artifactRoot, now });
}

test('validates both exact targets, candidate, rollback, migrations, and Cron-removal plan together', async () => {
  const result = await valid();
  assert.equal(result.phase, 'ADMISSION_VALIDATED_PENDING_DURABLE_PARENT');
  assert.equal(result.targets.cloudflare.percentage, 100);
  assert.equal(result.targets.supabase.migrationsApplied, 0);
  assert.equal(result.productionMutationAuthorized, false);
});

test('fails closed when either provider target is missing, partial, stale, or mismatched', async () => {
  const base = { manifest: manifest(), readbacks: readbacks(), repoRoot, artifactRoot, now };
  for (const entry of base.manifest.targets[1].migrations) entry.bytes = (await readFile(path.join(repoRoot, 'supabase/migrations', path.basename(entry.path)))).length;
  const cases = [
    ["missing Cloudflare", v => { delete v.readbacks.cloudflare; }, /Cloudflare readback timestamp/],
    ["partial traffic", v => { v.readbacks.cloudflare.payload.result.deployments[0].versions[0].percentage = 50; }, /not the exact expected/],
    ["stale Supabase", v => { v.readbacks.supabase.capturedAt = '2026-10-30T08:40:00.000Z'; }, /Supabase readback is stale/],
    ["wrong Supabase project", v => { v.readbacks.supabase.projectId = 'wrong-project-ref-000'; }, /not from an authenticated read-only source/],
    ["missing legacy grant", v => { v.readbacks.supabase.snapshot.grants = []; }, /legacy grant missing/],
    ["already-applied migration", v => { v.readbacks.supabase.snapshot.candidateMigrations = [{ version: '20261029200450' }]; }, /migration ledger is not empty/],
  ];
  for (const [name, change, expected] of cases) {
    const v = structuredClone(base); change(v);
    await assert.rejects(validateHbnfTwoTargetAdmission(v), expected, name);
  }
});

test('rejects changed candidate, migration, rollback, Cron plan, and replayed one-time parent', async () => {
  const cases = [
    ["candidate digest", v => { v.manifest.candidate.sha256 = 'f'.repeat(64); }, /candidate identity does not match/],
    ["migration digest", v => { v.manifest.targets[1].migrations[0].sha256 = 'f'.repeat(64); }, /migration identity\/hash mismatch/],
    ["rollback digest", v => { v.manifest.targets[0].rollback.sha256 = 'f'.repeat(64); }, /baseline or exact rollback identity/],
    ["Cron rollback", v => { v.manifest.targets[0].rollback.cronRemoval = 'leave cron'; }, /Cron-removal rollback is missing/],
    ["replay", v => { v.priorLedger = [{ releaseId: HBNF_ADMISSION.releaseId, state: 'ADMISSION_PASS' }]; }, /already been claimed/],
  ];
  const base = { manifest: manifest(), readbacks: readbacks(), repoRoot, artifactRoot, now };
  for (const entry of base.manifest.targets[1].migrations) entry.bytes = (await readFile(path.join(repoRoot, 'supabase/migrations', path.basename(entry.path)))).length;
  for (const [name, change, expected] of cases) {
    const v = structuredClone(base); change(v);
    await assert.rejects(validateHbnfTwoTargetAdmission(v), expected, name);
  }
});

test('parent admission is one-time, durably read back before PASS, and mutation-free', async () => {
  const m = manifest();
  for (const entry of m.targets[1].migrations) entry.bytes = (await readFile(path.join(repoRoot, 'supabase/migrations', path.basename(entry.path)))).length;
  const originalManifestBytes = Buffer.from(JSON.stringify(m));
  const receiptRoot = await mkdtemp(path.join(os.tmpdir(), 'hbnf-two-target-shared-'));
  const files = new Map();
  const durableStore = {
    async putOnce(name, bytes) {
      if ([...files.values()].some(value => value.name === name)) throw new Error('immutable file exists');
      const id = `drive-${files.size + 1}`; files.set(id, { name, bytes: Buffer.from(bytes) });
      return { id, url: `https://drive.google.com/file/d/${id}/view` };
    },
    async download(id) { return files.get(id).bytes; },
  };
  const claims = [];
  const oneTimeLedger = { async claim(releaseId, digest, driveId) { claims.push({ releaseId, digest, driveId }); return true; } };
  try {
    const result = await runHbnfTwoTargetAdmission({ manifest: m, originalManifestBytes, readbacks: readbacks(), receiptRoot, repoRoot, artifactRoot, durableStore, oneTimeLedger, now });
    assert.equal(result.status, 'ADMISSION_PASS');
    assert.equal(result.productionMutationAuthorized, false);
    assert.equal(files.size, 2, 'parent manifest and final decision each have independent durable round trips');
    assert.equal(claims.length, 1);
  } finally { await rm(receiptRoot, { recursive: true, force: true }); }
});

test('parent admission never claims a replay or accepts a non-identical Drive download', async () => {
  const m = manifest();
  for (const entry of m.targets[1].migrations) entry.bytes = (await readFile(path.join(repoRoot, 'supabase/migrations', path.basename(entry.path)))).length;
  const originalManifestBytes = Buffer.from(JSON.stringify(m));
  const store = {
    async putOnce() { return { id: 'drive-1', url: 'https://drive.google.com/file/d/drive-1/view' }; },
    async download() { return Buffer.from('tampered'); },
  };
  let claims = 0;
  const ledger = { async claim() { claims += 1; return true; } };
  const receiptRoot = await mkdtemp(path.join(os.tmpdir(), 'hbnf-two-target-shared-'));
  try {
    await assert.rejects(runHbnfTwoTargetAdmission({ manifest: m, originalManifestBytes, readbacks: readbacks(), receiptRoot, repoRoot, artifactRoot, durableStore: store, oneTimeLedger: ledger, now }), /not byte-identical/);
    assert.equal(claims, 0, 'download-back mismatch prevents one-time claim');
    await assert.rejects(runHbnfTwoTargetAdmission({ manifest: m, originalManifestBytes, readbacks: readbacks(), receiptRoot, repoRoot, artifactRoot, durableStore: store, oneTimeLedger: ledger, priorLedger: [{ releaseId: HBNF_ADMISSION.releaseId, state: 'ADMISSION_PASS' }], now }), /already been claimed/);
    assert.equal(claims, 0);
  } finally { await rm(receiptRoot, { recursive: true, force: true }); }
});

test('Cloudflare adapter performs only the official GET and never reports credentials', async () => {
  const seen = [];
  const result = await readCloudflareDeploymentEvidence({ token: 'test-secret-never-output', now, fetchImpl: async (url, init) => {
    seen.push({ url, method: init.method, auth: init.headers.Authorization });
    return { ok: true, json: async () => ({ success: true, result: { deployments: [] } }) };
  } });
  assert.equal(seen[0].method, 'GET');
  assert.equal(seen[0].url, result.endpoint);
  assert.equal(seen[0].auth, 'Bearer test-secret-never-output');
  assert.equal(JSON.stringify(result).includes('test-secret-never-output'), false);
  await assert.rejects(readCloudflareDeploymentEvidence({ token: '', fetchImpl: async () => { throw new Error('should not fetch'); } }), /CLOUDFLARE_API_TOKEN is required/);
});

test('Supabase adapter uses the read-only Management API route and SELECT-only evidence query', async () => {
  const seen = [];
  const result = await readSupabaseBaselineEvidence({ token: 'test-secret-never-output', now, fetchImpl: async (url, init) => {
    seen.push({ url, method: init.method, auth: init.headers.Authorization, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ admission_evidence: { serverTime: new Date(now).toISOString(), tableExists: true } }) };
  } });
  assert.match(seen[0].url, /database\/query\/read-only$/);
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].auth, 'Bearer test-secret-never-output');
  assert.match(seen[0].body.query, /^\s*WITH/);
  assert.doesNotMatch(seen[0].body.query, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
  assert.equal(SUPABASE_READ_ONLY_QUERY, seen[0].body.query);
  assert.equal(JSON.stringify(result).includes('test-secret-never-output'), false);
  await assert.rejects(readSupabaseBaselineEvidence({ token: '', fetchImpl: async () => { throw new Error('should not fetch'); } }), /SUPABASE_ACCESS_TOKEN/);
});

test('accepts authenticated connected Supabase read-only evidence with server timestamp', async () => {
  const rb = readbacks();
  rb.supabase.provider = 'supabase-mcp-read-only';
  rb.supabase.tool = 'mcp__codex_apps__supabase_execute_sql';
  rb.supabase.readOnly = true;
  delete rb.supabase.endpoint;
  rb.supabase.payload = { snapshot: { ...rb.supabase.payload.admission_evidence, serverTime: new Date(now).toISOString() } };
  const m = manifest();
  for (const entry of m.targets[1].migrations) entry.bytes = (await readFile(path.join(repoRoot, 'supabase/migrations', path.basename(entry.path)))).length;
  const result = await validateHbnfTwoTargetAdmission({ manifest: m, readbacks: rb, repoRoot, artifactRoot, now });
  assert.equal(result.targets.supabase.identity, HBNF_ADMISSION.supabaseProject);
});

test('durable parent admission requires independent byte-identical Drive download-back', () => {
  const bytes = Buffer.from('{"releaseId":"hbnf-glow-d68334f67026"}\n');
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(verifyDurableParentBytes({ originalBytes: bytes, downloadedBytes: Buffer.from(bytes), driveFileId: 'drive-file-1', expectedSha256: digest }).downloadBack, 'PASS');
  assert.throws(() => verifyDurableParentBytes({ originalBytes: bytes, downloadedBytes: Buffer.from('changed'), driveFileId: 'drive-file-1', expectedSha256: digest }), /not byte-identical/);
  assert.throws(() => verifyDurableParentBytes({ originalBytes: bytes, downloadedBytes: bytes, driveFileId: '', expectedSha256: digest }), /Drive identity is required/);
});

test('Drive adapter stores immutable bytes in the approved folder and reads them back without exposing its token', async () => {
  let created = false;
  const bytes = Buffer.from('{"releaseId":"hbnf-glow-d68334f67026"}\n');
  const calls = [];
  const { durableStore } = createGoogleDriveReleaseStore({ token: 'drive-test-secret', fetchImpl: async (url, init = {}) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, method: init.method || 'GET', auth: init.headers?.Authorization });
    if (parsed.hostname === 'www.googleapis.com' && parsed.pathname.includes('/upload/drive/v3/files')) {
      created = true;
      return { ok: true, json: async () => ({ id: 'drive-object-1', webViewLink: 'https://drive.google.com/file/d/drive-object-1/view' }) };
    }
    if (parsed.searchParams.get('alt') === 'media') return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    return { ok: true, json: async () => ({ files: created ? [{ id: 'drive-object-1', name: 'immutable.json' }] : [] }) };
  } });
  const stored = await durableStore.putOnce('immutable.json', bytes);
  assert.equal(stored.id, 'drive-object-1');
  assert.deepEqual(await durableStore.download(stored.id), bytes);
  assert.ok(calls.every(call => call.auth === 'Bearer drive-test-secret'));
  assert.equal(JSON.stringify(stored).includes('drive-test-secret'), false);
  await assert.rejects(durableStore.putOnce('immutable.json', bytes), /already exists/);
});
