import { normalizeIdentityText } from "./normalize.js";
import type { CanonicalEventIdentity, MatchResult, NormalizedEventCandidate } from "./types.js";

function canonicalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    }
    const query = url.searchParams.toString();
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, "")}${query ? `?${query}` : ""}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function tokenSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const aa = new Set(normalizeIdentityText(a).split(" ").filter(Boolean));
  const bb = new Set(normalizeIdentityText(b).split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  const intersection = [...aa].filter((token) => bb.has(token)).length;
  const union = new Set([...aa, ...bb]).size;
  return intersection / union;
}

function datesOverlap(candidate: NormalizedEventCandidate, event: CanonicalEventIdentity): boolean {
  return candidate.startDate <= event.endDate && candidate.endDate >= event.startDate;
}

function sameLocation(candidate: NormalizedEventCandidate, event: CanonicalEventIdentity): number {
  let score = 0;
  if (candidate.county && event.county && candidate.county.toLowerCase() === event.county.toLowerCase()) score += 0.5;
  if (candidate.city && event.city && candidate.city.toLowerCase() === event.city.toLowerCase()) score += 0.5;
  return score;
}

export function scoreMatch(candidate: NormalizedEventCandidate, event: CanonicalEventIdentity, sourceKey: string): MatchResult {
  const reasons: string[] = [];
  const knownExternal = event.externalIds?.[sourceKey];
  if (candidate.externalId && knownExternal && candidate.externalId === knownExternal) {
    return { eventId: event.id, score: 1, disposition: "auto_merge", reasons: ["exact stable external ID"], strongIdentifier: true };
  }

  const candidateRegistration = canonicalUrl(candidate.registrationUrl);
  const eventRegistration = canonicalUrl(event.registrationUrl);
  if (candidateRegistration && eventRegistration && candidateRegistration === eventRegistration) {
    return { eventId: event.id, score: 0.99, disposition: "auto_merge", reasons: ["exact canonical registration URL"], strongIdentifier: true };
  }

  const nameScore = tokenSimilarity(candidate.name, event.name);
  const dateScore = datesOverlap(candidate, event) ? 1 : 0;
  const venueScore = Math.max(
    tokenSimilarity(candidate.venueName, event.venueName),
    tokenSimilarity(candidate.courseName, event.courseName),
  );
  const locationScore = sameLocation(candidate, event);
  const organizerScore = tokenSimilarity(candidate.organizer, event.organizer);
  const sanctionScore = candidate.sanctioned != null && event.sanctioned != null && candidate.sanctioned === event.sanctioned ? 0.5 : 0;
  const tierScore = candidate.tier && event.tier && normalizeIdentityText(candidate.tier) === normalizeIdentityText(event.tier) ? 0.5 : 0;

  let score = nameScore * 0.45 + dateScore * 0.25 + venueScore * 0.15 + locationScore * 0.08 + organizerScore * 0.04 + sanctionScore * 0.015 + tierScore * 0.015;

  if (nameScore > 0.8) reasons.push("similar event name");
  if (dateScore) reasons.push("overlapping dates");
  if (venueScore > 0.65) reasons.push("similar venue/course");
  if (locationScore > 0.5) reasons.push("same city/county");
  if (organizerScore > 0.65) reasons.push("similar organizer");

  // Name similarity alone can never merge events on different dates.
  if (!dateScore && nameScore > 0.8) score = Math.min(score, 0.49);

  // Same date + highly similar name but conflicting venue should be human-reviewed.
  const venueConflict = dateScore === 1 && nameScore >= 0.7 && candidate.venueName && event.venueName && venueScore < 0.25;
  if (venueConflict) {
    score = Math.max(score, 0.65);
    reasons.push("venue conflict");
  }

  const rounded = Math.max(0, Math.min(1, Number(score.toFixed(4))));
  const disposition = rounded >= 0.85 ? "auto_merge" : rounded >= 0.6 ? "review" : "new_event";
  return { eventId: event.id, score: rounded, disposition, reasons, strongIdentifier: false };
}

export function findBestMatch(candidate: NormalizedEventCandidate, events: readonly CanonicalEventIdentity[], sourceKey: string): MatchResult {
  if (!events.length) return { eventId: null, score: 0, disposition: "new_event", reasons: ["no canonical candidates"], strongIdentifier: false };
  const results = events.map((event) => scoreMatch(candidate, event, sourceKey)).sort((a, b) => b.score - a.score);
  const best = results[0]!;
  const second = results[1];
  if (best.disposition === "auto_merge" && !best.strongIdentifier && second && second.score >= best.score - 0.05 && second.score >= 0.6) {
    return { ...best, disposition: "review", reasons: [...best.reasons, "multiple similarly plausible matches"] };
  }
  return best;
}
