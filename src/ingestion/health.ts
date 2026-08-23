import type { SourceHealthResult, SourceRunInput } from "./types.js";

export function assessSourceHealth(input: SourceRunInput): SourceHealthResult {
  const reasons: string[] = [];
  let healthStatus: SourceHealthResult["healthStatus"] = "healthy";
  let validationStatus: SourceHealthResult["validationStatus"] = "success";

  if (input.fetchStatus === "failed") {
    healthStatus = "failed";
    reasons.push(input.errorCode ? `fetch failed: ${input.errorCode}` : "fetch failed");
  }
  if (input.parseStatus === "failed") {
    healthStatus = "failed";
    reasons.push(input.errorCode ? `parser failed: ${input.errorCode}` : "parser failed");
  }

  const previous = input.previousHealthyValidCount ?? null;
  if (input.parseStatus === "success" && input.recordsSeen === 0) {
    if (previous != null && previous > 0) {
      healthStatus = "failed";
      validationStatus = "failed";
      reasons.push("zero records after nonzero healthy baseline");
    } else {
      healthStatus = healthStatus === "failed" ? "failed" : "warning";
      validationStatus = "warning";
      reasons.push("zero records with no healthy nonzero baseline");
    }
  }

  if (previous != null && previous > 0 && input.recordsValid < previous * 0.5) {
    if (healthStatus !== "failed") healthStatus = "warning";
    if (validationStatus === "success") validationStatus = "warning";
    reasons.push("valid record count collapsed by more than 50%");
  }

  const rejectedRatio = input.recordsSeen > 0 ? input.recordsRejected / input.recordsSeen : 0;
  if (rejectedRatio > 0.2) {
    if (healthStatus !== "failed") healthStatus = rejectedRatio > 0.5 ? "failed" : "warning";
    validationStatus = rejectedRatio > 0.5 ? "failed" : "warning";
    reasons.push("more than 20% of parsed records failed validation");
  }

  const missingSentinels = (input.sentinelExpected ?? []).filter((id) => !(input.sentinelSeen ?? []).includes(id));
  if (missingSentinels.length) {
    if (healthStatus !== "failed") healthStatus = "warning";
    reasons.push(`missing sentinel records: ${missingSentinels.join(", ")}`);
  }

  if ((input.consecutiveMissingRuns ?? 0) >= 2) {
    if (healthStatus !== "failed") healthStatus = "warning";
    reasons.push("records have disappeared in repeated runs");
  }

  if ((input.upcomingDates ?? []).length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    if (input.upcomingDates!.every((date) => date < today)) {
      if (healthStatus !== "failed") healthStatus = "warning";
      reasons.push("source expected upcoming events but all parsed dates are in the past");
    }
  }

  if (input.schedulerSucceeded && healthStatus !== "healthy") {
    reasons.push("scheduler succeeded but data health did not");
  }

  return {
    runId: input.runId,
    sourceKey: input.sourceKey,
    healthStatus,
    fetchStatus: input.fetchStatus,
    parseStatus: input.parseStatus,
    validationStatus,
    schedulerSucceeded: input.schedulerSucceeded,
    preserveLastKnownGood: healthStatus !== "healthy",
    reasons,
  };
}
