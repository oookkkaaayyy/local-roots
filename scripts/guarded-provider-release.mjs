#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateReleaseReceipt } from './validate-release-receipt.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const equalBytes = (a, b) => Buffer.from(a).equals(Buffer.from(b));

function assertProviderBaseline(observed, receipt) {
  const baseline = receipt.baseline;
  const artifact = baseline.artifact;
  if (!observed || observed.provider !== baseline.provider || observed.target !== baseline.target ||
      observed.identity !== baseline.identity || observed.sourceCommit !== baseline.sourceCommit ||
      observed.artifactSha256 !== artifact.sha256 || observed.artifactBytes !== artifact.bytes) {
    throw new Error('fresh provider readback does not exactly match the admitted installed baseline');
  }
}

function assertSourceWitness(observed, receipt) {
  if (!observed || observed.commit !== receipt.source.commit || observed.ref !== receipt.source.ref ||
      observed.tree !== receipt.source.tree || observed.clean !== true) {
    throw new Error('fresh source readback is missing, stale, dirty, or does not match the admitted commit, ref, and tree');
  }
}

async function durableRoundTrip(store, key, bytes) {
  const stored = await store.putOnce(key, Buffer.from(bytes));
  if (!stored?.id || !stored?.url) throw new Error(`${key} durable upload did not return a stable file identity`);
  const downloaded = Buffer.from(await store.download(stored.id));
  if (!equalBytes(bytes, downloaded)) throw new Error(`${key} durable download-back is not byte-identical`);
  return { ...stored, bytes: downloaded.length, sha256: sha(downloaded), downloaded };
}

/**
 * The only repository-owned provider mutation entry point. Provider and durable
 * store adapters are explicit dependencies so the same gate is exercised by
 * offline fakes and any future authenticated CLI adapter. External dashboards
 * remain outside this interlock.
 */
