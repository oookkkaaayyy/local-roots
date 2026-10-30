#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA256 = /^[a-f0-9]{64}$/i;

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a 64-character SHA-256`);
}

function admissionProjection(receipt, hashes = {}) {
  return {
    schemaVersion: 1,
    releaseId: receipt.releaseId,
    source: receipt.source,
    build: receipt.build,
    baseline: {
      provider: receipt.baseline.provider,
      target: receipt.baseline.target,
      identity: receipt.baseline.identity,
      sourceCommit: receipt.baseline.sourceCommit,
      sourceEvidence: receipt.baseline.sourceEvidence,
      artifactDriveFileId: receipt.baseline.artifact.driveFileId,
      artifactSha256: hashes.baselineSha256 ?? receipt.baseline.artifact.sha256,
      artifactBytes: hashes.baselineBytes ?? receipt.baseline.artifact.bytes,
      identityEvidenceSha256: receipt.baseline.identityEvidence.sha256,
      rollbackSha256: hashes.rollbackSha256 ?? receipt.rollback.artifact.sha256,
      rollbackBytes: hashes.rollbackBytes ?? receipt.rollback.artifact.bytes,
      rollbackDriveFileId: receipt.rollback.recovery.driveFileId,
      rollbackDriveUrl: receipt.rollback.recovery.driveUrl,
      rollbackDownloadBackSha256: receipt.rollback.recovery.downloadBack.sha256,
      rollbackDownloadBackBytes: receipt.rollback.recovery.downloadBack.bytes,
      restoreProcedure: receipt.rollback.restoreProcedure,
    },
    package: {
      sha256: hashes.packageSha256 ?? receipt.package.sha256,
      bytes: hashes.packageBytes ?? receipt.package.bytes,
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
  await assertIndependentRecovery(root, receipt.admission, receipt.admission.downloadBack, 'admission.downloadBack');
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

// A byte-equal recovery claim must refer to a separate local file. This does
// not replace an authenticated Drive download, which the release executor must
// independently perform, but prevents accidental self-referential receipts.
async function assertIndependentRecovery(root, original, recovered, label) {
  const from = await realpath(path.resolve(root, original.path));
  const to = await realpath(path.resolve(root, recovered.path));
  const first = await stat(from);
  const second = await stat(to);
  if (from === to || (first.dev === second.dev && first.ino === second.ino)) {
    throw new Error(`${label} must refer to an independent recovered copy, not the source file`);
  }
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
  const baselineArtifact = baseline?.artifact;
  if (baselineArtifact?.disposition !== 'recovered') {
    throw new Error('baseline.artifact must be recovered before mutation');
  }
  requireString(baselineArtifact.driveFileId, 'baseline.artifact.driveFileId');
  const baselineArtifactFile = await verifyFile(root, baselineArtifact, 'baseline.artifact');
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
  const baselineRollback = baseline?.rollback;
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
  await assertIndependentRecovery(root, baselineRollback, baselineRollback.downloadBack, 'baseline.rollback.downloadBack');
  if (baselineRollbackCopy.sha256 !== baselineRollback.sha256 || baselineRollbackCopy.bytes !== baselineRollback.bytes) {
    throw new Error('baseline.rollback.downloadBack must byte-match the baseline rollback');
  }
  const packageFile = await verifyFile(root, receipt.package, 'package');
  if (packageFile.sha256 === baselineRollback.sha256) {
    throw new Error('candidate package must be distinct from the baseline rollback package');
  }
  if (baselineArtifactFile.sha256 !== baselineRollback.sha256 || baselineArtifactFile.bytes !== baselineRollback.bytes) {
    throw new Error('baseline rollback must byte-match the recovered current baseline artifact');
  }
  const rollbackFile = await verifyFile(root, receipt.rollback?.artifact, 'rollback.artifact');
  if (rollbackFile.sha256 === packageFile.sha256) throw new Error('rollback artifact must differ from the candidate package');
  if (rollbackFile.sha256 !== baselineRollback.sha256 || rollbackFile.bytes !== baselineRollback.bytes) {
    throw new Error('rollback artifact must match the recovered current baseline rollback');
  }
  requireString(receipt.rollback?.restoreProcedure, 'rollback.restoreProcedure');
  const rollbackRecovery = receipt.rollback?.recovery;
  requireString(rollbackRecovery?.driveFileId, 'rollback.recovery.driveFileId');
  requireString(rollbackRecovery?.driveUrl, 'rollback.recovery.driveUrl');
  if (rollbackRecovery.downloadBackVerified !== true) throw new Error('rollback.recovery.downloadBackVerified must be true');
  const recoveredRollback = await verifyFile(root, rollbackRecovery.downloadBack, 'rollback.recovery.downloadBack');
  await assertIndependentRecovery(root, receipt.rollback.artifact, rollbackRecovery.downloadBack, 'rollback.recovery.downloadBack');
  if (recoveredRollback.sha256 !== rollbackFile.sha256 || recoveredRollback.bytes !== rollbackFile.bytes) {
    throw new Error('rollback.recovery.downloadBack must byte-match the rollback artifact');
  }

  const deployment = receipt.deployment;
  requireString(deployment?.provider, 'deployment.provider');
  requireString(deployment?.target, 'deployment.target');
  if (deployment.provider !== baseline.provider || deployment.target !== baseline.target) {
    throw new Error('deployment provider/target must match the current baseline provider/target');
  }
  if (phase === 'admission') {
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
    await assertIndependentRecovery(root, deployment.receipt, deployment.receipt.downloadBack, 'deployment.receipt.downloadBack');
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
        readback.versionId !== deployment.versionId || readback.sourceCommit !== receipt.source.commit ||
        readback.packageSha256 !== packageFile.sha256 || readback.baselineIdentity !== baseline.identity) {
      throw new Error('deployment.readback must bind provider/target/version, source commit, candidate hash, and prior baseline');
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
  await assertIndependentRecovery(root, receipt.package, recovery.downloadBack, 'recovery.downloadBack');
  if (recovered.sha256 !== packageFile.sha256 || recovered.bytes !== packageFile.bytes) {
    throw new Error('recovery.downloadBack must byte-match the release package');
  }
  if (rollbackFile.bytes <= 0) throw new Error('rollback artifact is empty');

  const admissionManifest = admissionProjection(receipt, {
    baselineSha256: baselineArtifactFile.sha256,
    baselineBytes: baselineArtifactFile.bytes,
    packageSha256: packageFile.sha256,
    packageBytes: packageFile.bytes,
    rollbackSha256: rollbackFile.sha256,
    rollbackBytes: rollbackFile.bytes,
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
