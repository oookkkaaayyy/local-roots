// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NamedFixtureAdapter } from "../src/ingestion/adapter.js";
import { assessSourceHealth } from "../src/ingestion/health.js";
import { findBestMatch, scoreMatch } from "../src/ingestion/match.js";
import { normalizeRawEvent } from "../src/ingestion/normalize.js";
import { ingestFixturePayload } from "../src/ingestion/pipeline.js";
import { decidePromotion, reviewItemsForSourceHealth } from "../src/ingestion/review.js";
import type { CanonicalEventIdentity, RawEventRecord } from "../src/ingestion/types.js";
import { DEFAULT_SIX_COUNTY_SCOPE, inScope, validateCandidate } from "../src/ingestion/validate.js";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/events.json", import.meta.url), "utf8"));
const adapter = new NamedFixtureAdapter();

const baseRaw: RawEventRecord = {
  externalId: "evt-101",
  name: "SoCal Summer Classic",
  startDate: "2026-09-12",
  endDate: "2026-09-13",
  county: "Orange County",
  city: "Huntington Beach",
  venueName: "HB Disc Golf Course",
  courseName: "Huntington Beach Disc Golf Course",
  eventType: "Tournament",
  sanctioned: true,
  sanctionBasis: "authorized official source",
  tier: "C-Tier",
  status: "upcoming",
  registrationUrl: "https://example.com/register/101",
  sourceUrl: "https://example.com/events/101",
  clubHost: "Example Club",
  sourceRole: "official",
  confidence: 0.98,
};

const canonical: CanonicalEventIdentity = {
  id: "canonical-1",
  externalIds: { fixture: "evt-101" },
  name: "SoCal Summer Classic",
  startDate: "2026-09-12",
  endDate: "2026-09-13",
  county: "Orange",
  city: "Huntington Beach",
  venueName: "HB Disc Golf Course",
  courseName: "Huntington Beach Disc Golf Course",
  registrationUrl: "https://example.com/register/101",
  organizer: "Example Club",
  sanctioned: true,
  tier: "C-Tier",
  status: "upcoming",
};

test("named fixture adapter rejects positional rows", () => {
  assert.throws(() => adapter.parse([["evt", "Event", "2026-09-01"]]), /positional array/);
});

test("normalization canonicalizes county and whitespace", () => {
  const candidate = normalizeRawEvent({ ...baseRaw, name: "  SoCal   Summer Classic ", county: "Orange County" });
  assert.equal(candidate.name, "SoCal Summer Classic");
  assert.equal(candidate.county, "Orange");
});

test("acceptance 9: active county is accepted", () => {
  const result = validateCandidate(normalizeRawEvent(baseRaw), DEFAULT_SIX_COUNTY_SCOPE);
  assert.equal(result.valid, true);
  assert.equal(result.publishable, true);
});

test("acceptance 10: outside county is held from publication", () => {
  const candidate = normalizeRawEvent(fixtures.outsideScope[0]);
  const result = validateCandidate(candidate, DEFAULT_SIX_COUNTY_SCOPE);
  assert.equal(result.valid, true);
  assert.equal(result.publishable, false);
  assert.ok(result.issues.some((issue) => issue.code === "outside_scope"));
});

test("acceptance 11: explicit course allow-list can override county exclusion", () => {
  const candidate = normalizeRawEvent(fixtures.outsideScope[0]);
  const scope = { ...DEFAULT_SIX_COUNTY_SCOPE, allowedCourseIds: ["sb-special"] };
  assert.equal(inScope(candidate, scope).allowed, true);
  assert.equal(validateCandidate(candidate, scope).publishable, true);
});

test("explicit exclusion beats explicit allow", () => {
  const candidate = normalizeRawEvent(fixtures.outsideScope[0]);
  const scope = { ...DEFAULT_SIX_COUNTY_SCOPE, allowedCourseIds: ["sb-special"], excludedCourseIds: ["sb-special"] };
  assert.equal(validateCandidate(candidate, scope).valid, false);
});

