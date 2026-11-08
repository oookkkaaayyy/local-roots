import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCoordinatorContinuation, assessDeliveryEvidence, authorizeOperation, classifyRecovery, executeRecovery, resumeAfterContextLoss, routeReadyWork } from '../scripts/classify-delivery-recovery.mjs';

test('2: rejected upload requires a changed artifact and bounded verification before retry', () => {
  assert.equal(classifyRecovery({ operationState: 'rejected', failureClass: 'artifact-validation', priorArtifactDigest: 'a', candidateArtifactDigest: 'a' }).action, 'rebuild-correction');
  assert.equal(classifyRecovery({ operationState: 'rejected', failureClass: 'artifact-validation', priorArtifactDigest: 'a', candidateArtifactDigest: 'b', attempts: 0, maxAttempts: 2 }).action, 'verify-corrected-artifact');
  assert.equal(classifyRecovery({ operationState: 'rejected', failureClass: 'artifact-validation', priorArtifactDigest: 'a', candidateArtifactDigest: 'b', attempts: 0, maxAttempts: 2, correctedArtifactVerified: true }).action, 'inspect');
  assert.deepEqual(classifyRecovery({ operationState: 'rejected', failureClass: 'artifact-validation', priorArtifactDigest: 'a', candidateArtifactDigest: 'b', attempts: 0, maxAttempts: 2, correctedArtifactVerified: true, retrySafe: true }), { action: 'retry-operation', retry: true, reason: 'rejection and changed verified artifact establish a bounded safe retry' });
  assert.equal(classifyRecovery({ operationState: 'rejected', failureClass: 'artifact-validation', priorArtifactDigest: 'a', candidateArtifactDigest: 'b', attempts: 2, maxAttempts: 2, correctedArtifactVerified: true, retrySafe: true }).action, 'stop-retries');
});

test('3: unrelated permission denial does not block the required operation', () => {
  assert.equal(classifyRecovery({ operationState: 'rejected', failureClass: 'permission', requiredOperation: 'worker.upload', deniedOperation: 'billing.read' }).action, 'continue-independent');
  assert.equal(classifyRecovery({ operationState: 'rejected', failureClass: 'permission', requiredOperation: 'worker.upload', deniedOperation: 'worker.upload' }).action, 'blocked-required-operation');
});

test('4: ambiguous mutation requires authoritative readback before any retry', () => {
  assert.deepEqual(classifyRecovery({ operationState: 'ambiguous' }), { action: 'readback', retry: false, reason: 'mutation outcome is ambiguous; read the authoritative target before retrying' });
  assert.equal(classifyRecovery({ operationState: 'ambiguous', readbackVerified: true, readbackTargetMatches: true, readbackState: 'applied' }).action, 'continue-after-readback');
  assert.equal(classifyRecovery({ operationState: 'ambiguous', readbackVerified: true, readbackTargetMatches: true, readbackState: 'not-applied', retrySafe: true, attempts: 0, maxAttempts: 2 }).retry, true);
  assert.equal(classifyRecovery({ operationState: 'ambiguous', readbackVerified: true, readbackTargetMatches: false, readbackState: 'not-applied', retrySafe: true }).action, 'readback');
  assert.equal(classifyRecovery({ operationState: 'ambiguous', readbackVerified: true, readbackTargetMatches: true, readbackState: 'not-applied', retrySafe: true, attempts: 2, maxAttempts: 2 }).action, 'stop-retries');
  assert.equal(classifyRecovery({ operationState: 'ambiguous', readbackVerified: true, readbackTargetMatches: true, readbackState: 'unknown', retrySafe: true }).action, 'inspect');
});

test('5: historical resolution is not current proof; gather current evidence', () => {
  assert.equal(classifyRecovery({ operationState: 'rejected', failureClass: 'permission' }).action, 'gather-evidence');
  assert.equal(classifyRecovery({ historicalStatus: 'resolved', currentEvidence: 'not-checked' }).action, 'verify-current-state');
});

test('6: a prerequisite alone is not a handoff execution receipt', () => {
  assert.equal(assessDeliveryEvidence({ receivingWorker: { status: 'queued' } }).handoffExecuted, false);
});

