import { createHash } from 'node:crypto';
import { REQUIRED_STAGES, REQUIRED_TARGETS, validatePlan } from './parent-gate.mjs';

const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) || value instanceof Uint8Array ? value : canonical(value)).digest('hex');
const ORIGINAL_MANIFEST_ID = '12X06fFmdc5oPGlcq9kprf1hhglbVV7mW';
const CF_BASELINE_VERSION = '48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
// Exact immutable save-ACK candidate staged under the original rev10 authority.
// Do not advance this pin without a new candidate and same-manifest amendment.
const CF_CANDIDATE_VERSION = 'f0902911-6930-4042-883c-7899098d62d4';

export function validateTransaction(tx) {
  const errors = [];
  if (tx?.schemaVersion !== 1 || tx?.mode !== 'review-only' || tx?.liveExecutionEnabled !== false) errors.push('transaction must be schema v1 and hard-locked review-only');
  if (!/^[a-z0-9][a-z0-9-]{7,100}$/i.test(tx?.transactionId || '')) errors.push('transactionId invalid');
  if (!/^[0-9a-f]{40}$/i.test(tx?.sourceCommit || '')) errors.push('exact source commit missing');
  if (!tx?.sourceAttestation?.driveFileId || !/^[a-f0-9]{64}$/i.test(tx?.sourceAttestation?.sha256 || '') || !Number.isSafeInteger(tx?.sourceAttestation?.bytes) || tx.sourceAttestation.bytes<1 || tx?.sourceAttestation?.downloadBackVerified !== true) errors.push('source-attestation evidence not durably bound');
  if (!tx?.acceptanceCriteria?.length || tx.acceptanceCriteria.some(c=>!c.id||!c.description||!c.method||!c.expected)) errors.push('complete acceptance criteria missing');
  const targets = tx?.targets || [];
  if (targets.length !== REQUIRED_TARGETS.length || new Set(targets.map(t => t.id)).size !== targets.length || REQUIRED_TARGETS.some(id => !targets.some(t => t.id === id))) errors.push('exact five target baseline set required');
  for (const t of targets) if (!t.baselineIdentity || !/^[a-f0-9]{64}$/i.test(t.baselineSha256 || '') || !/^[a-f0-9]{64}$/i.test(t.rollback?.sha256 || '') || !t.rollback?.driveFileId || !Number.isSafeInteger(t.rollback?.bytes) || t.rollback.bytes<1 || t.rollback.downloadBackVerified!==true || (t.id === 'cloudflare-worker' && (!/^[0-9a-f-]{36}$/i.test(t.baselineProviderVersionId || '') || !/^[0-9a-f-]{36}$/i.test(t.rollback?.providerVersionId || '') || t.rollback.providerVersionId !== t.baselineProviderVersionId))) errors.push(`target ${t.id}: baseline and rollback binding incomplete`);
  const operations = tx?.operations || [];
  if (operations.length !== REQUIRED_STAGES.length) errors.push('exact seven ordered stages required');
  for (let i = 0; i < REQUIRED_STAGES.length; i++) {
    const [id, targetId] = REQUIRED_STAGES[i], op = operations[i];
    if (op?.id !== id || op?.targetId !== targetId) errors.push(`stage ${i} order mismatch`);
    if (!/^[a-f0-9]{64}$/i.test(op?.candidate?.sha256 || '') || !Number.isSafeInteger(op?.candidate?.bytes) || op.candidate.bytes < 1 || !op?.candidate?.driveFileId || !/^[a-f0-9]{64}$/i.test(op?.restore?.sha256 || '') || !Number.isSafeInteger(op?.restore?.bytes) || op.restore.bytes < 1 || !op?.restore?.driveFileId || !op?.restore?.route) errors.push(`${id}: candidate and inverse binding required`);
    for (const f of ['expectedBefore', 'expectedAfter', 'expectedRestored']) if (!/^[a-f0-9]{64}$/i.test(op?.[f] || '')) errors.push(`${id}: ${f} identity missing`);
    if (!op?.applyRoute || !op?.readbackRoute) errors.push(`${id}: apply/readback route missing`);
  }
  if (tx?.rollbackOrder?.join(',') !== [...operations].reverse().map(o => o.id).join(',')) errors.push('rollback order must reverse stages (legacy grants before Worker rollback)');
  if (operations.at(-1)?.id !== 'db-revoke-old-writes' || operations.at(-1)?.restore?.effect !== 'restore-legacy-grants') errors.push('reverse cutover must restore legacy permissions before Worker rollback');
  if (validatePlan(tx?.parentContract || {}).length) errors.push(...validatePlan(tx?.parentContract || {}).map(x => `parent contract: ${x}`));
  const contract = tx?.parentContract || {};
  if (contract.sourceCommit !== tx?.sourceCommit) errors.push('parent contract source commit differs from transaction source');
  const contractTargets = contract.targets || [];
  if (contractTargets.length !== REQUIRED_TARGETS.length || new Set(contractTargets.map(t => t.id)).size !== contractTargets.length || REQUIRED_TARGETS.some(id => !contractTargets.some(t => t.id === id))) {
    errors.push('parent contract must bind the exact five transaction targets');
  }
  for (const target of targets) {
    const contractTarget = contractTargets.find(t => t.id === target.id);
    if (!contractTarget) continue;
    const baselineMatches = contractTarget.provider === target.provider
      && contractTarget.target === target.target
      && contractTarget.baselineIdentity === target.baselineIdentity
      && contractTarget.baselineReadbackSha256 === target.baselineSha256;
    const rollbackMatches = contractTarget.rollback?.driveFileId === target.rollback?.driveFileId
      && contractTarget.rollback?.sha256 === target.rollback?.sha256
      && contractTarget.rollback?.bytes === target.rollback?.bytes
      && contractTarget.rollback?.downloadBackVerified === target.rollback?.downloadBackVerified;
    const versionMatches = target.id !== 'cloudflare-worker'
      || (contractTarget.baselineProviderVersionId === target.baselineProviderVersionId
        && contractTarget.rollback?.providerVersionId === target.rollback?.providerVersionId);
    if (!baselineMatches || !rollbackMatches || !versionMatches) errors.push(`parent contract target binding differs:${target.id}`);
  }
  return errors;
}