test("acceptance 12: geography can change by config only", () => {
  const candidate = normalizeRawEvent(fixtures.outsideScope[0]);
  assert.equal(validateCandidate(candidate, { ...DEFAULT_SIX_COUNTY_SCOPE, allowedCounties: [...DEFAULT_SIX_COUNTY_SCOPE.allowedCounties, "Santa Barbara"] }).publishable, true);
});

test("acceptance 13/16: stable external ID auto-merges and outranks fuzzy matching", () => {
  const candidate = normalizeRawEvent({ ...baseRaw, name: "Completely Different Display Name", venueName: "Elsewhere" });
  const match = scoreMatch(candidate, canonical, "fixture");
  assert.equal(match.disposition, "auto_merge");
  assert.equal(match.score, 1);
  assert.equal(match.strongIdentifier, true);
});

test("exact registration URL is a strong identifier", () => {
  const event = { ...canonical, externalIds: {} };
  const candidate = normalizeRawEvent({ ...baseRaw, externalId: "different", registrationUrl: "https://example.com/register/101?utm_source=x" });
  const match = scoreMatch(candidate, event, "fixture");
  assert.equal(match.disposition, "auto_merge");
  assert.equal(match.strongIdentifier, true);
});

test("acceptance 14: same name on different dates remains separate", () => {
  const candidate = normalizeRawEvent({ ...baseRaw, externalId: null, registrationUrl: null, startDate: "2026-10-20", endDate: "2026-10-20" });
  const event = { ...canonical, externalIds: {}, registrationUrl: null };
  const match = scoreMatch(candidate, event, "fixture");
  assert.equal(match.disposition, "new_event");
  assert.ok(match.score < 0.6);
});

test("acceptance 15: similar same-date event with conflicting venue enters review", () => {
  const candidate = normalizeRawEvent({ ...baseRaw, externalId: null, registrationUrl: null, name: "SoCal Summer Classic Disc Golf", venueName: "Totally Different Park", courseName: "Different Course" });
  const event = { ...canonical, externalIds: {}, registrationUrl: null };
  const match = scoreMatch(candidate, event, "fixture");
  assert.equal(match.disposition, "review");
});

test("best match detects multiple similarly plausible fuzzy matches", () => {
  const candidate = normalizeRawEvent({ ...baseRaw, externalId: null, registrationUrl: null });
  const events = [
    { ...canonical, id: "a", externalIds: {}, registrationUrl: null },
    { ...canonical, id: "b", externalIds: {}, registrationUrl: null, venueName: "HB Disc Golf" },
  ];
  const match = findBestMatch(candidate, events, "fixture");
  assert.equal(match.disposition, "review");
});

test("acceptance 19: multiday dates are preserved", () => {
  const candidate = normalizeRawEvent(baseRaw);
  assert.equal(candidate.startDate, "2026-09-12");
  assert.equal(candidate.endDate, "2026-09-13");
});

test("material lower-authority date change routes to review", () => {
  const candidate = normalizeRawEvent({ ...baseRaw, externalId: null, registrationUrl: null, startDate: "2026-09-19", endDate: "2026-09-20" });
  const validation = validateCandidate(candidate, DEFAULT_SIX_COUNTY_SCOPE);
  const match = { eventId: canonical.id, score: 0.9, disposition: "auto_merge" as const, reasons: [], strongIdentifier: false };
  const decision = decidePromotion({ candidate, validation, match, existing: canonical, sourceAuthority: "normal" });
  assert.equal(decision.action, "review");
  assert.ok(decision.reviewItems.some((item) => item.issueType === "date_change"));
});

