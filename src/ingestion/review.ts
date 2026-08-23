import type {
  CanonicalEventIdentity,
  MatchResult,
  NormalizedEventCandidate,
  PromotionDecision,
  ReviewItem,
  SourceAuthority,
  SourceHealthResult,
  ValidationResult,
} from "./types.js";

function item(issueType: ReviewItem["issueType"], severity: ReviewItem["severity"], summary: string, details: Record<string, unknown> = {}): ReviewItem {
  return { issueType, severity, summary, details };
}

function materialChanges(candidate: NormalizedEventCandidate, existing: CanonicalEventIdentity): ReviewItem[] {
  const items: ReviewItem[] = [];
  if (candidate.startDate !== existing.startDate || candidate.endDate !== existing.endDate) {
    items.push(item("date_change", "high", "Event date changed", { from: [existing.startDate, existing.endDate], to: [candidate.startDate, candidate.endDate] }));
  }
  if (candidate.venueName && existing.venueName && candidate.venueName !== existing.venueName) {
    items.push(item("venue_change", "warning", "Event venue changed", { from: existing.venueName, to: candidate.venueName }));
  }
  if ((candidate.city && existing.city && candidate.city !== existing.city) || (candidate.county && existing.county && candidate.county !== existing.county)) {
    items.push(item("location_change", "warning", "Event location changed"));
  }
  if (candidate.status === "canceled" && existing.status !== "canceled") {
    items.push(item("cancellation", "high", "Event cancellation requires authority check"));
  }
  if (existing.status === "canceled" && candidate.status !== "canceled") {
    items.push(item("reinstatement", "high", "Canceled event appears reinstated"));
  }
  if (candidate.sanctioned != null && existing.sanctioned != null && candidate.sanctioned !== existing.sanctioned) {
    items.push(item("sanction_conflict", "high", "Sanction status conflicts with canonical event"));
  }
  if (candidate.tier && existing.tier && candidate.tier !== existing.tier) {
    items.push(item("tier_conflict", "warning", "Tier conflicts with canonical event"));
  }
  return items;
}


export function reviewItemsForSourceHealth(health: SourceHealthResult): ReviewItem[] {
  if (health.healthStatus === "healthy") return [];
  const disappearance = health.reasons.some((reason) => /disappear|sentinel|zero records after nonzero/i.test(reason));
  return [
    item(
      disappearance ? "source_disappearance" : "source_health",
      health.healthStatus === "failed" ? "high" : "warning",
      disappearance ? "Source records disappeared or collapsed" : "Source run requires review",
      { runId: health.runId, sourceKey: health.sourceKey, reasons: health.reasons },
    ),
  ];
}

function authorityCanAutoApply(authority: SourceAuthority, confidence: number): boolean {
  return (authority === "official" || authority === "organizer_confirmed") && confidence >= 0.9;
}

export function decidePromotion(args: {
  candidate: NormalizedEventCandidate;
  validation: ValidationResult;
  match: MatchResult;
  existing?: CanonicalEventIdentity | null;
  sourceAuthority: SourceAuthority;
  sourceHealth?: SourceHealthResult;
}): PromotionDecision {
  const { candidate, validation, match, existing, sourceAuthority, sourceHealth } = args;
  const reviewItems: ReviewItem[] = [];
  const reasons: string[] = [];

  if (!validation.valid) {
    reviewItems.push(item("validation_failure", "high", "Candidate failed structural validation", { issues: validation.issues }));
    return { action: "reject", reviewItems, reasons: ["candidate failed validation"] };
  }

  if (!validation.publishable) {
    return { action: "reject", reviewItems, reasons: ["candidate is outside active publish scope"] };
  }

  if (sourceHealth && sourceHealth.healthStatus !== "healthy") {
    reviewItems.push(...reviewItemsForSourceHealth(sourceHealth));
    return { action: "review", reviewItems, reasons: ["unhealthy source data cannot auto-promote"] };
  }

  if (candidate.confidence < 0.8) {
    reviewItems.push(item("low_confidence", "warning", "Candidate confidence is below auto-publish threshold", { confidence: candidate.confidence }));
  }

  if (match.disposition === "review") {
    reviewItems.push(item("ambiguous_duplicate", "warning", "Candidate has an ambiguous canonical match", { eventId: match.eventId, score: match.score, reasons: match.reasons }));
  }

  if (existing) {
    const changes = materialChanges(candidate, existing);
    if (changes.length && !authorityCanAutoApply(sourceAuthority, candidate.confidence)) reviewItems.push(...changes);
  }

  if (reviewItems.length) return { action: "review", reviewItems, reasons: ["candidate requires human review"] };

  if (existing && match.disposition === "auto_merge") {
    return { action: "auto_update", reviewItems: [], reasons: ["high-confidence canonical match and no protected material change"] };
  }

  if (!existing && match.disposition === "new_event" && candidate.confidence >= 0.9 && authorityCanAutoApply(sourceAuthority, candidate.confidence)) {
    return { action: "auto_publish", reviewItems: [], reasons: ["high-confidence approved new event"] };
  }

  if (match.disposition === "new_event" && candidate.confidence >= 0.9 && sourceAuthority === "normal") {
    return { action: "auto_publish", reviewItems: [], reasons: ["high-confidence validated approved-source event"] };
  }

  return { action: "review", reviewItems: [item("low_confidence", "warning", "Candidate did not meet auto-promotion policy")], reasons: ["promotion policy requires review"] };
}