test('7: a terminated worker counts only with an actual result to resume from', () => {
  assert.equal(assessDeliveryEvidence({ receivingWorker: { status: 'failed' } }).handoffExecuted, false);
  assert.equal(assessDeliveryEvidence({ receivingWorker: { status: 'failed', runId: 'run-17', observedBy: 'independent-run-readback', startedAt: '2026-11-06T10:00:00Z', completedAt: '2026-11-06T10:02:00Z', actualResult: 'saved checkpoint read' } }).handoffExecuted, true);
  assert.deepEqual(resumeAfterContextLoss({ authorityUrl: 'https://example.invalid/record', sourceRef: 'commit', lastVerifiedEvidence: 'CI pass', nextAction: 'inspect route' }), { action: 'resume-next-action', safe: true });
  assert.equal(resumeAfterContextLoss({ authorityUrl: 'https://example.invalid/record' }).safe, false);
});

test('8: source success cannot compensate for a missing release gate', () => {
  assert.equal(assessDeliveryEvidence({ acceptanceTarget: 'provider', checks: { sourceTests: true, providerReadback: true, releaseGate: false }, receivingWorker: { status: 'completed', actualResult: 'readback' } }).complete, false);
});

test('9: an unapproved or unmet-dependency operation is not routed', () => {
  assert.deepEqual(routeReadyWork([{ id: 'a', status: 'ready', authorized: false, dependenciesMet: true }, { id: 'b', status: 'ready', authorized: true, dependenciesMet: false }]), []);
  assert.equal(authorizeOperation({ provider: 'cloudflare', target: 'prod', operation: 'deploy' }, { authorized: true, provider: 'cloudflare', target: 'prod', operations: ['read'] }).allowed, false);
});

test('10: a blocked lane does not suppress independent ready work', () => {
  assert.deepEqual(routeReadyWork([{ id: 'blocked', status: 'blocked', authorized: true, dependenciesMet: true }, { id: 'ready', status: 'ready', authorized: true, dependenciesMet: true }]), ['ready']);
});

test('a newly satisfied prerequisite makes that work item routable on the next readback', () => {
  const waiting = { id: 'upload', status: 'blocked', authorized: true, dependenciesMet: false };
  assert.deepEqual(routeReadyWork([waiting]), []);
  const resumed = { ...waiting, status: 'ready', dependenciesMet: true };
  assert.deepEqual(routeReadyWork([resumed]), ['upload']);
});

test('11: green source tests without provider or device readback are not accepted at those levels', () => {
  const state = assessDeliveryEvidence({ acceptanceTarget: 'provider', checks: { sourceTests: true, providerReadback: false, deviceReadback: false, releaseGate: true }, receivingWorker: { status: 'completed', actualResult: 'source test output' } });
  assert.equal(state.sourceVerified, true);
  assert.equal(state.providerAccepted, false);
  assert.equal(state.deviceAccepted, false);
  assert.equal(state.complete, false);
});

test('12: a sent handoff without receiving-worker execution cannot close the handoff', () => {
  assert.equal(assessDeliveryEvidence({ checks: { sourceTests: true, releaseGate: true }, receivingWorker: { status: 'queued' } }).complete, false);
  assert.equal(assessDeliveryEvidence({ checks: { sourceTests: true, releaseGate: true }, receivingWorker: { status: 'inProgress' } }).complete, false);
  assert.equal(assessDeliveryEvidence({ checks: { sourceTests: true, releaseGate: true }, receivingWorker: { status: 'inProgress', runId: 'run-18', observedBy: 'independent-run-readback', startedAt: '2026-11-06T10:00:00Z' } }).handoffExecuted, true);
});

const observedRun = { status: 'completed', runId: 'workflow-run-42340048195', observedBy: 'independent-run-readback', startedAt: '2026-11-06T20:00:00Z', completedAt: '2026-11-06T20:02:00Z', actualResult: 'source checks passed' };
const acceptanceReceipt = target => ({ target, outcome: 'PASS', observedBy: 'independent-readback', sourceRef: 'be4d9910cca31917e6c8daa9ed4cc6e83bf012bf', evidenceRef: 'https://github.com/oookkkaaayyy/local-roots/actions/runs/42340048195' });
const verifiedInventory = items => ({
  outcome: 'PASS',
  observedBy: 'independent-readback',
  sourceRef: 'https://docs.google.com/document/d/180CdeHe03Y9mFs3TB-t6kFSEoUvKyts8xEeZffa6E-4/edit',
  evidenceRef: 'https://docs.google.com/document/d/180CdeHe03Y9mFs3TB-t6kFSEoUvKyts8xEeZffa6E-4/edit',
  itemIds: items.map(item => item?.id ?? ''),
});
const assessContinuation = (items, waitPolicy = null) => assessCoordinatorContinuation(items, verifiedInventory(items), waitPolicy);

