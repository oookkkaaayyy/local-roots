import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDeliveryEvidence, authorizeOperation, classifyRecovery, resumeAfterContextLoss, routeReadyWork } from '../scripts/classify-delivery-recovery.mjs';

test('1: raw and base64 Source Map v3 upload checks remain explicit', async () => {
  const { validateCloudflareWorkerMultipart } = await import('../scripts/validate-cloudflare-worker-multipart.mjs');
  assert.equal(typeof validateCloudflareWorkerMultipart, 'function');
});

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