export async function providerBoundPreflight(tx, provider, evidenceStore) {
  tx = structuredClone(tx);
  const errors = validateTransaction(tx);
  if (errors.length) return { status: 'PENDING', errors, admission: 'NOT_ADMITTED' };
  if (!provider?.readOnly || typeof provider.readAllTargets !== 'function') return { status: 'PENDING', errors: ['authenticated read-only provider adapter required'], admission: 'NOT_ADMITTED' };
  if(typeof evidenceStore?.readAndVerifyDriveArtifact!=='function') return { status:'PENDING',errors:['independent artifact download verifier required'],admission:'NOT_ADMITTED' };
  const observed = await provider.readAllTargets(tx);
  const expectedIds = REQUIRED_TARGETS.slice().sort();
  if (Object.keys(observed).sort().join('|') !== expectedIds.join('|')) return { status: 'PENDING', errors: ['provider target set mismatch'], admission: 'NOT_ADMITTED' };
  const mismatches = [];
  for (const target of tx.targets) if (digest(observed[target.id]) !== target.baselineSha256) mismatches.push(target.id);
  const artifactSpecs=[tx.sourceAttestation,...tx.targets.map(t=>t.rollback),...tx.operations.flatMap(o=>[o.candidate,o.restore])];
  const artifacts=[];
  for(const artifact of new Map(artifactSpecs.map(a=>[a.driveFileId,a])).values()){
    try { const check=await evidenceStore.readAndVerifyDriveArtifact(artifact); artifacts.push(check); if(!check.verified) mismatches.push(`artifact:${artifact.driveFileId}`); }
    catch { mismatches.push(`artifact:${artifact.driveFileId}`); }
  }
  const finalObserved=await provider.readAllTargets(tx);
  for(const target of tx.targets) if(digest(finalObserved[target.id])!==digest(observed[target.id])) mismatches.push(`provider-drift:${target.id}`);
  const manifest = { schemaVersion: 1, transactionId: tx.transactionId, transactionSha256: digest(tx), transaction:tx, status: 'PENDING', preflightStatus: mismatches.length ? 'FAIL' : 'PASS', targetReadbacks: finalObserved, verifiedArtifacts:artifacts, mismatches, admission: 'NOT_ADMITTED', capturedAt: new Date().toISOString() };
  const bytes = Buffer.from(canonical(manifest));
  let evidence;
  try { evidence = await evidenceStore.persistAndDownloadBack(`${tx.transactionId}-preflight.json`, bytes, tx.evidenceFolderId); }
  catch { return { status: 'PENDING', errors: ['durable manifest upload/download-back failed'], manifest }; }
  if (!evidence?.downloadBackVerified || evidence.sha256 !== digest(bytes)) return { status: 'PENDING', errors: ['durable manifest byte verification failed'], manifest };
  return { status: 'PENDING', preflightStatus: manifest.preflightStatus, admission: 'NOT_ADMITTED', manifest, evidence };
}

