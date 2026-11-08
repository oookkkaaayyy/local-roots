const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'expired']);
const acceptanceTargets = new Set(['source', 'provider', 'device', 'owner']);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** A label or dispatched prompt is not evidence that a receiving worker ran. */
function hasExecutionReadback(execution) {
  if (!execution || !nonEmpty(execution.runId) || execution.observedBy !== 'independent-run-readback') return false;
  if (execution.status === 'inProgress') return nonEmpty(execution.startedAt);
  return terminalStatuses.has(execution.status) && nonEmpty(execution.startedAt) &&
    nonEmpty(execution.completedAt) && nonEmpty(execution.actualResult);
}

/** Evidence references must be explicit; this pure function does not fetch or authenticate them. */
function hasAcceptanceReceipt(receipt, target) {
  return receipt?.target === target && receipt?.outcome === 'PASS' &&
    receipt?.observedBy === 'independent-readback' &&
    nonEmpty(receipt?.sourceRef) && nonEmpty(receipt?.evidenceRef);
}

/** Classify one failed operation without authorizing an unsafe retry. */
export function classifyRecovery(event) {
  if (!event || typeof event !== 'object') throw new TypeError('recovery event is required');

  if (event.historicalStatus === 'resolved' && event.currentEvidence !== 'verified') {
    return { action: 'verify-current-state', retry: false, reason: 'historical resolution is not current provider or project state' };
  }

  if (event.operationState === 'ambiguous') {
    if (event.readbackVerified !== true || event.readbackTargetMatches !== true) {
      return { action: 'readback', retry: false, reason: 'mutation outcome is ambiguous; read the authoritative target before retrying' };
    }
    if (event.readbackState === 'applied') {
      return { action: 'continue-after-readback', retry: false, reason: 'authoritative target readback confirms the mutation already applied' };
    }
    if (event.readbackState !== 'not-applied') {
      return { action: 'inspect', retry: false, reason: 'authoritative readback did not establish whether the mutation applied' };
    }
    const attempts = Number.isInteger(event.attempts) && event.attempts >= 0 ? event.attempts : 0;
    const maxAttempts = Number.isInteger(event.maxAttempts) && event.maxAttempts > 0 ? event.maxAttempts : 1;
    if (attempts >= maxAttempts) return { action: 'stop-retries', retry: false, reason: 'bounded retry limit reached after confirmed non-application' };
    if (event.retrySafe !== true) {
      return { action: 'inspect', retry: false, reason: 'automatic retry safety is not established for this operation' };
    }
    return { action: 'retry-operation', retry: true, reason: 'authoritative target readback confirms non-application and bounded retry is safe' };
  }

  if (event.operationState === 'rejected') {
    if (event.failureClass === 'permission') {
      if (!event.requiredOperation || !event.deniedOperation) {
        return { action: 'gather-evidence', retry: false, reason: 'permission failure is not mapped to the required operation' };
      }
      if (event.deniedOperation !== event.requiredOperation) {
        if (Array.isArray(event.requiredGateOperations) && event.requiredGateOperations.includes(event.deniedOperation)) {
          return { action: 'blocked-required-gate', retry: false, reason: 'denied read is a mandatory independent release or cost gate' };
        }
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
      if (event.correctedArtifactVerified !== true) {
        return { action: 'verify-corrected-artifact', retry: false, reason: 'corrected bytes exist; verify them before the next upload attempt' };
      }
      if (event.retrySafe !== true) {
        return { action: 'inspect', retry: false, reason: 'automatic retry safety is not established for this rejected operation' };
      }
      return { action: 'retry-operation', retry: true, reason: 'rejection and changed verified artifact establish a bounded safe retry' };
    }
  }

  return { action: 'inspect', retry: false, reason: 'failure evidence does not establish a safe recovery action' };
}

/** Execute bounded recovery steps through explicit adapters, then resume the original task. */
export async function executeRecovery(event, adapters) {
  let current = event;
  let steps = 0;
  const maxSteps = 5;
  while (steps < maxSteps) {
    const decision = classifyRecovery(current);
    if (decision.action === 'retry-operation') {
      const proposal = { provider: event?.provider, target: event?.target, operation: event?.operation };
      const sameOperation = current?.provider === proposal.provider &&
        current?.target === proposal.target && current?.operation === proposal.operation;
      const authorization = authorizeOperation(proposal, event?.standingScope);
      if (!sameOperation || !authorization.allowed) {
        return { ...decision, action: 'blocked-authorization', retry: false, executed: steps > 0, resumed: false, steps,
          reason: 'retry requires an exact provider, target, and operation match to explicit standing authorization' };
      }
    }
    const dispatch = {
      'verify-current-state': 'readback',
      readback: 'readback',
      'continue-after-readback': 'continueTask',
      'continue-independent': 'continueTask',
      'rebuild-correction': 'rebuildArtifact',
      'verify-corrected-artifact': 'verifyArtifact',
      'retry-operation': 'retryOperation',
    }[decision.action];
    if (!dispatch) return { ...decision, executed: steps > 0, resumed: false, steps };
    const operation = adapters?.[dispatch];
    if (typeof operation !== 'function') {
      return { ...decision, action: 'blocked-adapter', executed: steps > 0, resumed: false, steps,
        reason: `required recovery adapter is unavailable: ${dispatch}` };
    }
    let result;
    try {
      result = await operation(current);
    } catch (error) {
      return { ...decision, action: 'recovery-step-failed', executed: true, resumed: false, steps: steps + 1,
        reason: `recovery adapter threw: ${String(error)}` };
    }
    steps += 1;
    if (result?.ok !== true) {
      return { ...decision, action: 'recovery-step-failed', executed: true, resumed: false, steps, result };
    }
    if (dispatch === 'continueTask') return { ...decision, executed: true, resumed: true, steps, result };
    if (!result.event || typeof result.event !== 'object') {
      return { ...decision, action: 'recovery-evidence-required', executed: true, resumed: false, steps,
        reason: `adapter ${dispatch} succeeded without returning current evidence for the next decision` };
    }
    current = result.event;
  }
  return { action: 'stop-recovery', retry: false, executed: true, resumed: false, steps,
    reason: 'bounded recovery step limit reached; task must be inspected before further action' };
}

/** Check that evidence is sufficient for the specific claim being made. */
export function assessDeliveryEvidence(evidence) {
  const checks = evidence?.checks ?? {};
  const sourceTests = checks.sourceTests === true;
  const provider = checks.providerReadback === true;
  const device = checks.deviceReadback === true;
  const owner = checks.ownerAcceptance === true;
  const releaseGate = checks.releaseGate === true;
  const execution = evidence?.receivingWorker ?? {};
  const target = evidence?.acceptanceTarget;
  const validTarget = acceptanceTargets.has(target);
  const observedExecution = hasExecutionReadback(execution);
  const workerCompleted = observedExecution && execution.status === 'completed';
  const receipt = validTarget && hasAcceptanceReceipt(evidence?.acceptanceReceipt, target);
  const targetAccepted = target === 'source' ? sourceTests :
    target === 'provider' ? sourceTests && releaseGate && provider :
    target === 'device' ? sourceTests && releaseGate && device :
    target === 'owner' ? sourceTests && releaseGate && owner : false;

  return {
    sourceVerified: sourceTests,
    providerAccepted: provider && releaseGate && hasAcceptanceReceipt(evidence?.acceptanceReceipt, 'provider'),
    deviceAccepted: device && releaseGate && hasAcceptanceReceipt(evidence?.acceptanceReceipt, 'device'),
    handoffExecuted: observedExecution,
    complete: validTarget && Boolean(receipt) && Boolean(targetAccepted) && workerCompleted,
  };
}

/** Fail closed when a proposed operation falls outside an explicit standing scope. */
export function authorizeOperation(proposal, standingScope) {
  const allowed = standingScope?.authorized === true
    && standingScope.provider === proposal?.provider
    && standingScope.target === proposal?.target
    && Array.isArray(standingScope.operations)
    && standingScope.operations.includes(proposal?.operation);
  return { allowed, action: allowed ? 'proceed-to-release-gates' : 'refuse', reason: allowed ? 'proposal matches the explicit standing scope' : 'proposal is outside explicit standing authorization' };
}

/** Select a durable checkpoint before resuming after a terminated session. */
export function resumeAfterContextLoss(checkpoint) {
  const complete = Boolean(checkpoint?.authorityUrl && checkpoint?.sourceRef && checkpoint?.lastVerifiedEvidence && checkpoint?.nextAction);
  return { action: complete ? 'resume-next-action' : 'recover-authority-and-evidence', safe: complete };
}

/** Keep unrelated work flowing while one lane is blocked. */
export function routeReadyWork(workItems = []) {
  const busy = new Set(workItems.filter(item => hasExecutionReadback(item?.receivingWorker) &&
    item.receivingWorker.status === 'inProgress').map(item => item.target ?? item.id));
  const seen = new Set();
  return workItems.filter(item => {
    if (!item || item.status !== 'ready' || item.authorized !== true || item.dependenciesMet !== true || !nonEmpty(item.id)) return false;
    const key = item.target ?? item.id;
    if (busy.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(item => item.id);
}

 
function hasVerifiedWorkInventory(items, receipt) {
  if (!Array.isArray(items) || !receipt || receipt.outcome !== 'PASS' ||
      receipt.observedBy !== 'independent-readback' || !nonEmpty(receipt.sourceRef) ||
      !nonEmpty(receipt.evidenceRef) || !Array.isArray(receipt.itemIds)) return false;
  const ids = items.map(item => item && typeof item === 'object' && nonEmpty(item.id) ? item.id : null);
  if (ids.some(id => id === null) || new Set(ids).size !== ids.length) return false;
  return receipt.itemIds.length === ids.length &&
    receipt.itemIds.every((id, index) => id === ids[index]);
}

/** Gate coordinator exit: verified inventory is required before any terminal decision. */
export function assessCoordinatorContinuation(workItems, inventoryReceipt) {
  if (!hasVerifiedWorkInventory(workItems, inventoryReceipt)) {
    return { action: 'verify-work-inventory', canExit: false,
      reason: 'a complete independently read-back work inventory is required before routing or exit' };
  }
  const items = workItems;
  const readyWorkIds = routeReadyWork(items);
  const activeWorkIds = items.filter(item => item.status === 'inProgress' &&
    hasExecutionReadback(item.receivingWorker)).map(item => item.id);
  const unverifiedWorkIds = items.filter(item => item.status === 'inProgress' &&
    !hasExecutionReadback(item.receivingWorker)).map(item => item.id);

  if (readyWorkIds.length) {
    return { action: 'route-ready-work', canExit: false, nextWorkId: readyWorkIds[0],
      readyWorkCount: readyWorkIds.length, activeWorkIds };
  }
  if (activeWorkIds.length) {
    return { action: 'wait-for-active-work', canExit: false, activeWorkIds, readyWorkIds: [] };
  }
  if (unverifiedWorkIds.length) {
    return { action: 'verify-execution', canExit: false, workIds: unverifiedWorkIds };
  }

  const unresolved = items.filter(item => {
    if (item.status === 'done') return assessDeliveryEvidence(item.deliveryEvidence).complete !== true;
    return item.status !== 'superseded' || !nonEmpty(item.supersededBy);
  });
  if (unresolved.length === 0) return { action: 'complete', canExit: true };

  const preciselyBlocked = unresolved.filter(item => item.status === 'blocked' &&
    nonEmpty(item.blocker) && nonEmpty(item.resumptionTrigger));
  if (preciselyBlocked.length === unresolved.length) {
    return { action: 'blocked', canExit: true, blockedWorkIds: preciselyBlocked.map(item => item.id) };
  }
  return { action: 'continue-work', canExit: false,
    unresolvedWorkIds: unresolved.map(item => item.id),
    reason: 'incomplete work lacks a verified terminal receipt or precise blocker' };
}
