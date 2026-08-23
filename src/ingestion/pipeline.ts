import type { SourceAdapter } from "./adapter.js";
import { findBestMatch } from "./match.js";
import { normalizeRawEvent } from "./normalize.js";
import { decidePromotion } from "./review.js";
import type { CanonicalEventIdentity, PromotionDecision, ScopeProfile, SourceAuthority } from "./types.js";
import { validateCandidate } from "./validate.js";

export interface FixtureIngestionResult {
  candidate: ReturnType<typeof normalizeRawEvent>;
  validation: ReturnType<typeof validateCandidate>;
  match: ReturnType<typeof findBestMatch>;
  promotion: PromotionDecision;
}

export function ingestFixturePayload<TRaw>(args: {
  adapter: SourceAdapter<TRaw>;
  payload: TRaw;
  scope: ScopeProfile;
  canonicalEvents: readonly CanonicalEventIdentity[];
  sourceKey: string;
  sourceAuthority: SourceAuthority;
}): FixtureIngestionResult[] {
  const rows = args.adapter.parse(args.payload);
  return rows.map((raw) => {
    const candidate = normalizeRawEvent(raw);
    const validation = validateCandidate(candidate, args.scope);
    const match = findBestMatch(candidate, args.canonicalEvents, args.sourceKey);
    const existing = match.eventId ? args.canonicalEvents.find((event) => event.id === match.eventId) ?? null : null;
    const promotion = decidePromotion({ candidate, validation, match, existing, sourceAuthority: args.sourceAuthority });
    return { candidate, validation, match, promotion };
  });
}