export async function persistCloseout({ admittedManifest, result }, evidenceStore) {
  if (admittedManifest?.status !== 'ADMITTED' || !admittedManifest?.manifestSha256) return { status: 'PENDING', errors: ['same-manifest admission is not verified'] };
  if (result?.manifestSha256 !== admittedManifest.manifestSha256 || !Array.isArray(result.acceptance) || result.acceptance.some(x => x.status !== 'PASS')) return { status: 'PENDING', errors: ['closeout is not bound to admitted manifest or acceptance failed'] };
  const receipt = { schemaVersion: 1, status: 'CLOSEOUT_PENDING', manifestSha256: admittedManifest.manifestSha256, providerReadbacks: result.providerReadbacks, acceptance: result.acceptance };
  const bytes = Buffer.from(canonical(receipt));
  try {
    const evidence = await evidenceStore.persistAndDownloadBack(`${admittedManifest.releaseId}-closeout.json`, bytes, admittedManifest.evidenceFolderId);
    if (!evidence?.downloadBackVerified || evidence.sha256 !== digest(bytes)) return { status: 'PENDING', errors: ['closeout download-back mismatch'] };
    return { status: 'CLOSEOUT_PENDING', receipt, evidence };
  } catch { return { status: 'PENDING', errors: ['closeout durable storage failed'] }; }
}

// Saga engine is exercised only with explicit testOnly adapters. Live provider adapters are read-only.
export async function executeMockableSaga(tx, adapters, journal) {
  return runProviderSaga(tx, adapters, journal, false);
}

// This is the real-provider execution ENTRYPOINT, not a release authorization.
// A separate, independently durable same-manifest owner approval and atomic
// provider-backed one-time claim remain mandatory; in their absence NO write
// adapter may be invoked. The controlling review manifest can never satisfy it.
export async function executeAdmittedProviderSaga(tx, adapters, journal, admission, verifier) {
  const txHash = digest(tx);
  const blocked = reason => ({status:'NOT_ADMITTED_NO_MUTATION', errors:[reason], trace:[]});
  if (validateTransaction(tx).length) return blocked('INVALID_IMMUTABLE_TRANSACTION');
  if (admission?.status !== 'ADMITTED' || admission?.productionMutationAuthorized !== true ||
      admission?.transactionSha256 !== txHash || !/^[a-f0-9]{64}$/.test(admission?.manifestSha256 || '') ||
      admission?.controllingManifestFileId !== '12X06fFmdc5oPGlcq9kprf1hhglbVV7mW' ||
      admission?.ownerApproval?.approved !== true ||
      admission?.rollbackVersionAndBindingsVerified !== true ||
      admission?.fiveTargetConditionalRestoreQualified !== true ||
      admission?.fullSourceAndProviderArtifactReadbackVerified !== true)
    return blocked('SAME_MANIFEST_FULL_ADMISSION_REQUIRED');
  if (adapters?.authenticated !== true || adapters?.readOnly !== false ||
      typeof adapters.readTarget !== 'function' || typeof adapters.apply !== 'function' ||
      typeof adapters.restore !== 'function')
    return blocked('AUTHENTICATED_FIVE_TARGET_PROVIDER_ADAPTER_REQUIRED');
  if (journal?.atomicOneTimeClaim !== true || journal?.durableDownloadBack !== true ||
      typeof journal.claim !== 'function' || typeof journal.append !== 'function')
    return blocked('DURABLE_ATOMIC_ONCE_ONLY_JOURNAL_REQUIRED');
  if (typeof verifier?.verifyOwnerApprovalAndManifest !== 'function' ||
      typeof verifier?.verifyFiveProviderRecoveryReadbacks !== 'function')
    return blocked('TRUSTED_EXTERNAL_ADMISSION_VERIFIER_REQUIRED');
  try {
    if (await verifier.verifyOwnerApprovalAndManifest({txHash,admission}) !== true ||
        await verifier.verifyFiveProviderRecoveryReadbacks({tx,admission}) !== true)
      return blocked('ADMISSION_OR_PROVIDER_GATE_FAILED');
  } catch { return blocked('ADMISSION_VERIFICATION_UNAVAILABLE'); }
  return runProviderSaga(tx, adapters, journal, true);
}

