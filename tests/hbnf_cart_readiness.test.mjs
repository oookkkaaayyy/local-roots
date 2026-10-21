import assert from "node:assert/strict";
import { deviceReadinessChecks, readinessStatus, scoreFeedStatus } from "../hbnf-final-controller/hbnf-cart-readiness.mjs";

const now = Date.parse("2026-10-21T10:00:00Z");
const snapshot = {
  desired: { revision: 7 },
  devices: {
    matrix: { confirmed: true, confirmedRevision: 7 },
    aux: { confirmed: true, confirmedRevision: 7 },
  },
  observed: ["matrix", "aux"].map(device_id => ({
    device_id, desired_revision: 7, status: "online", observed_at: new Date(now - 1000).toISOString(),
    reported: { confirmed: true },
  })),
};
const requiredPass = ["Matrix API PASS", ...deviceReadinessChecks(snapshot, now), "Score feed PASS · fresh"];
assert.equal(readinessStatus(requiredPass), "READY");
assert.equal(readinessStatus([]), "NOT READY");
assert.equal(readinessStatus(["UNKNOWN"]), "NOT READY");
assert.equal(readinessStatus(["Matrix API PASS", "Matrix device PASS", "AUX device PASS"]), "NOT READY");
assert.equal(readinessStatus(["Matrix API PASS", "Matrix device CHECK", "AUX device PASS", "Score feed PASS"]), "DEGRADED");
assert.equal(readinessStatus(["Matrix API FAIL", "Matrix device PASS", "AUX device PASS", "Score feed PASS"]), "NOT READY");
assert.equal(readinessStatus(["BLOCKED · not on Cart LAN"]), "NOT READY");
assert.deepEqual(deviceReadinessChecks(snapshot, now), ["Matrix device PASS · readback confirmed", "AUX device PASS · readback confirmed"]);
assert.ok(deviceReadinessChecks({}, now).every(value => value.includes("UNCONFIRMED")));
assert.ok(deviceReadinessChecks(snapshot, now + 91000).every(value => value.includes("STALE")));
assert.ok(deviceReadinessChecks(snapshot, now - 2000).every(value => value.includes("STALE")));
const unconfirmed = structuredClone(snapshot);
unconfirmed.devices.aux.confirmed = false;
assert.ok(deviceReadinessChecks(unconfirmed, now)[1].includes("UNCONFIRMED"));
assert.equal(scoreFeedStatus({ live: { active: true, label: "F9", entries: ["Ava 1", "Bo 0"] } }), "Score feed ACTIVE · F9 · 2 rows · source freshness not exposed");
assert.equal(scoreFeedStatus({ live: { active: false, entries: [] } }), "Score feed NO ACTIVE ROUND · source freshness not exposed");
assert.equal(scoreFeedStatus({}), "Score feed FAIL · response missing");
assert.equal(readinessStatus(["Matrix API PASS", "Matrix device PASS", "AUX device PASS", scoreFeedStatus({ live: { active: true, entries: ["Ava 1"] } })]), "DEGRADED");

// OTA installability is release admission, not evidence that devices are currently operating.
assert.equal(readinessStatus(["Signed OTA PASS"]), "NOT READY");

console.log("PASS: Cart readiness fails closed on missing, unknown, stale, or unconfirmed device evidence");