test("organizer-confirmed high-confidence date change may auto-update", () => {
  const candidate = normalizeRawEvent({ ...baseRaw, externalId: null, registrationUrl: null, startDate: "2026-09-19", endDate: "2026-09-20", confidence: 0.99 });
  const validation = validateCandidate(candidate, DEFAULT_SIX_COUNTY_SCOPE);
  const match = { eventId: canonical.id, score: 0.9, disposition: "auto_merge" as const, reasons: [], strongIdentifier: false };
  const decision = decidePromotion({ candidate, validation, match, existing: canonical, sourceAuthority: "organizer_confirmed" });
  assert.equal(decision.action, "auto_update");
});

test("acceptance 20/35/48: HTTP 200 + zero rows after healthy baseline is failed, despite scheduler OK", () => {
  const health = assessSourceHealth({
    runId: "run-1", sourceKey: "fixture", schedulerSucceeded: true, fetchStatus: "success", httpStatus: 200,
    parseStatus: "success", recordsSeen: 0, recordsValid: 0, recordsRejected: 0, previousHealthyValidCount: 40,
  });
  assert.equal(health.healthStatus, "failed");
  assert.equal(health.schedulerSucceeded, true);
  assert.equal(health.preserveLastKnownGood, true);
  assert.ok(health.reasons.some((reason) => reason.includes("scheduler succeeded")));
});

test("acceptance 21/23: one acquisition failure preserves last-known-good data", () => {
  const health = assessSourceHealth({ runId: "run-2", sourceKey: "fixture", schedulerSucceeded: true, fetchStatus: "failed", parseStatus: "failed", recordsSeen: 0, recordsValid: 0, recordsRejected: 0, previousHealthyValidCount: 20 });
  assert.equal(health.preserveLastKnownGood, true);
});

test("acceptance 22: repeated disappearance creates health warning", () => {
  const health = assessSourceHealth({ runId: "run-3", sourceKey: "fixture", schedulerSucceeded: true, fetchStatus: "success", parseStatus: "success", recordsSeen: 10, recordsValid: 10, recordsRejected: 0, previousHealthyValidCount: 10, consecutiveMissingRuns: 2 });
  assert.equal(health.healthStatus, "warning");
  assert.ok(health.reasons.some((reason) => reason.includes("repeated")));
});

test("repeated disappearance generates a source-disappearance review item", () => {
  const health = assessSourceHealth({ runId: "run-disappear", sourceKey: "fixture", schedulerSucceeded: true, fetchStatus: "success", parseStatus: "success", recordsSeen: 10, recordsValid: 10, recordsRejected: 0, previousHealthyValidCount: 10, consecutiveMissingRuns: 2 });
  const items = reviewItemsForSourceHealth(health);
  assert.equal(items[0]?.issueType, "source_disappearance");
  assert.equal(items[0]?.details.runId, "run-disappear");
});

test("acceptance 37: >50% record collapse warns", () => {
  const health = assessSourceHealth({ runId: "run-4", sourceKey: "fixture", schedulerSucceeded: true, fetchStatus: "success", parseStatus: "success", recordsSeen: 19, recordsValid: 19, recordsRejected: 0, previousHealthyValidCount: 40 });
  assert.equal(health.healthStatus, "warning");
});

test("acceptance 38: >20% validation rejects warn", () => {
  const health = assessSourceHealth({ runId: "run-5", sourceKey: "fixture", schedulerSucceeded: true, fetchStatus: "success", parseStatus: "success", recordsSeen: 10, recordsValid: 7, recordsRejected: 3, previousHealthyValidCount: 8 });
  assert.equal(health.healthStatus, "warning");
  assert.equal(health.validationStatus, "warning");
});

test("acceptance 36: majority structurally invalid rows fails", () => {
  const health = assessSourceHealth({ runId: "run-6", sourceKey: "fixture", schedulerSucceeded: true, fetchStatus: "success", parseStatus: "success", recordsSeen: 10, recordsValid: 4, recordsRejected: 6, previousHealthyValidCount: 8 });
  assert.equal(health.healthStatus, "failed");
  assert.equal(health.validationStatus, "failed");
});