// Narrow Stage B child for the original five-target authority.  The parent
// contract is still fully validated and independently verified; this child
// executes only the already-staged Cloudflare version and cannot dispatch DB
// or Edge operations.  It is intentionally inert until the same rev10 record
// contains an exact admitted scope and the external verifier confirms it.
export function validateCloudflareChildTransaction(tx) {
  const errors=[];
  if(tx?.schemaVersion!==1||tx?.mode!=='review-only'||tx?.liveExecutionEnabled!==false)
    errors.push('Cloudflare child must remain schema v1 and hard-locked review-only');
  if(!/^[a-z0-9][a-z0-9-]{7,100}$/i.test(tx?.transactionId||''))errors.push('transactionId invalid');
  if(!/^[a-f0-9]{40}$/i.test(tx?.sourceCommit||''))errors.push('exact source commit missing');
  if(tx?.controllingManifestFileId!==ORIGINAL_MANIFEST_ID||!/^[a-f0-9]{64}$/i.test(tx?.controllingManifestSha256||''))
    errors.push('original rev10 manifest identity missing');
  if(!/^[a-f0-9]{64}$/i.test(tx?.parentTransactionSha256||''))errors.push('parent five-target transaction digest missing');
  if(validatePlan(tx?.parentContract||{}).length)errors.push('complete original five-target parent contract invalid');
  if(tx?.parentContract?.sourceCommit!==tx?.sourceCommit)errors.push('parent source binding differs from child');
  const targets=tx?.targets||[];
  if(targets.length!==1||targets[0]?.id!=='cloudflare-worker')errors.push('child must bind exactly the Cloudflare Worker target');
  const target=targets[0]||{};
  if(target.provider!=='Cloudflare'||target.target!=='hbnf'||
    target.baselineProviderVersionId!==CF_BASELINE_VERSION||
    target.rollback?.providerVersionId!==CF_BASELINE_VERSION||
    !target.baselineIdentity||!/^[a-f0-9]{64}$/i.test(target.baselineSha256||'')||
    !target.rollback?.driveFileId||!/^[a-f0-9]{64}$/i.test(target.rollback?.sha256||'')||
    !Number.isSafeInteger(target.rollback?.bytes)||target.rollback.bytes<1||target.rollback.downloadBackVerified!==true)
    errors.push('exact retained v348 baseline and durable rollback required');
  const operations=tx?.operations||[];
  if(operations.length!==1)errors.push('child must contain exactly one operation');
  const op=operations[0]||{};
  const candidate=op.candidate||{},restore=op.restore||{};
  if(op.id!=='worker-vnext'||op.targetId!=='cloudflare-worker')errors.push('child operation must be the Cloudflare Worker deployment only');
  if(candidate.providerVersionId!==CF_CANDIDATE_VERSION||candidate.uploadedVersionAndBindingsVerified!==true||
    !candidate.driveFileId||!/^[a-f0-9]{64}$/i.test(candidate.sha256||'')||
    !Number.isSafeInteger(candidate.bytes)||candidate.bytes<1||candidate.downloadBackVerified!==true||
    candidate.runWorkerFirst!==true)errors.push('exact verified v356 candidate and durable download-back required');
  if(restore.providerVersionId!==CF_BASELINE_VERSION||restore.retainedVersionAndBindingsVerified!==true||
    !restore.driveFileId||!/^[a-f0-9]{64}$/i.test(restore.sha256||'')||
    !Number.isSafeInteger(restore.bytes)||restore.bytes<1||restore.downloadBackVerified!==true||!restore.route)
    errors.push('exact retained v348 restoration and durable bytes required');
  for(const f of ['expectedBefore','expectedAfter','expectedRestored'])if(!/^[a-f0-9]{64}$/i.test(op[f]||''))errors.push(`${f} identity missing`);
  if(op.expectedBefore!==target.baselineSha256||op.expectedRestored!==target.baselineSha256)
    errors.push('child before/restore identities must equal original Worker baseline');
  if(!op.applyRoute||!op.readbackRoute)errors.push('Worker apply and readback routes missing');
  if(tx?.rollbackOrder?.join('|')!=='worker-vnext')errors.push('child rollback order must contain only worker-vnext');
  if(!Array.isArray(tx?.acceptanceCriteria)||tx.acceptanceCriteria.length===0||
    tx.acceptanceCriteria.some(c=>!c.id||!c.description||!c.method||!c.expected))errors.push('child acceptance criteria missing');
  return errors;
}

