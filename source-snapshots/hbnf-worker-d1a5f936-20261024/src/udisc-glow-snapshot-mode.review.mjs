/**
 * HBNF snapshot provenance; the upstream XLSX has NO provider cursor, signed
 * revision, score-update timestamp or push contract. Everything identified as
 * hbnf* is derived locally after an event-bound fetch and independent CAS.
 * Pure except for its cryptographic hash; no UDisc, Supabase or Cart calls.
 */
const clean = x => String(x ?? '').trim();
const iso = x => typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x) && !Number.isNaN(Date.parse(x));
const asScore = x => clean(x);

export async function xlsxSha256(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw Error('An exact, bounded XLSX byte buffer is required.');
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A new source score is fresh only when an ACTUAL STORED scored hole changes.
 * Rank, totals, user/roster edits, ZIP packaging and repeated GETs are NOT
 * scored-hole freshness. Mismatches under manual override are never counted.
 */
export function acceptedHoleChanges(before, after) {
  const previous = new Map((before?.players||[]).map(p=>[clean(p?.id),p]));
  const incoming = new Map((after?.udiscSync?.latest?.rows||[]).map(r=>[clean(r?.glowTeamId),r]));
  const changes=[];
  for(const p of after?.players||[]) {
    const prior=previous.get(clean(p?.id));
    const fromSource=incoming.get(clean(p?.id));
    if(!fromSource||!Array.isArray(p?.scores))continue;
    for(let i=0;i<Math.min(18,p.scores.length);i++){
      const next=asScore(p.scores[i]);
      const original=asScore(prior?.scores?.[i]);
      const imported=asScore(fromSource?.holeScores?.[i]);
      if(next && next!==original && imported===next)
        changes.push({teamId:clean(p.id),hole:i+1,previous:original,next});
    }
  }
  return changes;
}

export function attachLocalSnapshotEvidence({before,prepared,sha256,observedAt,eventId,weekDate}) {
  if(!prepared?.changed||!prepared.week?.udiscSync?.latest)throw Error('Snapshot must contain a material proposal.');
  if(!/^[a-f0-9]{64}$/.test(sha256)||!iso(observedAt)||prepared.week.udiscSync.eventId!==eventId||prepared.week.udiscSync.weekDate!==weekDate)
    throw Error('Local snapshot digest, observation or event identity is invalid.');
  const prior=before?.udiscSync;
  const prevSequence=Number(prior?.latest?.hbnfLocalSnapshot?.sequence||0);
  if(!Number.isSafeInteger(prevSequence)||prevSequence<0||prevSequence>1_000_000_000)throw Error('Local snapshot sequence is invalid.');
  const acceptedChanges=acceptedHoleChanges(before,prepared.week);
  const previousHoleAt=prior?.latest?.hbnfLocalSnapshot?.lastAcceptedHoleObservedAt||prior?.status?.lastSuccessAt||null;
  const lastAcceptedHoleObservedAt=acceptedChanges.length?observedAt:(iso(previousHoleAt)?previousHoleAt:null);
  const after=prepared.week;
  after.udiscSync.latest.hbnfLocalSnapshot={
    sha256,sequence:prevSequence+1,observedAt,
    lastAcceptedHoleObservedAt,acceptedHoleChanges:acceptedChanges.length,
    provenance:'HBNF_LOCAL_XLSX_OBSERVATION_NOT_UDISC_METADATA',
    providerCursor:null,providerRevision:null,providerUpdatedAt:null,
  };
  after.udiscSync.status={
    state:acceptedChanges.length?'fresh':'standings_only',
    lastAttemptAt:observedAt,lastSuccessAt:lastAcceptedHoleObservedAt,errorCode:null,
    freshnessBasis:acceptedChanges.length?'HBNF_ACCEPTED_HOLE_CHANGE':'NO_NEW_ACCEPTED_HOLE_SCORE',
  };
  return {week:after,acceptedChanges,sequence:prevSequence+1,lastAcceptedHoleObservedAt};
}

export function shouldPauseForRateLimit(week,now,minimumMs=5*60_000) {
  const state=week?.udiscSync?.status;
  const last=Date.parse(state?.lastAttemptAt||'');
  return state?.state==='failed' && state?.errorCode==='SOURCE_RATE_LIMITED' &&
    Number.isFinite(last) && now instanceof Date && now.getTime()>=last && now.getTime()-last<minimumMs;
}