test("acceptance 39: adapter exception carries source/run context input", () => {
  const health = assessSourceHealth({ runId: "run-7", sourceKey: "fixture", schedulerSucceeded: true, fetchStatus: "success", parseStatus: "failed", recordsSeen: 0, recordsValid: 0, recordsRejected: 0, errorCode: "ADAPTER_EXCEPTION", errorMessage: "fixture parse error" });
  assert.equal(health.healthStatus, "failed");
  assert.ok(health.reasons.some((reason) => reason.includes("ADAPTER_EXCEPTION")));
  assert.equal(health.runId, "run-7");
  assert.equal(health.sourceKey, "fixture");
});

test("acceptance 40: scheduler state is independent from health", () => {
  const health = assessSourceHealth({ runId: "run-8", sourceKey: "fixture", schedulerSucceeded: false, fetchStatus: "success", parseStatus: "success", recordsSeen: 12, recordsValid: 12, recordsRejected: 0, previousHealthyValidCount: 12 });
  assert.equal(health.healthStatus, "healthy");
  assert.equal(health.schedulerSucceeded, false);
});

test("acceptance 42: high-confidence validated new event can auto-publish", () => {
  const candidate = normalizeRawEvent(baseRaw);
  const validation = validateCandidate(candidate, DEFAULT_SIX_COUNTY_SCOPE);
  const match = { eventId: null, score: 0, disposition: "new_event" as const, reasons: [], strongIdentifier: false };
  const decision = decidePromotion({ candidate, validation, match, sourceAuthority: "official" });
  assert.equal(decision.action, "auto_publish");
});

test("low-confidence candidate routes to review", () => {
  const candidate = normalizeRawEvent({ ...baseRaw, confidence: 0.5 });
  const validation = validateCandidate(candidate, DEFAULT_SIX_COUNTY_SCOPE);
  const match = { eventId: null, score: 0, disposition: "new_event" as const, reasons: [], strongIdentifier: false };
  const decision = decidePromotion({ candidate, validation, match, sourceAuthority: "official" });
  assert.equal(decision.action, "review");
});

test("acceptance 43: lower-authority cancellation routes to review", () => {
  const candidate = normalizeRawEvent({ ...baseRaw, status: "canceled", externalId: null, registrationUrl: null });
  const validation = validateCandidate(candidate, DEFAULT_SIX_COUNTY_SCOPE);
  const match = { eventId: canonical.id, score: 0.9, disposition: "auto_merge" as const, reasons: [], strongIdentifier: false };
  const decision = decidePromotion({ candidate, validation, match, existing: canonical, sourceAuthority: "normal" });
  assert.equal(decision.action, "review");
  assert.ok(decision.reviewItems.some((item) => item.issueType === "cancellation"));
});

test("historical exact Sheet corruption is rejected", () => {
  const result = ingestFixturePayload({ adapter, payload: fixtures.sheetCorruption, scope: DEFAULT_SIX_COUNTY_SCOPE, canonicalEvents: [], sourceKey: "fixture", sourceAuthority: "normal" })[0]!;
  const codes = result.validation.issues.map((issue) => issue.code);
  assert.equal(result.validation.valid, false);
  assert.equal(result.promotion.action, "reject");
  assert.ok(codes.includes("invalid_external_id"));
  assert.ok(codes.includes("invalid_name"));
  assert.ok(codes.includes("course_looks_like_tier"));
});

test("good fixture passes end-to-end candidate pipeline", () => {
  const result = ingestFixturePayload({ adapter, payload: fixtures.good, scope: DEFAULT_SIX_COUNTY_SCOPE, canonicalEvents: [], sourceKey: "fixture", sourceAuthority: "official" })[0]!;
  assert.equal(result.validation.publishable, true);
  assert.equal(result.match.disposition, "new_event");
  assert.equal(result.promotion.action, "auto_publish");
});
