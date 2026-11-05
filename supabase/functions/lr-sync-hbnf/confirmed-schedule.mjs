export const HBNF_SCHEDULE_CONFIRMATION_REF = "owner-confirmed-hbnf-schedule-2026-10-19";
export const FINAL_MONTHLY_GLOW_DATE = "2026-10-24";
export const FIRST_CONFIRMED_TUESDAY_GLOW = "2026-11-03";
export const CONFIRMED_TUESDAY_HORIZON_OCCURRENCES = 8;

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Expected an ISO date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== value) throw new RangeError("Invalid ISO date");
  return date;
}

export function buildConfirmedGlowSchedule(today) {
  parseIsoDate(today);
  const schedule = [];
  if (today <= FINAL_MONTHLY_GLOW_DATE) {
    schedule.push({
      date: FINAL_MONTHLY_GLOW_DATE,
      rule: "final-monthly-glow-2026-10-24",
      recurrenceRule: "Final monthly Glow on 2026-10-24",
      monthlyFinal: true,
    });
  }

  const lowerBound = today > FIRST_CONFIRMED_TUESDAY_GLOW ? today : FIRST_CONFIRMED_TUESDAY_GLOW;
  const next = parseIsoDate(lowerBound);
  next.setUTCDate(next.getUTCDate() + ((2 - next.getUTCDay() + 7) % 7));
  for (let count = 0; count < CONFIRMED_TUESDAY_HORIZON_OCCURRENCES; count += 1) {
    const date = next.toISOString().slice(0, 10);
    schedule.push({
      date,
      rule: "weekly-tuesday-glow-after-2026-10-27",
      recurrenceRule: "Weekly Tuesday Glow beginning 2026-11-03; limited to eight upcoming dates",
      monthlyFinal: false,
    });
    next.setUTCDate(next.getUTCDate() + 7);
  }
  return schedule;
}

export function hasGlowActivity(week) {
  const activePlayers = Array.isArray(week?.players)
    ? week.players.filter((player) => player?.removed !== true)
    : [];
  const cards = week?.cards && typeof week.cards === "object" ? Object.values(week.cards) : [];
  return activePlayers.length > 0 || cards.some((card) => card?.finalized === true);
}

// A known synthetic scoring fixture must never become a public event or result.
// Requiring every active player to carry the explicit Fixture prefix avoids
// classifying legitimate unfinalized rounds as synthetic.
export function isSyntheticGlowFixtureWeek(week) {
  const players = Array.isArray(week?.players)
    ? week.players.filter((player) => player?.removed !== true)
    : [];
  if (!players.length || week?.finalized === true) return false;
  const cards = week?.cards && typeof week.cards === "object" ? Object.values(week.cards) : [];
  if (cards.some((card) => card?.finalized === true)) return false;
  return players.every((player) => typeof player?.name === "string"
    && /^Fixture(?:\s|$)/i.test(player.name.trim()));
}

// An unconfirmed Glow week with no participant or finalized-card evidence
// is a placeholder, not proof that an event occurred. Explicit cancellations
// are retained so existing event status can still be updated.
export function isUnobservedGlowPlaceholderWeek(week) {
  return !hasGlowActivity(week) && !isCanceledGlowWeek(week);
}

export function isCanceledGlowWeek(week) {
  const status = String(week?.status ?? "").toLowerCase();
  return week?.canceled === true || week?.cancelled === true || status === "canceled" || status === "cancelled";
}

export function shouldUseConfirmedSchedule(date, week, confirmedDates) {
  return confirmedDates.has(date) && !hasGlowActivity(week) && !isCanceledGlowWeek(week);
}

export function shouldEmitConfirmedScheduleRecord(week) {
  return !hasGlowActivity(week) && !isCanceledGlowWeek(week);
}

export function shouldSkipCanceledEvent(existingStatus, incomingStatus) {
  return existingStatus === "canceled" && incomingStatus !== "canceled";
}

function parseSourcePayload(value) {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === "object" ? value : null;
}

export function isConfirmedGlowScheduleProvenance(value) {
  const payload = parseSourcePayload(value);
  return payload?.origin === "organizer_confirmed_schedule"
    && payload?.confirmation_reference === HBNF_SCHEDULE_CONFIRMATION_REF
    && ["final-monthly-glow-2026-10-24", "weekly-tuesday-glow-after-2026-10-27"].includes(payload?.schedule_rule);
}

export function findMissingSourceRecords(existingRows, seenExternalIds, sourceStateReadSucceeded) {
  if (!sourceStateReadSucceeded) return [];
  const seen = seenExternalIds instanceof Set ? seenExternalIds : new Set(seenExternalIds ?? []);
  return existingRows.filter((row) => row?.external_id
    && !seen.has(row.external_id)
    && !isConfirmedGlowScheduleProvenance(row.source_payload));
}
