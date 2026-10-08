import assert from "node:assert/strict";
import { classifyFoundationInvocation } from "../staging/coordinated-backend/hbnf-cart-reconcile/foundation-result.ts";

const projection = {
  cartRevision: 123,
  fenceEpoch: 4,
  brightness: 44,
  auxBrightness: 52,
  enabled: true,
};

const missingStatus = await classifyFoundationInvocation({
  context: new Response(JSON.stringify({ failureCode: "mqtt_publish_accepted_status_not_observed" }), { status: 502 }),
}, null, projection);
assert.deepEqual(missingStatus, {
  ok: false,
  failureCode: "mqtt_publish_accepted_status_not_observed",
  httpStatus: 502,
});

const retainedOnline = await classifyFoundationInvocation(null, {
  transportConfirmed: true,
  deviceId: "matrix",
  cartRevision: 123,
  fenceEpoch: 4,
  requestedMatrixBrightness: 44,
  requestedAuxBrightness: 52,
  enabled: true,
}, projection);
assert.deepEqual(retainedOnline, { ok: true, status: "submitted", httpStatus: null });

const disabledProjection = { ...projection, enabled: false };
const disabledRequestStillSubmitted = await classifyFoundationInvocation(null, {
  transportConfirmed: true,
  deviceId: "matrix",
  cartRevision: 123,
  fenceEpoch: 4,
  requestedMatrixBrightness: 44,
  requestedAuxBrightness: 52,
  enabled: false,
}, disabledProjection);
assert.deepEqual(disabledRequestStillSubmitted, { ok: true, status: "submitted", httpStatus: null });

const disabledWithoutLiveness = await classifyFoundationInvocation(null, {
  transportConfirmed: false,
  failureCode: "mqtt_publish_accepted_status_not_observed",
  deviceId: "matrix",
  cartRevision: 123,
  fenceEpoch: 4,
  requestedMatrixBrightness: 44,
  requestedAuxBrightness: 52,
  enabled: false,
}, disabledProjection);
assert.deepEqual(disabledWithoutLiveness, {
  ok: false,
  failureCode: "mqtt_publish_accepted_status_not_observed",
  httpStatus: null,
});

const mismatch = await classifyFoundationInvocation(null, {
  transportConfirmed: true,
  deviceId: "matrix",
  cartRevision: 122,
  fenceEpoch: 4,
  requestedMatrixBrightness: 44,
  requestedAuxBrightness: 52,
  enabled: true,
}, projection);
assert.deepEqual(mismatch, { ok: false, failureCode: "foundation_ack_field_mismatch", httpStatus: null });

console.log("HBNF Foundation reconciliation outcome: PASS");
