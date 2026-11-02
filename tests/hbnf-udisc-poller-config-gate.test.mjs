import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POLLER_RELEASE, createPollerManifest, disablePoller, manifestBytes,
  manifestSha256, restorePoller, validatePollerManifest,
} from '../scripts/hbnf-udisc-poller-config-gate.mjs';

const manifest = createPollerManifest({ releaseId: 'hbnf-udisc-unit-release-20261102-unique', gateSourceCommit: 'df08de4853a9ffb4c3ee87709c4d274efc7e01e6' });
const bytes = manifestBytes(manifest);
const digest = manifestSha256(manifest);
const decision = {
  status: 'ADMISSION_PASS', releaseId: manifest.releaseId, manifestSha256: digest,
  candidateSha256: manifest.candidate.sha256, rollbackSha256: manifest.rollback.packageSha256,
  gateSourceCommit: manifest.gateSourceCommit,
  baselineWorkerVersion: manifest.baseline.workerVersion,
  supabaseStateFingerprint: manifest.baseline.supabase.stateFingerprint,
  downloadBackVerified: true,
};
const downloadBack = { manifestDownloadedBack: true, candidateDownloadedBack: true, rollbackDownloadedBack: true };

function baseTarget() {
  return {
    accountId: POLLER_RELEASE.accountId, worker: POLLER_RELEASE.worker,
    versionId: POLLER_RELEASE.workerVersion, trafficPercent: 100,
    packageSha256: POLLER_RELEASE.workerSha256, packageBytes: POLLER_RELEASE.workerBytes,
    vars: { [POLLER_RELEASE.approvalBinding]: 'true' }, cron: ['* * * * *'],
    route: 'hbnightflyers.com', secretNamePresent: 'SUPABASE_SERVICE_ROLE_KEY',
    publicAssetCount: 46, publicAssetsSha256: POLLER_RELEASE.publicAssetsSha256,
    serverTime: '2026-11-04T00:00:00.000Z',
    supabase: {
      projectId: POLLER_RELEASE.supabaseProject,
      updatedAt: POLLER_RELEASE.supabaseUpdatedAt,
      stateFingerprint: POLLER_RELEASE.supabaseStateFingerprint,
    },
  };
}

function fixture({ mutateOnRead = 0, failCloseout = false } = {}) {
  const state = {
    target: baseTarget(), reads: 0, stages: 0, deployments: [],
    claims: new Set(), records: new Map(), staged: new Map(),
  };
  const store = {
    async putOnce(key, value) {
      if (failCloseout) throw new Error('Drive closeout unavailable');
      if (state.records.has(key)) throw new Error('duplicate durable key');
      const id = `drive-${state.records.size + 1}`;
      state.records.set(id, Buffer.from(value));
      return { id };
    },
    async download(id) { return Buffer.from(state.records.get(id) || []); },
  };
  const claims = {
    async claimOnce(releaseId, action, hash) {
      const key = `${releaseId}:${action}:${hash}`;
      if (state.claims.has(key)) return false;
      state.claims.add(key);
      return true;
    },
  };
  const provider = {
    async readTarget() {
      state.reads++;
      if (mutateOnRead && state.reads === mutateOnRead) {
        state.target = { ...state.target, supabase: { ...state.target.supabase, stateFingerprint: 'f'.repeat(32) } };
      }
      return structuredClone(state.target);
    },
    async uploadVersion({ artifact, sha256, keepVars, strict }) {
      state.stages++;
      assert.equal(artifact.sha256, POLLER_RELEASE.candidateSha256);
      assert.equal(sha256, POLLER_RELEASE.candidateSha256);
      assert.equal(keepVars, true);
      assert.equal(strict, true);
      const versionId = 'c103a44e-a113-4d8c-a216-01f38dcd28d1';
      state.staged.set(versionId, {
        versionId, packageSha256: POLLER_RELEASE.candidateSha256,
        vars: { [POLLER_RELEASE.approvalBinding]: 'false' },
        publicAssetsSha256: POLLER_RELEASE.publicAssetsSha256,
        secretNamePresent: 'SUPABASE_SERVICE_ROLE_KEY',
      });
      return { versionId };
    },
    async readVersion(versionId) { return structuredClone(state.staged.get(versionId)); },
    async deployVersion({ versionId, trafficPercent }) {
      assert.equal(trafficPercent, 100);
      state.deployments.push(versionId);
      if (versionId === 'c103a44e-a113-4d8c-a216-01f38dcd28d1') {
        state.target = {
          ...state.target, versionId, trafficPercent: 100,
          packageSha256: POLLER_RELEASE.candidateSha256,
          packageBytes: POLLER_RELEASE.candidateBytes,
          vars: { ...state.target.vars, [POLLER_RELEASE.approvalBinding]: 'false' },
        };
      } else if (versionId === POLLER_RELEASE.workerVersion) {
        const supabase = structuredClone(state.target.supabase);
        state.target = baseTarget();
        state.target.supabase = supabase;
        state.target.serverTime = '2026-11-04T08:00:00.000Z';
      }
      return { versionId };
    },
  };
  return { state, provider, store, claims };
}

