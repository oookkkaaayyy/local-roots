import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateReleaseReceipt } from '../scripts/validate-release-receipt.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-receipt-'));
  await mkdir(path.join(root, 'evidence'));
  const files = {
    package: Buffer.from('candidate-package-bytes'),
    baseline: Buffer.from('baseline-current-package-bytes'),
    baselineRollback: Buffer.from('baseline-current-package-bytes'),
    rollback: Buffer.from('baseline-current-package-bytes'),
    rollbackRecovery: Buffer.from('baseline-current-package-bytes'),
    deployment: Buffer.from('provider install receipt'),
    recovery: Buffer.from('candidate-package-bytes'),
  };
  for (const [name, bytes] of Object.entries(files)) await writeFile(path.join(root, 'evidence', `${name}.bin`), bytes);
  const entry = name => ({ path: `evidence/${name}.bin`, bytes: files[name].length, sha256: hash(files[name]) });
  const identityEvidence = {
    identity: 'provider version baseline-v1', sourceCommit: 'd'.repeat(40),
    artifactSha256: hash(files.baseline), artifactBytes: files.baseline.length,
  };
  const identityEvidenceBytes = Buffer.from(JSON.stringify(identityEvidence));
  await writeFile(path.join(root, 'evidence/baseline-identity.json'), identityEvidenceBytes);
  const identityEvidenceEntry = { path: 'evidence/baseline-identity.json', bytes: identityEvidenceBytes.length, sha256: hash(identityEvidenceBytes) };
  const receipt = {
    schemaVersion: 1,
    releaseId: 'example-2026-10-25',
    source: { repository: 'owner/repo', ref: 'main', commit: 'a'.repeat(40) },
    build: { command: 'npm run build', toolchain: 'node 22.0.0', lockfileSha256: 'b'.repeat(64), inputs: [{ name: 'base-image', version: 'sha256:' + 'c'.repeat(64), sha256: 'c'.repeat(64) }] },
    baseline: { authorityUrl: 'https://drive.google.com/file/d/index/view', identity: 'provider version baseline-v1', sourceCommit: 'd'.repeat(40), sourceEvidence: 'evidence/baseline-source.txt', identityEvidence: identityEvidenceEntry, acceptance: 'PASS', artifact: { disposition: 'recovered', driveFileId: 'baseline-artifact-id', ...entry('baseline') }, rollback: { ...entry('baselineRollback'), driveFileId: 'baseline-rollback-id', baselineIdentity: 'provider version baseline-v1', downloadBackVerified: true, downloadBack: entry('baseline'), restoreProcedure: 'Restore exact baseline version.' } },
    package: entry('package'),
    deployment: { provider: 'example', target: 'production', versionId: 'immutable-version-1', installedAt: '2026-10-25T00:00:00Z', receipt: entry('deployment') },
    rollback: { artifact: entry('rollback'), restoreProcedure: 'Restore the exact previous version using the provider version ID.', recovery: { driveFileId: 'rollback-drive-file-id', driveUrl: 'https://drive.google.com/file/d/rollback-drive-file-id/view', downloadBackVerified: true, downloadBack: entry('rollbackRecovery') } },
    acceptance: { criteria: [{ id: 'runtime-check', status: 'PASS', evidence: ['evidence/runtime-check.txt'] }] },
    recovery: { driveFileId: 'drive-file-id', driveUrl: 'https://drive.google.com/file/d/drive-file-id/view', downloadBackVerified: true, downloadBack: entry('recovery') },
  };
  await writeFile(path.join(root, 'evidence/runtime-check.txt'), 'observed runtime acceptance');
  await writeFile(path.join(root, 'evidence/baseline-source.txt'), 'indexed deployed identity evidence');
  return { root, receipt, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('accepts a complete receipt when package and recovery copy match', async () => {
  const f = await fixture();
  try {
    const result = await validateReleaseReceipt(f.receipt, f.root);
    assert.equal(result.releaseId, f.receipt.releaseId);
    assert.equal(result.packageSha256, f.receipt.package.sha256);
  } finally { await f.cleanup(); }
});

test('rejects a missing deployment receipt', async () => {
  const f = await fixture();
  try {
    f.receipt.deployment.receipt = undefined;
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /deployment\.receipt is required/);
  } finally { await f.cleanup(); }
});

