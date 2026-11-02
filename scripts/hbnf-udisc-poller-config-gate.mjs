import { createHash } from 'node:crypto';

export const POLLER_RELEASE = Object.freeze({
  releaseId: 'hbnf-udisc-nov3-poller-disable-restore-20261102-8fa942b4',
  sourceCommit: '44612c09677f59b84bece7de655af7bb011b51e7',
  accountId: 'e3bc6b78f1104fa0c2a01245084594cf',
  worker: 'hbnf',
  workerVersion: '48ffa87e-3c83-46d0-a6ca-db7bf0b064e6',
  workerSha256: '0b51b7ecdfeced01cc73bee96dff8085f2f1f9529df48223fa4f7185c7d15b4c',
  workerBytes: 5015699,
  workerDriveId: '1UUDgrd5udbV7ZX0BG-GwSAT6FRLpd69v',
  candidateSha256: '8fa942b400adbc657e11f171299696a0123d264d2fec1547fead506248f3aade',
  candidateBytes: 3310990,
  publicAssetsSha256: 'a9193a13a3b2d0e67f103424ded6e410e95df0be7181b473dfc628f136899b02',
  candidateDriveId: '1c8_41rkcEB9elO-W0mk2uEuQ5jdWSSCy',
  supabaseProject: 'phcpbvuqibyarpfrftgx',
  supabaseUpdatedAt: '2026-11-01T22:33:40.372437Z',
  supabaseStateFingerprint: 'ec15053c2bde3c28fa252ee804c07623',
  supabaseStateBytes: 2554262,
  supabaseEvidenceDriveId: '1O5sKF03z72jdGAo14yuV6mRbKTh7Iu0V',
  supabaseEvidenceSha256: '4ad947436b7fceb531b1c0c451b7c36aef5c38d16f5cce1bbe634b81fdacfd96',
  eventDate: '2026-11-03',
  eventId: 'hb-glow-doubles-tAP8Y5',
  windowStart: '2026-11-04T01:30:00.000Z',
  windowEnd: '2026-11-04T07:30:00.000Z',
  approvalBinding: 'UDISC_GLOW_ACCESS_APPROVED',
});

