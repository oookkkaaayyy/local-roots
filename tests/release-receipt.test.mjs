import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { link, mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
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
    deploymentReceiptRecovery: Buffer.from('provider install receipt'),
    readback: Buffer.from(JSON.stringify({
      provider: 'example', target: 'production', versionId: 'immutable-version-1',
      sourceCommit: 'a'.repeat(40), packageSha256: hash(Buffer.from('candidate-package-bytes')),
      baselineIdentity: 'provider version baseline-v1',
    })),
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
    baseline: { authorityUrl: 'https://drive.google.com/file/d/index/view', provider: 'example', target: 'production', identity: 'provider version baseline-v1', sourceCommit: 'd'.repeat(40), sourceEvidence: 'evidence/baseline-source.txt', identityEvidence: identityEvidenceEntry, acceptance: 'PASS', artifact: { disposition: 'recovered', driveFileId: 'baseline-artifact-id', ...entry('baseline') }, rollback: { ...entry('baselineRollback'), driveFileId: 'baseline-rollback-id', baselineIdentity: 'provider version baseline-v1', downloadBackVerified: true, downloadBack: entry('baseline'), restoreProcedure: 'Restore exact baseline version.' } },
    package: entry('package'),
    deployment: { provider: 'example', target: 'production', plannedRoute: 'Deploy immutable candidate version through provider CLI.', restoreProcedure: 'Restore the exact previous version using the provider version ID.', versionId: 'immutable-version-1', installedAt: '2026-10-25T00:00:00Z', receipt: { ...entry('deployment'), driveFileId: 'deployment-receipt-id', driveUrl: 'https://drive.google.com/file/d/deployment-receipt-id/view', downloadBackVerified: true, downloadBack: entry('deploymentReceiptRecovery') }, readback: entry('readback') },
    rollback: { artifact: entry('rollback'), restoreProcedure: 'Restore the exact previous version using the provider version ID.', recovery: { driveFileId: 'rollback-drive-file-id', driveUrl: 'https://drive.google.com/file/d/rollback-drive-file-id/view', downloadBackVerified: true, downloadBack: entry('rollbackRecovery') } },
    acceptance: { scope: 'Verify the live production UI after deployment.', criteria: [{ id: 'runtime-check', description: 'The released page loads for a user.', method: 'Read the deployed target and verify HTTP 200 plus expected content.', expectedOutcome: 'The deployed page returns HTTP 200 and renders the expected content.', status: 'PASS', evidence: ['evidence/runtime-check.txt'] }] },
    recovery: { driveFileId: 'drive-file-id', driveUrl: 'https://drive.google.com/file/d/drive-file-id/view', downloadBackVerified: true, downloadBack: entry('recovery') },
  };
  await writeFile(path.join(root, 'evidence/runtime-check.txt'), 'observed runtime acceptance');
  await writeFile(path.join(root, 'evidence/baseline-source.txt'), 'indexed deployed identity evidence');
  const preflight = structuredClone(receipt);
  delete preflight.deployment.versionId;
  delete preflight.deployment.installedAt;
  delete preflight.deployment.receipt;
  delete preflight.deployment.readback;
  preflight.acceptance.criteria[0].status = 'PENDING';
  delete preflight.acceptance.criteria[0].evidence;
  const admitted = await validateReleaseReceipt(preflight, root, { phase: 'admission' });
  const manifestBytes = Buffer.from(JSON.stringify(admitted.admissionManifest, null, 2) + '\n');
  files.readback = Buffer.from(JSON.stringify({ ...JSON.parse(files.readback), admissionManifestSha256: hash(manifestBytes) }));
  await writeFile(path.join(root, 'evidence/readback.bin'), files.readback);
  receipt.deployment.readback = entry('readback');
  const admissionPath = `${receipt.releaseId}.admission.json`;
  await writeFile(path.join(root, admissionPath), manifestBytes);
  await writeFile(path.join(root, 'evidence/admission-download.json'), manifestBytes);
  receipt.admission = {
    path: admissionPath, bytes: manifestBytes.length, sha256: hash(manifestBytes),
    driveFileId: 'admission-manifest-id', driveUrl: 'https://drive.google.com/file/d/admission-manifest-id/view',
    downloadBackVerified: true,
    downloadBack: { path: 'evidence/admission-download.json', bytes: manifestBytes.length, sha256: hash(manifestBytes) },
  };
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

