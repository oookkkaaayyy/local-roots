import { LOCAL_ROOTS_COUNTIES } from "../domain/events.js";
import type { NormalizedEventCandidate, ScopeProfile, ValidationIssue, ValidationResult } from "./types.js";

const MONTH_NAMES = new Set([
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
]);

const PLACEHOLDER_NAMES = new Set(["event", "event name", "tbd", "unknown", "n/a", "na", "none", "test"]);
const TIERISH = /^(?:yes\s*[-–—:]?\s*)?(?:pdga\s*)?(?:a|b|c|d|x)\s*-?\s*tier$/i;
const SANCTIONISH = /^(?:yes|no)?\s*[-–—:]?\s*(?:pdga\s*)?sanctioned$/i;

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function courseLooksLikeTier(value: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return TIERISH.test(trimmed) || SANCTIONISH.test(trimmed) || /\b(?:a|b|c|d|x)\s*-?\s*tier\b/i.test(trimmed);
}

export function inScope(candidate: NormalizedEventCandidate, scope: ScopeProfile): { allowed: boolean; issue?: ValidationIssue } {
  const courseId = candidate.courseId;
  if (courseId && scope.excludedCourseIds?.includes(courseId)) {
    return { allowed: false, issue: { code: "excluded_course", field: "courseId", message: "course is explicitly excluded by active scope" } };
  }
  if (courseId && scope.allowedCourseIds?.includes(courseId)) {
    return { allowed: true };
  }
  if (candidate.city && scope.allowedCities?.some((city) => city.toLowerCase() === candidate.city!.toLowerCase())) {
    return { allowed: true };
  }
  if (candidate.county && scope.allowedCounties.some((county) => county.toLowerCase() === candidate.county!.toLowerCase())) {
    return { allowed: true };
  }
  return { allowed: false, issue: { code: "outside_scope", field: "county", message: "event is outside the active geography profile" } };
}

export function validateCandidate(candidate: NormalizedEventCandidate, scope: ScopeProfile): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (candidate.externalId && MONTH_NAMES.has(candidate.externalId.toLowerCase())) {
    issues.push({ code: "invalid_external_id", field: "externalId", message: "external ID cannot be a month name" });
  }

  const nameKey = candidate.name.trim().toLowerCase();
  if (!candidate.name || /^\d+$/.test(candidate.name) || PLACEHOLDER_NAMES.has(nameKey)) {
    issues.push({ code: "invalid_name", field: "name", message: "event name is blank, numeric-only, or a placeholder" });
  }

  if (!isIsoDate(candidate.startDate) || !isIsoDate(candidate.endDate)) {
    issues.push({ code: "invalid_date", field: "startDate/endDate", message: "dates must be real YYYY-MM-DD values" });
  } else if (candidate.endDate < candidate.startDate) {
    issues.push({ code: "invalid_date_range", field: "endDate", message: "end date cannot precede start date" });
  }

  for (const [field, value] of [
    ["sourceUrl", candidate.sourceUrl],
    ["registrationUrl", candidate.registrationUrl],
    ["resultsUrl", candidate.resultsUrl],
  ] as const) {
    if (!value || (field !== "sourceUrl" && value === null)) continue;
    if (!isHttpUrl(value)) {
      issues.push({ code: "invalid_url", field, message: `${field} must use HTTP(S)` });
    }
  }

  if (courseLooksLikeTier(candidate.courseName)) {
    issues.push({ code: "course_looks_like_tier", field: "courseName", message: "course field contains sanction/tier text" });
  }

  if (candidate.sanctioned === true && !candidate.sanctionBasis) {
    issues.push({ code: "sanction_basis_missing", field: "sanctionBasis", message: "sanctioned=true requires an explicit sanction basis" });
  }

  const scopeResult = inScope(candidate, scope);
  if (!scopeResult.allowed && scopeResult.issue) issues.push(scopeResult.issue);

  const hardInvalidCodes = new Set([
    "invalid_external_id",
    "invalid_name",
    "invalid_date",
    "invalid_date_range",
    "invalid_url",
    "course_looks_like_tier",
    "sanction_basis_missing",
    "excluded_course",
  ]);
  const valid = !issues.some((issue) => hardInvalidCodes.has(issue.code));
  const publishable = valid && !issues.some((issue) => issue.code === "outside_scope") && Boolean(candidate.sourceUrl);
  return { valid, publishable, issues };
}

export const DEFAULT_SIX_COUNTY_SCOPE: ScopeProfile = {
  allowedCounties: LOCAL_ROOTS_COUNTIES,
  allowedCities: [],
  allowedCourseIds: [],
  excludedCourseIds: [],
};
