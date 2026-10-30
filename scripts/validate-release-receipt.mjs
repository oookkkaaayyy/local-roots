#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA256 = /^[a-f0-9]{64}$/i;
const DYE_STUDIO_NATIVE_ROLLBACK_SCOPES = Object.freeze({
  'local-roots-dye-studio-pr-153-2026-10-29-r2': Object.freeze({
    releaseId: 'local-roots-dye-studio-pr-153-2026-10-29-r2',
    repository: 'oookkkaaayyy/local-roots', pullRequest: 153, project: 'local-roots', target: 'production',
    baselineDeployment: 'b56e1122-f55d-48ae-817a-0e511e72b9e4',
    baselineCommit: '0f8e9c2409bb5a947482f66db0d436de49d1acc0',
    approvalRecord: '1NCpsNS9zTSlYLvV7afP4hhJNsLDTbKBToBysNH_ZeWM',
  }),
  'local-roots-dye-studio-pr-156-2026-10-30-r1': Object.freeze({
    releaseId: 'local-roots-dye-studio-pr-156-2026-10-30-r1',
    repository: 'oookkkaaayyy/local-roots', pullRequest: 156, project: 'local-roots', target: 'production',
    approvalRecord: '1NCpsNS9zTSlYLvV7afP4hhJNsLDTbKBToBysNH_ZeWM',
    approvalDeltaSpreadsheetId: '1tJIcKRfWFdHVYVo4G6mgySB46p6xwsseGON3JdnEnzY',
    approvalDeltaRow: 2787, approvalResponse: 'Yes I approve.',
    maxProviderEvidenceAgeMs: 10 * 60 * 1000,
  }),
});
const DYE_STUDIO_PR156_RELEASE_ID = 'local-roots-dye-studio-pr-156-2026-10-30-r1';
const DYE_STUDIO_PR156_PROVIDER_CONFIG_PATHS = Object.freeze([
  'dist/_headers', 'dist/_redirects', 'dist/_routes.json',
]);

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a 64-character SHA-256`);
}

async function verifyPR156SquashMergeIdentity(receipt, root, readback) {
  const bridge = receipt.deployment?.identityBridge;
  if (!bridge || bridge.mode !== 'github-pr156-squash-tree-match') {
    throw new Error('PR #156 closeout requires its GitHub-verified squash-merge identity bridge');
  }
  const evidence = bridge.evidence;
  const evidenceFile = await verifyFile(root, evidence, 'deployment.identityBridge.evidence');
  requireString(evidence.driveFileId, 'deployment.identityBridge.evidence.driveFileId');
  requireString(evidence.driveUrl, 'deployment.identityBridge.evidence.driveUrl');
  if (evidence.downloadBackVerified !== true) {
    throw new Error('deployment.identityBridge.evidence.downloadBackVerified must be true');
  }
  const downloaded = await verifyFile(root, evidence.downloadBack, 'deployment.identityBridge.evidence.downloadBack');
  if (downloaded.sha256 !== evidenceFile.sha256 || downloaded.bytes !== evidenceFile.bytes) {
    throw new Error('deployment.identityBridge.evidence.downloadBack must byte-match GitHub identity evidence');
  }

  let proof;
  try {
    proof = JSON.parse(await readFile(path.resolve(root, evidence.path), 'utf8'));
  } catch {
    throw new Error('deployment.identityBridge.evidence must be valid JSON');
  }
  const repository = 'oookkkaaayyy/local-roots';
  const apiRoot = 'https://api.github.com/repos/oookkkaaayyy/local-roots';
  const pr = proof.pullRequest?.payload;
  const candidate = proof.candidateCommit?.payload;
  const merge = proof.mergeCommit?.payload;
  if (proof.schemaVersion !== 1 || proof.repository !== repository ||
      proof.pullRequest?.url !== `${apiRoot}/pulls/156` ||
      proof.candidateCommit?.url !== `${apiRoot}/commits/${receipt.source.commit}` ||
      typeof proof.retrievedAt !== 'string' || !Number.isFinite(Date.parse(proof.retrievedAt)) ||
      Date.parse(proof.retrievedAt) > Date.now() + 5 * 60 * 1000) {
    throw new Error('GitHub identity evidence must identify the fixed repository, PR, commits, and retrieval time');
  }
  if (receipt.releaseId !== DYE_STUDIO_PR156_RELEASE_ID || receipt.source.repository !== repository ||
      receipt.source.pullRequest !== 156 || receipt.source.pullRequestHeadCommit !== receipt.source.commit ||
      pr?.number !== 156 || pr.state !== 'closed' || pr.merged !== true ||
      pr.head?.repo?.full_name !== repository || pr.head.sha !== receipt.source.commit ||
      pr.base?.repo?.full_name !== repository || !pr.merged_at ||
      typeof pr.merge_commit_sha !== 'string' ||
      proof.mergeCommit?.url !== `${apiRoot}/commits/${pr.merge_commit_sha}` ||
      candidate?.sha !== receipt.source.commit || merge?.sha !== pr.merge_commit_sha) {
    throw new Error('GitHub identity evidence does not prove the admitted PR #156 was merged from its exact head');
  }
  const candidateTree = candidate.commit?.tree?.sha;
  const mergeTree = merge.commit?.tree?.sha;
  if (!/^[a-f0-9]{40}$/i.test(candidateTree ?? '') || candidateTree !== mergeTree ||
      receipt.source.treeSha !== candidateTree) {
    throw new Error('GitHub identity evidence must prove identical admitted-head and squash-merge trees');
  }
  if (readback.sourceCommit !== pr.merge_commit_sha || readback.sourceTreeSha !== mergeTree ||
      readback.admittedCandidateCommit !== receipt.source.commit ||
      readback.candidateTreeSha !== candidateTree) {
    throw new Error('Cloudflare readback must report the verified squash SHA and admitted candidate tree identity');
  }
  return pr.merge_commit_sha;
}

function admissionProjection(receipt, hashes = {}) {
  return {
    schemaVersion: 1,
    releaseId: receipt.releaseId,
    ...(receipt.recoveryMode?.mode === 'cloudflare-pages-native-rollback'
      ? { recoveryMode: receipt.recoveryMode }
      : {}),
    source: receipt.source,
    build: receipt.build,
    baseline: {
      provider: receipt.baseline.provider,
      target: receipt.baseline.target,
      identity: receipt.baseline.identity,
      sourceCommit: receipt.baseline.sourceCommit,
      sourceEvidence: receipt.baseline.sourceEvidence,
      ...(receipt.recoveryMode?.mode === 'cloudflare-pages-native-rollback'
        ? { artifactDisposition: receipt.baseline.artifact?.disposition ?? null }
        : {}),
      artifactDriveFileId: receipt.baseline.artifact?.driveFileId ?? null,
      artifactSha256: hashes.baselineSha256 ?? receipt.baseline.artifact?.sha256 ?? null,
      artifactBytes: hashes.baselineBytes ?? receipt.baseline.artifact?.bytes ?? null,
      identityEvidenceSha256: receipt.baseline.identityEvidence?.sha256 ?? hashes.providerEvidenceSha256 ?? null,
      rollbackSha256: hashes.rollbackSha256 ?? receipt.rollback?.artifact?.sha256 ?? null,
      rollbackBytes: hashes.rollbackBytes ?? receipt.rollback?.artifact?.bytes ?? null,
      rollbackDriveFileId: receipt.rollback?.recovery?.driveFileId ?? null,
      rollbackDriveUrl: receipt.rollback?.recovery?.driveUrl ?? null,
      rollbackDownloadBackSha256: receipt.rollback?.recovery?.downloadBack?.sha256 ?? null,
      rollbackDownloadBackBytes: receipt.rollback?.recovery?.downloadBack?.bytes ?? null,
      restoreProcedure: receipt.rollback.restoreProcedure,
      ...(receipt.recoveryMode?.mode === 'cloudflare-pages-native-rollback'
        ? { providerEvidenceSha256: hashes.providerEvidenceSha256 ?? null }
        : {}),
      ...(receipt.releaseId === DYE_STUDIO_PR156_RELEASE_ID ? {
        publicAssetEvidenceSha256: hashes.publicAssetEvidenceSha256 ?? receipt.baseline.publicAssetEvidence?.sha256 ?? null,
        publicAssetEvidenceDriveFileId: receipt.baseline.publicAssetEvidence?.driveFileId ?? null,
        publicAssetCount: receipt.baseline.publicAssetEvidence?.publicAssetCount ?? null,
        providerManagedConfiguration: receipt.baseline.providerManagedConfiguration ?? null,
      } : {}),
    },
    package: {
      sha256: hashes.packageSha256 ?? receipt.package.sha256,
      bytes: hashes.packageBytes ?? receipt.package.bytes,
      ...(receipt.releaseId === DYE_STUDIO_PR156_RELEASE_ID ? {
        manifestSha256: hashes.candidateManifestSha256 ?? receipt.packageManifest?.sha256 ?? null,
        manifestDriveFileId: receipt.packageManifest?.driveFileId ?? null,
      } : {}),
    },
    recovery: {
      driveFileId: receipt.recovery.driveFileId,
      driveUrl: receipt.recovery.driveUrl,
      downloadBackSha256: receipt.recovery.downloadBack.sha256,
      downloadBackBytes: receipt.recovery.downloadBack.bytes,
    },
    deployment: {
      provider: receipt.deployment.provider,
      target: receipt.deployment.target,
      plannedRoute: receipt.deployment.plannedRoute,
      restoreProcedure: receipt.deployment.restoreProcedure,
    },
    acceptance: {
      scope: receipt.acceptance.scope,
      criteria: receipt.acceptance.criteria.map(({ id, description, method, expectedOutcome }) =>
        ({ id, description, method, expectedOutcome })),
    },
  };
}

function requireDyeStudioNativeRollbackScope(receipt) {
  const recovery = receipt.recoveryMode;
  if (!recovery || recovery.mode !== 'cloudflare-pages-native-rollback') return false;
  const scope = recovery.scope;
  const approval = recovery.approval;
  const expected = DYE_STUDIO_NATIVE_ROLLBACK_SCOPES[receipt.releaseId];
  if (!expected) throw new Error('Cloudflare native rollback is not authorized for this release identity');
  const checks = [
    [receipt.releaseId, expected.releaseId, 'releaseId'],
    [receipt.source?.repository, expected.repository, 'source.repository'],
    [receipt.source?.pullRequest, expected.pullRequest, 'source.pullRequest'],
    [scope?.provider, 'cloudflare-pages', 'recoveryMode.scope.provider'],
    [scope?.project, expected.project, 'recoveryMode.scope.project'],
    [scope?.target, expected.target, 'recoveryMode.scope.target'],
    [scope?.releaseId, expected.releaseId, 'recoveryMode.scope.releaseId'],
    [scope?.pullRequest, expected.pullRequest, 'recoveryMode.scope.pullRequest'],
    [scope?.repository, expected.repository, 'recoveryMode.scope.repository'],
    [approval?.authority, 'owner-approved-AKS', 'recoveryMode.approval.authority'],
    [approval?.canonicalRecordId, expected.approvalRecord, 'recoveryMode.approval.canonicalRecordId'],
  ];
  for (const [actual, wanted, label] of checks) {
    if (actual !== wanted) throw new Error(`${label} is outside the owner-approved Cloudflare recovery exception`);
  }
  requireString(approval?.canonicalUrl, 'recoveryMode.approval.canonicalUrl');
  if (!approval.canonicalUrl.includes(expected.approvalRecord)) {
    throw new Error('recoveryMode.approval.canonicalUrl must identify the approved canonical D&U record');
  }
  if (expected.approvalDeltaRow !== undefined) {
    const approvalScope = [
      [receipt.source?.pullRequest, expected.pullRequest, 'source.pullRequest'],
      [receipt.source?.ref, `refs/pull/${expected.pullRequest}/head`, 'source.ref'],
      [approval?.deltaInboxSpreadsheetId, expected.approvalDeltaSpreadsheetId, 'recoveryMode.approval.deltaInboxSpreadsheetId'],
      [approval?.deltaInboxRow, expected.approvalDeltaRow, 'recoveryMode.approval.deltaInboxRow'],
      [approval?.ownerResponse, expected.approvalResponse, 'recoveryMode.approval.ownerResponse'],
    ];
    for (const [actual, wanted, label] of approvalScope) {
      if (actual !== wanted) throw new Error(`${label} is outside the owner-approved PR #156 recovery exception`);
    }
    const approvalEvidence = approval.evidence;
    requireString(approvalEvidence?.url, 'recoveryMode.approval.evidence.url');
    if (!approvalEvidence.url.includes(`${expected.approvalDeltaSpreadsheetId}`) ||
        !approvalEvidence.url.includes(`range=A${expected.approvalDeltaRow}:K${expected.approvalDeltaRow}`)) {
      throw new Error('PR #156 approval evidence URL must identify the approved Delta Inbox row');
    }
  }
  return true;
}