test('admits a candidate only with a recovered exact baseline and rollback before mutation', async () => {
  const f = await fixture();
  try {
    f.receipt.deployment = {
      provider: 'example', target: 'production',
      plannedRoute: 'Deploy immutable candidate version through provider CLI.',
      restoreProcedure: f.receipt.rollback.restoreProcedure,
    };
    f.receipt.acceptance.criteria = [{ id: 'runtime-check', description: 'The released page loads.', status: 'PENDING', method: 'Read the deployed target and verify HTTP 200 plus expected content.', expectedOutcome: 'HTTP 200 and expected content.' }];
    delete f.receipt.admission;
    const result = await validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' });
    assert.equal(result.phase, 'admission');
    assert.equal(result.packageSha256, f.receipt.package.sha256);
  } finally { await f.cleanup(); }
});

test('admission CLI writes one immutable manifest and refuses overwrite', async () => {
  const f = await fixture();
  try {
    delete f.receipt.admission;
    f.receipt.acceptance.criteria[0].status = 'PENDING';
    delete f.receipt.acceptance.criteria[0].evidence;
    const receiptPath = path.join(f.root, 'receipt.json');
    await writeFile(receiptPath, JSON.stringify(f.receipt));
    const script = path.resolve('scripts/validate-release-receipt.mjs');
    const run = () => spawnSync(process.execPath, [script, receiptPath, f.root], {
      encoding: 'utf8', env: { ...process.env, npm_lifecycle_event: 'release:admit' },
    });
    const first = run();
    assert.equal(first.status, 2, first.stderr);
    assert.match(first.stdout, /PENDING durable admission copy .*manifestSha256=[a-f0-9]{64}/);
    const manifestPath = path.join(f.root, 'example-2026-10-25.admission.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(manifest.package.sha256, f.receipt.package.sha256);
    assert.equal(manifest.baseline.rollbackSha256, f.receipt.rollback.artifact.sha256);
    const manifestBytes = await readFile(manifestPath);
    await writeFile(path.join(f.root, 'evidence/admission-download.json'), manifestBytes);
    f.receipt.admission = {
      path: 'example-2026-10-25.admission.json', bytes: manifestBytes.length, sha256: hash(manifestBytes),
      driveFileId: 'admission-manifest-id', driveUrl: 'https://drive.google.com/file/d/admission-manifest-id/view',
      downloadBackVerified: true,
      downloadBack: { path: 'evidence/admission-download.json', bytes: manifestBytes.length, sha256: hash(manifestBytes) },
    };
    await writeFile(receiptPath, JSON.stringify(f.receipt));
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /PASS admission/);
    assert.deepEqual(await readFile(manifestPath), manifestBytes);
  } finally { await f.cleanup(); }
});

test('refuses admission when acceptance criteria were not declared pending', async () => {
  const f = await fixture();
  try {
    f.receipt.deployment = { provider: 'example', target: 'production', plannedRoute: 'deploy exact candidate', restoreProcedure: f.receipt.rollback.restoreProcedure };
    f.receipt.acceptance.criteria[0] = { id: 'runtime-check', description: 'check', status: 'PASS', method: 'check', expectedOutcome: 'pass' };
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' }), /must be PENDING before mutation/);
  } finally { await f.cleanup(); }
});