test('manifest binds exact current Worker backup, Supabase fingerprint, config diff, and restore version', () => {
  assert.equal(manifest.status, 'PENDING');
  assert.equal(manifest.oneTime, true);
  assert.equal(manifest.baseline.workerVersion, POLLER_RELEASE.workerVersion);
  assert.equal(manifest.baseline.package.sha256, POLLER_RELEASE.workerSha256);
  assert.equal(manifest.rollback.workerVersion, POLLER_RELEASE.workerVersion);
  assert.equal(manifest.baseline.supabase.stateFingerprint, POLLER_RELEASE.supabaseStateFingerprint);
  assert.deepEqual(manifest.candidate.configDiff, {
    path: 'wrangler.jsonc', key: 'vars.UDISC_GLOW_ACCESS_APPROVED', from: 'true', to: 'false',
  });
  assert.equal(manifest.operations[1].notBefore, POLLER_RELEASE.windowEnd);
  assert.equal(validatePollerManifest(manifest, bytes).manifestSha256, digest);
  const fresh = createPollerManifest({ releaseId: 'hbnf-udisc-native-fixture-20261102-unique', gateSourceCommit: 'df08de4853a9ffb4c3ee87709c4d274efc7e01e6', supabaseBaseline: {
    projectId: POLLER_RELEASE.supabaseProject, updatedAt: '2026-11-02T16:00:00.000001Z',
    stateFingerprint: 'a'.repeat(32), stateBytes: 212, evidenceDriveFileId: 'native-fixture-snapshot',
    evidenceSha256: 'b'.repeat(64),
  } });
  assert.equal(fresh.baseline.supabase.updatedAt, '2026-11-02T16:00:00.000001Z');
  assert.equal(validatePollerManifest(fresh, manifestBytes(fresh)).manifestSha256, manifestSha256(fresh));
  assert.throws(() => createPollerManifest({ releaseId: 'hbnf-udisc-native-fixture-20261102-bad', gateSourceCommit: 'df08de4853a9ffb4c3ee87709c4d274efc7e01e6', supabaseBaseline: { ...fresh.baseline.supabase, stateFingerprint: 'not-a-fingerprint' } }), /Supabase baseline/);
});

test('stale Worker baseline fails before a claim, upload, or deployment', async () => {
  const f = fixture();
  f.state.target.versionId = 'b80b1d22-e144-4a2d-9a2a-5fdbe3af4394';
  await assert.rejects(() => disablePoller({ manifest, bytes, decision, ...f, downloadBack }), /Cloudflare Worker version/);
  assert.equal(f.state.stages, 0);
  assert.equal(f.state.deployments.length, 0);
  assert.equal(f.state.claims.size, 0);
});

test('Supabase fingerprint drift immediately before deploy prevents traffic mutation', async () => {
  const f = fixture({ mutateOnRead: 3 });
  await assert.rejects(() => disablePoller({ manifest, bytes, decision, ...f, downloadBack }), /Supabase revision\/state fingerprint/);
  assert.equal(f.state.stages, 1);
  assert.equal(f.state.deployments.length, 0);
  assert.equal(f.state.target.versionId, POLLER_RELEASE.workerVersion);
});

test('old or mismatched admission is rejected before provider access', async () => {
  const f = fixture();
  const oldDecision = { ...decision, releaseId: 'hbnf-glow-oct30-acceptance-20261030' };
  await assert.rejects(() => disablePoller({ manifest, bytes, decision: oldDecision, ...f, downloadBack }), /ADMISSION_PASS/);
  const wrongGateSource = { ...decision, gateSourceCommit: 'a'.repeat(40) };
  await assert.rejects(() => disablePoller({ manifest, bytes, decision: wrongGateSource, ...f, downloadBack }), /ADMISSION_PASS/);
  assert.equal(f.state.reads, 0);
});

