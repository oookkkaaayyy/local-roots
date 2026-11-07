const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'expired']);

/** Classify one failed operation without authorizing an unsafe retry. */
export function classifyRecovery(event) {
  if (!event || typeof event !== 'object') throw new TypeError('recovery event is required');

  if (event.operationState === 'ambiguous') {
    return { action: 'readback', retry: false, reason: 'mutation outcome is ambiguous; read the authoritative target before retrying' };
  }

  if (event.operationState === 'rejected') {
    if (event.failureClass === 'permission') {
      if (!event.requiredOperation || !event.deniedOperation) {
        return { action: 'gather-evidence', retry: false, reason: 'permission failure is not mapped to the required operation' };
      }
      if (event.deniedOperation !== event.requiredOperation) {
        return { action: 'continue-independent', retry: false, reason: 'denied permission is unrelated to the required operation' };
      }
      return { action: 'blocked-required-operation', retry: false, reason: 'the required operation is explicitly denied' };
    }

    if (event.failureClass === 'artifact-validation') {
      const changed = Boolean(event.priorArtifactDigest && event.candidateArtifactDigest && event.priorArtifactDigest !== event.candidateArtifactDigest);
      const attempts = Number.isInteger(event.attempts) && event.attempts >= 0 ? event.attempts : 0;
      const maxAttempts = Number.isInteger(event.maxAttempts) && event.maxAttempts > 0 ? event.maxAttempts : 1;
      if (!changed) return { action: 'rebuild-correction', retry: false, reason: 'rebuild a corrected artifact before retrying the rejected upload' };
      if (attempts >= maxAttempts) return { action: 'stop-retries', retry: false, reason: 'bounded retry limit reached' };
      return { action: 'verify-corrected-artifact', retry: false, reason: 'corrected bytes exist; verify them before the next upload attempt' };
    }
  }

  return { action: 'inspect', retry: false, reason: 'failure evidence does not establish a safe recovery action' };
}

/** Check that evidence is sufficient for the specific claim being made. */
export function assessDeliveryEvidence(evidence) {
  const checks = evidence?.checks ?? {};
  const sourceTests = checks.sourceTests === true;
  const provider = checks.providerReadback === true;
  const device = checks.deviceReadback === true;
  const releaseGate = checks.releaseGate === true;
  const execution = evidence?.receivingWorker ?? {};
  const workerStarted = execution.status === 'inProgress' || (terminalStatuses.has(execution.status) && Boolean(execution.actualResult));

  return {
    sourceVerified: sourceTests,
    providerAccepted: provider && releaseGate,
    deviceAccepted: device && releaseGate,
    handoffExecuted: workerStarted,
    complete: sourceTests && releaseGate && (evidence.acceptanceTarget === 'provider' ? provider : evidence.acceptanceTarget === 'device' ? device : true) && workerStarted,
  };
}

/** Keep unrelated work flowing while one lane is blocked. */
export function routeReadyWork(workItems = []) {
  return workItems.filter(item => item?.status === 'ready' && item?.authorized === true && item?.dependenciesMet === true).map(item => item.id);
}