async function verifyNativeRollbackEvidence(receipt, root, baseline, { phase }) {
  const recovery = receipt.recoveryMode;
  const provider = recovery.providerVerification;
  requireString(provider?.verifiedAt, 'recoveryMode.providerVerification.verifiedAt');
  if (!Number.isFinite(Date.parse(provider.verifiedAt))) throw new Error('recoveryMode.providerVerification.verifiedAt must be an ISO date');
  const expected = DYE_STUDIO_NATIVE_ROLLBACK_SCOPES[receipt.releaseId];
  const expectedDeployment = expected.baselineDeployment ?? baseline.identity;
  const expectedCommit = expected.baselineCommit ?? baseline.sourceCommit;
  if (expected.maxProviderEvidenceAgeMs && phase === 'admission') {
    const age = Date.now() - Date.parse(provider.verifiedAt);
    if (age < -30_000 || age > expected.maxProviderEvidenceAgeMs) {
      throw new Error('PR #156 provider baseline verification must be current within the admission window');
    }
  }
  const bindings = [
    [provider.provider, 'cloudflare-pages', 'provider'],
    [provider.project, expected.project, 'project'],
    [provider.target, expected.target, 'target'],
    [provider.environment, 'production', 'environment'],
    [provider.deploymentId, expectedDeployment, 'deploymentId'],
    [provider.sourceCommit, expectedCommit, 'sourceCommit'],
    [baseline.identity, expectedDeployment, 'baseline.identity'],
    [baseline.sourceCommit, expectedCommit, 'baseline.sourceCommit'],
  ];
  for (const [actual, wanted, label] of bindings) {
    if (actual !== wanted) throw new Error(`recoveryMode.providerVerification.${label} does not match the approved production baseline`);
  }
  if (provider.deploymentStatus !== 'success' || provider.rollbackEligible !== true ||
      provider.authenticatedProviderReadback !== true) {
    throw new Error('Cloudflare provider readback must confirm an authenticated successful rollback-eligible production deployment');
  }
  requireString(provider.immutableUrl, 'recoveryMode.providerVerification.immutableUrl');
  if (!/^https:\/\/[a-f0-9-]+\.local-roots\.pages\.dev\/?$/i.test(provider.immutableUrl)) {
    throw new Error('recoveryMode.providerVerification.immutableUrl must be an immutable local-roots Pages URL');
  }
  requireString(provider.restoreProcedure, 'recoveryMode.providerVerification.restoreProcedure');
  requireString(provider.rollbackInstructions, 'recoveryMode.providerVerification.rollbackInstructions');
  if (!/rollback/i.test(provider.rollbackInstructions)) throw new Error('provider rollback instructions must describe the rollback operation');
  const evidence = await verifyFile(root, provider.evidence, 'recoveryMode.providerVerification.evidence');
  let record;
  try { record = JSON.parse(await readFile(path.resolve(root, provider.evidence.path), 'utf8')); }
  catch { throw new Error('recoveryMode.providerVerification.evidence must be valid JSON'); }
  if (record.provider !== 'cloudflare-pages' || record.project !== expected.project || record.target !== expected.target ||
      record.deploymentId !== expectedDeployment || record.sourceCommit !== expectedCommit ||
      record.deploymentStatus !== 'success' || record.rollbackEligible !== true ||
      record.authenticatedProviderReadback !== true || record.immutableUrl !== provider.immutableUrl ||
      (expected.maxProviderEvidenceAgeMs && record.verifiedAt !== provider.verifiedAt)) {
    throw new Error('provider evidence file does not prove the approved Cloudflare production rollback target');
  }
  requireString(provider.evidence.driveFileId, 'recoveryMode.providerVerification.evidence.driveFileId');
  requireString(provider.evidence.driveUrl, 'recoveryMode.providerVerification.evidence.driveUrl');
  if (provider.evidence.downloadBackVerified !== true) throw new Error('provider evidence durable download-back verification is required');
  const downloaded = await verifyFile(root, provider.evidence.downloadBack, 'recoveryMode.providerVerification.evidence.downloadBack');
  if (path.resolve(root, provider.evidence.downloadBack.path) === path.resolve(root, provider.evidence.path)) {
    throw new Error('provider verification evidence download-back must be a separate downloaded file');
  }
  if (downloaded.sha256 !== evidence.sha256 || downloaded.bytes !== evidence.bytes) {
    throw new Error('provider verification evidence download-back must byte-match the archived evidence');
  }
  return { sha256: evidence.sha256, bytes: evidence.bytes };
}