test('13: missing or unknown acceptance target cannot count as DONE', () => {
  for (const target of [undefined, 'done', '', null]) {
    assert.equal(assessDeliveryEvidence({ acceptanceTarget: target, checks: { sourceTests: true, releaseGate: true, providerReadback: true }, receivingWorker: observedRun, acceptanceReceipt: acceptanceReceipt('provider') }).complete, false);
  }
});

test('14: a sent prompt or text result without an independent run receipt cannot close a handoff', () => {
  const e = { acceptanceTarget: 'source', checks: { sourceTests: true }, acceptanceReceipt: acceptanceReceipt('source') };
  assert.equal(assessDeliveryEvidence({ ...e, receivingWorker: { status: 'completed', actualResult: 'done' } }).complete, false);
  assert.equal(assessDeliveryEvidence({ ...e, receivingWorker: { ...observedRun, observedBy: 'sent-prompt' } }).complete, false);
  assert.equal(assessDeliveryEvidence({ ...e, receivingWorker: { ...observedRun, runId: '' } }).complete, false);
});

test('15: provider PASS requires a matching independent acceptance receipt', () => {
  const e = { acceptanceTarget: 'provider', checks: { sourceTests: true, releaseGate: true, providerReadback: true }, receivingWorker: observedRun };
  assert.equal(assessDeliveryEvidence(e).complete, false);
  assert.equal(assessDeliveryEvidence({ ...e, acceptanceReceipt: acceptanceReceipt('source') }).complete, false);
  assert.equal(assessDeliveryEvidence({ ...e, acceptanceReceipt: { ...acceptanceReceipt('provider'), observedBy: 'assumed' } }).complete, false);
  assert.equal(assessDeliveryEvidence({ ...e, acceptanceReceipt: acceptanceReceipt('provider') }).complete, true);
});

test('16: source-only acceptance requires no fabricated production gates', () => {
  assert.equal(assessDeliveryEvidence({ acceptanceTarget: 'source', checks: { sourceTests: true }, receivingWorker: observedRun, acceptanceReceipt: acceptanceReceipt('source') }).complete, true);
});

test('17: denial of a mandatory zero-cost plan read gate must not be dismissed as unrelated', () => {
  const e = { operationState: 'rejected', failureClass: 'permission', requiredOperation: 'worker.upload', deniedOperation: 'billing.read' };
  assert.equal(classifyRecovery({ ...e, requiredGateOperations: ['billing.read'] }).action, 'blocked-required-gate');
  assert.equal(classifyRecovery({ ...e, requiredGateOperations: ['route.read'] }).action, 'continue-independent');
});

test('18: real active target suppresses duplicate dispatch without blocking unrelated work', () => {
  const active = { id: 'run', target: 'edge-function', status: 'inProgress', receivingWorker: { ...observedRun, status: 'inProgress' } };
  const ready = { id: 'next', target: 'edge-function', status: 'ready', authorized: true, dependenciesMet: true };
  const other = { id: 'independent', target: 'events', status: 'ready', authorized: true, dependenciesMet: true };
  assert.deepEqual(routeReadyWork([active, ready, other, { ...other, id: 'duplicate' }]), ['independent']);
  assert.deepEqual(routeReadyWork([ready, other, { ...other, id: 'duplicate' }]), ['next', 'independent']);
});

test('19: owner acceptance is separate from source and device evidence', () => {
  const e = { acceptanceTarget: 'owner', checks: { sourceTests: true, releaseGate: true, providerReadback: true, deviceReadback: true }, receivingWorker: observedRun, acceptanceReceipt: acceptanceReceipt('owner') };
  assert.equal(assessDeliveryEvidence(e).complete, false);
  assert.equal(assessDeliveryEvidence({ ...e, checks: { ...e.checks, ownerAcceptance: true } }).complete, true);
});

test('20: a working label without run ID and start readback is NOT actual execution', () => {
  assert.equal(assessDeliveryEvidence({ receivingWorker: { status: 'inProgress' } }).handoffExecuted, false);
  assert.equal(assessDeliveryEvidence({ receivingWorker: { status: 'inProgress', runId: 'run-1', observedBy: 'independent-run-readback', startedAt: '2026-11-06T10:00:00Z' } }).handoffExecuted, true);
});

