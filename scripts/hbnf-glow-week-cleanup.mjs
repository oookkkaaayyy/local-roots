// One-use, revision-safe cleanup of the known Nov 3 rehearsal round.
// All writes use the existing anonymous CAS RPC; provider, Drive and GitHub
// operations are injected so the offline tests cannot reach production.
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createGoogleDriveEvidenceStore, createGitHubExecutionLockAdapter} from './hbnf-two-target-provider-adapters.mjs';

export const HBNF_GLOW_CLEANUP = Object.freeze({
  format: 'hbnf-glow-week-cleanup-v1',
  projectId: 'phcpbvuqibyarpfrftgx',
  table: 'public.league_state',
  rowId: 1,
  weekDate: '2026-11-03',
  testMarker: /^test player(?:\b|\s)/i,
});

const fail = message => { throw new Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const md5 = value => createHash('md5').update(value).digest('hex');
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;
export const canonicalJson = value => JSON.stringify(stable(value));
export const canonicalBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
function sameTimestamp(a, b) {
  const micros = value => {
    const text = String(value || '');
    const fraction = text.match(/\.(\d{1,6})/)?.[1] || '';
    const millis = Date.parse(text);
    if (!Number.isFinite(millis)) return null;
    const subMillis = Number((fraction + '000000').slice(3, 6));
    return millis * 1000 + subMillis;
  };
  return micros(a) !== null && micros(a) === micros(b);
}

/** Reuse the established private Drive byte-verified store for cleanup evidence. */
export function createHbnfGlowCleanupStorage(options = {}) {
  return createGoogleDriveEvidenceStore({...options, folderId:'1mZWMyzLIKnSjBTP82-EfGOqktld17X84'});
}

/** Three separate GitHub create-file references make admission, execution,
 * and restore claims independently atomic and non-replayable. */
export function createHbnfGlowCleanupLedger({createFile, fetchFile, releaseId, repository='oookkkaaayyy/local-roots', branch='feature/udisc-glow-standings-prototype'} = {}) {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(releaseId || '')) fail('cleanup release ID is required for unique claims');
  const names = ['admission','execution','restore'];
  const locks = Object.fromEntries(names.map(kind => [kind, createGitHubExecutionLockAdapter({
    createFile, fetchFile, releaseId:`${releaseId}-${kind}`,
    repository, branch, claimPath:`release-claims/${releaseId}.${kind}-claim.json`,
  })]));
  return Object.fromEntries(names.flatMap(kind => [
    [`claim${kind[0].toUpperCase()}${kind.slice(1)}`, (_claim, bytes) => locks[kind].createExclusive(kind, bytes)],
    [`read${kind[0].toUpperCase()}${kind.slice(1)}`, id => locks[kind].read(id)],
  ]));
}

function scoreCount(players) {
  return (players || []).reduce((sum, player) => sum + (player.scores || []).filter(value =>
    value !== null && value !== undefined && value !== ''
  ).length, 0);
}

function testAliases(aliases) {
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) fail('Glow alias map is not an object');
  return Object.keys(aliases).filter(key => HBNF_GLOW_CLEANUP.testMarker.test(key) ||
    HBNF_GLOW_CLEANUP.testMarker.test(String(aliases[key]))).sort();
}

function targetWeek(root) {
  const glow = root?.glow;
  if (!glow || glow.activeWeek !== HBNF_GLOW_CLEANUP.weekDate) fail('Nov 3 must remain the active Glow week');
  const week = glow.weeks?.[HBNF_GLOW_CLEANUP.weekDate];
  if (!week || week.scoresLocked !== false) fail('Nov 3 week is missing or locked');
  return week;
}

