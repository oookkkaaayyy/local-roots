import { createHash } from 'node:crypto';
import { REQUIRED_STAGES, REQUIRED_TARGETS, validatePlan } from './parent-gate.mjs';

const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) || value instanceof Uint8Array ? value : canonical(value)).digest('hex');

export function validateTransaction(tx) {
  const errors = [];
  if (tx?.schemaVersion !== 1 || tx?.mode !== 'review-only' || tx?.liveExecutionEnabled !== false) errors.push('transaction must be schema v1 and hard-locked review-only');
  if (!/^[a-z0-9][a-z0-9-]{7,100}$/i.test(tx?.transactionId || '')) errors.push('transactionId invalid');
  if (!/^[0-9a-f]{40}$/i.test(tx?.sourceCommit || '')) errors.push('exact source commit missing');
  if (!tx?.sourceAttestation?.driveFileId || !/^[a-f0-9]{64}$/i.test(tx?.sourceAttestation?.sha256 || '') || !Number.isSafeInteger(tx?.sourceAttestation?.bytes) || tx.sourceAttestation.bytes<1 || tx?.sourceAttestation?.downloadBackVerified !== true) errors.push('source-attestation evidence not durably bound');
  if (!tx?.acceptanceCriteria?.length || tx.acceptanceCriteria.some(c=>!c.id||!c.description||!c.method||!c.expected)) errors.push('complete acceptance criteria missing');
  const targets = tx?.targets || [];
  if (targets.length !== REQUIRED_TARGETS.length || new Set(targets.map(t => t.id)).size !== targets.length || REQUIRED_TARGETS.some(id => !targets.some(t => t.id === id))) errors.push('exact five target baseline set required');
  for (const t of targets) if (!t.baselineIdentity || !/^[a-f0-9]{64}$/i.test(t.baselineSha256 || '') || !/^[a-f0-9]{64}$/i.test(t.rollback?.sha256 || '') || !t.rollback?.driveFileId || !Number.isSafeInteger(t.rollback?.bytes) || t.rollback.bytes<1 || t.rollback.downloadBackVerified!==true) errors.push(`target ${t.id}: baseline and rollback binding incomplete`);
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
  return errors;
}

export async function providerBoundPreflight(tx, provider, evidenceStore) {
  tx = structuredClone(tx);
  const errors = validateTransaction(tx);
  if (errors.length) return { status: 'PENDING', errors, admission: 'NOT_ADMITTED' };
  if (!provider?.readOnly || typeof provider.readAllTargets !== 'function') return { status: 'PENDING', errors: ['authenticated read-only provider adapter required'], admission: 'NOT_ADMITTED' };
  if(typeof evidenceStore?.readAndVerifyDriveArtifact!=='function') return { status:'PENDING',errors:['independent artifact download verifier required'],admission:'NOT_ADMITTED' };
  const observed = await provider.readAllTargets();
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
  const finalObserved=await provider.readAllTargets();
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
  tx = structuredClone(tx);
  const errors = validateTransaction(tx);
  if (errors.length) return { status: 'PENDING', errors, trace: [] };
  if (adapters?.testOnly !== true || adapters?.readOnly === true) return { status: 'PENDING', errors: ['mutations are disabled outside explicit isolated test adapters'], trace: [] };
  const txHash = digest(tx);
  try { await journal.claim(tx.transactionId, txHash); } catch { return { status: 'REPLAY_REJECTED', trace: [] }; }
  const completed = [], trace = [];
  await journal.append({ event: 'START', txHash });
  for (const op of tx.operations) {
    if (digest(tx) !== txHash) return abort('immutable transaction digest changed', true);
    const before = await adapters.readTarget(op.targetId);
    if (digest(before) !== op.expectedBefore) {
      await journal.append({ event: 'STALE_TARGET_ABORT', stage: op.id, identity: digest(before) });
      if (completed.length) return abort(`stale provider identity:${op.targetId}`);
      return { status: 'STALE_TARGET_ABORT', errors: [`stale provider identity:${op.targetId}`], trace };
    }
    await journal.append({ event: 'BEFORE', stage: op.id, identity: digest(before) });
    let ack;
    try { ack = await adapters.apply(op); } catch { ack = null; }
    let after;
    try { after = await adapters.readTarget(op.targetId); } catch { return abort('readback unavailable after operation', true); }
    const afterHash = digest(after);
    if (afterHash === op.expectedAfter) {
      completed.push(op);
      await journal.append({ event: 'OBSERVED_APPLIED', stage: op.id, identity: afterHash, acknowledged: ack?.acknowledged === true });
      if (ack?.acknowledged !== true) return abort('lost or incomplete acknowledgement');
      trace.push(`APPLIED+READBACK:${op.id}`);
      continue;
    }
    if (afterHash !== op.expectedBefore || ack?.acknowledged === true) return abort('operation result differs from acknowledged state', true);
    await journal.append({ event: 'REJECTED_NO_CHANGE', stage: op.id });
    return abort('operation rejected without changing target');
  }
  await journal.append({ event: 'MOCK_SEQUENCE_COMPLETE_NOT_ADMITTED', txHash });
  return { status: 'MOCKED_COMPLETE_NOT_ADMITTED', trace, txHash };

  async function abort(reason, uncertain = false) {
    await journal.append({ event: 'ABORT', reason });
    for (const op of completed.slice().reverse()) {
      let current;
      try { current = await adapters.readTarget(op.targetId); } catch { return manual(`rollback readback unavailable:${op.id}`); }
      if (digest(current) !== op.expectedAfter) return manual(`rollback target drift:${op.id}`);
      try {
        const result = await adapters.restore(op);
        const restored = await adapters.readTarget(op.targetId);
        if (result?.acknowledged !== true || digest(restored) !== op.expectedRestored) return manual(`rollback failed:${op.id}`);
        await journal.append({ event: 'RESTORED+READBACK', stage: op.id, identity: digest(restored) });
        trace.push(`RESTORED+READBACK:${op.id}`);
      } catch { return manual(`rollback failed:${op.id}`); }
    }
    for (const target of tx.targets) {
      try { if (digest(await adapters.readTarget(target.id)) !== target.baselineSha256) return manual(`baseline not restored:${target.id}`); }
      catch { return manual(`final baseline readback unavailable:${target.id}`); }
    }
    return { status: uncertain ? 'MANUAL_RECOVERY_REQUIRED' : 'MOCKED_ABORT_RESTORED_NOT_ADMITTED', reason, trace };
  }
  async function manual(reason) { await journal.append({ event: 'MANUAL_RECOVERY_REQUIRED', reason }); return { status: 'MANUAL_RECOVERY_REQUIRED', reason, trace }; }
}