export async function executeAdmittedCloudflareChildSaga(tx,adapters,journal,admission,verifier){
  const txHash=digest(tx);
  const blocked=reason=>({status:'NOT_ADMITTED_NO_MUTATION',errors:[reason],trace:[]});
  if(validateCloudflareChildTransaction(tx).length)return blocked('INVALID_CLOUDFLARE_CHILD_TRANSACTION');
  if(admission?.status!=='ADMITTED'||admission?.productionMutationAuthorized!==true||
    admission?.controllingManifestFileId!==ORIGINAL_MANIFEST_ID||
    admission?.manifestSha256!==tx.controllingManifestSha256||
    admission?.transactionSha256!==txHash||admission?.scope!=='cloudflare-worker-only-stage-b'||
    admission?.targetVersionId!==CF_CANDIDATE_VERSION||admission?.trafficPercentage!==100||
    admission?.rollbackVersionId!==CF_BASELINE_VERSION||admission?.parentFiveTargetRecoveryVerified!==true)
    return blocked('SAME_REV10_EXACT_CLOUDFLARE_CHILD_ADMISSION_REQUIRED');
  if(adapters?.authenticated!==true||adapters?.readOnly!==false||
    typeof adapters.readTarget!=='function'||typeof adapters.apply!=='function'||typeof adapters.restore!=='function')
    return blocked('AUTHENTICATED_CLOUDFLARE_STAGE_ADAPTER_REQUIRED');
  if(journal?.atomicOneTimeClaim!==true||journal?.durableDownloadBack!==true||
    typeof journal.claim!=='function'||typeof journal.append!=='function')
    return blocked('DURABLE_ATOMIC_CHILD_CLAIM_REQUIRED');
  if(typeof verifier?.verifyOwnerApprovalAndManifest!=='function'||
    typeof verifier?.verifyParentFiveTargetRecovery!=='function')
    return blocked('TRUSTED_SAME_MANIFEST_PARENT_VERIFIER_REQUIRED');
  try{
    if(await verifier.verifyOwnerApprovalAndManifest({txHash,tx,admission})!==true||
      await verifier.verifyParentFiveTargetRecovery({tx,admission})!==true)
      return blocked('SAME_MANIFEST_OR_PARENT_RECOVERY_VERIFICATION_FAILED');
  }catch{return blocked('SAME_MANIFEST_VERIFICATION_UNAVAILABLE');}
  return runProviderSaga(tx,adapters,journal,true,validateCloudflareChildTransaction);
}