/** Build only the exact rehearsal cleanup. No other branch or week is edited. */
export function buildCleanupCandidate(stateJson, operation) {
  if (!stateJson || typeof stateJson !== 'object' || Array.isArray(stateJson)) fail('league_state JSON must be an object');
  const week = targetWeek(stateJson);
  const cards = week.cards;
  const players = week.players;
  if (!Array.isArray(cards) || !Array.isArray(players)) fail('Nov 3 cards/players arrays are missing');
  if (cards.some(card => card.finalized === true)) fail('a Nov 3 rehearsal card is finalized');
  const teams = cards.flatMap(card => Array.isArray(card.players) ? card.players : []);
  if (!teams.every(team => [team.partner1, team.partner2].some(name => HBNF_GLOW_CLEANUP.testMarker.test(String(name || '')))) ||
      !players.every(player => [player.name, player.partner1, player.partner2].some(name => HBNF_GLOW_CLEANUP.testMarker.test(String(name || ''))))) {
    fail('Nov 3 includes a team/player without an explicit test-player identity; refusing broad cleanup');
  }
  const aliasKeys = testAliases(stateJson.glow.playerAliases);
  const counts = {cards: cards.length, teams: teams.length, playerRows: players.length, enteredScores: scoreCount(players), testAliases: aliasKeys.length};
  if (!operation || !isDeepStrictEqual(counts, operation.expectedCounts)) fail('rehearsal data counts differ from the admitted exact cleanup');
  const aliasesMd5 = md5(aliasKeys.join('\n'));
  if (aliasesMd5 !== operation.testAliasKeysMd5) fail('test alias set differs from the admitted exact set');
  const rehearsalPayloadSha256 = sha256(Buffer.from(canonicalJson({cards, players})));
  if (rehearsalPayloadSha256 !== operation.rehearsalPayloadSha256) fail('Nov 3 rehearsal payload differs from the admitted snapshot');

  const cleaned = structuredClone(stateJson);
  const cleanedWeek = cleaned.glow.weeks[HBNF_GLOW_CLEANUP.weekDate];
  cleanedWeek.cards = [];
  cleanedWeek.players = [];
  for (const key of aliasKeys) delete cleaned.glow.playerAliases[key];

  // Prove all state outside the three exact collection edits is unchanged.
  const expected = structuredClone(stateJson);
  expected.glow.weeks[HBNF_GLOW_CLEANUP.weekDate].cards = [];
  expected.glow.weeks[HBNF_GLOW_CLEANUP.weekDate].players = [];
  for (const key of aliasKeys) delete expected.glow.playerAliases[key];
  if (!isDeepStrictEqual(cleaned, expected)) fail('cleanup changed state outside its declared paths');
  const cleanedStateSha256 = sha256(Buffer.from(canonicalJson(cleaned)));
  if (cleanedStateSha256 !== operation.cleanedStateSha256) fail('cleanup result differs from the admitted exact state');
  return {stateJson: cleaned, counts, aliasKeysMd5: aliasesMd5, rehearsalPayloadSha256, cleanedStateSha256};
}

