import assert from "node:assert/strict";
import fs from "node:fs";
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
    reported: { confirmed: true, ddp: true },
  })),
};
const requiredPass = ["Matrix API PASS", ...deviceReadinessChecks(snapshot, now), "Score feed PASS · fresh"];
assert.equal(readinessStatus(requiredPass), "READY");
assert.equal(readinessStatus([...requiredPass, "Cart → cloud relay NOT EXPOSED · no runtime status signal", "Matrix live standings NOT EXPOSED · relay delivery receipt unavailable"]), "DEGRADED", "the readiness panel must not infer headless relay or Matrix score delivery from the iPad's cloud read");
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
const auxReceiverMissing = structuredClone(snapshot);
auxReceiverMissing.observed[1].reported.ddp = false;
assert.ok(deviceReadinessChecks(auxReceiverMissing, now)[1].includes("DDP receiver is not confirmed"));
assert.equal(readinessStatus(["Matrix API PASS", ...deviceReadinessChecks(auxReceiverMissing, now), "Score feed PASS · fresh"]), "DEGRADED");
assert.equal(scoreFeedStatus({ live: { active: true, label: "F9", entries: ["Ava 1", "Bo 0"] } }), "Score feed (this iPad → cloud) ACTIVE · F9 · 2 rows · source freshness not exposed");
assert.equal(scoreFeedStatus({ live: { active: false, entries: [] } }), "Score feed (this iPad → cloud) NO ACTIVE ROUND · source freshness not exposed");
assert.equal(scoreFeedStatus({}), "Score feed (this iPad → cloud) FAIL · response missing");
assert.equal(readinessStatus(["Matrix API PASS", "Matrix device PASS", "AUX device PASS", scoreFeedStatus({ live: { active: true, entries: ["Ava 1"] } })]), "DEGRADED");

// OTA installability is release admission, not evidence that devices are currently operating.
assert.equal(readinessStatus(["Signed OTA PASS"]), "NOT READY");

const controller = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
const features = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
assert.match(controller, /deviceReadinessChecks\(canonicalSnapshot\)/, "visible device state must use the freshness and DDP checks");
assert.match(controller, /matrixCheck\.indexOf\("PASS"\)/);
assert.match(controller, /auxCheck\.indexOf\("PASS"\)/);
assert.match(html, /id="scorePathStatus"/);
assert.match(html, /id="scoreActionStatus"[^>]*role="status"/);
assert.match(features, /Cart → cloud relay: not reported/);
assert.match(features, /Matrix live-standings receipt: not reported/);
assert.match(features, /Cart → cloud relay NOT EXPOSED · no runtime status signal/);
assert.match(features, /Matrix live standings NOT EXPOSED · relay delivery receipt unavailable/);
assert.match(features, /commandResult && commandResult\.acknowledged===false/, "Show Scores must not claim device acknowledgment while reports are pending");
assert.match(features, /Matrix standings command acknowledged by Cart devices\. Physical display is not verified\./);

console.log("PASS: Cart readiness fails closed on missing, unknown, stale, or unconfirmed device evidence");
