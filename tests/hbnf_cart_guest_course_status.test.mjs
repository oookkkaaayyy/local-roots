import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  courseInternetCloudLabel,
  courseScoreLabel,
  guestDefaultEnableNeeded,
  hbnfEndpointReachabilityText,
  localLinkStatusText,
  matrixRelayLabel,
  scoringCloudStatusText,
} from "../hbnf-final-controller/hbnf-cart-readiness.mjs";

const now = Date.parse("2026-10-22T20:00:00Z");

// Cart LAN and WAN are measured separately; one never implies the other.
assert.equal(localLinkStatusText({ local: true }, "unavailable"), "Reachable");
assert.equal(hbnfEndpointReachabilityText("unverified"), "Unconfirmed");
assert.equal(scoringCloudStatusText(null, true), "Not confirmed · this iPad’s score-cloud request failed");
assert.equal(localLinkStatusText({ local: false }, "unavailable"), "Not reachable");
assert.equal(hbnfEndpointReachabilityText("reachable"), "Available");
assert.equal(scoringCloudStatusText({ live: { active: true, entries: ["Ava"] } }), "Reachable from this iPad · score endpoint responded");
assert.equal(courseInternetCloudLabel("reachable", "reachable"), "Internet and cloud available");
assert.equal(courseInternetCloudLabel("unverified", "reachable"), "Cloud available · internet check not confirmed");
assert.equal(courseInternetCloudLabel("reachable", "unavailable"), "Internet available · cloud unavailable");

// A missing source timestamp remains unknown; a real timestamp may establish age.
assert.equal(courseScoreLabel({ live: { active: true, entries: ["Ava"] } }, false, null, now), "Loaded · age unverified");
assert.equal(courseScoreLabel({ live: { active: true, updated_at: new Date(now - 60_000).toISOString() } }, false, null, now), "Current");
assert.equal(courseScoreLabel({ live: { active: true, updated_at: new Date(now - 20 * 60_000).toISOString() } }, false, null, now), "Old · refresh needed");
assert.equal(courseScoreLabel(null, true, null, now), "Unavailable");
assert.equal(courseScoreLabel(null, true, 20 * 60_000, now), "Saved copy · old");

// Matrix score output is confirmed only by matching source and receiver revisions.
assert.equal(matrixRelayLabel("aligned"), "Confirmed · display not visually checked");
assert.equal(matrixRelayLabel("stale"), "Older · display not visually checked");
assert.equal(matrixRelayLabel("unknown"), "Unconfirmed");
assert.equal(matrixRelayLabel("aligned", false), "Unconfirmed");

// First paired open migrates the existing closed value to the requested default once.
assert.equal(guestDefaultEnableNeeded({ guestMode: false }, false), true);
assert.equal(guestDefaultEnableNeeded({ guestMode: true }, false), false);
const persistedOpenState = { guestMode: true };
assert.equal(guestDefaultEnableNeeded(persistedOpenState, true), false, "a reload reads the persisted open state");
const ownerClosedState = { guestMode: false };
assert.equal(guestDefaultEnableNeeded(ownerClosedState, true), false, "an explicit later close stays closed");

const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
const owner = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
assert.match(html, /id="guestModeOpen"/);
assert.match(html, /id="guestModeClose"/);
assert.match(html, /href="https:\/\/hbnightflyers\.com\/guest\/hbnf-cart\/"/);
assert.doesNotMatch(html, /id="guestMode"[^>]*type="checkbox"/);
assert.match(owner, /guestDefaultEnableNeeded\(state, guestMigrationApplied\(\)\)/);
assert.match(owner, /command\("GUEST_MODE", \{ enabled: true \}\)/);
assert.match(owner, /command\("GUEST_MODE", \{ enabled: enabled \}\)/);
assert.match(owner, /GUEST_DEFAULT_MIGRATION_KEY/);
assert.match(owner, /guestMode === true/);

const start = owner.indexOf("async function setGuestMode(enabled)");
const end = owner.indexOf("\nasync function refresh(", start);
assert.ok(start >= 0 && end > start, "the live guest toggle handler is present");
const guestState = { guestMode: false };
const nodes = { guestModeStatus: { textContent: "" } };
let migrationValue = "";
const guestContext = {
  guestDefaultMigrationInFlight: false,
  $: id => nodes[id],
  guestMigrationMark: value => { migrationValue = value; },
  command: async (type, payload) => {
    assert.equal(type, "GUEST_MODE");
    guestState.guestMode = payload.enabled;
  },
};
vm.runInNewContext(owner.slice(start, end) + "\nglobalThis.runGuestToggle = setGuestMode;", guestContext);
await guestContext.runGuestToggle(true);
assert.equal(guestState.guestMode, true, "Open control sends the existing owner command");
assert.equal(migrationValue, "done", "the default migration is persisted");
assert.equal(guestDefaultEnableNeeded(guestState, true), false, "reload keeps the open state");
await guestContext.runGuestToggle(false);
assert.equal(guestState.guestMode, false, "Close control sends the existing owner command");
assert.equal(guestDefaultEnableNeeded(guestState, true), false, "reload does not silently reopen an owner-closed mode");

console.log("PASS: Cart/WAN separation, score freshness, Matrix revision acknowledgment, guest default/toggle/reload/link behavior");