test('superseded v1 manifest format cannot be replayed under the revision-bound v2 gate', () => {
  const old = { ...manifest, format: 'hbnf-udisc-poller-disable-restore-v1', schemaVersion: 1 };
  assert.throws(() => validatePollerManifest(old, manifestBytes(old)), /manifest is missing/);
});

test('replayed disable claim is rejected and never deploys twice', async () => {
  const f = fixture();
  const result = await disablePoller({ manifest, bytes, decision, ...f, downloadBack });
  assert.equal(result.status, 'DISABLED_READBACK_PASS');
  // Simulate a provider-side return to the exact baseline without clearing the
  // immutable claim; the same manifest still cannot be used a second time.
  f.state.target = baseTarget();
  await assert.rejects(() => disablePoller({ manifest, bytes, decision, ...f, downloadBack }), /claim was already consumed/);
  assert.equal(f.state.stages, 1);
  assert.deepEqual(f.state.deployments, ['c103a44e-a113-4d8c-a216-01f38dcd28d1']);
});

test('disable then restore preserves newer Supabase scoring state', async () => {
  const f = fixture();
  const disabled = await disablePoller({ manifest, bytes, decision, ...f, downloadBack });
  const disabledTarget = structuredClone(f.state.target);
  // Scoring can legitimately advance while the UDisc test-week flag is off.
  f.state.target.supabase = {
    ...f.state.target.supabase,
    updatedAt: '2026-11-04T04:12:00.000001Z',
    stateFingerprint: 'e'.repeat(32),
  };
  f.state.target.serverTime = '2026-11-04T08:00:00.000Z';
  const restored = await restorePoller({ manifest, bytes, decision, disableReceipt: disabled, ...f, downloadBack });
  assert.equal(restored.status, 'EXACT_RESTORE_READBACK_PASS');
  assert.equal(restored.restoredVersionId, POLLER_RELEASE.workerVersion);
  assert.equal(f.state.target.versionId, POLLER_RELEASE.workerVersion);
  assert.equal(f.state.target.packageSha256, POLLER_RELEASE.workerSha256);
  assert.equal(f.state.target.vars[POLLER_RELEASE.approvalBinding], 'true');
  assert.deepEqual(f.state.target.cron, ['* * * * *']);
  assert.equal(f.state.target.route, 'hbnightflyers.com');
  assert.deepEqual(f.state.deployments, ['c103a44e-a113-4d8c-a216-01f38dcd28d1', POLLER_RELEASE.workerVersion]);
  assert.equal(f.state.target.supabase.stateFingerprint, 'e'.repeat(32));
  assert.equal(restored.supabaseStateAdvancedDuringEvent, true);
  assert.equal(restored.supabaseUpdatedAt, '2026-11-04T04:12:00.000001Z');
  assert.equal(f.state.records.size, 2);
  f.state.target = { ...disabledTarget, serverTime: '2026-11-04T08:00:00.000Z' };
  await assert.rejects(() => restorePoller({ manifest, bytes, decision, disableReceipt: disabled, ...f, downloadBack }), /restore manifest claim was already consumed/);
  assert.equal(f.state.deployments.length, 2);
});

test('restore before the event window ends fails without consuming restore claim', async () => {
  const f = fixture();
  const disabled = await disablePoller({ manifest, bytes, decision, ...f, downloadBack });
  await assert.rejects(() => restorePoller({ manifest, bytes, decision, disableReceipt: disabled, ...f, downloadBack }), /not permitted until the Nov 3 UDisc event window has ended/);
  assert.deepEqual(f.state.deployments, ['c103a44e-a113-4d8c-a216-01f38dcd28d1']);
  assert.equal([...f.state.claims].some(key => key.includes(':restore:')), false);
});

test('unverified closeout does not silently re-enable the poller', async () => {
  const f = fixture({ failCloseout: true });
  await assert.rejects(() => disablePoller({ manifest, bytes, decision, ...f, downloadBack }), /Drive closeout unavailable/);
  assert.equal(f.state.target.vars[POLLER_RELEASE.approvalBinding], 'false');
  assert.equal(f.state.target.versionId, 'c103a44e-a113-4d8c-a216-01f38dcd28d1');
  assert.equal(f.state.deployments.length, 1);
});
