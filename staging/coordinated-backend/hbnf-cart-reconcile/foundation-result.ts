const MISSING_STATUS = "mqtt_publish_accepted_status_not_observed";

const sameProjection = (ack: any, projection: any) =>
  ack?.deviceId === "matrix" &&
  ack?.cartRevision === projection.cartRevision &&
  ack?.fenceEpoch === projection.fenceEpoch &&
  ack?.requestedMatrixBrightness === projection.brightness &&
  ack?.requestedAuxBrightness === projection.auxBrightness &&
  ack?.enabled === projection.enabled;

/** A carried observation remains valid only for the exact stored revision and fence it reports. */
export function canCarryForwardObservation(prior: any, cartRevision: number, fenceEpoch: number, releaseId: string) {
  return !!prior &&
    ["online", "off", "submitted"].includes(String(prior.status)) &&
    Number(prior.desired_revision) === cartRevision &&
    Number(prior.fence_epoch) === fenceEpoch &&
    prior.release_id === releaseId &&
    Number(prior.reported?.cartRevision) === cartRevision &&
    Number(prior.reported?.fenceEpoch) === fenceEpoch;
}

/** Carry validity without manufacturing a new device observation or application acknowledgement. */
export function carryForwardObservation(prior: any, cartRevision: number, fenceEpoch: number, releaseId: string) {
  if (!canCarryForwardObservation(prior, cartRevision, fenceEpoch, releaseId)) return null;
  const observedAt = prior.observed_at;
  if (typeof observedAt !== "string" || !Number.isFinite(Date.parse(observedAt))) return null;
  return {
    status: "carried" as const,
    observedAt,
    commandApplicationConfirmed: false as const,
  };
}

/** Preserve the adapter's bounded failure code without persisting its raw body. */
export async function classifyFoundationInvocation(invokeError: any, ack: any, projection: any) {
  if (invokeError) {
    const context = invokeError.context;
    const httpStatus = Number(context?.status) || null;
    let body: any = null;
    if (typeof context?.json === "function") {
      try { body = await context.json(); } catch { /* response body may not be JSON */ }
    }
    const failureCode = httpStatus === 502 && body?.failureCode === MISSING_STATUS
      ? MISSING_STATUS
      : httpStatus ? `foundation_http_${httpStatus}` : "foundation_invocation_failed";
    return { ok: false as const, failureCode, httpStatus };
  }

  if (!ack) return { ok: false as const, failureCode: "foundation_ack_missing", httpStatus: null };
  if (ack.transportConfirmed !== true) {
    return {
      ok: false as const,
      failureCode: ack.failureCode === MISSING_STATUS ? MISSING_STATUS : "mqtt_status_not_observed",
      httpStatus: null,
    };
  }
  if (!sameProjection(ack, projection)) {
    return { ok: false as const, failureCode: "foundation_ack_field_mismatch", httpStatus: null };
  }

  // WLED's retained MQTT online status is liveness only; it is not a
  // revision-correlated command acknowledgement.
  return { ok: true as const, status: "submitted" as const, httpStatus: null };
}