function validateManifest(manifest, manifestBytes, sourceCommit) {
  if (!manifest || manifest.format !== HBNF_GLOW_CLEANUP.format || manifest.phase !== 'PENDING' || manifest.oneTime !== true) fail('cleanup manifest identity/phase is invalid');
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(manifest.releaseId || '')) fail('cleanup release ID is not a safe immutable identifier');
  if (!Buffer.from(manifestBytes || []).equals(canonicalBytes(manifest))) fail('cleanup manifest bytes are not canonical and exact');
  if (!/^[0-9a-f]{40}$/.test(sourceCommit || '') || manifest.sourceCommit !== sourceCommit) fail('cleanup source commit differs from the running committed source');
  if (manifest.ownerAuthorization?.confirmed !== true || !manifest.ownerAuthorization?.evidence ||
      manifest.ownerAuthorization.scope !== 'remove only the verified rehearsal rows and aliases from the Nov 3 Glow week') fail('scoped owner authorization evidence is missing');
  if (manifest.target?.projectId !== HBNF_GLOW_CLEANUP.projectId || manifest.target?.table !== HBNF_GLOW_CLEANUP.table ||
      manifest.target?.rowId !== HBNF_GLOW_CLEANUP.rowId || manifest.target?.weekDate !== HBNF_GLOW_CLEANUP.weekDate) fail('cleanup target is outside the exact production row/week');
  const b = manifest.baseline, backup = manifest.backup, op = manifest.operation;
  if (!b || !/^\d{4}-\d\d-\d\d[ T].+/.test(b.updatedAt || '') || !/^[a-f0-9]{32}$/.test(b.rowFingerprint || '') ||
      !/^[a-f0-9]{32}$/.test(b.stateJsonMd5 || '') || b.matrixAutoLive !== false ||
      b.queueFingerprint !== b.stateJsonMd5 || b.queueStateUpdatedAt !== b.updatedAt ||
      !Number.isInteger(b.cinematicEventCount) || b.cinematicEventCount < 0 || b.tagProjectionMatches !== true) fail('cleanup baseline/Matrix/tag side-effect evidence is incomplete');
  if (!backup || !backup.driveFileId || !Number.isSafeInteger(backup.bytes) || backup.bytes <= 0 ||
      !/^[a-f0-9]{64}$/.test(backup.sha256 || '') || backup.downloadBackVerified !== true) fail('exact durable recovery snapshot is missing');
  if (!op || !isDeepStrictEqual(op.expectedCounts, {cards: 1, teams: 3, playerRows: 3, enteredScores: 9, testAliases: 4}) ||
      !/^[a-f0-9]{32}$/.test(op.testAliasKeysMd5 || '') || !/^[a-f0-9]{64}$/.test(op.rehearsalPayloadSha256 || '') ||
      !/^[a-f0-9]{64}$/.test(op.cleanedStateSha256 || '') || !/^[a-f0-9]{32}$/.test(op.cleanedStateMd5 || '')) fail('exact cleanup transformation is not fully bound');
  if (b.testAliasKeysMd5 !== op.testAliasKeysMd5) fail('baseline does not bind the exact temporary alias set');
  if (!manifest.claims?.admission || !manifest.claims?.execution || !manifest.claims?.restore ||
      new Set([manifest.claims.admission, manifest.claims.execution, manifest.claims.restore]).size !== 3) fail('admission, execution, and restore require distinct one-use claims');
  const stem = `release-claims/${manifest.releaseId}`;
  if (manifest.claims.admission !== `${stem}.admission-claim.json` || manifest.claims.execution !== `${stem}.execution-claim.json` ||
      manifest.claims.restore !== `${stem}.restore-claim.json`) fail('cleanup claim paths are not the exact immutable admission/execution/restore paths');
}

function assertBaseline(readback, manifest) {
  const b = manifest.baseline;
  const mismatches = [];
  const equals = (path, actual, expected) => { if (actual !== expected) mismatches.push(path); };
  equals('projectId', readback?.projectId, HBNF_GLOW_CLEANUP.projectId);
  equals('row.id', readback?.row?.id, 1);
  equals('row.updatedAt', readback?.row?.updatedAt, b.updatedAt);
  equals('row.rowFingerprint', readback?.row?.rowFingerprint, b.rowFingerprint);
  equals('row.stateJsonMd5', readback?.row?.stateJsonMd5, b.stateJsonMd5);
  equals('row.activeWeek', readback?.row?.activeWeek, HBNF_GLOW_CLEANUP.weekDate);
  equals('row.testAliases', readback?.row?.testAliases, manifest.operation.expectedCounts.testAliases);
  equals('row.testAliasKeysMd5', readback?.row?.testAliasKeysMd5, manifest.operation.testAliasKeysMd5);
  equals('row.cards', readback?.row?.cards, manifest.operation.expectedCounts.cards);
  equals('row.teams', readback?.row?.teams, manifest.operation.expectedCounts.teams);
  equals('row.playerRows', readback?.row?.playerRows, manifest.operation.expectedCounts.playerRows);
  equals('row.enteredScores', readback?.row?.enteredScores, manifest.operation.expectedCounts.enteredScores);
  equals('matrix.queueFingerprint', readback?.matrix?.queueFingerprint, b.queueFingerprint);
  equals('matrix.queueStateUpdatedAt', readback?.matrix?.queueStateUpdatedAt, b.queueStateUpdatedAt);
  equals('matrix.autoLive', readback?.matrix?.autoLive, false);
  equals('matrix.cinematicEventCount', readback?.matrix?.cinematicEventCount, b.cinematicEventCount);
  equals('tagProjectionMatches', readback?.tagProjectionMatches, true);
  equals('row.scoresLocked', readback?.row?.scoresLocked, false);
  if (mismatches.length) fail(`fresh Supabase/Matrix/tag baseline differs (${mismatches.join(', ')}); no write is allowed`);
}