test('21: consumer reads an ambiguous target, retries only verified non-application, then resumes', async () => {
  const calls = [];
  const result = await executeRecovery({ operationState: 'ambiguous', provider: 'cloudflare', target: 'worker-v12', operation: 'worker.upload', standingScope: { authorized: true, provider: 'cloudflare', target: 'worker-v12', operations: ['worker.upload'] } }, {
    readback: async () => { calls.push('readback'); return { ok: true, event: { operationState: 'ambiguous', provider: 'cloudflare', target: 'worker-v12', operation: 'worker.upload', readbackVerified: true, readbackTargetMatches: true, readbackState: 'not-applied', retrySafe: true, attempts: 0, maxAttempts: 1 } }; },
    retryOperation: async () => { calls.push('retry'); return { ok: true, event: { operationState: 'rejected', failureClass: 'permission', requiredOperation: 'worker.upload', deniedOperation: 'billing.read' } }; },
    continueTask: async () => { calls.push('resume'); return { ok: true, nextAction: 'continue-upload-workflow' }; },
  });
  assert.deepEqual(calls, ['readback', 'retry', 'resume']);
  assert.equal(result.resumed, true);
});

test('consumer fails closed when readback adapter cannot establish current state', async () => {
  const result = await executeRecovery({ operationState: 'ambiguous' }, {
    readback: async () => ({ ok: true }),
    retryOperation: async () => assert.fail('must not retry without readback evidence'),
  });
  assert.equal(result.action, 'recovery-evidence-required');
  assert.equal(result.resumed, false);
});

test('consumer rebuilds, verifies, retries a changed artifact, then resumes', async () => {
  const calls = [];
  const result = await executeRecovery({ operationState: 'rejected', failureClass: 'artifact-validation', provider: 'cloudflare', target: 'worker-v12', operation: 'worker.upload', standingScope: { authorized: true, provider: 'cloudflare', target: 'worker-v12', operations: ['worker.upload'] }, priorArtifactDigest: 'old', candidateArtifactDigest: 'old', attempts: 0, maxAttempts: 2 }, {
    rebuildArtifact: async () => { calls.push('rebuild'); return { ok: true, event: { operationState: 'rejected', failureClass: 'artifact-validation', provider: 'cloudflare', target: 'worker-v12', operation: 'worker.upload', priorArtifactDigest: 'old', candidateArtifactDigest: 'new', attempts: 0, maxAttempts: 2 } }; },
    verifyArtifact: async () => { calls.push('verify'); return { ok: true, event: { operationState: 'rejected', failureClass: 'artifact-validation', provider: 'cloudflare', target: 'worker-v12', operation: 'worker.upload', priorArtifactDigest: 'old', candidateArtifactDigest: 'new', correctedArtifactVerified: true, retrySafe: true, attempts: 0, maxAttempts: 2 } }; },
    retryOperation: async () => { calls.push('retry'); return { ok: true, event: { operationState: 'rejected', failureClass: 'permission', requiredOperation: 'worker.upload', deniedOperation: 'billing.read' } }; },
    continueTask: async () => { calls.push('resume'); return { ok: true }; },
  });
  assert.deepEqual(calls, ['rebuild', 'verify', 'retry', 'resume']);
  assert.equal(result.resumed, true);
});

test('recovery retry requires exact explicit standing authorization', async () => {
  const calls = [];
  const scope = { authorized: false, provider: 'cloudflare', target: 'worker-v12', operations: ['worker.upload'] };
  const result = await executeRecovery({ operationState: 'ambiguous', provider: 'cloudflare', target: 'worker-v12', operation: 'worker.upload', standingScope: scope }, {
    readback: async () => { calls.push('readback'); return { ok: true, event: { operationState: 'ambiguous', provider: 'cloudflare', target: 'worker-v12', operation: 'worker.upload', readbackVerified: true, readbackTargetMatches: true, readbackState: 'not-applied', retrySafe: true, attempts: 0, maxAttempts: 1 } }; },
    retryOperation: async () => { calls.push('retry'); return { ok: true, event: {} }; },
  });
  assert.deepEqual(calls, ['readback']);
  assert.equal(result.action, 'blocked-authorization');
  assert.equal(result.resumed, false);
});

