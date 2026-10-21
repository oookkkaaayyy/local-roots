import assert from "node:assert/strict";
import { readinessStatus, scoreFeedStatus, truthConnectedText } from "../hbnf-final-controller/hbnf-cart-readiness.mjs";

assert.equal(truthConnectedText("CONNECTED · state confirmed"), true);
assert.equal(truthConnectedText("READY"), true);
assert.equal(truthConnectedText("DISCONNECTED · retrying"), false);
assert.equal(truthConnectedText("NOT CONNECTED"), false);
assert.equal(truthConnectedText("OFFLINE · last seen 10:20"), false);
assert.equal(readinessStatus(["Matrix API PASS", "AUX truth PASS", "Live-data path PASS"]), "READY");
assert.equal(readinessStatus(["Matrix API PASS", "AUX truth CHECK", "Live-data path WAN/CHECK"]), "DEGRADED");
assert.equal(readinessStatus(["Matrix API FAIL", "AUX truth CHECK"]), "NOT READY");
assert.equal(readinessStatus(["BLOCKED · not on Cart LAN"]), "NOT READY");
assert.equal(scoreFeedStatus({ live: { active: true, label: "F9", entries: ["Ava 1", "Bo 0"] } }), "Score feed ACTIVE · F9 · 2 rows · source freshness not exposed");
assert.equal(scoreFeedStatus({ live: { active: false, entries: [] } }), "Score feed NO ACTIVE ROUND · source freshness not exposed");
assert.equal(scoreFeedStatus({}), "Score feed FAIL · response missing");
assert.equal(readinessStatus([scoreFeedStatus({ live: { active: true, entries: ["Ava 1"] } })]), "DEGRADED");

console.log("PASS: Cart readiness rejects negative connection text and distinguishes READY, DEGRADED, and NOT READY");
