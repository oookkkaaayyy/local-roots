// Source-only builder for the existing Scoring administrator's Nov 10 week
// initialization. This module never calls a provider or writes league_state.
import { createHash } from 'node:crypto';

export const NOV10_EVENT = Object.freeze({
  eventId: 'hb-glow-doubles-af85rU',
  date: '2026-11-10',
  windowStart: '2026-11-11T01:30:00Z',
  windowEnd: '2026-11-11T07:30:00Z',
});

const canonical = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item);
const sha256 = value => createHash('sha256').update(canonical(value)).digest('hex');

function verifiedPars(witness) {
  if (!witness || witness.eventId !== NOV10_EVENT.eventId || witness.date !== NOV10_EVENT.date ||
      witness.windowStart !== NOV10_EVENT.windowStart || witness.windowEnd !== NOV10_EVENT.windowEnd ||
      !witness.authority || !witness.sourceUrl || !/^[a-f0-9]{64}$/.test(witness.sourceSha256 || '') ||
      witness.verified !== true || !Array.isArray(witness.holes) || witness.holes.length !== 18)
    throw new Error('NOV10_AUTHORIZED_EXACT_LAYOUT_WITNESS_REQUIRED');
  const pars = {};
  witness.holes.forEach((hole, i) => {
    if (hole.number !== i + 1 || !Number.isInteger(hole.par) || hole.par < 2 || hole.par > 6)
      throw new Error('NOV10_LAYOUT_MUST_HAVE_EXACTLY_18_ORDERED_VALID_PARS');
    pars[String(i + 1)] = String(hole.par);
  });
  if (witness.layoutSha256 && sha256(witness.holes) !== witness.layoutSha256)
    throw new Error('NOV10_LAYOUT_WITNESS_HASH_MISMATCH');
  return { pars, parTotal: Object.values(pars).reduce((sum, value) => sum + Number(value), 0) };
}

/**
 * Build exact changed-path CAS and path-only inverse after an authorized
 * layout witness and fresh provider preimage. This is a review artifact only.
 */
export function prepareNov10WeekInitialization({ root, updatedAt, witness }) {
  const { pars, parTotal } = verifiedPars(witness);
  if (!root || !updatedAt || !root.glow || !root.glow.weeks ||
      root.glow.activeWeek !== '2026-11-03' || !root.glow.weeks['2026-11-03'])
    throw new Error('FRESH_ROOT_WITH_COMPLETED_NOV03_ACTIVE_WEEK_REQUIRED');
  const nextRoot = structuredClone(root);
  const prior = nextRoot.glow.weeks[NOV10_EVENT.date];
  if (prior !== undefined) throw new Error('NOV10_TARGET_WEEK_ALREADY_EXISTS_REVIEW_REQUIRED');
  const nextWeek = {};
  nextWeek.date = NOV10_EVENT.date;
  nextWeek.eventId = NOV10_EVENT.eventId;
  nextWeek.eventWindow = { start: NOV10_EVENT.windowStart, end: NOV10_EVENT.windowEnd };
  nextWeek.players ??= [];
  nextWeek.cards ??= [];
  nextWeek.scorecardText = { ...(nextWeek.scorecardText || {}), holePars: pars };
  nextWeek.parLayout = {
    authority: witness.authority,
    sourceUrl: witness.sourceUrl,
    sourceSha256: witness.sourceSha256,
    layoutSha256: sha256(witness.holes),
  };
  nextRoot.glow.weeks[NOV10_EVENT.date] = nextWeek;
  nextRoot.glow.activeWeek = NOV10_EVENT.date;

  const changedPaths = [
    `glow.weeks.${NOV10_EVENT.date}`,
    'glow.activeWeek',
  ];
  const inverse = {
    eventId: NOV10_EVENT.eventId,
    date: NOV10_EVENT.date,
    expectedAfterWeekSha256: sha256(nextWeek),
    expectedAfterActiveWeek: NOV10_EVENT.date,
    restoreWeek: null,
    restoreActiveWeek: '2026-11-03',
  };
  return {
    status: 'READY_FOR_EXISTING_ADMIN_CAS_REVIEW',
    event: NOV10_EVENT,
    updatedAt,
    rootSha256: sha256(root),
    proposedRootSha256: sha256(nextRoot),
    proposedRoot: nextRoot,
    changedPaths,
    inverse,
    parTotal,
    witness: { authority: witness.authority, sourceUrl: witness.sourceUrl,
      sourceSha256: witness.sourceSha256, layoutSha256: sha256(witness.holes) },
    acceptance: ['fresh full-root and updatedAt reread immediately before CAS',
      'CAS updates only the two listed paths', 'independent post-CAS full-root readback',
      'November 3 scores, T1/T2 revision 11 tags, skins and financial fields unchanged',
      'inverse allowed only when activeWeek and new-week hash still match this proposal'],
    productionWrite: false,
  };
}

/** Apply inverse to a supplied current root only when its exact postimage matches. */
export function prepareNov10WeekInitializationUndo({ currentRoot, inverse }) {
  const currentWeek = currentRoot?.glow?.weeks?.[NOV10_EVENT.date];
  if (!currentWeek || currentRoot.glow.activeWeek !== inverse?.expectedAfterActiveWeek ||
      sha256(currentWeek) !== inverse.expectedAfterWeekSha256)
    throw new Error('NOV10_UNDO_POSTIMAGE_DRIFT_NO_CHANGE');
  const restored = structuredClone(currentRoot);
  if (inverse.restoreWeek === null) delete restored.glow.weeks[NOV10_EVENT.date];
  else restored.glow.weeks[NOV10_EVENT.date] = structuredClone(inverse.restoreWeek);
  restored.glow.activeWeek = inverse.restoreActiveWeek;
  return { status: 'PATH_ONLY_INVERSE_READY_FOR_SEPARATE_ADMITTED_CAS',
    rootSha256: sha256(currentRoot), proposedRoot: restored,
    proposedRootSha256: sha256(restored),
    changedPaths: [`glow.weeks.${NOV10_EVENT.date}`, 'glow.activeWeek'],
    productionWrite: false };
}