function verifyCleanReadback(readback, manifest, expectedUpdatedAt) {
  const row = readback?.row, matrix = readback?.matrix;
  if (!row || row.updatedAt === manifest.baseline.updatedAt || (expectedUpdatedAt && row.updatedAt !== expectedUpdatedAt) ||
      row.stateJsonMd5 !== manifest.operation.cleanedStateMd5 || row.activeWeek !== HBNF_GLOW_CLEANUP.weekDate ||
      row.cards !== 0 || row.teams !== 0 || row.playerRows !== 0 || row.enteredScores !== 0 || row.testAliases !== 0 ||
      row.scoresLocked !== false || matrix?.queueFingerprint !== row.stateJsonMd5 || matrix?.queueStateUpdatedAt !== row.updatedAt ||
      matrix?.autoLive !== false || matrix?.cinematicEventCount !== manifest.baseline.cinematicEventCount ||
      readback.tagProjectionMatches !== true) fail('independent cleanup/Matrix/tag readback failed');
}

function verifyRestoredReadback(readback, manifest, expectedUpdatedAt) {
  const row = readback?.row, matrix = readback?.matrix;
  if (!row || row.updatedAt === manifest.baseline.updatedAt || (expectedUpdatedAt && row.updatedAt !== expectedUpdatedAt) ||
      row.stateJsonMd5 !== manifest.baseline.stateJsonMd5 || row.activeWeek !== HBNF_GLOW_CLEANUP.weekDate ||
      matrix?.queueFingerprint !== row.stateJsonMd5 || matrix?.queueStateUpdatedAt !== row.updatedAt ||
      matrix?.autoLive !== false || matrix?.cinematicEventCount !== manifest.baseline.cinematicEventCount ||
      readback.tagProjectionMatches !== true) fail('exact snapshot restore readback failed');
}

async function putAndVerify(storage, name, bytes) {
  const result = await storage.putOnce(name, bytes);
  if (!result?.id || !Buffer.from(await storage.download(result.id)).equals(bytes)) fail(`durable Drive readback failed for ${name}`);
  return result;
}

async function verifySnapshot(storage, manifest) {
  const bytes = Buffer.from(await storage.download(manifest.backup.driveFileId));
  if (bytes.length !== manifest.backup.bytes || sha256(bytes) !== manifest.backup.sha256) fail('downloaded recovery snapshot bytes/hash mismatch');
  let parsed;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { fail('durable recovery snapshot is not valid JSON'); }
  if (parsed?.id !== 1 || !sameTimestamp(parsed?.updated_at, manifest.baseline.updatedAt) || !parsed?.state_json) fail('recovery snapshot target/revision mismatch');
  return {bytes, snapshot: parsed};
}

function assertLedger(ledger) {
  for (const method of ['claimAdmission', 'readAdmission', 'claimExecution', 'readExecution', 'claimRestore', 'readRestore']) {
    if (typeof ledger?.[method] !== 'function') fail(`one-use cleanup ledger missing ${method}`);
  }
}

