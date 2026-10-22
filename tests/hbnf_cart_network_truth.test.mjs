import assert from "node:assert/strict";
import fs from "node:fs";
import {
  deviceEvidenceLabel,
  localLinkStatusText,
  readinessStatus,
  scoreFeedStatus,
  scoreFreshnessLabel,
  scoringCloudStatusText,
} from "../hbnf-final-controller/hbnf-cart-readiness.mjs";

const now = Date.parse("2026-10-21T18:00:00Z");
const observedAt = new Date(now - 1000).toISOString();
const currentSnapshot = {
  local: true,
  desired: { revision: 4 },
  devices: {
    matrix: { confirmed: true, confirmedRevision: 4 },
    aux: { confirmed: true, confirmedRevision: 4 },
  },
  observed: [
    { device_id: "matrix", desired_revision: 4, status: "online", observed_at: observedAt, reported: { confirmed: true } },
    { device_id: "aux", desired_revision: 4, status: "online", observed_at: observedAt, reported: { confirmed: true, ddp: true, physical: "unverified" } },
  ],
};

assert.equal(localLinkStatusText(currentSnapshot, "unavailable"), "Reachable · local Cart status returned");
assert.equal(localLinkStatusText({ local: false }, "unavailable"), "Not confirmed · local check failed");
assert.equal(localLinkStatusText({ local: false }, "not_checked"), "Not tested from this iPad");
assert.equal(scoringCloudStatusText({ live: { active: false, entries: [] } }), "Response received · scoring cloud reachable");
assert.equal(scoringCloudStatusText(null, true), "Unavailable · score request failed");
assert.equal(scoringCloudStatusText({ live: null }), "Response received · score data missing");
assert.equal(scoreFreshnessLabel(), "Unverified · scoring response has no source timestamp");
assert.match(scoreFeedStatus({ live: { active: true, label: "F9", entries: ["Ava"] } }), /source freshness not exposed/);
assert.equal(readinessStatus([
  "Matrix API PASS", "Matrix device PASS", "AUX device PASS",
  scoreFeedStatus({ live: { active: true, entries: ["Ava"] } }),
]), "DEGRADED", "a score response without a source timestamp must not produce READY");

assert.equal(deviceEvidenceLabel(currentSnapshot, "matrix", now), "Reachable · command ack current · display not visually confirmed");
assert.equal(deviceEvidenceLabel(currentSnapshot, "aux", now), "Reachable · command ack current · DDP confirmed · light not physically confirmed");

const unacknowledged = structuredClone(currentSnapshot);
unacknowledged.observed[0].reported.confirmed = false;
assert.match(deviceEvidenceLabel(unacknowledged, "matrix", now), /Reachable · command ack unconfirmed/);

const unsynchronized = structuredClone(currentSnapshot);
unsynchronized.observed[1].reported.ddp = false;
assert.match(deviceEvidenceLabel(unsynchronized, "aux", now), /DDP unconfirmed/);

const stale = structuredClone(currentSnapshot);
stale.observed[0].observed_at = new Date(now - 91000).toISOString();
assert.match(deviceEvidenceLabel(stale, "matrix", now), /^Status stale · command ack not current/);
assert.match(deviceEvidenceLabel({}, "matrix", now), /^No current report · command ack unconfirmed/);

const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
const features = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
const backend = fs.readFileSync(new URL("../staging/coordinated-backend/hbnf-cart-control/index.ts", import.meta.url), "utf8");
assert.match(html, /id="cartLanTruth"/);
assert.match(html, /id="scoreCloudTruth"/);
assert.match(html, /id="scoreFreshnessTruth"/);
assert.match(html, /physical light or display output/);
assert.match(html, /https:\/\/hbnightflyers\.com\/skins\.html/);
assert.match(html, /https:\/\/hbnightflyers\.com\/glow\.html/);
assert.match(features, /renderLive\(out\.live,false\)/, "client receipt time must not be rendered as score freshness");
assert.doesNotMatch(features, /renderLive\(out\.live,false,now\.toLocaleTimeString\(\)\)/);

const liveStatusStart = backend.indexOf('if (action === "live_status")');
const statusStart = backend.indexOf('if (action === "status")', liveStatusStart);
const liveStatusContract = backend.slice(liveStatusStart, statusStart);
assert.match(liveStatusContract, /select\("state_json"\)/);
assert.doesNotMatch(liveStatusContract, /updated_at/, "current source contract does not expose the database update timestamp to the PWA");

console.log("PASS: Cart LAN, scoring cloud, freshness, device acknowledgment, DDP sync, and physical-output status remain distinct");