export async function runGuardedProviderRelease({ receipt, receiptPath, root, provider, durableStore, oneTimeLedger, sourceControl, approved = false }) {
  if (!provider || !durableStore || !oneTimeLedger?.claim || !oneTimeLedger?.close || !oneTimeLedger?.fail || !sourceControl?.read) throw new Error('provider, durableStore, one-time ledger, and source-control adapters are required');
  if (approved !== true) throw new Error('owner release authorization is required before provider mutation');
  assertSourceWitness(await sourceControl.read(), receipt);
  const preflight = structuredClone(receipt);
  delete preflight.admission;
  delete preflight.deployment.versionId;
  delete preflight.deployment.installedAt;
  delete preflight.deployment.receipt;
  delete preflight.deployment.readback;
  preflight.acceptance.criteria = preflight.acceptance.criteria.map(({ id, description, method, expectedOutcome }) => ({
    id, description, method, expectedOutcome, status: 'PENDING',
  }));

  const admissionResult = await validateReleaseReceipt(preflight, root, { phase: 'admission' });
  const manifestBytes = Buffer.from(`${JSON.stringify(admissionResult.admissionManifest, null, 2)}\n`);
  const manifestHash = sha(manifestBytes);
  const manifestPath = path.join(root, `${receipt.releaseId}.admission.json`);
  try { await writeFile(manifestPath, manifestBytes, { flag: 'wx' }); }
  catch (error) {
    if (error?.code !== 'EEXIST' || !equalBytes(await readFile(manifestPath), manifestBytes)) {
      throw new Error('admission manifest already exists with different bytes; refusing replay or replacement');
    }
  }
  const manifestObject = await durableRoundTrip(durableStore, `${receipt.releaseId}.admission.json`, manifestBytes);
  const manifestDownloadPath = path.join(root, `${receipt.releaseId}.admission.download.json`);
  await writeFile(manifestDownloadPath, manifestObject.downloaded, { flag: 'wx' });
  receipt.admission = {
    path: path.basename(manifestPath), bytes: manifestBytes.length, sha256: manifestHash,
    driveFileId: manifestObject.id, driveUrl: manifestObject.url, downloadBackVerified: true,
    downloadBack: { path: path.basename(manifestDownloadPath), bytes: manifestObject.bytes, sha256: manifestObject.sha256 },
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  const admitted = await validateReleaseReceipt(receipt, root, { phase: 'admission' });
  if (sha(manifestBytes) !== manifestHash) throw new Error('admission manifest changed before use');

  assertSourceWitness(await sourceControl.read(), receipt);
  if (!await oneTimeLedger.claim(receipt.releaseId, manifestHash)) throw new Error('admission manifest has already been consumed');
  const beforeMutation = await provider.readTarget({ provider: receipt.baseline.provider, target: receipt.baseline.target });
  assertProviderBaseline(beforeMutation, receipt);
  let mutationAttempted = false;
  try {
  mutationAttempted = true;
  // This is the sole mutation call in the repository-owned route.
  const mutation = await provider.mutate({
    route: admitted.admissionManifest.deployment.plannedRoute,
    candidatePath: path.resolve(root, receipt.package.path),
    candidateSha256: admitted.packageSha256,
    rollbackPath: path.resolve(root, receipt.rollback.artifact.path),
    rollbackSha256: admitted.rollbackSha256,
    sourceCommit: receipt.source.commit,
    target: receipt.deployment.target,
  });
  if (!mutation?.versionId || !mutation?.installedAt) throw new Error('provider mutation did not return an immutable version and install time');

  const postReadback = await provider.readTarget({ provider: receipt.baseline.provider, target: receipt.baseline.target });
  if (postReadback?.identity !== mutation.versionId || postReadback?.sourceCommit !== receipt.source.commit ||
      postReadback?.artifactSha256 !== admitted.packageSha256 || postReadback?.artifactBytes !== receipt.package.bytes) {
    throw new Error('post-mutation provider readback does not match the admitted candidate');
  }
  const readback = {
    provider: receipt.deployment.provider, target: receipt.deployment.target,
    versionId: mutation.versionId, sourceCommit: receipt.source.commit,
    packageSha256: admitted.packageSha256, packageBytes: receipt.package.bytes,
    baselineIdentity: receipt.baseline.identity, admissionManifestSha256: manifestHash,
  };
  const readbackBytes = Buffer.from(`${JSON.stringify(readback, null, 2)}\n`);
  const readbackPath = path.join(root, `${receipt.releaseId}.provider-readback.json`);
  await writeFile(readbackPath, readbackBytes, { flag: 'wx' });
  const closeoutBytes = Buffer.from(`${JSON.stringify({ releaseId: receipt.releaseId, admissionManifestSha256: manifestHash, readback }, null, 2)}\n`);
  const closeoutObject = await durableRoundTrip(durableStore, `${receipt.releaseId}.closeout.json`, closeoutBytes);
  const closeoutDownloadPath = path.join(root, `${receipt.releaseId}.closeout.download.json`);
  await writeFile(closeoutDownloadPath, closeoutObject.downloaded, { flag: 'wx' });
  const closeoutReceiptPath = path.join(root, `${receipt.releaseId}.provider-receipt.json`);
  await writeFile(closeoutReceiptPath, closeoutObject.downloaded, { flag: 'wx' });
  receipt.deployment = {
    ...receipt.deployment, versionId: mutation.versionId, installedAt: mutation.installedAt,
    receipt: {
      path: path.basename(closeoutReceiptPath), bytes: closeoutObject.bytes, sha256: closeoutObject.sha256,
      driveFileId: closeoutObject.id, driveUrl: closeoutObject.url, downloadBackVerified: true,
      downloadBack: { path: path.basename(closeoutDownloadPath), bytes: closeoutObject.bytes, sha256: closeoutObject.sha256 },
    },
    readback: { path: path.basename(readbackPath), bytes: readbackBytes.length, sha256: sha(readbackBytes) },
  };
  for (const criterion of receipt.acceptance.criteria) {
    const evidence = await provider.verifyAcceptance(criterion, postReadback);
    if (evidence?.pass !== true || !evidence.reference) throw new Error(`post-install acceptance failed: ${criterion.id}`);
    criterion.status = 'PASS';
    criterion.evidence = [evidence.reference];
  }
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  const verified = await validateReleaseReceipt(receipt, root, { phase: 'closeout' });
  await oneTimeLedger.close(receipt.releaseId, manifestHash, closeoutObject.sha256);
  return { admissionManifestSha256: manifestHash, closeoutSha256: closeoutObject.sha256, ...verified };
  } catch (error) {
    let observed;
    try { observed = await provider.readTarget({ provider: receipt.baseline.provider, target: receipt.baseline.target }); }
    catch { throw new Error(`provider route failed after mutation was armed; current target is unknown and requires exact manual recovery: ${error.message}`); }
    const unchanged = observed?.identity === receipt.baseline.identity &&
      observed?.artifactSha256 === receipt.baseline.artifact.sha256 && observed?.artifactBytes === receipt.baseline.artifact.bytes;
    if (!unchanged) {
      if (typeof provider.restore !== 'function') {
        throw new Error(`provider route failed and target changed; exact rollback adapter is unavailable: ${error.message}`);
      }
      await provider.restore({
        target: receipt.deployment.target,
        rollbackPath: path.resolve(root, receipt.rollback.artifact.path),
        rollbackSha256: receipt.rollback.artifact.sha256,
        restoreProcedure: receipt.rollback.restoreProcedure,
        observedIdentity: observed?.identity,
      });
      const restored = await provider.readTarget({ provider: receipt.baseline.provider, target: receipt.baseline.target });
      assertProviderBaseline(restored, receipt);
      const rollbackBytes = Buffer.from(`${JSON.stringify({
        releaseId: receipt.releaseId, admissionManifestSha256: manifestHash,
        target: receipt.deployment.target, restoredIdentity: restored.identity,
        rollbackSha256: receipt.rollback.artifact.sha256, disposition: 'RESTORED_BASELINE',
      }, null, 2)}\n`);
      const rollbackReceipt = await durableRoundTrip(durableStore, `${receipt.releaseId}.rollback.json`, rollbackBytes);
      await oneTimeLedger.fail(receipt.releaseId, manifestHash, { disposition: 'RESTORED_BASELINE', rollbackReceiptSha256: rollbackReceipt.sha256 });
      throw new Error(`provider route failed; exact baseline rollback was independently read back and retained (${rollbackReceipt.id}): ${error.message}`);
    }
    if (mutationAttempted) await oneTimeLedger.fail(receipt.releaseId, manifestHash, { disposition: 'NO_TARGET_CHANGE', observedIdentity: observed.identity });
    throw error;
  }
}

async function main() {
  const [receiptPathArg, rootArg, adapterArg] = process.argv.slice(2);
  if (!receiptPathArg || !rootArg || !adapterArg || process.argv.length !== 5) {
    throw new Error('usage: node scripts/guarded-provider-release.mjs <receipt.json> <receipt-root> <adapter.mjs>');
  }
  if (process.env.HBNF_RELEASE_AUTHORIZED !== 'yes') throw new Error('HBNF_RELEASE_AUTHORIZED=yes is required; no provider action was attempted');
  const receiptPath = path.resolve(receiptPathArg), root = path.resolve(rootArg);
  const adapterUrl = pathToFileURL(path.resolve(adapterArg));
  const adapter = await import(adapterUrl.href);
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const sourceControl = {
    async read() {
      const git = args => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim();
      return {
        commit: git(['rev-parse', 'HEAD']),
        ref: git(['branch', '--show-current']),
        tree: git(['rev-parse', 'HEAD^{tree}']),
        clean: git(['status', '--porcelain']).length === 0,
      };
    },
  };
  const result = await runGuardedProviderRelease({
    receipt, receiptPath, root,
    provider: adapter.provider,
    durableStore: adapter.durableStore,
    oneTimeLedger: adapter.oneTimeLedger,
    sourceControl,
    approved: true,
  });
  process.stdout.write(`PASS guarded closeout ${result.releaseId} candidate=${result.packageSha256} admission=${result.admissionManifestSha256}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`FAIL ${error.message}\n`); process.exitCode = 1; });
}