test('rejects incomplete acceptance', async () => {
  const f = await fixture();
  try {
    f.receipt.acceptance.criteria[0].status = 'NOT_CHECKED';
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /is not PASS/);
  } finally { await f.cleanup(); }
});

test('rejects a recovery copy that differs from the candidate package', async () => {
  const f = await fixture();
  try {
    const recoveryPath = path.join(f.root, f.receipt.recovery.downloadBack.path);
    await writeFile(recoveryPath, 'different bytes');
    const updated = await readFile(recoveryPath);
    f.receipt.recovery.downloadBack = { path: f.receipt.recovery.downloadBack.path, bytes: updated.length, sha256: hash(updated) };
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /must byte-match the release package/);
  } finally { await f.cleanup(); }
});

test('rejects a rollback recovery copy that differs from the rollback artifact', async () => {
  const f = await fixture();
  try {
    const recoveryPath = path.join(f.root, f.receipt.rollback.recovery.downloadBack.path);
    await writeFile(recoveryPath, 'different rollback bytes');
    const updated = await readFile(recoveryPath);
    f.receipt.rollback.recovery.downloadBack = { path: f.receipt.rollback.recovery.downloadBack.path, bytes: updated.length, sha256: hash(updated) };
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /must byte-match the rollback artifact/);
  } finally { await f.cleanup(); }
});

test('rejects path traversal', async () => {
  const f = await fixture();
  try {
    f.receipt.package.path = '../outside.bin';
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /escapes the receipt root/);
  } finally { await f.cleanup(); }
});


test('rejects a missing current-build baseline', async () => {
  const f = await fixture();
  try {
    f.receipt.baseline = undefined;
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /baseline\.authorityUrl is required/);
  } finally { await f.cleanup(); }
});

test('rejects an unverified baseline rollback copy', async () => {
  const f = await fixture();
  try {
    f.receipt.baseline.rollback.downloadBackVerified = false;
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /baseline\.rollback\.downloadBackVerified must be true/);
  } finally { await f.cleanup(); }
});


test('blocks an unrecovered current baseline even if a rollback file is supplied', async () => {
  const f = await fixture();
  try {
    f.receipt.baseline.artifact = { disposition: 'unrecovered', installReceipt: 'receipt.json', recoveryGap: 'binary missing' };
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /baseline\.artifact must be recovered before mutation/);
  } finally { await f.cleanup(); }
});

test('rejects rollback that is not bound to the active baseline identity', async () => {
  const f = await fixture();
  try {
    f.receipt.baseline.rollback.baselineIdentity = 'different-version';
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /baseline\.rollback\.baselineIdentity must match baseline\.identity/);
  } finally { await f.cleanup(); }
});

test('rejects a candidate identical to its rollback', async () => {
  const f = await fixture();
  try {
    const bytes = await readFile(path.join(f.root, f.receipt.rollback.artifact.path));
    await writeFile(path.join(f.root, f.receipt.package.path), bytes);
    f.receipt.package.bytes = bytes.length;
    f.receipt.package.sha256 = hash(bytes);
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /candidate package must be distinct/);
  } finally { await f.cleanup(); }
});


test('rejects identity evidence that does not bind the current artifact bytes', async () => {
  const f = await fixture();
  try {
    const evidencePath = path.join(f.root, f.receipt.baseline.identityEvidence.path);
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
    evidence.artifactSha256 = 'e'.repeat(64);
    const bytes = Buffer.from(JSON.stringify(evidence));
    await writeFile(evidencePath, bytes);
    f.receipt.baseline.identityEvidence.bytes = bytes.length;
    f.receipt.baseline.identityEvidence.sha256 = hash(bytes);
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /must bind baseline identity\/source commit/);
  } finally { await f.cleanup(); }
});
