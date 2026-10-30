import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runGuardedProviderRelease } from '../scripts/guarded-provider-release.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'guarded-provider-'));
  await mkdir(path.join(root, 'evidence'));
  const files = {
    baseline: Buffer.from('exact-installed-baseline'),
    baselineCopy: Buffer.from('exact-installed-baseline'),
    rollback: Buffer.from('exact-installed-baseline'),
    rollbackCopy: Buffer.from('exact-installed-baseline'),
    candidate: Buffer.from('exact-candidate-package'),
    candidateCopy: Buffer.from('exact-candidate-package'),
    identity: Buffer.from(''),
    evidence: Buffer.from('acceptance evidence'),
  };
  const entry = async (name, bytes = files[name]) => {
    const file = path.join(root, 'evidence', `${name}-${Math.random().toString(36).slice(2)}.bin`);
    await writeFile(file, bytes);
    return { path: path.relative(root, file), bytes: bytes.length, sha256: hash(bytes) };
  };
  const baseline = await entry('baseline');
  const identityBytes = Buffer.from(JSON.stringify({ identity: 'installed-v1', sourceCommit: 'd'.repeat(40), artifactSha256: baseline.sha256, artifactBytes: baseline.bytes }));
  const identityEvidence = await entry('identity', identityBytes);
  const baselineRollback = { ...await entry('baselineCopy'), driveFileId: 'baseline-original-id', baselineIdentity: 'installed-v1', downloadBackVerified: true, downloadBack: await entry('baselineCopy'), restoreProcedure: 'Restore exact baseline version.' };
  const candidate = await entry('candidate');
  const candidateCopy = await entry('candidateCopy');
  const rollbackArtifact = await entry('rollback');
  const rollbackCopy = await entry('rollbackCopy');
  const evidence = await entry('evidence');
  const receipt = {
    schemaVersion: 1,
    releaseId: 'guarded-test-release',
    source: { repository: 'owner/repo', ref: 'feature/test', commit: 'a'.repeat(40), tree: '1'.repeat(40) },
    build: { command: 'deterministic build', toolchain: 'node 24.0.0', lockfileSha256: 'b'.repeat(64), inputs: [{ name: 'wrangler', version: '4.152.0', sha256: 'c'.repeat(64) }] },
    baseline: { authorityUrl: 'https://drive.google.com/file/d/index/view', provider: 'example', target: 'isolated-test', identity: 'installed-v1', sourceCommit: 'd'.repeat(40), sourceEvidence: 'evidence/provider-baseline.json', identityEvidence, acceptance: 'PASS', artifact: { disposition: 'recovered', driveFileId: 'baseline-original-id', ...baseline }, rollback: baselineRollback },
    package: candidate,
    deployment: { provider: 'example', target: 'isolated-test', plannedRoute: 'guarded test mutation', restoreProcedure: 'Restore exact baseline version.' },
    rollback: { artifact: rollbackArtifact, restoreProcedure: 'Restore exact baseline version.', recovery: { driveFileId: 'rollback-id', driveUrl: 'https://drive.google.com/file/d/rollback-id/view', downloadBackVerified: true, downloadBack: rollbackCopy } },
    acceptance: { scope: 'isolated route test', criteria: [{ id: 'provider-readback', description: 'Provider returns exact candidate.', method: 'Read fake target.', expectedOutcome: 'Candidate identity and hash match.', status: 'PENDING' }] },
    recovery: { driveFileId: 'candidate-id', driveUrl: 'https://drive.google.com/file/d/candidate-id/view', downloadBackVerified: true, downloadBack: candidateCopy },
  };
  await writeFile(path.join(root, 'evidence', 'provider-baseline.json'), JSON.stringify({ identity: 'installed-v1' }));
  const objects = new Map();
  const durableNames = [];
  const durableStore = {
    async putOnce(key, bytes) {
      if (objects.has(key)) throw new Error('durable object replay');
      durableNames.push(key);
      const id = `durable-${objects.size + 1}`;
      objects.set(id, Buffer.from(bytes));
      return { id, url: `https://drive.google.com/file/d/${id}/view` };
    },
    async download(id) { const bytes = objects.get(id); if (!bytes) throw new Error('missing durable object'); return Buffer.from(bytes); },
  };
  const claimed = new Set();
  const oneTimeLedger = {
    async claim(id, manifestHash) { const key = `${id}:${manifestHash}`; if (claimed.has(key)) return false; claimed.add(key); return true; },
    async close() {},
    async fail() {},
  };
  let target = { provider: 'example', target: 'isolated-test', identity: 'installed-v1', sourceCommit: 'd'.repeat(40), artifactSha256: baseline.sha256, artifactBytes: baseline.bytes };
  const calls = [];
  let sourceReads = 0;
  const sourceControl = { async read() { sourceReads++; return { commit: 'a'.repeat(40), ref: 'feature/test', tree: '1'.repeat(40), clean: true }; } };
  const provider = {
    async readTarget() { calls.push('read'); return structuredClone(target); },
    async mutate(args) { calls.push('mutate'); assert.equal(args.candidateSha256, candidate.sha256); target = { provider: 'example', target: 'isolated-test', identity: 'installed-v2', sourceCommit: 'a'.repeat(40), artifactSha256: candidate.sha256, artifactBytes: candidate.bytes }; return { versionId: 'installed-v2', installedAt: '2026-10-30T00:00:00Z' }; },
    async verifyAcceptance() { return { pass: true, reference: evidence.path }; },
  };
  const receiptPath = path.join(root, 'receipt.json');
  await writeFile(receiptPath, JSON.stringify(receipt));
  return { root, receiptPath, receipt, provider, durableStore, oneTimeLedger, sourceControl, calls, durableNames, get sourceReads() { return sourceReads; }, get target() { return target; }, setTarget(value) { target = value; }, candidate, baseline, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('guarded route durably admits, rereads target, mutates once, and closes with same manifest', async () => {
  const f = await fixture();
  try {
    const result = await runGuardedProviderRelease({ ...f, approved: true });
    assert.equal(result.phase, 'closeout');
    assert.equal(f.calls.filter(x => x === 'mutate').length, 1);
    assert.ok(f.calls.indexOf('read') < f.calls.indexOf('mutate'));
    const receipt = JSON.parse(await readFile(f.receiptPath, 'utf8'));
    const readback = JSON.parse(await readFile(path.join(f.root, receipt.deployment.readback.path), 'utf8'));
    assert.equal(readback.admissionManifestSha256, result.admissionManifestSha256);
    assert.equal(receipt.deployment.receipt.downloadBackVerified, true);
  } finally { await f.cleanup(); }
});

test('no owner authorization means no durable admission or provider read/mutation', async () => {
  const f = await fixture();
  try {
    await assert.rejects(runGuardedProviderRelease({ ...f, approved: false }), /owner release authorization/);
    assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});

test('missing, stale, or dirty source checkout blocks before durable admission or provider access', async () => {
  const f = await fixture();
  try {
    f.sourceControl.read = async () => ({ commit: 'b'.repeat(40), ref: 'feature/test', tree: '1'.repeat(40), clean: true });
    await assert.rejects(runGuardedProviderRelease({ ...f, approved: true }), /source readback is missing, stale, dirty/);
    assert.deepEqual(f.durableNames, []);
    assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});

test('source checkout is re-read after durable admission and before the fresh provider target read', async () => {
  const f = await fixture();
  try {
    let reads = 0;
    f.sourceControl.read = async () => ++reads === 1
      ? { commit: 'a'.repeat(40), ref: 'feature/test', tree: '1'.repeat(40), clean: true }
      : { commit: 'b'.repeat(40), ref: 'feature/test', tree: '2'.repeat(40), clean: true };
    await assert.rejects(runGuardedProviderRelease({ ...f, approved: true }), /source readback is missing, stale, dirty/);
    assert.equal(reads, 2);
    assert.equal(f.calls.includes('mutate'), false);
    assert.equal(f.calls.includes('read'), false);
  } finally { await f.cleanup(); }
});

test('fresh mismatched installed baseline aborts before mutation', async () => {
  const f = await fixture();
  try {
    f.provider.readTarget = async () => ({ ...f.target, identity: 'changed-version' });
    await assert.rejects(runGuardedProviderRelease({ ...f, approved: true }), /does not exactly match/);
    assert.equal(f.calls.includes('mutate'), false);
  } finally { await f.cleanup(); }
});

test('failed durable manifest download-back prevents the provider call', async () => {
  const f = await fixture();
  try {
    f.durableStore.download = async () => Buffer.from('mismatched durable bytes');
    await assert.rejects(runGuardedProviderRelease({ ...f, approved: true }), /not byte-identical/);
    assert.equal(f.calls.includes('mutate'), false);
  } finally { await f.cleanup(); }
});

test('a candidate hash mismatch fails receipt validation before provider access', async () => {
  const f = await fixture();
  try {
    f.receipt.package.sha256 = 'f'.repeat(64);
    await assert.rejects(runGuardedProviderRelease({ ...f, approved: true }));
    assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});

test('an already consumed admission cannot be replayed', async () => {
  const f = await fixture();
  try {
    f.oneTimeLedger.claim = async () => false;
    await assert.rejects(runGuardedProviderRelease({ ...f, approved: true }), /already been consumed/);
    assert.equal(f.calls.includes('mutate'), false);
  } finally { await f.cleanup(); }
});

test('interrupted provider mutation never reports closeout PASS', async () => {
  const f = await fixture();
  try {
    f.provider.mutate = async () => { f.calls.push('mutate'); throw new Error('simulated interruption'); };
    await assert.rejects(runGuardedProviderRelease({ ...f, approved: true }), /simulated interruption/);
    assert.equal(f.calls.includes('mutate'), true);
    assert.equal(f.receipt.deployment.versionId, undefined);
  } finally { await f.cleanup(); }
});

test('partial provider interruption restores the exact admitted rollback and retains a durable rollback receipt', async () => {
  const f = await fixture();
  try {
    const baseline = structuredClone(f.target);
    f.provider.mutate = async () => {
      f.calls.push('mutate');
      f.setTarget({ ...baseline, identity: 'partially-installed', artifactSha256: 'f'.repeat(64), artifactBytes: 99 });
      throw new Error('simulated interrupted migration');
    };
    f.provider.restore = async args => {
      f.calls.push('restore');
      assert.equal(args.rollbackSha256, f.receipt.rollback.artifact.sha256);
      f.setTarget(baseline);
    };
    let failure;
    try { await runGuardedProviderRelease({ ...f, approved: true }); } catch (error) { failure = error; }
    assert.match(failure?.message || '', /exact baseline rollback was independently read back and retained/);
    assert.deepEqual(f.target, baseline);
    assert.ok(f.calls.indexOf('restore') > f.calls.indexOf('mutate'));
    assert.ok(f.durableNames.includes('guarded-test-release.rollback.json'));
  } finally { await f.cleanup(); }
});
