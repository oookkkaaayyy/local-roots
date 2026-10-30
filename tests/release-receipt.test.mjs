import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('candidate packager hashes every build file into the exact archived ZIP', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pr156-package-'));
  try {
    const dist = path.join(root, 'app/dist');
    const output = path.join(root, 'capsule');
    await mkdir(dist, { recursive: true });
    await writeFile(path.join(root, 'app/package-lock.json'), '{"lock":true}\n');
    const html = Buffer.from('<main>candidate</main>');
    await writeFile(path.join(dist, 'index.html'), html);
    const script = path.resolve('scripts/package-dye-studio-candidate.mjs');
    const run = spawnSync(process.execPath, [script, dist, output, 'a'.repeat(40)], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
    const archive = await readFile(path.join(output, 'candidate.zip'));
    assert.equal(manifest.releaseId, 'local-roots-dye-studio-pr-156-2026-10-30-r1');
    assert.equal(manifest.sourceCommit, 'a'.repeat(40));
    assert.equal(manifest.archiveBytes, archive.length);
    assert.equal(manifest.archiveSha256, hash(archive));
    assert.deepEqual(manifest.files, [{ path: 'index.html', bytes: html.length, sha256: hash(html) }]);

    const pr159Output = path.join(root, 'capsule-pr159');
    const pr159 = spawnSync(process.execPath, [script, dist, pr159Output, 'b'.repeat(40), '159'], { encoding: 'utf8' });
    assert.equal(pr159.status, 0, pr159.stderr);
    const pr159Manifest = JSON.parse(await readFile(path.join(pr159Output, 'manifest.json'), 'utf8'));
    assert.equal(pr159Manifest.releaseId, 'local-roots-dye-photo-pr-159-2026-10-30-r1');
    assert.equal(pr159Manifest.sourceCommit, 'b'.repeat(40));
    const rejectedOutput = path.join(root, 'capsule-pr157');
    const rejected = spawnSync(process.execPath, [script, dist, rejectedOutput, 'c'.repeat(40), '157'], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0, 'unapproved PR cannot receive a release identity');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('PR #159 candidate packaging binds the manifest and artifact name to the exact PR head', async () => {
  const workflow = await readFile(path.resolve('.github/workflows/ci.yml'), 'utf8');
  const start = workflow.indexOf('name: Package exact PR #159 photo workflow build for release evidence');
  const end = workflow.indexOf('\n      - name:', start + 1);
  assert.ok(start >= 0 && end > start);
  const packaging = workflow.slice(start, end);
  assert.match(packaging, /\$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.doesNotMatch(packaging, /\$GITHUB_SHA|\$\{\{ github\.sha \}\}/,
    'synthetic pull-request merge SHA must not be recorded as the candidate source');
  const artifactStart = workflow.indexOf('name: Retain PR #159 candidate archive and manifest');
  const artifactEnd = workflow.indexOf('\n      - name:', artifactStart + 1);
  const artifact = workflow.slice(artifactStart, artifactEnd < 0 ? workflow.length : artifactEnd);
  assert.match(artifact, /dye-photo-pr159-candidate-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
});

async function nativeRollbackFixture() {
  const f = await fixture();
  const providerRecord = {
    provider: 'cloudflare-pages', project: 'local-roots', target: 'production', environment: 'production',
    deploymentId: 'b56e1122-f55d-48ae-817a-0e511e72b9e4',
    sourceCommit: '0f8e9c2409bb5a947482f66db0d436de49d1acc0', deploymentStatus: 'success',
    rollbackEligible: true, authenticatedProviderReadback: true,
    immutableUrl: 'https://b56e1122.local-roots.pages.dev',
  };
  const bytes = Buffer.from(JSON.stringify(providerRecord, null, 2) + '\n');
  await writeFile(path.join(f.root, 'evidence/cloudflare-production-readback.json'), bytes);
  await writeFile(path.join(f.root, 'evidence/cloudflare-production-readback-download.json'), bytes);
  const evidence = {
    path: 'evidence/cloudflare-production-readback.json', bytes: bytes.length, sha256: hash(bytes),
    driveFileId: 'cloudflare-provider-evidence-id', driveUrl: 'https://drive.google.com/file/d/cloudflare-provider-evidence-id/view',
    downloadBackVerified: true,
    downloadBack: { path: 'evidence/cloudflare-production-readback-download.json', bytes: bytes.length, sha256: hash(bytes) },
  };
  f.receipt.releaseId = 'local-roots-dye-studio-pr-153-2026-10-29-r2';
  f.receipt.source.repository = 'oookkkaaayyy/local-roots';
  f.receipt.source.ref = 'refs/pull/153/head';
  f.receipt.source.pullRequest = 153;
  f.receipt.baseline = {
    provider: 'cloudflare-pages', target: 'production', authorityUrl: 'https://dash.cloudflare.com/',
    identity: providerRecord.deploymentId, sourceCommit: providerRecord.sourceCommit,
    sourceEvidence: 'Authenticated Cloudflare Pages dashboard deployment readback.', acceptance: 'Production remains on the recorded successful deployment.',
    artifact: { disposition: 'provider-native-rollback', driveFileId: evidence.driveFileId, driveUrl: evidence.driveUrl },
    rollback: { mode: 'cloudflare-pages-native-rollback', deploymentId: providerRecord.deploymentId,
      sourceCommit: providerRecord.sourceCommit, rollbackEligible: true,
      restoreProcedure: 'Cloudflare dashboard > local-roots > Deployments > select deployment > Rollback to this deployment; confirm.' },
  };
  f.receipt.recoveryMode = {
    mode: 'cloudflare-pages-native-rollback',
    scope: { provider: 'cloudflare-pages', project: 'local-roots', target: 'production', releaseId: f.receipt.releaseId, pullRequest: 153, repository: 'oookkkaaayyy/local-roots' },
    approval: { authority: 'owner-approved-AKS', canonicalRecordId: '1NCpsNS9zTSlYLvV7afP4hhJNsLDTbKBToBysNH_ZeWM', canonicalUrl: 'https://docs.google.com/document/d/1NCpsNS9zTSlYLvV7afP4hhJNsLDTbKBToBysNH_ZeWM/edit' },
    providerVerification: { ...providerRecord, verifiedAt: '2026-10-29T22:00:00Z', evidence,
      restoreProcedure: f.receipt.baseline.rollback.restoreProcedure,
      rollbackInstructions: 'Select the verified successful deployment and choose Rollback to this deployment in Cloudflare Pages.' },
  };
  f.receipt.rollback = { mode: 'cloudflare-pages-native-rollback', deploymentId: providerRecord.deploymentId,
    sourceCommit: providerRecord.sourceCommit, rollbackEligible: true,
    restoreProcedure: f.receipt.baseline.rollback.restoreProcedure };
  f.receipt.deployment = { provider: 'cloudflare-pages', target: 'production', plannedRoute: 'Merge PR #153 and allow Git-integrated Pages production deployment.', restoreProcedure: f.receipt.rollback.restoreProcedure };
  f.receipt.acceptance.criteria[0] = { id: 'candidate-preview', description: 'Candidate preview is available and passed required checks.', method: 'Verify exact preview deployment and CI results.', expectedOutcome: 'Exact candidate preview and all required checks pass.', status: 'PENDING' };
  delete f.receipt.admission;
  return f;
}

async function nativeRollbackPR156Fixture() {
  const f = await nativeRollbackFixture();
  const releaseId = 'local-roots-dye-studio-pr-156-2026-10-30-r1';
  const sourceCommit = 'a'.repeat(40);
  const providerRecord = {
    provider: 'cloudflare-pages', project: 'local-roots', target: 'production', environment: 'production',
    deploymentId: '310d16df-cb08-4d06-90f9-7c252fcf06e5',
    sourceCommit: '55c2251011415b7c975d7f873b075955335101d4', deploymentStatus: 'success',
    rollbackEligible: true, authenticatedProviderReadback: true,
    immutableUrl: 'https://310d16df.local-roots.pages.dev', verifiedAt: new Date().toISOString(),
  };
  const bytes = Buffer.from(JSON.stringify(providerRecord, null, 2) + '\n');
  await writeFile(path.join(f.root, 'evidence/cloudflare-production-readback.json'), bytes);
  await writeFile(path.join(f.root, 'evidence/cloudflare-production-readback-download.json'), bytes);
  const evidence = {
    path: 'evidence/cloudflare-production-readback.json', bytes: bytes.length, sha256: hash(bytes),
    driveFileId: 'cloudflare-pr156-provider-evidence-id', driveUrl: 'https://drive.google.com/file/d/cloudflare-pr156-provider-evidence-id/view',
    downloadBackVerified: true,
    downloadBack: { path: 'evidence/cloudflare-production-readback-download.json', bytes: bytes.length, sha256: hash(bytes) },
  };
  const restoreProcedure = 'Cloudflare dashboard > local-roots > Deployments > select the exact prior production deployment > Rollback to this deployment > confirm.';
  const assetRecord = {
    provider: 'cloudflare-pages', project: 'local-roots', target: 'production',
    deploymentId: providerRecord.deploymentId, sourceCommit: providerRecord.sourceCommit,
    publicAssetCount: 1, matchedPublicAssetCount: 1,
    publicAssets: [{ path: 'dyed-and-unattached/dye-studio/index.html', bytes: 1, sha256: 'c'.repeat(64) }],
    providerManagedConfiguration: {
      disposition: 'provider-managed-not-public', publicByteIdentity: 'unavailable',
      paths: ['dist/_headers', 'dist/_redirects', 'dist/_routes.json'],
    },
  };
  const assetBytes = Buffer.from(JSON.stringify(assetRecord, null, 2) + '\n');
  await writeFile(path.join(f.root, 'evidence/pr156-public-assets.json'), assetBytes);
  await writeFile(path.join(f.root, 'evidence/pr156-public-assets-download.json'), assetBytes);
  const publicAssetEvidence = {
    path: 'evidence/pr156-public-assets.json', bytes: assetBytes.length, sha256: hash(assetBytes), publicAssetCount: 1,
    driveFileId: 'pr156-public-assets-id', driveUrl: 'https://drive.google.com/file/d/pr156-public-assets-id/view',
    downloadBackVerified: true,
    downloadBack: { path: 'evidence/pr156-public-assets-download.json', bytes: assetBytes.length, sha256: hash(assetBytes) },
  };
  const candidateManifest = {
    releaseId, repository: 'oookkkaaayyy/local-roots', sourceCommit,
    command: f.receipt.build.command, toolchain: f.receipt.build.toolchain,
    lockfileSha256: f.receipt.build.lockfileSha256, fileCount: 1,
    files: [{ path: 'index.html', bytes: Buffer.byteLength('<h1>PR 156 fixture</h1>'), sha256: hash(Buffer.from('<h1>PR 156 fixture</h1>')) }],
  };
  const buildDir = path.join(f.root, 'evidence/pr156-build');
  await mkdir(buildDir);
  const html = Buffer.from('<h1>PR 156 fixture</h1>');
  await writeFile(path.join(buildDir, 'index.html'), html);
  const archivePath = path.join(f.root, 'evidence/pr156-candidate.zip');
  const zip = spawnSync('zip', ['-X', '-q', '-r', archivePath, 'index.html'], { cwd: buildDir, encoding: 'utf8' });
  assert.equal(zip.status, 0, zip.stderr);
  const archiveBytes = await readFile(archivePath);
  candidateManifest.archiveSha256 = hash(archiveBytes);
  candidateManifest.archiveBytes = archiveBytes.length;
  await writeFile(path.join(f.root, 'evidence/package.bin'), archiveBytes);
  await writeFile(path.join(f.root, 'evidence/recovery.bin'), archiveBytes);
  f.receipt.package = { path: 'evidence/package.bin', bytes: archiveBytes.length, sha256: hash(archiveBytes) };
  f.receipt.recovery.downloadBack = { path: 'evidence/recovery.bin', bytes: archiveBytes.length, sha256: hash(archiveBytes) };
  const candidateManifestBytes = Buffer.from(JSON.stringify(candidateManifest, null, 2) + '\n');
  await writeFile(path.join(f.root, 'evidence/pr156-candidate-manifest.json'), candidateManifestBytes);
  await writeFile(path.join(f.root, 'evidence/pr156-candidate-manifest-download.json'), candidateManifestBytes);
  const packageManifest = {
    path: 'evidence/pr156-candidate-manifest.json', bytes: candidateManifestBytes.length, sha256: hash(candidateManifestBytes),
    driveFileId: 'pr156-candidate-manifest-id', driveUrl: 'https://drive.google.com/file/d/pr156-candidate-manifest-id/view',
    downloadBackVerified: true,
    downloadBack: { path: 'evidence/pr156-candidate-manifest-download.json', bytes: candidateManifestBytes.length, sha256: hash(candidateManifestBytes) },
  };
  f.receipt.releaseId = releaseId;
  f.receipt.source = { repository: 'oookkkaaayyy/local-roots', ref: 'refs/pull/156/head', commit: sourceCommit, pullRequest: 156 };
  f.receipt.baseline = {
    provider: 'cloudflare-pages', target: 'production', authorityUrl: 'https://dash.cloudflare.com/account/pages/view/local-roots',
    identity: providerRecord.deploymentId, sourceCommit: providerRecord.sourceCommit,
    sourceEvidence: 'Fresh authenticated Cloudflare Pages production deployment readback.',
    acceptance: 'Current successful immutable production deployment is provider-native rollback target.',
    artifact: { disposition: 'provider-native-rollback', driveFileId: evidence.driveFileId, driveUrl: evidence.driveUrl },
    publicAssetEvidence,
    providerManagedConfiguration: {
      disposition: 'provider-managed-not-public', publicByteIdentity: 'unavailable', publiclyReadable: false,
      paths: ['dist/_headers', 'dist/_redirects', 'dist/_routes.json'],
    },
    rollback: { mode: 'cloudflare-pages-native-rollback', deploymentId: providerRecord.deploymentId,
      sourceCommit: providerRecord.sourceCommit, rollbackEligible: true, restoreProcedure },
  };
  f.receipt.recoveryMode = {
    mode: 'cloudflare-pages-native-rollback',
    scope: { provider: 'cloudflare-pages', project: 'local-roots', target: 'production', releaseId, pullRequest: 156, repository: 'oookkkaaayyy/local-roots' },
    approval: {
      authority: 'owner-approved-AKS', canonicalRecordId: '1NCpsNS9zTSlYLvV7afP4hhJNsLDTbKBToBysNH_ZeWM',
      canonicalUrl: 'https://docs.google.com/document/d/1NCpsNS9zTSlYLvV7afP4hhJNsLDTbKBToBysNH_ZeWM/edit',
      deltaInboxSpreadsheetId: '1tJIcKRfWFdHVYVo4G6mgySB46p6xwsseGON3JdnEnzY', deltaInboxRow: 2787,
      ownerResponse: 'Yes I approve.',
      evidence: { url: 'https://docs.google.com/spreadsheets/d/1tJIcKRfWFdHVYVo4G6mgySB46p6xwsseGON3JdnEnzY/edit#gid=1794604334&range=A2787:K2787' },
    },
    providerVerification: { ...providerRecord, evidence, restoreProcedure,
      rollbackInstructions: 'Select the verified successful deployment and choose Rollback to this deployment in Cloudflare Pages.' },
  };
  f.receipt.rollback = { mode: 'cloudflare-pages-native-rollback', deploymentId: providerRecord.deploymentId,
    sourceCommit: providerRecord.sourceCommit, rollbackEligible: true, restoreProcedure };
  f.receipt.deployment = { provider: 'cloudflare-pages', target: 'production',
    plannedRoute: 'Merge the admitted PR #156 candidate to main; allow Git-integrated Cloudflare Pages production deployment.', restoreProcedure };
  f.receipt.acceptance.criteria[0] = { id: 'candidate-preview', description: 'The exact PR #156 preview passes required interactive acceptance.',
    method: 'Run the declared preview/browser acceptance plan and verify exact-head CI.',
    expectedOutcome: 'Every mandatory preview criterion passes on this exact source candidate.', status: 'PENDING' };
  f.receipt.packageManifest = packageManifest;
  delete f.receipt.admission;
  return f;
}

async function standingCloudflarePRFixture(prNumber, releaseId = `local-roots-dye-photo-pr-${prNumber}-2026-10-30-r1`) {
  const f = await nativeRollbackPR156Fixture();
  const sourceCommit = f.receipt.source.commit;
  f.receipt.releaseId = releaseId;
  f.receipt.source.pullRequest = prNumber;
  f.receipt.source.ref = `refs/pull/${prNumber}/head`;
  f.receipt.packageManifest.path = 'evidence/standing-candidate-manifest.json';
  f.receipt.packageManifest.downloadBack.path = 'evidence/standing-candidate-manifest-download.json';
  const manifest = JSON.parse(await readFile(path.join(f.root, 'evidence/pr156-candidate-manifest.json'), 'utf8'));
  manifest.releaseId = releaseId;
  manifest.sourceCommit = sourceCommit;
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(f.root, f.receipt.packageManifest.path), manifestBytes);
  await writeFile(path.join(f.root, f.receipt.packageManifest.downloadBack.path), manifestBytes);
  Object.assign(f.receipt.packageManifest, { bytes: manifestBytes.length, sha256: hash(manifestBytes) });
  Object.assign(f.receipt.packageManifest.downloadBack, { bytes: manifestBytes.length, sha256: hash(manifestBytes) });
  f.receipt.recoveryMode.authorization = 'standing-owner-approved-cloudflare-pages-production';
  f.receipt.recoveryMode.scope.releaseId = releaseId;
  f.receipt.recoveryMode.scope.pullRequest = prNumber;
  f.receipt.recoveryMode.approval.canonicalUrl = 'https://github.com/oookkkaaayyy/local-roots/issues/62#issuecomment-6532457701';
  f.receipt.recoveryMode.approval.issueCommentId = '6532457701';
  f.receipt.recoveryMode.approval.deltaInboxSpreadsheetId = '1tJIcKRfWFdHVYVo4G6mgySB46p6xwsseGON3JdnEnzY';
  f.receipt.recoveryMode.approval.deltaInboxRow = 2800;
  f.receipt.recoveryMode.approval.evidence.url = 'https://docs.google.com/spreadsheets/d/1tJIcKRfWFdHVYVo4G6mgySB46p6xwsseGON3JdnEnzY/edit#gid=1&range=A2800:K2800';
  delete f.receipt.admission;
  return f;
}

async function attachAdmissionManifest(f) {
  const result = await validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' });
  const bytes = Buffer.from(JSON.stringify(result.admissionManifest, null, 2) + '\n');
  const manifestPath = `${f.receipt.releaseId}.admission.json`;
  await writeFile(path.join(f.root, manifestPath), bytes);
  await writeFile(path.join(f.root, 'evidence/admission-download.json'), bytes);
  f.receipt.admission = {
    path: manifestPath, bytes: bytes.length, sha256: hash(bytes), driveFileId: 'pr156-admission-manifest-id',
    driveUrl: 'https://drive.google.com/file/d/pr156-admission-manifest-id/view', downloadBackVerified: true,
    downloadBack: { path: 'evidence/admission-download.json', bytes: bytes.length, sha256: hash(bytes) },
  };
  return bytes;
}

async function attachDeploymentCloseout(f) {
  f.receipt.acceptance.criteria[0] = { ...f.receipt.acceptance.criteria[0], status: 'PASS', evidence: ['evidence/runtime-check.txt'] };
  f.receipt.deployment.versionId = 'production-deployment-after-pr156';
  f.receipt.deployment.installedAt = new Date().toISOString();
  const deploymentBytes = Buffer.from('immutable Cloudflare deployment receipt');
  await writeFile(path.join(f.root, 'evidence/pr156-deployment.txt'), deploymentBytes);
  await writeFile(path.join(f.root, 'evidence/pr156-deployment-download.txt'), deploymentBytes);
  f.receipt.deployment.receipt = {
    path: 'evidence/pr156-deployment.txt', bytes: deploymentBytes.length, sha256: hash(deploymentBytes),
    driveFileId: 'pr156-deployment-receipt-id', driveUrl: 'https://drive.google.com/file/d/pr156-deployment-receipt-id/view',
    downloadBackVerified: true,
    downloadBack: { path: 'evidence/pr156-deployment-download.txt', bytes: deploymentBytes.length, sha256: hash(deploymentBytes) },
  };
  const readback = {
    provider: 'cloudflare-pages', target: 'production', versionId: f.receipt.deployment.versionId,
    sourceCommit: f.receipt.source.commit, packageSha256: f.receipt.package.sha256,
    baselineIdentity: f.receipt.baseline.identity,
  };
  const readbackBytes = Buffer.from(JSON.stringify(readback));
  await writeFile(path.join(f.root, 'evidence/pr156-deployment-readback.json'), readbackBytes);
  f.receipt.deployment.readback = { path: 'evidence/pr156-deployment-readback.json', bytes: readbackBytes.length, sha256: hash(readbackBytes) };
}

async function attachSquashIdentityProof(f) {
  const prNumber = f.receipt.source.pullRequest;
  const sourceCommit = f.receipt.source.commit;
  const mergeCommit = 'f'.repeat(40);
  const tree = 'e'.repeat(40);
  f.receipt.source.pullRequestHeadCommit = sourceCommit;
  f.receipt.source.treeSha = tree;
  const api = 'https://api.github.com/repos/oookkkaaayyy/local-roots';
  const proof = {
    schemaVersion: 1, repository: 'oookkkaaayyy/local-roots', retrievedAt: new Date().toISOString(),
    pullRequest: { url: `${api}/pulls/${prNumber}`, payload: {
      number: prNumber, state: 'closed', merged: true, merged_at: new Date().toISOString(), merge_commit_sha: mergeCommit,
      head: { repo: { full_name: 'oookkkaaayyy/local-roots' }, sha: sourceCommit },
      base: { repo: { full_name: 'oookkkaaayyy/local-roots' } },
    } },
    candidateCommit: { url: `${api}/commits/${sourceCommit}`, payload: { sha: sourceCommit, commit: { tree: { sha: tree } } } },
    mergeCommit: { url: `${api}/commits/${mergeCommit}`, payload: { sha: mergeCommit, commit: { tree: { sha: tree } } } },
  };
  const bytes = Buffer.from(JSON.stringify(proof, null, 2) + '\n');
  await writeFile(path.join(f.root, 'evidence/github-merge-proof.json'), bytes);
  await writeFile(path.join(f.root, 'evidence/github-merge-proof-download.json'), bytes);
  f.receipt.deployment.identityBridge = {
    mode: 'github-pr-squash-tree-match',
    evidence: { path: 'evidence/github-merge-proof.json', bytes: bytes.length, sha256: hash(bytes),
      driveFileId: 'github-merge-proof-id', driveUrl: 'https://drive.google.com/file/d/github-merge-proof-id/view', downloadBackVerified: true,
      downloadBack: { path: 'evidence/github-merge-proof-download.json', bytes: bytes.length, sha256: hash(bytes) } },
  };
  await attachDeploymentCloseout(f);
  const readback = JSON.parse(await readFile(path.join(f.root, f.receipt.deployment.readback.path), 'utf8'));
  Object.assign(readback, { sourceCommit: mergeCommit, sourceTreeSha: tree,
    admittedCandidateCommit: sourceCommit, candidateTreeSha: tree });
  const readbackBytes = Buffer.from(JSON.stringify(readback));
  await writeFile(path.join(f.root, f.receipt.deployment.readback.path), readbackBytes);
  f.receipt.deployment.readback = { path: f.receipt.deployment.readback.path, bytes: readbackBytes.length, sha256: hash(readbackBytes) };
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
    assert.equal(Object.hasOwn(manifest, 'recoveryMode'), false, 'strict artifact-based admission manifest stays unchanged');
    assert.equal(Object.hasOwn(manifest.baseline, 'artifactDisposition'), false);
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

test('admits only the owner-approved Dye Studio PR #153 Cloudflare rollback alternative', async () => {
  const f = await nativeRollbackFixture();
  try {
    const result = await validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' });
    assert.equal(result.phase, 'admission');
    assert.equal(result.admissionManifest.recoveryMode.mode, 'cloudflare-pages-native-rollback');
    assert.equal(result.admissionManifest.baseline.artifactSha256, null);
    assert.equal(result.admissionManifest.baseline.providerEvidenceSha256, f.receipt.recoveryMode.providerVerification.evidence.sha256);
  } finally { await f.cleanup(); }
});

test('fails closed when authenticated Cloudflare rollback verification is missing', async () => {
  const f = await nativeRollbackFixture();
  try {
    delete f.receipt.recoveryMode.providerVerification.authenticatedProviderReadback;
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' }), /authenticated successful rollback-eligible production deployment/);
  } finally { await f.cleanup(); }
});

test('native rollback evidence requires an independently downloaded provider-evidence copy', async () => {
  const f = await nativeRollbackFixture();
  try {
    f.receipt.recoveryMode.providerVerification.evidence.downloadBack.path = f.receipt.recoveryMode.providerVerification.evidence.path;
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' }), /separate downloaded file/);
  } finally { await f.cleanup(); }
});

test('Cloudflare exception cannot target another project, hardware target, or release', async () => {
  for (const [path, value, expected] of [
    [['recoveryMode', 'scope', 'project'], 'another-project', /outside the owner-approved Cloudflare recovery exception/],
    [['recoveryMode', 'scope', 'target'], 'hardware', /outside the owner-approved Cloudflare recovery exception/],
    [['releaseId'], 'unrelated-release-2026-10-29', /outside the owner-approved Cloudflare recovery exception/],
  ]) {
    const f = await nativeRollbackFixture();
    try {
      let target = f.receipt;
      for (const key of path.slice(0, -1)) target = target[key];
      target[path.at(-1)] = value;
      await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' }), path[0] === 'releaseId' ? /not authorized for this release identity/ : expected);
    } finally { await f.cleanup(); }
  }
});

test('native rollback evidence cannot claim unavailable historical archive hashes', async () => {
  const f = await nativeRollbackFixture();
  try {
    f.receipt.baseline.artifact.sha256 = 'a'.repeat(64);
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' }), /cannot claim unavailable historical deployment artifact bytes/);
  } finally { await f.cleanup(); }
});

test('admits the separately owner-approved PR #156 Cloudflare rollback recovery and candidate binding', async () => {
  const f = await nativeRollbackPR156Fixture();
  try {
    const result = await validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' });
    assert.equal(result.phase, 'admission');
    assert.equal(result.admissionManifest.releaseId, 'local-roots-dye-studio-pr-156-2026-10-30-r1');
    assert.equal(result.admissionManifest.source.commit, f.receipt.source.commit);
    assert.equal(result.admissionManifest.recoveryMode.approval.deltaInboxRow, 2787);
    assert.equal(result.admissionManifest.baseline.identity, '310d16df-cb08-4d06-90f9-7c252fcf06e5');
    assert.equal(result.admissionManifest.baseline.artifactSha256, null, 'unavailable historical bytes remain explicitly unavailable');
    assert.equal(result.admissionManifest.baseline.providerEvidenceSha256, f.receipt.recoveryMode.providerVerification.evidence.sha256);
  } finally { await f.cleanup(); }
});

test('PR #156 native rollback fails closed for wrong repository, project, target, PR, release, or approval provenance', async () => {
  const mutations = [
    [r => { r.source.repository = 'other/repo'; }, /source\.repository is outside/],
    [r => { r.recoveryMode.scope.project = 'other-project'; }, /scope\.project is outside/],
    [r => { r.recoveryMode.scope.target = 'hardware'; }, /scope\.target is outside/],
    [r => { r.recoveryMode.scope.pullRequest = 153; }, /scope\.pullRequest is outside/],
    [r => { r.releaseId = 'future-release'; }, /not authorized for this release identity/],
    [r => { r.source.ref = 'main'; }, /source\.ref is outside/],
    [r => { r.recoveryMode.approval.deltaInboxRow = 2786; }, /deltaInboxRow is outside/],
    [r => { r.recoveryMode.approval.ownerResponse = 'Yes'; }, /ownerResponse is outside/],
  ];
  for (const [mutate, expected] of mutations) {
    const f = await nativeRollbackPR156Fixture();
    try { mutate(f.receipt); await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' }), expected); }
    finally { await f.cleanup(); }
  }
});

test('PR #156 native rollback rejects stale or mismatched provider baseline and ineligible deployment', async () => {
  for (const [mutate, expected] of [
    [r => { r.baseline.identity = 'stale-deployment'; }, /providerVerification\.deploymentId does not match/],
    [r => { r.recoveryMode.providerVerification.deploymentStatus = 'failed'; }, /successful rollback-eligible/],
    [r => { r.recoveryMode.providerVerification.rollbackEligible = false; }, /successful rollback-eligible/],
    [r => { r.recoveryMode.providerVerification.authenticatedProviderReadback = false; }, /successful rollback-eligible/],
    [r => { r.recoveryMode.providerVerification.verifiedAt = '2020-01-01T00:00:00Z'; }, /current within the admission window/],
  ]) {
    const f = await nativeRollbackPR156Fixture();
    try { mutate(f.receipt); await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' }), expected); }
    finally { await f.cleanup(); }
  }
});

test('PR #156 native rollback requires hashed provider and candidate recovery evidence', async () => {
  for (const mutate of [
    r => { delete r.recoveryMode.providerVerification.evidence.sha256; },
    r => { r.recoveryMode.providerVerification.evidence.downloadBackVerified = false; },
    r => { delete r.recovery.driveFileId; },
    r => { r.recovery.downloadBackVerified = false; },
    r => { delete r.packageManifest; },
    r => { r.packageManifest.downloadBackVerified = false; },
    r => { delete r.baseline.publicAssetEvidence; },
    r => { r.baseline.publicAssetEvidence.downloadBackVerified = false; },
    r => { r.baseline.providerManagedConfiguration.publicByteIdentity = 'sha256-known'; },
  ]) {
    const f = await nativeRollbackPR156Fixture();
    try { mutate(f.receipt); await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' })); }
    finally { await f.cleanup(); }
  }
});

test('PR #156 candidate manifest and provider configuration evidence cannot overclaim or drift', async () => {
  for (const mutate of [
    r => { r.packageManifest.sha256 = 'f'.repeat(64); },
    r => { r.baseline.providerManagedConfiguration.paths = ['dist/_headers']; },
  ]) {
    const f = await nativeRollbackPR156Fixture();
    try { mutate(f.receipt); await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' })); }
    finally { await f.cleanup(); }
  }
  const f = await nativeRollbackPR156Fixture();
  try {
    const recordPath = path.join(f.root, f.receipt.baseline.publicAssetEvidence.path);
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    record.publicAssetCount = 2;
    const bytes = Buffer.from(JSON.stringify(record));
    await writeFile(recordPath, bytes);
    await writeFile(path.join(f.root, f.receipt.baseline.publicAssetEvidence.downloadBack.path), bytes);
    f.receipt.baseline.publicAssetEvidence.bytes = bytes.length;
    f.receipt.baseline.publicAssetEvidence.sha256 = hash(bytes);
    f.receipt.baseline.publicAssetEvidence.downloadBack.bytes = bytes.length;
    f.receipt.baseline.publicAssetEvidence.downloadBack.sha256 = hash(bytes);
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' }), /every listed public asset hash and size/);
  } finally { await f.cleanup(); }
});

test('PR #156 admission manifest cannot be replayed for a changed candidate and closeout is mandatory', async () => {
  const f = await nativeRollbackPR156Fixture();
  try {
    await attachAdmissionManifest(f);
    await attachDeploymentCloseout(f);
    const pass = await validateReleaseReceipt(f.receipt, f.root, { phase: 'closeout' });
    assert.equal(pass.phase, 'closeout');
    f.receipt.source.commit = 'e'.repeat(40);
    const readbackPath = path.join(f.root, f.receipt.deployment.readback.path);
    const readback = JSON.parse(await readFile(readbackPath, 'utf8'));
    readback.sourceCommit = f.receipt.source.commit;
    const readbackBytes = Buffer.from(JSON.stringify(readback));
    await writeFile(readbackPath, readbackBytes);
    f.receipt.deployment.readback.bytes = readbackBytes.length;
    f.receipt.deployment.readback.sha256 = hash(readbackBytes);
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'closeout' }), /candidate manifest must bind the exact release, source, build and archived candidate bytes/);
  } finally { await f.cleanup(); }
});

test('PR #156 cannot skip same-manifest post-deployment release verification', async () => {
  const f = await nativeRollbackPR156Fixture();
  try {
    await attachDeploymentCloseout(f);
    await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'closeout' }), /admission manifest reference and durable recovery are required/);
  } finally { await f.cleanup(); }
});

test('standing Cloudflare production authorization admits PR #159 and a differently numbered future eligible PR', async () => {
  for (const pr of [159, 247]) {
    const f = await standingCloudflarePRFixture(pr);
    try {
      const result = await validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' });
      assert.equal(result.phase, 'admission');
      assert.equal(result.releaseId, f.receipt.releaseId);
      assert.equal(result.admissionManifest.baseline.identity, f.receipt.baseline.identity);
      assert.equal(result.admissionManifest.package.manifestSha256, f.receipt.packageManifest.sha256);
    } finally { await f.cleanup(); }
  }
});

test('standing Cloudflare authorization fails closed outside its provider, repository, project, target and approval', async () => {
  for (const mutate of [
    r => { r.source.repository = 'other/repo'; },
    r => { r.recoveryMode.scope.project = 'other-pages'; },
    r => { r.recoveryMode.scope.target = 'preview'; },
    r => { r.baseline.provider = 'other-provider'; },
    r => { r.deployment.target = 'preview'; },
    r => { r.recoveryMode.approval.issueCommentId = 'different'; },
    r => { r.releaseId = 'unrelated-release'; r.recoveryMode.scope.releaseId = 'unrelated-release'; },
  ]) {
    const f = await standingCloudflarePRFixture(159);
    try { mutate(f.receipt); await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' })); }
    finally { await f.cleanup(); }
  }
});

test('standing Cloudflare authorization requires fresh authenticated eligible baseline and durable candidate evidence', async () => {
  for (const mutate of [
    r => { r.recoveryMode.providerVerification.authenticatedProviderReadback = false; },
    r => { r.recoveryMode.providerVerification.rollbackEligible = false; },
    r => { r.recoveryMode.providerVerification.deploymentStatus = 'failed'; },
    r => { r.recoveryMode.providerVerification.deploymentId = 'stale-deployment'; },
    r => { r.recoveryMode.providerVerification.verifiedAt = '2020-01-01T00:00:00Z'; },
    r => { delete r.packageManifest.downloadBack; },
    r => { delete r.baseline.publicAssetEvidence; },
    r => { r.recovery.downloadBackVerified = false; },
  ]) {
    const f = await standingCloudflarePRFixture(159);
    try { mutate(f.receipt); await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'admission' })); }
    finally { await f.cleanup(); }
  }
});

test('standing Cloudflare closeout verifies the actual PR head, squash tree, provider source and same admission', async () => {
  const f = await standingCloudflarePRFixture(159);
  try {
    f.receipt.source.pullRequestHeadCommit = f.receipt.source.commit;
    f.receipt.source.treeSha = 'e'.repeat(40);
    await attachAdmissionManifest(f);
    await attachSquashIdentityProof(f);
    const result = await validateReleaseReceipt(f.receipt, f.root, { phase: 'closeout' });
    assert.equal(result.phase, 'closeout');
    assert.equal(result.admissionSha256, f.receipt.admission.sha256);
  } finally { await f.cleanup(); }
});

test('standing Cloudflare closeout rejects forged PR head, tree and provider source identity', async () => {
  for (const mutation of ['head', 'tree', 'provider']) {
    const f = await standingCloudflarePRFixture(247);
    try {
      f.receipt.source.pullRequestHeadCommit = f.receipt.source.commit;
      f.receipt.source.treeSha = 'e'.repeat(40);
      await attachAdmissionManifest(f);
      await attachSquashIdentityProof(f);
      const proofPath = path.join(f.root, f.receipt.deployment.identityBridge.evidence.path);
      const proof = JSON.parse(await readFile(proofPath, 'utf8'));
      const readbackPath = path.join(f.root, f.receipt.deployment.readback.path);
      const readback = JSON.parse(await readFile(readbackPath, 'utf8'));
      if (mutation === 'head') proof.pullRequest.payload.head.sha = 'd'.repeat(40);
      if (mutation === 'tree') proof.mergeCommit.payload.commit.tree.sha = 'd'.repeat(40);
      if (mutation === 'provider') readback.sourceCommit = 'd'.repeat(40);
      const proofBytes = Buffer.from(JSON.stringify(proof, null, 2) + '\n');
      await writeFile(proofPath, proofBytes);
      await writeFile(path.join(f.root, f.receipt.deployment.identityBridge.evidence.downloadBack.path), proofBytes);
      Object.assign(f.receipt.deployment.identityBridge.evidence, { bytes: proofBytes.length, sha256: hash(proofBytes) });
      Object.assign(f.receipt.deployment.identityBridge.evidence.downloadBack, { bytes: proofBytes.length, sha256: hash(proofBytes) });
      const readbackBytes = Buffer.from(JSON.stringify(readback));
      await writeFile(readbackPath, readbackBytes);
      Object.assign(f.receipt.deployment.readback, { bytes: readbackBytes.length, sha256: hash(readbackBytes) });
      await assert.rejects(validateReleaseReceipt(f.receipt, f.root, { phase: 'closeout' }));
    } finally { await f.cleanup(); }
  }
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
