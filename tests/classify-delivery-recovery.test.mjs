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
  assert.equal(classifyRecovery({ operationState: 'rejected', failureClass: 'artifact-validation', priorArtifactDigest: 'a', candidateArtifactDigest: 'b', attempts: 2, maxAttempts: 2 }).action, 'stop-retries');
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
  assert.equal(assessDeliveryEvidence({ receivingWorker: { status: 'failed', actualResult: 'saved checkpoint read' } }).handoffExecuted, true);
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
  assert.equal(assessDeliveryEvidence({ checks: { sourceTests: true, releaseGate: true }, receivingWorker: { status: 'inProgress' } }).handoffExecuted, true);
});
