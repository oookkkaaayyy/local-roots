import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  deviceEvidenceLabel,
  courseInternetCloudLabel,
  hbnfEndpointReachabilityText,
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

assert.equal(localLinkStatusText(currentSnapshot, "unavailable"), "Reachable");
assert.equal(localLinkStatusText({ local: false }, "unavailable"), "Not reachable");
assert.equal(localLinkStatusText({ local: false }, "not_checked"), "Not checked");
assert.equal(scoringCloudStatusText({ live: { active: false, entries: [] } }), "Reachable from this iPad · score endpoint responded");
assert.equal(scoringCloudStatusText(null, true), "Not confirmed · this iPad’s score-cloud request failed");
assert.equal(scoringCloudStatusText({ live: null }), "Response received · score data missing");
assert.equal(hbnfEndpointReachabilityText("reachable"), "Available");
assert.equal(hbnfEndpointReachabilityText("unverified"), "Unconfirmed");
assert.equal(hbnfEndpointReachabilityText("not_checked"), "Not checked");
assert.equal(scoreFreshnessLabel(), "Update age not available");
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
assert.match(html, /id="internetTruth"/);
assert.match(html, /<span>Internet<\/span><strong id="internetTruth"/);
assert.doesNotMatch(html, /<span>Internet\/WAN path<\/span>/);
assert.match(html, /id="scoreCloudTruth"/);
assert.match(html, /id="scoreFreshnessTruth"/);
const truthStart = features.indexOf("function updateScoreNetworkTruth(");
const truthEnd = features.indexOf("function renderScoreActionStatus(", truthStart);
const truthElements = { internetTruth: { textContent: "Available" }, scoreCloudTruth: { textContent: "" }, scoreFreshnessTruth: { textContent: "" }, courseScoresTruth: { textContent: "" } };
const truthContext = {
  $: id => truthElements[id],
  courseInternetState: "not_checked",
  courseCloudState: "not_checked",
  courseInternetCloudLabel,
  hbnfEndpointReachabilityText,
  scoringCloudStatusText,
  scoreFreshnessLabel,
  courseScoreLabel: (...args) => "Loaded · age unverified",
};
vm.runInNewContext(features.slice(truthStart, truthEnd), truthContext);
truthContext.updateScoreNetworkTruth({ live: { active: true, entries: ["Ava"] } });
assert.equal(truthElements.internetTruth.textContent, "Cloud available · internet check not confirmed", "score-cloud success must not be reused as endpoint reachability evidence");
assert.equal(truthElements.scoreCloudTruth.textContent, "Reachable from this iPad · score endpoint responded");
assert.equal(truthElements.scoreFreshnessTruth.textContent, "Update age not available");
assert.equal(truthElements.courseScoresTruth.textContent, "Loaded · age unverified");
const probeEnd = features.indexOf("function renderScoreActionStatus(", features.indexOf("function probeHbnfEndpoint("));
const probeElements = { internetTruth: { textContent: "" } };
const probeImages = [];
const timers = [];
let currentTime = now;
const probeContext = {
  document: { getElementById: id => probeElements[id] },
  Date: { now: () => currentTime },
  Image: class {
    constructor() { probeImages.push(this); this.naturalWidth=180; this.naturalHeight=180; }
    set src(value) { this.url=value; }
  },
  clearTimeout: id => { timers[id].cleared=true; },
  courseInternetState: "not_checked",
  courseCloudState: "not_checked",
  courseInternetCloudLabel,
  hbnfEndpointReachabilityText,
  setTimeout: (fn,ms) => { const id=timers.push({fn,ms,cleared:false})-1; return id; },
};
vm.runInNewContext(features.slice(features.indexOf("const HBNF_ENDPOINT_IMAGE_URL ="), probeEnd), probeContext);
probeContext.probeHbnfEndpoint();
assert.match(probeImages[0].url, /^https:\/\/hbnightflyers\.com\/hbnf-cart-icon-180\.png\?probe=/);
assert.equal(timers[0].ms, 4000);
probeImages[0].onload();
assert.equal(probeElements.internetTruth.textContent, "Internet available · cloud not checked");
probeContext.probeHbnfEndpoint();
assert.equal(probeImages.length, 1, "probe throttle prevents repeated endpoint requests inside the interval");
currentTime += 60000;
probeContext.probeHbnfEndpoint();
probeImages[1].onerror();
assert.equal(probeElements.internetTruth.textContent, "Not confirmed");
currentTime += 60000;
probeContext.probeHbnfEndpoint();
timers[timers.length-1].fn();
assert.equal(probeElements.internetTruth.textContent, "Not confirmed");
assert.doesNotMatch(html, /A Cart response confirms the change arrived|Check the display to confirm what you can see/);
assert.match(html, /https:\/\/hbnightflyers\.com\/skins\.html/);
assert.match(html, /https:\/\/hbnightflyers\.com\/glow\.html/);
assert.match(features, /function updateDisplayedLiveSnapshot\(response\) \{[\s\S]*?renderLive\(live,false,updatedAt\)/, "score freshness may use only the source timestamp returned with the live response");
assert.doesNotMatch(features, /renderLive\(out\.live,false,now\.toLocaleTimeString\(\)\)/);

const liveStatusStart = backend.indexOf('if (action === "live_status")');
const statusStart = backend.indexOf('if (action === "status")', liveStatusStart);
const liveStatusContract = backend.slice(liveStatusStart, statusStart);
assert.match(liveStatusContract, /select\("state_json"\)/);
assert.doesNotMatch(liveStatusContract, /updated_at/, "current source contract does not expose the database update timestamp to the PWA");

console.log("PASS: Cart LAN, scoring cloud, freshness, device acknowledgment, DDP sync, and physical-output status remain distinct");
