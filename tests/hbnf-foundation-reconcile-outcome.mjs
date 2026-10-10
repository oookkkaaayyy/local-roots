import assert from "node:assert/strict";
import { canCarryForwardObservation, carryForwardObservation, classifyFoundationInvocation } from "../staging/coordinated-backend/hbnf-cart-reconcile/foundation-result.ts";

const projection = {
  cartRevision: 123,
  fenceEpoch: 4,
  brightness: 44,
  auxBrightness: 52,
  enabled: true,
};

const carried = {
  status: "online", desired_revision: 123, fence_epoch: 4, release_id: "r4",
  observed_at: "2026-10-09T10:00:00.000Z",
  reported: { cartRevision: 123, fenceEpoch: 4, confirmed: true },
};
assert.equal(canCarryForwardObservation(carried, 123, 4, "r4"), true);
assert.deepEqual(carryForwardObservation(carried, 123, 4, "r4"), {
  status: "carried", observedAt: "2026-10-09T10:00:00.000Z", commandApplicationConfirmed: false,
});
assert.equal(carryForwardObservation({ ...carried, observed_at: undefined }, 123, 4, "r4"), null, "missing observation time cannot be made fresh by carry-forward");
assert.equal(carryForwardObservation({ ...carried, observed_at: "not-a-date" }, 123, 4, "r4"), null, "invalid observation time cannot be made fresh by carry-forward");
assert.equal(canCarryForwardObservation({ ...carried, desired_revision: 122 }, 123, 4, "r4"), false);
assert.equal(canCarryForwardObservation({ ...carried, reported: { cartRevision: 122, fenceEpoch: 4, confirmed: true } }, 123, 4, "r4"), false);
assert.equal(canCarryForwardObservation({ ...carried, fence_epoch: 3 }, 123, 4, "r4"), false);
assert.equal(canCarryForwardObservation({ ...carried, release_id: "old-r4" }, 123, 4, "r4"), false);

const pendingRelay = {
  ok: false,
  status: "pending_relay",
  failureCode: "matrix_writer_moved_to_opal_relay",
  httpStatus: 409,
};
const legacyTransportAck = {
  transportConfirmed: true,
  deviceId: "matrix",
  cartRevision: 123,
  fenceEpoch: 4,
  requestedMatrixBrightness: 44,
  requestedAuxBrightness: 52,
  enabled: true,
};

assert.deepEqual(await classifyFoundationInvocation(null, legacyTransportAck, projection), pendingRelay,
  "transport acknowledgement must not be accepted as application after the adapter became a non-writer");
assert.deepEqual(await classifyFoundationInvocation({
  context: new Response(JSON.stringify({ failureCode: "mqtt_publish_accepted_status_not_observed" }), { status: 502 }),
}, null, projection), pendingRelay,
  "legacy MQTT failure must remain pending until the authenticated relay observes Matrix state");
assert.deepEqual(await classifyFoundationInvocation(null, {
  ...legacyTransportAck, cartRevision: 122,
}, projection), pendingRelay,
  "mismatched legacy transport fields cannot become device confirmation");
assert.deepEqual(await classifyFoundationInvocation(null, {
  ...legacyTransportAck, enabled: false,
}, { ...projection, enabled: false }), pendingRelay,
  "off commands also remain pending until relay confirmation");

console.log("HBNF Foundation reconciliation outcome: PASS");