export function createHbnfGlowCleanupGate({provider, storage, ledger, sourceCommit, clock = () => new Date().toISOString()} = {}) {
  if (typeof provider?.read !== 'function' || typeof provider?.hashState !== 'function' || typeof provider?.compareAndSwap !== 'function') fail('Supabase cleanup adapter is incomplete');
  if (typeof storage?.putOnce !== 'function' || typeof storage?.download !== 'function') fail('durable Drive cleanup adapter is incomplete');
  assertLedger(ledger);

  async function claim(method, readMethod, claim, bytes) {
    const result = await ledger[method](claim, bytes);
    if (!result?.created || !result.id) fail(`${claim.kind} one-use claim was already consumed or not confirmed`);
    const remote = Buffer.from(await ledger[readMethod](result.id));
    if (!remote.equals(bytes)) fail(`${claim.kind} claim remote readback mismatch`);
    return result;
  }

  return {
    async admit({manifest, manifestBytes}) {
      validateManifest(manifest, manifestBytes, sourceCommit);
      const manifestSha256 = sha256(Buffer.from(manifestBytes));
      const {snapshot} = await verifySnapshot(storage, manifest);
      if (await provider.hashState(snapshot.state_json) !== manifest.baseline.stateJsonMd5) fail('durable snapshot JSON does not match the admitted database state fingerprint');
      const baseline = await provider.read();
      assertBaseline(baseline, manifest);
      const plan = buildCleanupCandidate(snapshot.state_json, manifest.operation);
      const cleanedStateMd5 = await provider.hashState(plan.stateJson);
      if (cleanedStateMd5 !== manifest.operation.cleanedStateMd5) fail('Postgres JSONB cleanup fingerprint differs from the admitted result');
      const storedManifest = await putAndVerify(storage, `${manifest.releaseId}.manifest.json`, Buffer.from(manifestBytes));
      const admissionClaimBytes = canonicalBytes({format: 'hbnf-glow-cleanup-admission-claim-v1', releaseId: manifest.releaseId, manifestSha256, sourceCommit: manifest.sourceCommit, claimedAt: clock()});
      const admissionClaim = await claim('claimAdmission', 'readAdmission', {kind: 'admission', key: manifest.claims.admission}, admissionClaimBytes);
      const decision = {
        format: 'hbnf-glow-cleanup-admission-decision-v1', releaseId: manifest.releaseId, status: 'ADMISSION_PASS',
        manifestSha256, sourceCommit: manifest.sourceCommit, snapshotDriveId: manifest.backup.driveFileId,
        target: manifest.target, baseline: manifest.baseline, operation: manifest.operation,
        admissionClaimId: admissionClaim.id, manifestDriveId: storedManifest.id, decidedAt: clock(),
      };
      const decisionBytes = canonicalBytes(decision);
      const storedDecision = await putAndVerify(storage, `${manifest.releaseId}.decision.json`, decisionBytes);
      return {status: 'ADMISSION_PASS', releaseId: manifest.releaseId, manifest, manifestBytes: Buffer.from(manifestBytes), manifestSha256, manifestDriveId: storedManifest.id, decision, decisionBytes, decisionDriveId: storedDecision.id, decisionSha256: sha256(decisionBytes), plan};
    },

    async execute(admission) {
      if (admission?.status !== 'ADMISSION_PASS' || admission.manifest?.releaseId == null) fail('fresh cleanup ADMISSION_PASS is required');
      const {manifest} = admission;
      validateManifest(manifest, admission.manifestBytes, sourceCommit);
      if (sha256(Buffer.from(admission.manifestBytes)) !== admission.manifestSha256) fail('cleanup admission manifest hash changed');
      const durableManifest = Buffer.from(await storage.download(admission.manifestDriveId));
      if (!durableManifest.equals(admission.manifestBytes)) fail('admitted manifest is no longer durably retrievable');
      const durableDecision = Buffer.from(await storage.download(admission.decisionDriveId));
      if (!durableDecision.equals(admission.decisionBytes) || sha256(durableDecision) !== admission.decisionSha256 ||
          admission.decision?.status !== 'ADMISSION_PASS' || admission.decision?.manifestSha256 !== admission.manifestSha256) fail('durable cleanup admission decision mismatch');
      const {snapshot} = await verifySnapshot(storage, manifest);
      if (await provider.hashState(snapshot.state_json) !== manifest.baseline.stateJsonMd5) fail('downloaded recovery snapshot no longer matches the admitted database state');
      const plan = buildCleanupCandidate(snapshot.state_json, manifest.operation);
      const executionClaimBytes = canonicalBytes({format: 'hbnf-glow-cleanup-execution-claim-v1', releaseId: manifest.releaseId, manifestSha256: admission.manifestSha256, sourceCommit: manifest.sourceCommit, claimedAt: clock()});
      const executionClaim = await claim('claimExecution', 'readExecution', {kind: 'execution', key: manifest.claims.execution}, executionClaimBytes);
      let mutationAttempted = false, expectedAfterUpdatedAt = null;
      try {
        const fresh = await provider.read();
        assertBaseline(fresh, manifest); // mutation-boundary re-read after the exclusive claim
        mutationAttempted = true;
        const write = await provider.compareAndSwap(manifest.baseline.updatedAt, plan.stateJson);
        if (write?.saved !== true || !write.updatedAt) fail('CAS save was not acknowledged; checking actual row before any recovery');
        expectedAfterUpdatedAt = write.updatedAt;
        const after = await provider.read();
        verifyCleanReadback(after, manifest, expectedAfterUpdatedAt);
        const receipt = {
          format: 'hbnf-glow-week-cleanup-closeout-v1', releaseId: manifest.releaseId,
          manifestSha256: admission.manifestSha256, admissionDecisionDriveId: admission.decisionDriveId,
          executionClaimId: executionClaim.id, sourceCommit: manifest.sourceCommit,
          backupDriveId: manifest.backup.driveFileId, backupSha256: manifest.backup.sha256,
          target: manifest.target, cleanup: {status: 'PASS', counts: plan.counts, stateJsonMd5: after.row.stateJsonMd5, updatedAt: after.row.updatedAt},
          matrix: {autoLive: after.matrix.autoLive, queueFingerprint: after.matrix.queueFingerprint, queueStateUpdatedAt: after.matrix.queueStateUpdatedAt, cinematicEventCount: after.matrix.cinematicEventCount},
          tagProjectionMatches: after.tagProjectionMatches, closedAt: clock(),
        };
        const receiptBytes = canonicalBytes(receipt);
        const stored = await putAndVerify(storage, `${manifest.releaseId}.closeout.json`, receiptBytes);
        return {status: 'CLEANUP_PASS', receipt, receiptBytes, receiptDriveId: stored.id, receiptSha256: sha256(receiptBytes), receiptBytesLength: receiptBytes.length};
      } catch (error) {
        let disposition = mutationAttempted ? 'MUTATION_STATE_UNCERTAIN' : 'ABORTED_BEFORE_WRITE';
        let restoreReceipt = null;
        if (mutationAttempted) {
          try {
            const current = await provider.read();
            const exactCandidateCurrent = current.row?.stateJsonMd5 === manifest.operation.cleanedStateMd5 &&
              (!expectedAfterUpdatedAt || current.row?.updatedAt === expectedAfterUpdatedAt) &&
              current.row?.activeWeek === HBNF_GLOW_CLEANUP.weekDate && current.matrix?.queueFingerprint === current.row.stateJsonMd5 &&
              current.matrix?.autoLive === false && current.matrix?.cinematicEventCount === manifest.baseline.cinematicEventCount &&
              current.tagProjectionMatches === true && current.row?.updatedAt !== manifest.baseline.updatedAt;
            if (exactCandidateCurrent) {
              const restoreClaimBytes = canonicalBytes({format: 'hbnf-glow-cleanup-restore-claim-v1', releaseId: manifest.releaseId, manifestSha256: admission.manifestSha256, currentUpdatedAt: current.row.updatedAt, claimedAt: clock()});
              const restoreClaim = await claim('claimRestore', 'readRestore', {kind: 'restore', key: manifest.claims.restore}, restoreClaimBytes);
              const restore = await provider.compareAndSwap(current.row.updatedAt, snapshot.state_json);
              if (restore?.saved === true && restore.updatedAt) {
                const restored = await provider.read();
                verifyRestoredReadback(restored, manifest, restore.updatedAt);
                disposition = 'RESTORED_BASELINE';
                restoreReceipt = {claimId: restoreClaim.id, updatedAt: restored.row.updatedAt, stateJsonMd5: restored.row.stateJsonMd5};
              } else disposition = 'RESTORE_CAS_NOT_ACKNOWLEDGED';
            } else disposition = 'PRESERVED_CONCURRENT_OR_UNEXPECTED_STATE';
          } catch (restoreError) {
            disposition = `RESTORE_NOT_COMPLETED: ${String(restoreError?.message || restoreError).slice(0,180)}`;
          }
        }
        const failure = {format: 'hbnf-glow-week-cleanup-failure-v1', releaseId: manifest.releaseId, manifestSha256: admission.manifestSha256, executionClaimId: executionClaim.id, disposition, restore: restoreReceipt, error: String(error?.message || error), failedAt: clock()};
        try { const bytes = canonicalBytes(failure); const stored = await putAndVerify(storage, `${manifest.releaseId}.failure.json`, bytes); }
        catch (receiptError) { throw new AggregateError([error, receiptError], `cleanup failed; disposition=${disposition}; failure receipt could not be durably verified`); }
        fail(`cleanup did not pass; ${disposition}; durable failure receipt recorded`);
      }
    },
  };
}