test('refuses admission without a predeclared restore procedure', async () => {
  const f = await fixture();
  try {
    f.receipt.deployment = { provider: 'example', target: 'production', plannedRoute: 'deploy exact candidate' };
    f.receipt.acceptance.criteria = [{ id: 'runtime-check', description: 'check', status: 'PENDING', method: 'check', expectedOutcome: 'pass' }];
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' }), /deployment\.restoreProcedure is required/);
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

test('rejects closeout when the acceptance plan changed after admission', async () => {
  const f = await fixture();
  try {
    f.receipt.acceptance.criteria[0].expectedOutcome = 'A different outcome';
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /does not match the pre-mutation admission manifest/);
  } finally { await f.cleanup(); }
});

test('rejects closeout readback for a different target or candidate', async () => {
  for (const [field, value] of [['target', 'staging'], ['packageSha256', 'f'.repeat(64)]]) {
    const f = await fixture();
    try {
      const readbackPath = path.join(f.root, f.receipt.deployment.readback.path);
      const readback = JSON.parse(await readFile(readbackPath, 'utf8'));
      readback[field] = value;
      const bytes = Buffer.from(JSON.stringify(readback));
      await writeFile(readbackPath, bytes);
      f.receipt.deployment.readback.bytes = bytes.length;
      f.receipt.deployment.readback.sha256 = hash(bytes);
      await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /deployment\.readback must bind/);
    } finally { await f.cleanup(); }
  }
});

test('rejects provider closeout readback that is not bound to the one-time admission manifest', async () => {
  const f = await fixture();
  try {
    const readbackPath = path.join(f.root, f.receipt.deployment.readback.path);
    const readback = JSON.parse(await readFile(readbackPath, 'utf8'));
    readback.admissionManifestSha256 = 'f'.repeat(64);
    const bytes = Buffer.from(JSON.stringify(readback));
    await writeFile(readbackPath, bytes);
    f.receipt.deployment.readback.bytes = bytes.length;
    f.receipt.deployment.readback.sha256 = hash(bytes);
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /prior baseline, and the admitted manifest/);
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
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /baseline\.provider is required/);
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
    f.receipt.baseline.artifact = {
      ...f.receipt.baseline.artifact,
      disposition: 'unrecovered',
      recovered: true,
      status: 'recovered',
      installReceipt: 'receipt.json',
      recoveryGap: 'binary missing',
    };
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

test('rejects a rollback that is not byte-identical to the recovered current baseline', async () => {
  const f = await fixture();
  try {
    const rollbackPath = path.join(f.root, f.receipt.rollback.artifact.path);
    const bytes = Buffer.from('different but internally consistent rollback');
    await writeFile(rollbackPath, bytes);
    f.receipt.rollback.artifact.bytes = bytes.length;
    f.receipt.rollback.artifact.sha256 = hash(bytes);
    const recoveryPath = path.join(f.root, f.receipt.rollback.recovery.downloadBack.path);
    await writeFile(recoveryPath, bytes);
    f.receipt.rollback.recovery.downloadBack.bytes = bytes.length;
    f.receipt.rollback.recovery.downloadBack.sha256 = hash(bytes);

    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /rollback artifact must match the recovered current baseline rollback/);
  } finally { await f.cleanup(); }
});

test('rejects baseline identity evidence with a mismatched identity, source commit, or byte count', async () => {
  for (const [field, value] of [
    ['identity', 'different installed version'],
    ['sourceCommit', 'f'.repeat(40)],
    ['artifactBytes', 1],
  ]) {
    const f = await fixture();
    try {
      const evidencePath = path.join(f.root, f.receipt.baseline.identityEvidence.path);
      const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
      evidence[field] = value;
      const bytes = Buffer.from(JSON.stringify(evidence));
      await writeFile(evidencePath, bytes);
      f.receipt.baseline.identityEvidence.bytes = bytes.length;
      f.receipt.baseline.identityEvidence.sha256 = hash(bytes);
      await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /must bind baseline identity\/source commit to the recovered artifact hash and size/);
    } finally { await f.cleanup(); }
  }
});

test('rejects baseline artifact size or hash metadata that differs from its bytes', async () => {
  for (const [field, value, expected] of [
    ['bytes', 1, /baseline\.artifact\.bytes does not match the file/],
    ['sha256', 'e'.repeat(64), /baseline\.artifact\.sha256 does not match the file/],
  ]) {
    const f = await fixture();
    try {
      f.receipt.baseline.artifact[field] = value;
      await assert.rejects(validateReleaseReceipt(f.receipt, f.root), expected);
    } finally { await f.cleanup(); }
  }
});

test('rejects self-referential admission download-back instead of accepting the original file', async () => {
  const f = await fixture();
  try {
    f.receipt.admission.downloadBack = { ...f.receipt.admission, path: f.receipt.admission.path };
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /independent recovered copy/);
  } finally { await f.cleanup(); }
});

test('rejects candidate download-back that aliases the original candidate', async () => {
  const f = await fixture();
  try {
    f.receipt.recovery.downloadBack = { ...f.receipt.package };
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /independent recovered copy/);
  } finally { await f.cleanup(); }
});

test('rejects hard-linked download-back even when path and hashes differ', async () => {
  const f = await fixture();
  try {
    const original = path.join(f.root, f.receipt.package.path);
    const returned = path.join(f.root, f.receipt.recovery.downloadBack.path);
    await unlink(returned);
    await link(original, returned);
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /independent recovered copy/);
  } finally { await f.cleanup(); }
});

test('rejects the identical local file as deployment receipt download-back', async () => {
  const f = await fixture();
  try {
    f.receipt.deployment.receipt.downloadBack = { ...f.receipt.deployment.receipt };
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /independent recovered copy/);
  } finally { await f.cleanup(); }
});

test('rejects self-referential baseline rollback download-back at admission', async () => {
  const f = await fixture();
  try {
    f.receipt.baseline.rollback.downloadBack = { ...f.receipt.baseline.rollback };
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' }), /independent recovered copy/);
  } finally { await f.cleanup(); }
});

test('rejects self-referential closeout rollback artifact recovery', async () => {
  const f = await fixture();
  try {
    f.receipt.rollback.recovery.downloadBack = { ...f.receipt.rollback.artifact };
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root), /independent recovered copy/);
  } finally { await f.cleanup(); }
});