async function verifyPR156PublicAssetEvidence(receipt, root, baseline) {
  const evidence = baseline.publicAssetEvidence;
  const source = await verifyFile(root, evidence, 'baseline.publicAssetEvidence');
  requireString(evidence?.driveFileId, 'baseline.publicAssetEvidence.driveFileId');
  requireString(evidence?.driveUrl, 'baseline.publicAssetEvidence.driveUrl');
  if (evidence.downloadBackVerified !== true) throw new Error('baseline.publicAssetEvidence.downloadBackVerified must be true');
  const recovered = await verifyFile(root, evidence.downloadBack, 'baseline.publicAssetEvidence.downloadBack');
  if (path.resolve(root, evidence.downloadBack.path) === path.resolve(root, evidence.path) ||
      recovered.sha256 !== source.sha256 || recovered.bytes !== source.bytes) {
    throw new Error('baseline public asset evidence download-back must be a separate byte-identical copy');
  }
  let record;
  try { record = JSON.parse(await readFile(path.resolve(root, evidence.path), 'utf8')); }
  catch { throw new Error('baseline public asset evidence must be valid JSON'); }
  const configuration = baseline.providerManagedConfiguration;
  if (record.provider !== 'cloudflare-pages' || record.project !== 'local-roots' || record.target !== 'production' ||
      record.deploymentId !== baseline.identity || record.sourceCommit !== baseline.sourceCommit ||
      !Number.isInteger(record.publicAssetCount) || record.publicAssetCount <= 0 ||
      !Number.isInteger(record.matchedPublicAssetCount) || record.matchedPublicAssetCount !== record.publicAssetCount ||
      evidence.publicAssetCount !== record.publicAssetCount ||
      !Array.isArray(record.publicAssets) || record.publicAssets.length !== record.publicAssetCount ||
      record.publicAssets.some(asset => !asset.path || !Number.isInteger(asset.bytes) || asset.bytes <= 0 || !SHA256.test(asset.sha256))) {
    throw new Error('public asset readback must bind the baseline deployment and prove every listed public asset hash and size');
  }
  if (!configuration || configuration.disposition !== 'provider-managed-not-public' || configuration.publicByteIdentity !== 'unavailable' ||
      configuration.publiclyReadable !== false || !Array.isArray(configuration.paths) ||
      JSON.stringify(configuration.paths) !== JSON.stringify(DYE_STUDIO_PR156_PROVIDER_CONFIG_PATHS) ||
      record.providerManagedConfiguration?.disposition !== configuration.disposition ||
      JSON.stringify(record.providerManagedConfiguration?.paths) !== JSON.stringify(configuration.paths) ||
      record.providerManagedConfiguration?.publicByteIdentity !== 'unavailable') {
    throw new Error('PR #156 must distinguish Cloudflare-managed configuration from public assets without claiming unavailable bytes');
  }
  return { sha256: source.sha256, bytes: source.bytes, publicAssetCount: record.publicAssetCount };
}