test('active work yields without a direct dependency and one bounded wait', () => {
  const active = { id: 'controls', target: 'controls', status: 'inProgress',
    receivingWorker: { ...observedRun, status: 'inProgress' } };
  const items = [active];
  const receipt = verifiedInventory(items);
  const yielded = assessContinuation(items);
  assert.deepEqual(yielded, {
    action: 'yield-active-work', canExit: true, streamComplete: false,
    activeWorkIds: ['controls'], readyWorkIds: [],
    resumptionTrigger: 'a completion or needs-attention event on an exact active thread; explicitly resume the coordinator because no automatic resumption is available',
    reason: 'no evidence-backed direct dependency and one bounded wait are authorized'
  });
  const waitPolicy = {
    completionIsDirectDependency: true, dependencyIds: ['controls'], maxWaitMs: 30_000,
    maxWaits: 1, waitsUsed: 0, inventorySourceRef: receipt.sourceRef,
    inventoryEvidenceRef: receipt.evidenceRef,
  };
  assert.deepEqual(assessCoordinatorContinuation(items, receipt, waitPolicy), {
    action: 'wait-for-active-work', canExit: false, activeWorkIds: ['controls'], readyWorkIds: [],
    wait: { maxWaitMs: 30_000, maxWaits: 1, waitsUsed: 1 }
  });
  assert.equal(assessCoordinatorContinuation(items, receipt, { ...waitPolicy, waitsUsed: 1 }).action, 'yield-active-work');
  assert.equal(assessCoordinatorContinuation(items, receipt, { ...waitPolicy, maxWaitMs: 60_001 }).action, 'yield-active-work');
  assert.equal(assessCoordinatorContinuation(items, receipt, { ...waitPolicy, inventoryEvidenceRef: 'stale' }).action, 'yield-active-work');
  assert.equal(assessCoordinatorContinuation(items, receipt, { ...waitPolicy, dependencyIds: ['other'] }).action, 'yield-active-work');
});

test('coordinator routes independent ready work before waiting on an active lane', () => {
  const active = { id: 'controls', target: 'controls', status: 'inProgress',
    receivingWorker: { ...observedRun, status: 'inProgress' } };
  const ready = { id: 'scoring-next', target: 'scoring', status: 'ready', authorized: true, dependenciesMet: true };
  const blocked = { id: 'provider-gate', status: 'blocked', blocker: 'owner-only admission decision', resumptionTrigger: 'owner decision' };
  assert.deepEqual(assessContinuation([active, ready, blocked]), {
    action: 'route-ready-work', canExit: false, nextWorkId: 'scoring-next', readyWorkCount: 1, activeWorkIds: ['controls']
  });
});

test('in-progress labels without execution readback cannot justify exit', () => {
  assert.deepEqual(assessContinuation([{ id: 'handoff', status: 'inProgress' }]),
    { action: 'verify-execution', canExit: false, workIds: ['handoff'] });
});

test('unresolved work without an exact blocker cannot be closed as blocked', () => {
  assert.deepEqual(assessContinuation([{ id: 'todo', status: 'ready', authorized: false, dependenciesMet: true }]), {
    action: 'continue-work', canExit: false, unresolvedWorkIds: ['todo'],
    reason: 'incomplete work lacks a verified terminal receipt or precise blocker'
  });
});

test('only a precise blocker permits blocked exit, and verified acceptance permits completion', () => {
  assert.deepEqual(assessContinuation([{ id: 'gated', status: 'blocked', blocker: 'missing signed authorization', resumptionTrigger: 'owner signs manifest' }]),
    { action: 'blocked', canExit: true, blockedWorkIds: ['gated'] });
  const evidence = { acceptanceTarget: 'source', checks: { sourceTests: true }, receivingWorker: observedRun, acceptanceReceipt: acceptanceReceipt('source') };
  assert.deepEqual(assessContinuation([{ id: 'done', status: 'done', deliveryEvidence: evidence }]),
    { action: 'complete', canExit: true });
  assert.equal(assessContinuation([{ id: 'false-done', status: 'done' }]).canExit, false);
});

test('coordinator fails closed when the work inventory is missing, empty without proof, or mismatched', () => {
  assert.deepEqual(assessCoordinatorContinuation(), {
    action: 'verify-work-inventory', canExit: false,
    reason: 'a complete independently read-back work inventory is required before routing or exit'
  });
  assert.equal(assessCoordinatorContinuation(null, verifiedInventory([])).canExit, false);
  assert.equal(assessCoordinatorContinuation([], { ...verifiedInventory([]), outcome: 'UNKNOWN' }).canExit, false);
  const item = { id: 'controls', status: 'ready', authorized: true, dependenciesMet: true };
  assert.equal(assessCoordinatorContinuation([item], verifiedInventory([])).canExit, false);
});

test('an explicitly verified empty inventory is terminal, while malformed items cannot be silently dropped', () => {
  assert.deepEqual(assessCoordinatorContinuation([], verifiedInventory([])), { action: 'complete', canExit: true });
  const items = [{ id: 'controls', status: 'blocked', blocker: 'owner action', resumptionTrigger: 'owner response' }, null];
  assert.equal(assessCoordinatorContinuation(items, { ...verifiedInventory(items), itemIds: ['controls', ''] }).canExit, false);
});
