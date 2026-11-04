// DORA E1, one verified synthetic historical event only.
export const DORA_E1 = Object.freeze({
  mode: "glow",
  date: "2026-09-02",
  slug: "hbnf-glow-2026-09-02",
  externalId: "hbnf:glow:2026-09-02",
  eventId: "5e87e132-dfe9-41e5-8087-80d4b881caa0",
  sourceId: "d77cfae0-8597-475a-8e05-ae96e2dbee6f",
});
export const isDoraE1FixtureDate = (mode, date) =>
  mode === DORA_E1.mode && date === DORA_E1.date;
export function isDoraE1LinkedEvent(link, sourceId) {
  if (!link) return false;
  if (sourceId !== DORA_E1.sourceId || link.event_id !== DORA_E1.eventId) {
    throw new Error("DORA E1 identity mismatch: quarantine refused");
  }
  return true;
}