async function verifyPR156CandidateManifest(receipt, root, packageFile) {
  const manifestRef = receipt.packageManifest;
  const manifestFile = await verifyFile(root, manifestRef, 'packageManifest');
  requireString(manifestRef?.driveFileId, 'packageManifest.driveFileId');
  requireString(manifestRef?.driveUrl, 'packageManifest.driveUrl');
  if (manifestRef.downloadBackVerified !== true) throw new Error('packageManifest.downloadBackVerified must be true');
  const recovered = await verifyFile(root, manifestRef.downloadBack, 'packageManifest.downloadBack');
  if (path.resolve(root, manifestRef.downloadBack.path) === path.resolve(root, manifestRef.path) ||
      recovered.sha256 !== manifestFile.sha256 || recovered.bytes !== manifestFile.bytes) {
    throw new Error('candidate manifest download-back must be a separate byte-identical copy');
  }
  let manifest;
  try { manifest = JSON.parse(await readFile(path.resolve(root, manifestRef.path), 'utf8')); }
  catch { throw new Error('candidate manifest must be valid JSON'); }
  if (manifest.releaseId !== receipt.releaseId || manifest.repository !== receipt.source.repository ||
      manifest.sourceCommit !== receipt.source.commit || manifest.archiveSha256 !== packageFile.sha256 ||
      manifest.archiveBytes !== packageFile.bytes || manifest.command !== receipt.build.command ||
      manifest.toolchain !== receipt.build.toolchain || manifest.lockfileSha256 !== receipt.build.lockfileSha256 ||
      !Array.isArray(manifest.files) || manifest.files.length === 0 || manifest.fileCount !== manifest.files.length) {
    throw new Error('candidate manifest must bind the exact release, source, build and archived candidate bytes');
  }
  const seen = new Set();
  for (const [i, file] of manifest.files.entries()) {
    requireString(file?.path, `packageManifest.files[${i}].path`);
    if (path.isAbsolute(file.path) || file.path.split(/[\\/]/).includes('..') || seen.has(file.path)) {
      throw new Error(`packageManifest.files[${i}].path must be a unique relative path`);
    }
    seen.add(file.path);
    if (!Number.isInteger(file.bytes) || file.bytes < 0) throw new Error(`packageManifest.files[${i}].bytes must be a non-negative integer`);
    requireSha(file.sha256, `packageManifest.files[${i}].sha256`);
  }
  let archiveEntries;
  try {
    archiveEntries = execFileSync('unzip', ['-Z1', path.resolve(root, receipt.package.path)], { encoding: 'utf8' })
      .split(/\r?\n/).filter(name => name && !name.endsWith('/'));
  } catch {
    throw new Error('PR #156 candidate package must be a readable ZIP archive');
  }
  if (archiveEntries.length !== seen.size || new Set(archiveEntries).size !== archiveEntries.length ||
      archiveEntries.some(name => !seen.has(name))) {
    throw new Error('candidate manifest file list must exactly match the candidate archive entries');
  }
  for (const file of manifest.files) {
    let content;
    try { content = execFileSync('unzip', ['-p', path.resolve(root, receipt.package.path), file.path], { maxBuffer: 128 * 1024 * 1024 }); }
    catch { throw new Error(`candidate archive is missing manifest file ${file.path}`); }
    if (content.length !== file.bytes || createHash('sha256').update(content).digest('hex') !== file.sha256) {
      throw new Error(`candidate archive file ${file.path} does not match its manifest hash and size`);
    }
  }
  return { sha256: manifestFile.sha256, bytes: manifestFile.bytes };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJson(value[key])]));
  }
  return value;
}