function sqlLiteral(json) {
  const tag = `hbnf_${sha256(Buffer.from(json)).slice(0, 20)}`;
  if (json.includes(`$${tag}$`)) fail('could not construct an unambiguous SQL JSON literal');
  return `$${tag}$${json}$${tag}$::jsonb`;
}

function parseSqlRows(result) {
  if (result?.isError === true) fail('Supabase cleanup SQL adapter returned an error');
  const content = (result?.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
  let outer;
  try { outer = JSON.parse(content); } catch { fail('Supabase cleanup SQL result was not JSON'); }
  const body = String(outer.result || '');
  const close = [...body.matchAll(/<\/untrusted-data-([^>]+)>/g)].at(-1);
  if (!close) fail('Supabase cleanup SQL result omitted its bounded data block');
  const open = `<untrusted-data-${close[1]}>`;
  const start = body.lastIndexOf(open, close.index);
  if (start < 0) fail('Supabase cleanup SQL data block was malformed');
  try { return JSON.parse(body.slice(start + open.length, close.index).trim()); }
  catch { fail('Supabase cleanup SQL data block was not valid JSON'); }
}

/** Uses only read-only inspection and the existing acknowledged CAS RPC. */
export function createSupabaseGlowCleanupProvider({executeSql, projectId = HBNF_GLOW_CLEANUP.projectId} = {}) {
  if (typeof executeSql !== 'function' || projectId !== HBNF_GLOW_CLEANUP.projectId) fail('exact Supabase cleanup target is required');
  const query = async sql => {
    const rows = parseSqlRows(await executeSql({project_id: projectId, query: sql}));
    if (!Array.isArray(rows) || rows.length !== 1) fail('Supabase cleanup read did not return exactly one row');
    return rows[0];
  };
  return {
    async read() {
      const sql = `select jsonb_build_object(
        'projectId','${HBNF_GLOW_CLEANUP.projectId}',
        'row',jsonb_build_object(
          'id',ls.id,'updatedAt',ls.updated_at,
          'rowFingerprint',md5(to_jsonb(ls)::text),'stateJsonMd5',md5(ls.state_json::text),
          'activeWeek',ls.state_json #>> '{glow,activeWeek}',
          'cards',jsonb_array_length(coalesce(ls.state_json #> '{glow,weeks,${HBNF_GLOW_CLEANUP.weekDate},cards}','[]'::jsonb)),
          'teams',coalesce((select sum(jsonb_array_length(coalesce(c.value->'players','[]'::jsonb))) from jsonb_array_elements(coalesce(ls.state_json #> '{glow,weeks,${HBNF_GLOW_CLEANUP.weekDate},cards}','[]'::jsonb)) c(value)),0),
          'playerRows',jsonb_array_length(coalesce(ls.state_json #> '{glow,weeks,${HBNF_GLOW_CLEANUP.weekDate},players}','[]'::jsonb)),
          'enteredScores',coalesce((select count(*) from jsonb_array_elements(coalesce(ls.state_json #> '{glow,weeks,${HBNF_GLOW_CLEANUP.weekDate},players}','[]'::jsonb)) p(value) cross join lateral jsonb_array_elements(coalesce(p.value->'scores','[]'::jsonb)) score(value) where score.value <> 'null'::jsonb and score.value <> '""'::jsonb),0),
          'testAliases',coalesce((select count(*) from jsonb_each_text(coalesce(ls.state_json #> '{glow,playerAliases}','{}'::jsonb)) a(key,value) where lower(a.key) like '%test player%' or lower(a.value) like '%test player%'),0),
          'testAliasKeysMd5',md5(coalesce((select string_agg(a.key,E'\\n' order by a.key) from jsonb_each_text(coalesce(ls.state_json #> '{glow,playerAliases}','{}'::jsonb)) a(key,value) where lower(a.key) like '%test player%' or lower(a.value) like '%test player%'),'')),
          'scoresLocked',coalesce((ls.state_json #>> '{glow,weeks,${HBNF_GLOW_CLEANUP.weekDate},scoresLocked}')::boolean,false)
        ),
        'matrix',jsonb_build_object(
          'queueFingerprint',(select q.fingerprint from public.hbnf_matrix_vnext_live_queue q where q.id=1),
          'queueStateUpdatedAt',(select q.state_updated_at from public.hbnf_matrix_vnext_live_queue q where q.id=1),
          'autoLive',coalesce((select c.auto_live from public.hbnf_matrix_control_state c where c.id=1),false),
          'cinematicEventCount',(select count(*) from public.hbnf_cinematic_events)
        ),
        'tagProjectionMatches',
          ls.state_json #> '{bagTags,players}' is not distinct from coalesce((select jsonb_agg(jsonb_build_object('tag',e.tag_number,'name',e.player_name) order by e.tag_number,lower(e.player_name)) from public.hbnf_current_tag_entries e),'[]'::jsonb)
          and ls.state_json #> '{bagTags,manual}' is not distinct from coalesce((select jsonb_object_agg(e.player_name,e.tag_number) from public.hbnf_current_tag_entries e),'{}'::jsonb)
      ) as readback from public.league_state ls where ls.id=1`;
      return (await query(sql)).readback;
    },
    async hashState(stateJson) {
      const serialized = JSON.stringify(stateJson);
      const row = await query(`select md5(${sqlLiteral(serialized)}::text) as "stateJsonMd5"`);
      return row.stateJsonMd5;
    },
    async compareAndSwap(expectedUpdatedAt, stateJson) {
      if (!/^\d{4}-\d\d-\d\d[ T].+/.test(expectedUpdatedAt || '')) fail('CAS expected revision is invalid');
      const revision = `'${expectedUpdatedAt.replace(/'/g, "''")}'::timestamptz`;
      const serialized = JSON.stringify(stateJson);
      const guardedSave = `DO $hbnf_cleanup_guard$
        DECLARE v_saved boolean;
        BEGIN
          LOCK TABLE public.hbnf_current_tag_entries IN SHARE MODE;
          PERFORM 1 FROM public.hbnf_matrix_control_state WHERE id=1 AND auto_live IS FALSE FOR SHARE;
          IF NOT FOUND THEN RAISE EXCEPTION 'hbnf_cleanup_matrix_live_or_missing'; END IF;
          SELECT EXISTS(SELECT 1 FROM public.hbnf_save_league_state_v1(${revision},${sqlLiteral(serialized)})) INTO v_saved;
          IF NOT v_saved THEN RAISE EXCEPTION 'hbnf_cleanup_cas_conflict'; END IF;
        END
      $hbnf_cleanup_guard$`;
      const writeResult = await executeSql({project_id: projectId, query: guardedSave});
      if (writeResult?.isError === true) fail('guarded CAS failed; no direct table write was attempted');
      const after = await this.read();
      const expectedMd5 = await this.hashState(stateJson);
      return {saved: after.row?.stateJsonMd5 === expectedMd5 && after.row?.updatedAt !== expectedUpdatedAt, updatedAt: after.row?.updatedAt || null};
    },
  };
}
