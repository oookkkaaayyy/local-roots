#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA256 = /^[a-f0-9]{64}$/i;

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a 64-character SHA-256`);
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

export async function validateReleaseReceipt(receipt, root) {
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

  const packageFile = await verifyFile(root, receipt.package, 'package');
  const rollbackFile = await verifyFile(root, receipt.rollback?.artifact, 'rollback.artifact');
  requireString(receipt.rollback?.restoreProcedure, 'rollback.restoreProcedure');
  const rollbackRecovery = receipt.rollback?.recovery;
  requireString(rollbackRecovery?.driveFileId, 'rollback.recovery.driveFileId');
  requireString(rollbackRecovery?.driveUrl, 'rollback.recovery.driveUrl');
  if (rollbackRecovery.downloadBackVerified !== true) throw new Error('rollback.recovery.downloadBackVerified must be true');
  const recoveredRollback = await verifyFile(root, rollbackRecovery.downloadBack, 'rollback.recovery.downloadBack');
  if (recoveredRollback.sha256 !== rollbackFile.sha256 || recoveredRollback.bytes !== rollbackFile.bytes) {
    throw new Error('rollback.recovery.downloadBack must byte-match the rollback artifact');
  }

  const deployment = receipt.deployment;
  requireString(deployment?.provider, 'deployment.provider');
  requireString(deployment?.target, 'deployment.target');
  requireString(deployment?.versionId, 'deployment.versionId');
  requireString(deployment?.installedAt, 'deployment.installedAt');
  await verifyFile(root, deployment?.receipt, 'deployment.receipt');

  const acceptance = receipt.acceptance;
  if (!Array.isArray(acceptance?.criteria) || acceptance.criteria.length === 0) {
    throw new Error('acceptance.criteria must contain separately tracked criteria');
  }
  for (const [index, criterion] of acceptance.criteria.entries()) {
    requireString(criterion?.id, `acceptance.criteria[${index}].id`);
    if (criterion.status !== 'PASS') throw new Error(`acceptance.criteria[${index}] is not PASS`);
    if (!Array.isArray(criterion.evidence) || criterion.evidence.length === 0 || criterion.evidence.some(v => typeof v !== 'string' || !v.trim())) {
      throw new Error(`acceptance.criteria[${index}].evidence must include evidence references`);
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
  if (rollbackFile.bytes <= 0) throw new Error('rollback artifact is empty');

  return { releaseId: receipt.releaseId, packageSha256: packageFile.sha256, rollbackSha256: rollbackFile.sha256 };
}

async function main() {
  const [receiptPath, rootArg = '.'] = process.argv.slice(2);
  if (receiptPath === '--help' || receiptPath === '-h') {
    process.stdout.write('usage: npm run release:verify -- <receipt.json> [receipt-root]\n');
    return;
  }
  if (!receiptPath) throw new Error('usage: node scripts/validate-release-receipt.mjs <receipt.json> [receipt-root]');
  const root = path.resolve(rootArg);
  const receipt = JSON.parse(await readFile(path.resolve(receiptPath), 'utf8'));
  const result = await validateReleaseReceipt(receipt, root);
  process.stdout.write(`PASS ${result.releaseId} package=${result.packageSha256} rollback=${result.rollbackSha256}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`FAIL ${error.message}\n`);
    process.exitCode = 1;
  });
}