function sameCanonical(a, b) {
  return JSON.stringify(canonicalJson(a)) === JSON.stringify(canonicalJson(b));
}

async function verifyAdmissionEvidence(root, receipt, expectedManifest, { required }) {
  if (!receipt.admission) {
    if (required) throw new Error('admission manifest reference and durable recovery are required');
    return null;
  }
  const expectedPath = `${receipt.releaseId}.admission.json`;
  if (receipt.admission.path !== expectedPath) {
    throw new Error(`admission.path must be ${expectedPath}`);
  }
  const admission = await verifyFile(root, receipt.admission, 'admission');
  let admitted;
  try {
    admitted = JSON.parse(await readFile(path.resolve(root, receipt.admission.path), 'utf8'));
  } catch {
    throw new Error('admission manifest must be valid JSON');
  }
  if (!sameCanonical(admitted, expectedManifest)) {
    throw new Error('receipt does not match the pre-mutation admission manifest');
  }
  requireString(receipt.admission.driveFileId, 'admission.driveFileId');
  requireString(receipt.admission.driveUrl, 'admission.driveUrl');
  if (receipt.admission.downloadBackVerified !== true) {
    throw new Error('admission.downloadBackVerified must be true');
  }
  const recovered = await verifyFile(root, receipt.admission.downloadBack, 'admission.downloadBack');
  if (recovered.sha256 !== admission.sha256 || recovered.bytes !== admission.bytes) {
    throw new Error('admission.downloadBack must byte-match the admission manifest');
  }
  return admission;
}

async function checkedFile(root, relativePath, label) {
  requireString(relativePath, `${label}.path`);
  if (path.isAbsolute(relativePath)) throw new Error(`${label}.path must be relative to the receipt root`);
  const rootReal = await realpath(root);
  const candidate = path.resolve(rootReal, relativePath);
  if (!candidate.startsWith(`${rootReal}${path.sep}`)) throw new Error(`${label}.path escapes the receipt root`);
  const actual = await realpath(candidate);
  if (!actual.startsWith(`${rootReal}${path.sep}`)) throw new Error(`${label}.path resolves outside the receipt root`);
  const info = await stat(actual);
  if (!info.isFile()) throw new Error(`${label}.path is not a file`);
  const bytes = await readFile(actual);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function verifyFile(root, entry, label) {
  if (!entry || typeof entry !== 'object') throw new Error(`${label} is required`);
  const actual = await checkedFile(root, entry.path, label);
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes !== actual.bytes) {
    throw new Error(`${label}.bytes does not match the file (${actual.bytes})`);
  }
  requireSha(entry.sha256, `${label}.sha256`);
  if (entry.sha256.toLowerCase() !== actual.sha256) throw new Error(`${label}.sha256 does not match the file`);
  return actual;
}