const fail = message => { throw new Error(message); };
const sha = value => createHash('sha256').update(value).digest('hex');
const isSha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const stable = value => JSON.stringify(canonical(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const byteEqual = (a, b) => Buffer.from(a).equals(Buffer.from(b));

export function createPollerManifest({ releaseId = POLLER_RELEASE.releaseId } = {}) {
  if (!/^[a-z0-9][a-z0-9._-]{20,90}$/.test(releaseId)) fail('releaseId must be a unique, non-replayable identifier');
  return {
    schemaVersion: 1,
    format: 'hbnf-udisc-poller-disable-restore-v1',
    releaseId,
    status: 'PENDING',
    oneTime: true,
    source: { repository: 'oookkkaaayyy/local-roots', commit: POLLER_RELEASE.sourceCommit },
    target: {
      provider: 'cloudflare-worker', accountId: POLLER_RELEASE.accountId,
      worker: POLLER_RELEASE.worker, route: 'hbnightflyers.com',
    },
    baseline: {
      workerVersion: POLLER_RELEASE.workerVersion,
      trafficPercent: 100,
      package: { sha256: POLLER_RELEASE.workerSha256, bytes: POLLER_RELEASE.workerBytes, driveFileId: POLLER_RELEASE.workerDriveId },
      publicAssetsSha256: POLLER_RELEASE.publicAssetsSha256,
      approvalValue: 'true', cron: ['* * * * *'], secretNamePresent: 'SUPABASE_SERVICE_ROLE_KEY',
      supabase: {
        projectId: POLLER_RELEASE.supabaseProject,
        updatedAt: POLLER_RELEASE.supabaseUpdatedAt,
        stateFingerprint: POLLER_RELEASE.supabaseStateFingerprint,
        stateBytes: POLLER_RELEASE.supabaseStateBytes,
        evidenceDriveFileId: POLLER_RELEASE.supabaseEvidenceDriveId,
        evidenceSha256: POLLER_RELEASE.supabaseEvidenceSha256,
        eventDate: POLLER_RELEASE.eventDate,
        eventId: POLLER_RELEASE.eventId,
        windowStart: POLLER_RELEASE.windowStart,
        windowEnd: POLLER_RELEASE.windowEnd,
      },
    },
    candidate: {
      sha256: POLLER_RELEASE.candidateSha256,
      bytes: POLLER_RELEASE.candidateBytes,
      driveFileId: POLLER_RELEASE.candidateDriveId,
      configDiff: { path: 'wrangler.jsonc', key: `vars.${POLLER_RELEASE.approvalBinding}`, from: 'true', to: 'false' },
      packageDiff: ['PACKAGE_MANIFEST.json', 'wrangler.jsonc'],
      applicationAssetsUnchanged: 46,
      publicAssetsSha256: POLLER_RELEASE.publicAssetsSha256,
    },
    operations: [
      {
        id: 'disable',
        order: 1,
        precondition: 'Fresh Worker version, package hash, approval value, Cron/routes/secrets, and Supabase updated_at/state fingerprint all equal baseline.',
        route: 'wrangler versions upload <exact-candidate-package> --strict --keep-vars; then wrangler versions deploy <returned-version-id>@100% --name hbnf --yes',
        expected: 'New immutable version at 100%; UDISC_GLOW_ACCESS_APPROVED=false; all 46 assets, route, Cron, secret presence, and Supabase state unchanged.',
      },
      {
        id: 'restore',
        order: 2,
        notBefore: POLLER_RELEASE.windowEnd,
        precondition: 'Fresh readback shows exactly the version installed by disable, false approval, unchanged Cron/routes/assets, and unchanged Supabase fingerprint.',
        route: `wrangler versions deploy ${POLLER_RELEASE.workerVersion}@100% --name hbnf --yes`,
        expected: 'Exact original Worker version/package at 100%; approval true; original Cron/routes/assets/secrets and Supabase state restored byte/identity exactly.',
      },
    ],
    rollback: {
      workerVersion: POLLER_RELEASE.workerVersion,
      packageSha256: POLLER_RELEASE.workerSha256,
      packageBytes: POLLER_RELEASE.workerBytes,
      artifactDriveFileId: POLLER_RELEASE.workerDriveId,
      restoreRoute: `wrangler versions deploy ${POLLER_RELEASE.workerVersion}@100% --name hbnf --yes`,
      exactPriorApprovalValue: 'true',
      exactPriorCron: ['* * * * *'],
      exactPriorRoute: 'hbnightflyers.com',
      databaseMutation: 'none',
    },
    admission: {
      decision: 'PENDING',
      requiredDecision: 'ADMISSION_PASS for this exact releaseId and canonical manifest SHA-256',
      requireDriveDownloadBack: true,
      requireNewExecutionClaim: true,
      oldOct30ClaimReusable: false,
    },
    postWriteReadback: [
      'Cloudflare deployment version ID and 100% traffic independently read back.',
      'Exact approval binding value independently read back; secret value is never read or recorded.',
      'All 46 public asset hashes, domain route, and one-minute Cron match the manifest.',
      'Supabase project ID, league_state updated_at and state fingerprint match baseline; no DB mutation.',
      'Same-manifest closeout and exact rollback identities are stored and independently downloaded back byte-for-byte.',
    ],
  };
}

export function manifestBytes(manifest) { return jsonBytes(manifest); }
export function manifestSha256(manifest) { return sha(manifestBytes(manifest)); }

export function validatePollerManifest(manifest, bytes, { candidateBytes, rollbackBytes } = {}) {
  if (!manifest || manifest.format !== 'hbnf-udisc-poller-disable-restore-v1' || manifest.schemaVersion !== 1 || manifest.status !== 'PENDING' || manifest.oneTime !== true) {
    fail('manifest is missing, non-pending, or not one-time');
  }
  if (!Buffer.isBuffer(bytes) || !byteEqual(bytes, manifestBytes(manifest))) fail('manifest bytes are not the canonical manifest');
  if (candidateBytes && (sha(candidateBytes) !== manifest.candidate.sha256 || candidateBytes.length !== manifest.candidate.bytes)) fail('candidate bytes/hash mismatch');
  if (rollbackBytes && (sha(rollbackBytes) !== manifest.rollback.packageSha256 || rollbackBytes.length !== manifest.rollback.packageBytes)) fail('rollback bytes/hash mismatch');
  if (!isSha(manifest.candidate?.sha256) || manifest.candidate.sha256 !== POLLER_RELEASE.candidateSha256 ||
      manifest.candidate.bytes !== POLLER_RELEASE.candidateBytes || manifest.candidate.driveFileId !== POLLER_RELEASE.candidateDriveId ||
      manifest.baseline?.workerVersion !== POLLER_RELEASE.workerVersion || manifest.baseline?.package?.sha256 !== POLLER_RELEASE.workerSha256 ||
      manifest.baseline?.package?.bytes !== POLLER_RELEASE.workerBytes || manifest.baseline?.package?.driveFileId !== POLLER_RELEASE.workerDriveId ||
      manifest.rollback?.workerVersion !== manifest.baseline.workerVersion || manifest.rollback.packageSha256 !== manifest.baseline.package.sha256 ||
      manifest.rollback.packageBytes !== POLLER_RELEASE.workerBytes || manifest.rollback.artifactDriveFileId !== POLLER_RELEASE.workerDriveId ||
      manifest.target?.accountId !== POLLER_RELEASE.accountId || manifest.target?.worker !== POLLER_RELEASE.worker ||
      manifest.baseline?.supabase?.projectId !== POLLER_RELEASE.supabaseProject ||
      manifest.baseline?.supabase?.updatedAt !== POLLER_RELEASE.supabaseUpdatedAt ||
      manifest.baseline?.supabase?.stateFingerprint !== POLLER_RELEASE.supabaseStateFingerprint ||
      manifest.baseline?.supabase?.evidenceDriveFileId !== POLLER_RELEASE.supabaseEvidenceDriveId ||
      manifest.baseline?.supabase?.evidenceSha256 !== POLLER_RELEASE.supabaseEvidenceSha256 ||
      manifest.baseline?.publicAssetsSha256 !== POLLER_RELEASE.publicAssetsSha256 ||
      manifest.candidate?.publicAssetsSha256 !== POLLER_RELEASE.publicAssetsSha256 ||
      manifest.candidate?.applicationAssetsUnchanged !== 46) fail('manifest baseline or durable artifact binding is stale or internally inconsistent');
  if (manifest.candidate.configDiff?.key !== `vars.${POLLER_RELEASE.approvalBinding}` || manifest.candidate.configDiff.from !== 'true' || manifest.candidate.configDiff.to !== 'false') fail('manifest config diff is not the exact poller-disable change');
  if (manifest.operations?.[0]?.order !== 1 || manifest.operations?.[1]?.order !== 2 || manifest.operations?.[1]?.notBefore !== POLLER_RELEASE.windowEnd) fail('manifest operation order or restore window changed');
  return { releaseId: manifest.releaseId, manifestSha256: sha(bytes), candidateSha256: manifest.candidate.sha256, rollbackSha256: manifest.rollback.packageSha256 };
}

function assertAdmitted(manifest, bytes, decision, { manifestDownloadedBack, candidateDownloadedBack, rollbackDownloadedBack }) {
  const digest = sha(bytes);
  if (decision?.status !== 'ADMISSION_PASS' || decision.releaseId !== manifest.releaseId || decision.manifestSha256 !== digest ||
      decision.candidateSha256 !== manifest.candidate.sha256 || decision.rollbackSha256 !== manifest.rollback.packageSha256 ||
      decision.baselineWorkerVersion !== manifest.baseline.workerVersion ||
      decision.supabaseStateFingerprint !== manifest.baseline.supabase.stateFingerprint ||
      decision.downloadBackVerified !== true || manifestDownloadedBack !== true || candidateDownloadedBack !== true || rollbackDownloadedBack !== true) {
    fail('this exact manifest lacks ADMISSION_PASS and independent durable download-back evidence');
  }
}

function assertSupabaseBaseline(observed, manifest) {
  const expected = manifest.baseline.supabase;
  if (!observed || observed.projectId !== expected.projectId || observed.updatedAt !== expected.updatedAt || observed.stateFingerprint !== expected.stateFingerprint) {
    fail('Supabase revision/state fingerprint is stale or changed');
  }
}

function assertBeforeEventWindow(observed) {
  const serverTime = Date.parse(observed?.serverTime || '');
  if (!Number.isFinite(serverTime) || serverTime >= Date.parse(POLLER_RELEASE.windowStart)) {
    fail('disable must be verified before the Nov 3 UDisc event window begins');
  }
}

function assertAfterEventWindow(observed) {
  const serverTime = Date.parse(observed?.serverTime || '');
  if (!Number.isFinite(serverTime) || serverTime < Date.parse(POLLER_RELEASE.windowEnd)) {
    fail('restore is not permitted until the Nov 3 UDisc event window has ended');
  }
}

function assertWorkerBaseline(observed, manifest) {
  if (!observed || observed.worker !== manifest.target.worker || observed.accountId !== manifest.target.accountId ||
      observed.versionId !== manifest.baseline.workerVersion || observed.trafficPercent !== 100 ||
      observed.packageSha256 !== manifest.baseline.package.sha256 || observed.packageBytes !== manifest.baseline.package.bytes ||
      observed.vars?.[POLLER_RELEASE.approvalBinding] !== 'true' || observed.cron?.join('\0') !== '* * * * *' ||
      observed.route !== manifest.target.route || observed.secretNamePresent !== 'SUPABASE_SERVICE_ROLE_KEY' ||
      observed.publicAssetCount !== 46 || observed.publicAssetsSha256 !== manifest.candidate.publicAssetsSha256) {
    fail('Cloudflare Worker version, bytes, config, route, Cron, secret presence, or asset baseline changed');
  }
  assertSupabaseBaseline(observed.supabase, manifest);
  assertBeforeEventWindow(observed);
}

function assertDisabledReadback(observed, manifest, installedVersionId) {
  if (!observed || observed.versionId !== installedVersionId || observed.trafficPercent !== 100 ||
      observed.packageSha256 !== manifest.candidate.sha256 || observed.packageBytes !== manifest.candidate.bytes ||
      observed.vars?.[POLLER_RELEASE.approvalBinding] !== 'false' ||
      observed.cron?.join('\0') !== '* * * * *' || observed.route !== manifest.target.route ||
      observed.secretNamePresent !== 'SUPABASE_SERVICE_ROLE_KEY' || observed.publicAssetCount !== 46 ||
      observed.publicAssetsSha256 !== manifest.candidate.publicAssetsSha256) fail('disabled Worker readback does not match exact candidate and preserved service configuration');
  assertSupabaseBaseline(observed.supabase, manifest);
}

async function durable(store, key, bytes) {
  const stored = await store.putOnce(key, Buffer.from(bytes));
  if (!stored?.id) fail(`durable ${key} upload returned no stable identity`);
  const downloaded = Buffer.from(await store.download(stored.id));
  if (!byteEqual(bytes, downloaded)) fail(`durable ${key} download-back differs`);
  return { id: stored.id, bytes: downloaded.length, sha256: sha(downloaded) };
}

/**
 * The route intentionally accepts only injected providers. No live adapter is
 * enabled by this module. The external release runner must supply the actual
 * authenticated Cloudflare/Supabase/Drive/GitHub adapters and exact ADMISSION_PASS.
 */
export async function disablePoller({ manifest, bytes, decision, provider, store, claims, downloadBack = {} }) {
  validatePollerManifest(manifest, bytes);
  assertAdmitted(manifest, bytes, decision, downloadBack);
  if (!provider?.readTarget || !provider?.uploadVersion || !provider?.deployVersion || !provider?.readVersion ||
      !store?.putOnce || !store?.download || !claims?.claimOnce) fail('authenticated provider, durable store, or one-time claim adapter is missing');
  const hash = sha(bytes);
  assertWorkerBaseline(await provider.readTarget(), manifest);
  if (!await claims.claimOnce(manifest.releaseId, 'disable', hash)) fail('disable manifest claim was already consumed');
  assertWorkerBaseline(await provider.readTarget(), manifest);
  const stage = await provider.uploadVersion({ artifact: manifest.candidate, sha256: manifest.candidate.sha256, keepVars: true, strict: true });
  if (!stage?.versionId) fail('Cloudflare did not return a new immutable version ID');
  const staged = await provider.readVersion(stage.versionId);
  if (staged?.versionId !== stage.versionId || staged?.packageSha256 !== manifest.candidate.sha256 ||
      staged?.vars?.[POLLER_RELEASE.approvalBinding] !== 'false' || staged?.publicAssetsSha256 !== manifest.candidate.publicAssetsSha256 ||
      staged?.secretNamePresent !== 'SUPABASE_SERVICE_ROLE_KEY') fail('staged immutable version failed exact config/asset/secret-name readback');
  assertWorkerBaseline(await provider.readTarget(), manifest);
  const deploy = await provider.deployVersion({ versionId: stage.versionId, trafficPercent: 100 });
  const post = await provider.readTarget();
  assertDisabledReadback(post, manifest, stage.versionId);
  if (deploy?.versionId !== stage.versionId) fail('deployment acknowledgement did not match staged version');
  const receipt = {
    format: 'hbnf-udisc-poller-disable-closeout-v1', releaseId: manifest.releaseId,
    manifestSha256: hash, installedVersionId: stage.versionId, candidateSha256: manifest.candidate.sha256,
    baselineVersionId: manifest.baseline.workerVersion, supabaseStateFingerprint: manifest.baseline.supabase.stateFingerprint,
    status: 'DISABLED_READBACK_PASS',
  };
  const receiptDurability = await durable(store, `${manifest.releaseId}.disable-closeout.json`, jsonBytes(receipt));
  return { ...receipt, receiptDurability };
}

/** Restore the exact original immutable version, only after the Nov 3 window. */
export async function restorePoller({ manifest, bytes, decision, disableReceipt, provider, store, claims, downloadBack = {} }) {
  validatePollerManifest(manifest, bytes);
  assertAdmitted(manifest, bytes, decision, downloadBack);
  if (!disableReceipt || disableReceipt.status !== 'DISABLED_READBACK_PASS' || disableReceipt.releaseId !== manifest.releaseId ||
      disableReceipt.manifestSha256 !== sha(bytes) || !disableReceipt.installedVersionId) fail('exact successful disable receipt is required for restoration');
  if (!provider?.readTarget || !provider?.deployVersion || !store?.putOnce || !store?.download || !claims?.claimOnce) fail('authenticated provider, durable store, or one-time restore claim adapter is missing');
  const current = await provider.readTarget();
  assertAfterEventWindow(current);
  assertDisabledReadback(current, manifest, disableReceipt.installedVersionId);
  if (!await claims.claimOnce(manifest.releaseId, 'restore', sha(bytes))) fail('restore manifest claim was already consumed');
  const again = await provider.readTarget();
  assertAfterEventWindow(again);
  assertDisabledReadback(again, manifest, disableReceipt.installedVersionId);
  const deploy = await provider.deployVersion({ versionId: manifest.rollback.workerVersion, trafficPercent: 100 });
  const restored = await provider.readTarget();
  if (deploy?.versionId !== manifest.rollback.workerVersion || restored?.versionId !== manifest.rollback.workerVersion ||
      restored?.trafficPercent !== 100 || restored?.packageSha256 !== manifest.rollback.packageSha256 ||
      restored?.packageBytes !== manifest.rollback.packageBytes || restored?.vars?.[POLLER_RELEASE.approvalBinding] !== 'true' ||
      restored?.cron?.join('\0') !== '* * * * *' || restored?.route !== manifest.target.route ||
      restored?.secretNamePresent !== 'SUPABASE_SERVICE_ROLE_KEY' || restored?.publicAssetCount !== 46 ||
      restored?.publicAssetsSha256 !== manifest.candidate.publicAssetsSha256) fail('exact original Worker configuration and package were not independently restored');
  assertSupabaseBaseline(restored.supabase, manifest);
  const receipt = {
    format: 'hbnf-udisc-poller-restore-closeout-v1', releaseId: manifest.releaseId,
    manifestSha256: sha(bytes), restoredVersionId: restored.versionId,
    rollbackSha256: manifest.rollback.packageSha256, supabaseStateFingerprint: manifest.baseline.supabase.stateFingerprint,
    status: 'EXACT_RESTORE_READBACK_PASS',
  };
  const receiptDurability = await durable(store, `${manifest.releaseId}.restore-closeout.json`, jsonBytes(receipt));
  return { ...receipt, receiptDurability };
}