async function runProviderSaga(tx, adapters, journal, authenticatedLive, validator=validateTransaction) {
  tx = structuredClone(tx);
  const errors = validator(tx);
  if (errors.length) return { status: 'PENDING', errors, trace: [] };
  if (!authenticatedLive && (adapters?.testOnly !== true || adapters?.readOnly === true)) return { status: 'PENDING', errors: ['mutations are disabled outside explicit isolated test adapters'], trace: [] };
  const txHash = digest(tx);
  try { await journal.claim(tx.transactionId, txHash); } catch { return { status: 'REPLAY_REJECTED', trace: [] }; }
  const completed = [], trace = [];
  // Durable journal failure is a release uncertainty, not an exception that
  // may skip reverse restoration after a provider has changed.
  let journalFailure = false;
  async function record(event) {
    try { await journal.append(event); return true; }
    catch { journalFailure = true; return false; }
  }
  if (!(await record({ event: 'START', txHash }))) {
    return { status: 'JOURNAL_UNAVAILABLE_NOT_ADMITTED', errors: ['start evidence is not durable'], trace };
  }
  for (const op of tx.operations) {
    if (digest(tx) !== txHash) return abort('immutable transaction digest changed', true);
    // A failed pre-change identity read cannot be mistaken for an unchanged
    // target. If earlier stages already applied, reverse only their verified
    // effects and classify this as uncertain even if local restore appears complete.
    let before;
    try { before = await adapters.readTarget(op.targetId); }
    catch {
      const recorded = await record({ event: 'PRECHANGE_READBACK_UNAVAILABLE', stage: op.id });
      if (completed.length) return abort('prechange readback unavailable:' + op.id, true);
      return { status: recorded ? 'READBACK_UNAVAILABLE_ABORT_NOT_ADMITTED' : 'MANUAL_RECOVERY_REQUIRED', errors: ['prechange readback unavailable:' + op.id], trace };
    }
    if (digest(before) !== op.expectedBefore) {
      const recorded = await record({ event: 'STALE_TARGET_ABORT', stage: op.id, identity: digest(before) });
      if (completed.length) return abort(`stale provider identity:${op.targetId}`, !recorded);
      return { status: recorded ? 'STALE_TARGET_ABORT' : 'MANUAL_RECOVERY_REQUIRED', errors: [`stale provider identity:${op.targetId}`], trace };
    }
    if (!(await record({ event: 'BEFORE', stage: op.id, identity: digest(before) }))) {
      return abort('prechange stage evidence not durable:' + op.id, true);
    }
    let ack;
    try { ack = await adapters.apply(op); } catch { ack = null; }
    let after;
    try { after = await adapters.readTarget(op.targetId); } catch { return abort('readback unavailable after operation', true); }
    const afterHash = digest(after);
    if (afterHash === op.expectedAfter) {
      completed.push(op);
      if (!(await record({ event: 'OBSERVED_APPLIED', stage: op.id, identity: afterHash, acknowledged: ack?.acknowledged === true }))) {
        return abort('applied stage evidence not durable:' + op.id, true);
      }
      if (ack?.acknowledged !== true) return abort('lost or incomplete acknowledgement');
      trace.push(`APPLIED+READBACK:${op.id}`);
      continue;
    }
    if (afterHash !== op.expectedBefore || ack?.acknowledged === true) return abort('operation result differs from acknowledged state', true);
    if (!(await record({ event: 'REJECTED_NO_CHANGE', stage: op.id }))) {
      return abort('rejected stage evidence not durable:' + op.id, true);
    }
    return abort('operation rejected without changing target');
  }
  if (!(await record({ event: authenticatedLive ? 'PROVIDER_STAGES_APPLIED_PENDING_FIELD_ACCEPTANCE' : 'MOCK_SEQUENCE_COMPLETE_NOT_ADMITTED', txHash }))) {
    return abort('final stage evidence not durable', true);
  }
  return { status: authenticatedLive ? 'PROVIDER_STAGES_APPLIED_PENDING_FIELD_ACCEPTANCE' : 'MOCKED_COMPLETE_NOT_ADMITTED', trace, txHash };

  async function abort(reason, uncertain = false) {
    if (!(await record({ event: 'ABORT', reason }))) uncertain = true;
    for (const op of completed.slice().reverse()) {
      let current;
      try { current = await adapters.readTarget(op.targetId); } catch { return manual(`rollback readback unavailable:${op.id}`); }
      if (digest(current) !== op.expectedAfter) return manual(`rollback target drift:${op.id}`);
      try {
        const result = await adapters.restore(op);
        const restored = await adapters.readTarget(op.targetId);
        if (result?.acknowledged !== true || digest(restored) !== op.expectedRestored) return manual(`rollback failed:${op.id}`);
        if (!(await record({ event: 'RESTORED+READBACK', stage: op.id, identity: digest(restored) }))) uncertain = true;
        trace.push(`RESTORED+READBACK:${op.id}`);
      } catch { return manual(`rollback failed:${op.id}`); }
    }
    for (const target of tx.targets) {
      try { if (digest(await adapters.readTarget(target.id)) !== target.baselineSha256) return manual(`baseline not restored:${target.id}`); }
      catch { return manual(`final baseline readback unavailable:${target.id}`); }
    }
    return { status: (uncertain || journalFailure) ? 'MANUAL_RECOVERY_REQUIRED' : (authenticatedLive ? 'PROVIDER_ABORT_RESTORED_PENDING_REACCEPTANCE' : 'MOCKED_ABORT_RESTORED_NOT_ADMITTED'), reason, trace };
  }
  async function manual(reason) { await record({ event: 'MANUAL_RECOVERY_REQUIRED', reason }); return { status: 'MANUAL_RECOVERY_REQUIRED', reason, trace }; }
}