export async function validateReleaseReceipt(receipt, root, { phase = 'closeout' } = {}) {
  if (!['admission', 'closeout'].includes(phase)) throw new Error('phase must be admission or closeout');
  if (!receipt || typeof receipt !== 'object' || receipt.schemaVersion !== 1) {
    throw new Error('schemaVersion must be 1');
  }
  requireString(receipt.releaseId, 'releaseId');

  const source = receipt.source;
  requireString(source?.repository, 'source.repository');
  requireString(source?.ref, 'source.ref');
  if (!/^[a-f0-9]{40}$/i.test(source?.commit ?? '')) throw new Error('source.commit must be a full 40-character commit SHA');
  if (receipt.recoveryMode && receipt.recoveryMode.mode !== 'cloudflare-pages-native-rollback' && receipt.recoveryMode.mode !== 'exact-artifact') {
    throw new Error(`unsupported recovery mode: ${receipt.recoveryMode.mode}`);
  }

  const build = receipt.build;
  requireString(build?.command, 'build.command');
  requireString(build?.toolchain, 'build.toolchain');
  requireSha(build?.lockfileSha256, 'build.lockfileSha256');
  if (!Array.isArray(build?.inputs) || build.inputs.length === 0) {
    throw new Error('build.inputs must list the pinned build inputs');
  }
  for (const [index, input] of build.inputs.entries()) {
    requireString(input?.name, `build.inputs[${index}].name`);
    requireString(input?.version, `build.inputs[${index}].version`);
    requireSha(input?.sha256, `build.inputs[${index}].sha256`);
  }

  const baseline = receipt.baseline;
  requireString(baseline?.provider, 'baseline.provider');
  requireString(baseline?.target, 'baseline.target');
  requireString(baseline?.authorityUrl, 'baseline.authorityUrl');
  requireString(baseline?.identity, 'baseline.identity');
  if (baseline?.sourceCommit !== 'unknown' && !/^[a-f0-9]{40}$/i.test(baseline?.sourceCommit ?? '')) {
    throw new Error('baseline.sourceCommit must be a full 40-character commit SHA or unknown');
  }
  requireString(baseline?.sourceEvidence, 'baseline.sourceEvidence');
  requireString(baseline?.acceptance, 'baseline.acceptance');
  const nativeRollback = requireDyeStudioNativeRollbackScope(receipt);
  const baselineArtifact = baseline?.artifact;
  let baselineArtifactFile;
  let providerEvidence;
  let publicAssetEvidence;
  let baselineRollback;
  if (nativeRollback) {
    if (baselineArtifact?.disposition !== 'provider-native-rollback') {
      throw new Error('Cloudflare exception requires baseline.artifact.disposition=provider-native-rollback');
    }
    if (baselineArtifact.sha256 !== undefined || baselineArtifact.bytes !== undefined || baselineArtifact.path !== undefined) {
      throw new Error('native rollback mode cannot claim unavailable historical deployment artifact bytes');
    }
    providerEvidence = await verifyNativeRollbackEvidence(receipt, root, baseline, { phase });
    if (receipt.releaseId === DYE_STUDIO_PR156_RELEASE_ID) {
      publicAssetEvidence = await verifyPR156PublicAssetEvidence(receipt, root, baseline);
    }
    baselineArtifactFile = providerEvidence;
    requireString(baselineArtifact.driveFileId, 'baseline.artifact.driveFileId');
    requireString(baselineArtifact.driveUrl, 'baseline.artifact.driveUrl');
    if (baselineArtifact.driveFileId !== receipt.recoveryMode.providerVerification.evidence.driveFileId) {
      throw new Error('baseline provider evidence reference must match providerVerification.evidence');
    }
    baselineRollback = baseline.rollback;
    if (baselineRollback?.mode !== 'cloudflare-pages-native-rollback' ||
        baselineRollback.deploymentId !== baseline.identity ||
        baselineRollback.sourceCommit !== baseline.sourceCommit ||
        baselineRollback.rollbackEligible !== true) {
      throw new Error('baseline.rollback must identify the verified immutable Cloudflare native rollback target');
    }
    requireString(baselineRollback.restoreProcedure, 'baseline.rollback.restoreProcedure');
    if (baselineRollback.restoreProcedure !== receipt.recoveryMode.providerVerification.restoreProcedure) {
      throw new Error('baseline native restore procedure must match the verified provider procedure');
    }
  } else {
    if (baselineArtifact?.disposition !== 'recovered') {
      throw new Error('baseline.artifact must be recovered before mutation');
    }
    requireString(baselineArtifact.driveFileId, 'baseline.artifact.driveFileId');
    baselineArtifactFile = await verifyFile(root, baselineArtifact, 'baseline.artifact');
    const identityEvidenceFile = await verifyFile(root, baseline?.identityEvidence, 'baseline.identityEvidence');
    let identityEvidence;
    try {
      identityEvidence = JSON.parse(await readFile(path.resolve(root, baseline.identityEvidence.path), 'utf8'));
    } catch {
      throw new Error('baseline.identityEvidence must be valid JSON');
    }
    if (identityEvidence.identity !== baseline.identity || identityEvidence.sourceCommit !== baseline.sourceCommit ||
        identityEvidence.artifactSha256 !== baselineArtifactFile.sha256 || identityEvidence.artifactBytes !== baselineArtifactFile.bytes) {
      throw new Error('baseline.identityEvidence must bind baseline identity/source commit to the recovered artifact hash and size');
    }
    baselineRollback = baseline?.rollback;
    requireString(baselineRollback?.driveFileId, 'baseline.rollback.driveFileId');
    requireString(baselineRollback?.baselineIdentity, 'baseline.rollback.baselineIdentity');
    if (baselineRollback.baselineIdentity !== baseline.identity) {
      throw new Error('baseline.rollback.baselineIdentity must match baseline.identity');
    }
    requireString(baselineRollback?.restoreProcedure, 'baseline.rollback.restoreProcedure');
    await verifyFile(root, baselineRollback, 'baseline.rollback');
    if (baselineRollback.downloadBackVerified !== true) {
      throw new Error('baseline.rollback.downloadBackVerified must be true');
    }
    const baselineRollbackCopy = await verifyFile(root, baselineRollback.downloadBack, 'baseline.rollback.downloadBack');
    if (baselineRollbackCopy.sha256 !== baselineRollback.sha256 || baselineRollbackCopy.bytes !== baselineRollback.bytes) {
      throw new Error('baseline.rollback.downloadBack must byte-match the baseline rollback');
    }
  }
  const packageFile = await verifyFile(root, receipt.package, 'package');
  const candidateManifest = receipt.releaseId === DYE_STUDIO_PR156_RELEASE_ID
    ? await verifyPR156CandidateManifest(receipt, root, packageFile)
    : null;
  if (!nativeRollback && packageFile.sha256 === baselineRollback.sha256) {
    throw new Error('candidate package must be distinct from the baseline rollback package');
  }
  if (!nativeRollback && (baselineArtifactFile.sha256 !== baselineRollback.sha256 || baselineArtifactFile.bytes !== baselineRollback.bytes)) {
    throw new Error('baseline rollback must byte-match the recovered current baseline artifact');
  }
  let rollbackFile;
  if (nativeRollback) {
    if (receipt.rollback?.mode !== 'cloudflare-pages-native-rollback' ||
        receipt.rollback.deploymentId !== baseline.identity || receipt.rollback.sourceCommit !== baseline.sourceCommit ||
        receipt.rollback.rollbackEligible !== true) {
      throw new Error('rollback must bind the same verified immutable Cloudflare production deployment');
    }
    rollbackFile = { sha256: providerEvidence.sha256, bytes: providerEvidence.bytes };
  } else {
    rollbackFile = await verifyFile(root, receipt.rollback?.artifact, 'rollback.artifact');
    if (rollbackFile.sha256 === packageFile.sha256) throw new Error('rollback artifact must differ from the candidate package');
    if (rollbackFile.sha256 !== baselineRollback.sha256 || rollbackFile.bytes !== baselineRollback.bytes) {
      throw new Error('rollback artifact must match the recovered current baseline rollback');
    }
  }
  requireString(receipt.rollback?.restoreProcedure, 'rollback.restoreProcedure');
  const rollbackRecovery = receipt.rollback?.recovery;
  if (nativeRollback) {
    if (receipt.rollback.restoreProcedure !== receipt.recoveryMode.providerVerification.restoreProcedure) {
      throw new Error('rollback.restoreProcedure must match the verified Cloudflare restore procedure');
    }
  } else {
    requireString(rollbackRecovery?.driveFileId, 'rollback.recovery.driveFileId');
    requireString(rollbackRecovery?.driveUrl, 'rollback.recovery.driveUrl');
    if (rollbackRecovery.downloadBackVerified !== true) throw new Error('rollback.recovery.downloadBackVerified must be true');
    const recoveredRollback = await verifyFile(root, rollbackRecovery.downloadBack, 'rollback.recovery.downloadBack');
    if (recoveredRollback.sha256 !== rollbackFile.sha256 || recoveredRollback.bytes !== rollbackFile.bytes) {
      throw new Error('rollback.recovery.downloadBack must byte-match the rollback artifact');
    }
  }

  const deployment = receipt.deployment;
  requireString(deployment?.provider, 'deployment.provider');
  requireString(deployment?.target, 'deployment.target');
  if (deployment.provider !== baseline.provider || deployment.target !== baseline.target) {
    throw new Error('deployment provider/target must match the current baseline provider/target');
  }
  if (phase === 'admission') {
    if (deployment?.identityBridge !== undefined) {
      throw new Error('deployment.identityBridge is closeout-only and cannot alter admission');
    }
    requireString(deployment?.plannedRoute, 'deployment.plannedRoute');
    requireString(deployment?.restoreProcedure, 'deployment.restoreProcedure');
    if (deployment.restoreProcedure !== receipt.rollback.restoreProcedure) {
      throw new Error('deployment.restoreProcedure must exactly match rollback.restoreProcedure');
    }
  } else {
    requireString(deployment?.versionId, 'deployment.versionId');
    requireString(deployment?.installedAt, 'deployment.installedAt');
    const deploymentReceipt = await verifyFile(root, deployment?.receipt, 'deployment.receipt');
    requireString(deployment.receipt.driveFileId, 'deployment.receipt.driveFileId');
    requireString(deployment.receipt.driveUrl, 'deployment.receipt.driveUrl');
    if (deployment.receipt.downloadBackVerified !== true) {
      throw new Error('deployment.receipt.downloadBackVerified must be true');
    }
    const deploymentReceiptCopy = await verifyFile(root, deployment.receipt.downloadBack, 'deployment.receipt.downloadBack');
    if (deploymentReceiptCopy.sha256 !== deploymentReceipt.sha256 || deploymentReceiptCopy.bytes !== deploymentReceipt.bytes) {
      throw new Error('deployment.receipt.downloadBack must byte-match the deployment receipt');
    }
    await verifyFile(root, deployment?.readback, 'deployment.readback');
    let readback;
    try {
      readback = JSON.parse(await readFile(path.resolve(root, deployment.readback.path), 'utf8'));
    } catch {
      throw new Error('deployment.readback must be valid JSON');
    }
    if (readback.provider !== deployment.provider || readback.target !== deployment.target ||
        readback.versionId !== deployment.versionId ||
        readback.packageSha256 !== packageFile.sha256 || readback.baselineIdentity !== baseline.identity) {
      throw new Error('deployment.readback must bind provider/target/version, source commit, candidate hash, and prior baseline');
    }
    if (nativeRollback && receipt.releaseId === DYE_STUDIO_PR156_RELEASE_ID) {
      await verifyPR156SquashMergeIdentity(receipt, root, readback);
    } else if (readback.sourceCommit !== receipt.source.commit) {
      throw new Error('deployment.readback sourceCommit must equal the admitted source commit');
    }
  }

  const acceptance = receipt.acceptance;
  requireString(acceptance?.scope, 'acceptance.scope');
  if (!Array.isArray(acceptance?.criteria) || acceptance.criteria.length === 0) {
    throw new Error('acceptance.criteria must contain separately tracked criteria');
  }
  for (const [index, criterion] of acceptance.criteria.entries()) {
    requireString(criterion?.id, `acceptance.criteria[${index}].id`);
    if (phase === 'admission') {
      if (criterion.status !== 'PENDING') throw new Error(`acceptance.criteria[${index}] must be PENDING before mutation`);
      requireString(criterion.description, `acceptance.criteria[${index}].description`);
      requireString(criterion.method, `acceptance.criteria[${index}].method`);
      requireString(criterion.expectedOutcome, `acceptance.criteria[${index}].expectedOutcome`);
    } else {
      if (criterion.status !== 'PASS') throw new Error(`acceptance.criteria[${index}] is not PASS`);
      if (!Array.isArray(criterion.evidence) || criterion.evidence.length === 0 || criterion.evidence.some(v => typeof v !== 'string' || !v.trim())) {
        throw new Error(`acceptance.criteria[${index}].evidence must include evidence references`);
      }
    }
  }

  const recovery = receipt.recovery;
  requireString(recovery?.driveFileId, 'recovery.driveFileId');
  requireString(recovery?.driveUrl, 'recovery.driveUrl');
  if (recovery.downloadBackVerified !== true) throw new Error('recovery.downloadBackVerified must be true');
  const recovered = await verifyFile(root, recovery?.downloadBack, 'recovery.downloadBack');
  if (recovered.sha256 !== packageFile.sha256 || recovered.bytes !== packageFile.bytes) {
    throw new Error('recovery.downloadBack must byte-match the release package');
  }
  if (nativeRollback && path.resolve(root, recovery.downloadBack.path) === path.resolve(root, receipt.package.path)) {
    throw new Error('candidate package recovery must be a separate downloaded-back file');
  }
  if (rollbackFile.bytes <= 0) throw new Error('rollback artifact is empty');

  const admissionManifest = admissionProjection(receipt, {
    baselineSha256: nativeRollback ? null : baselineArtifactFile.sha256,
    baselineBytes: nativeRollback ? null : baselineArtifactFile.bytes,
    packageSha256: packageFile.sha256,
    packageBytes: packageFile.bytes,
    rollbackSha256: rollbackFile.sha256,
    rollbackBytes: rollbackFile.bytes,
    providerEvidenceSha256: providerEvidence?.sha256,
    publicAssetEvidenceSha256: publicAssetEvidence?.sha256,
    candidateManifestSha256: candidateManifest?.sha256,
  });
  const admission = await verifyAdmissionEvidence(root, receipt, admissionManifest, { required: phase === 'closeout' });
  if (phase === 'closeout') {
    if (deployment.restoreProcedure !== receipt.rollback.restoreProcedure ||
        deployment.plannedRoute !== admissionManifest.deployment.plannedRoute) {
      throw new Error('closeout deployment plan differs from the admitted route or restore procedure');
    }
    return { phase, releaseId: receipt.releaseId, packageSha256: packageFile.sha256, rollbackSha256: rollbackFile.sha256, admissionSha256: admission.sha256 };
  }
  return { phase, releaseId: receipt.releaseId, packageSha256: packageFile.sha256, rollbackSha256: rollbackFile.sha256, admissionManifest };
}

