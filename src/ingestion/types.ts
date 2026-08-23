import type { EventStatus, EventType, LocalRootsCounty, RegistrationStatus } from "../domain/events.js";

export type SourceRole = "discovery" | "official" | "registration" | "results" | "organizer_confirmed";
export type SourceAuthority = "low" | "normal" | "official" | "organizer_confirmed";

export interface ScopeProfile {
  allowedCounties: readonly string[];
  allowedCities?: readonly string[];
  allowedCourseIds?: readonly string[];
  excludedCourseIds?: readonly string[];
}

export interface RawEventRecord {
  externalId?: string | null;
  name?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  county?: string | null;
  city?: string | null;
  venueName?: string | null;
  courseName?: string | null;
  courseId?: string | null;
  roundsText?: string | null;
  eventType?: string | null;
  format?: string | null;
  sanctioned?: boolean | null;
  sanctionBasis?: string | null;
  tier?: string | null;
  status?: string | null;
  registrationStatus?: string | null;
  registrationUrl?: string | null;
  resultsUrl?: string | null;
  sourceUrl?: string | null;
  clubHost?: string | null;
  organizer?: string | null;
  tdNames?: string[] | null;
  sourceRole?: SourceRole | null;
  confidence?: number | null;
}

export interface NormalizedEventCandidate {
  externalId: string | null;
  name: string;
  normalizedName: string;
  startDate: string;
  endDate: string;
  county: LocalRootsCounty | string | null;
  city: string | null;
  venueName: string | null;
  normalizedVenue: string | null;
  courseName: string | null;
  courseId: string | null;
  roundsText: string | null;
  eventType: EventType;
  format: string | null;
  sanctioned: boolean | null;
  sanctionBasis: string | null;
  tier: string | null;
  status: EventStatus;
  registrationStatus: RegistrationStatus | null;
  registrationUrl: string | null;
  resultsUrl: string | null;
  sourceUrl: string;
  clubHost: string | null;
  organizer: string | null;
  tdNames: string[];
  sourceRole: SourceRole;
  confidence: number;
}

export type ValidationCode =
  | "invalid_shape"
  | "invalid_external_id"
  | "invalid_name"
  | "invalid_date"
  | "invalid_date_range"
  | "invalid_url"
  | "course_looks_like_tier"
  | "sanction_basis_missing"
  | "outside_scope"
  | "excluded_course";

export interface ValidationIssue {
  code: ValidationCode;
  field?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  publishable: boolean;
  issues: ValidationIssue[];
}

export interface CanonicalEventIdentity {
  id: string;
  externalIds?: Record<string, string>;
  name: string;
  startDate: string;
  endDate: string;
  county?: string | null;
  city?: string | null;
  venueName?: string | null;
  courseName?: string | null;
  registrationUrl?: string | null;
  organizer?: string | null;
  sanctioned?: boolean | null;
  tier?: string | null;
  status?: EventStatus;
}

export type MatchDisposition = "auto_merge" | "review" | "new_event";

export interface MatchResult {
  eventId: string | null;
  score: number;
  disposition: MatchDisposition;
  reasons: string[];
  strongIdentifier: boolean;
}

export interface SourceRunInput {
  runId: string;
  sourceKey: string;
  schedulerSucceeded: boolean;
  fetchStatus: "success" | "failed";
  httpStatus?: number | null;
  parseStatus: "success" | "failed";
  recordsSeen: number;
  recordsValid: number;
  recordsRejected: number;
  previousHealthyValidCount?: number | null;
  consecutiveMissingRuns?: number;
  sentinelExpected?: readonly string[];
  sentinelSeen?: readonly string[];
  upcomingDates?: readonly string[];
  errorCode?: string | null;
  errorMessage?: string | null;
}

export type HealthStatus = "healthy" | "warning" | "failed";

export interface SourceHealthResult {
  runId: string;
  sourceKey: string;
  healthStatus: HealthStatus;
  fetchStatus: "success" | "failed";
  parseStatus: "success" | "failed";
  validationStatus: "success" | "warning" | "failed";
  schedulerSucceeded: boolean;
  preserveLastKnownGood: boolean;
  reasons: string[];
}

export type ReviewIssueType =
  | "ambiguous_duplicate"
  | "date_change"
  | "venue_change"
  | "location_change"
  | "cancellation"
  | "reinstatement"
  | "sanction_conflict"
  | "tier_conflict"
  | "source_disappearance"
  | "source_health"
  | "low_confidence"
  | "validation_failure";

export interface ReviewItem {
  issueType: ReviewIssueType;
  severity: "info" | "warning" | "high";
  summary: string;
  details: Record<string, unknown>;
}

export interface PromotionDecision {
  action: "auto_publish" | "auto_update" | "review" | "reject";
  reviewItems: ReviewItem[];
  reasons: string[];
}