async function main() {
  const args = process.argv.slice(2);
  let phase = 'closeout';
  if (args[0] === '--help' || args[0] === '-h') {
    process.stdout.write('usage: npm run release:admit -- <receipt.json> <receipt-root>\n       npm run release:verify -- <receipt.json> <receipt-root>\n');
    return;
  }
  if (args[0] === '--phase') throw new Error('use npm run release:admit or release:verify; --phase is not accepted');
  if (args.length !== 2 || args.some(arg => arg.startsWith('-'))) {
    throw new Error('usage: npm run release:admit -- <receipt.json> <receipt-root>\n       npm run release:verify -- <receipt.json> <receipt-root>');
  }
  if (process.env.npm_lifecycle_event === 'release:admit') phase = 'admission';
  const [receiptPath, rootArg = '.'] = args;
  const root = path.resolve(rootArg);
  const receipt = JSON.parse(await readFile(path.resolve(receiptPath), 'utf8'));
  const result = await validateReleaseReceipt(receipt, root, { phase });
  if (phase === 'admission') {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(result.releaseId)) throw new Error('releaseId must use only letters, numbers, dot, underscore, or hyphen');
    const manifestPath = path.join(root, `${result.releaseId}.admission.json`);
    const bytes = Buffer.from(`${JSON.stringify(result.admissionManifest, null, 2)}\n`);
    try {
      await writeFile(manifestPath, bytes, { flag: 'wx' });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await readFile(manifestPath);
      if (!existing.equals(bytes)) throw new Error('existing admission manifest differs; do not overwrite it');
    }
    const manifestSha256 = createHash('sha256').update(bytes).digest('hex');
    if (!receipt.admission) {
      process.stdout.write(`PENDING durable admission copy ${result.releaseId} manifest=${manifestPath} manifestBytes=${bytes.length} manifestSha256=${manifestSha256}; upload it, download it back, add receipt.admission metadata, then rerun before mutation\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`PASS admission ${result.releaseId} package=${result.packageSha256} rollback=${result.rollbackSha256} manifest=${manifestPath} manifestBytes=${bytes.length} manifestSha256=${manifestSha256}\n`);
  } else {
    process.stdout.write(`PASS closeout ${result.releaseId} package=${result.packageSha256} rollback=${result.rollbackSha256} admissionSha256=${result.admissionSha256}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`FAIL ${error.message}\n`);
    process.exitCode = 1;
  });
}
