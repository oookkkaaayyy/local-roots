import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createManualScoreboardPayload, parseManualScoreRows } from "../hbnf-final-controller/hbnf-cart-semantic.mjs";

test("manual rows normalize line endings and ignore blank lines", () => {
  assert.deepEqual(parseManualScoreRows(" AND 3 \r\n\r\nJAM 2\n"), ["AND 3", "JAM 2"]);
});

test("manual scoreboard accepts the exact row and count limits", () => {
  const row63 = "X".repeat(63);
  const rows12 = Array.from({ length: 12 }, (_, i) => "P" + i + " 3").join("\n");
  assert.equal(parseManualScoreRows(row63)[0].length, 63);
  assert.equal(parseManualScoreRows(rows12).length, 12);
  assert.deepEqual(createManualScoreboardPayload("B9", "A 2\nJ 1"), { label: "B9", entries: ["A 2", "J 1"] });
});

test("manual scoreboard rejects empty data, unsupported labels, and overflow", () => {
  assert.throws(() => parseManualScoreRows(" \n\r\n"), /at least one/);
  assert.throws(() => parseManualScoreRows(Array(13).fill("A 1").join("\n")), /no more than 12/);
  assert.throws(() => parseManualScoreRows("X".repeat(64)), /63 characters/);
  assert.throws(() => createManualScoreboardPayload("LIVE", "A 1"), /Choose Front 9/);
});

test("manual display uses only the local overlay path; live data remains a separate network read", () => {
  const source = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
  const start = source.indexOf("async function showManualScoreboard()");
  const end = source.indexOf("async function showAcePot()", start);
  assert.ok(start >= 0 && end > start);
  const manual = source.slice(start, end);
  assert.match(manual, /isLocalOwnerPwa\(\)/);
  assert.match(manual, /createManualScoreboardPayload/);
  assert.match(manual, /bridge\.overlay\("scoreboard",payload,22000\)/);
  assert.doesNotMatch(manual, /canonicalRead|live_status|readLiveCache|LIVE_CACHE_KEY/);
  const liveStart = source.indexOf("async function showScoreboard()");
  const liveEnd = source.indexOf("async function showManualScoreboard()", liveStart);
  const liveOnly = source.slice(liveStart, liveEnd);
  assert.match(liveOnly, /canonicalRead\("live_status"/);
  assert.doesNotMatch(liveOnly, /readLiveCache|renderLive\(cached/);
  assert.match(html, /Show scores entered here[^<]*works offline/);
  assert.match(html, /Live score updates require an internet connection/);
  assert.match(html, /Show scores on Cart/);
  assert.match(html, /id="scoreActionStatus" class="status" role="status" aria-live="polite"/);
  assert.match(html, /href="http:\/\/192\.168\.77\.1\/mission-control-local\/owner-pwa\/hbnf-cart\.html"/);
  assert.match(html, /Open local controls · Cart Wi-Fi/);
  assert.doesNotMatch(html, /mission-control-local\/index\.html/);
});

test("Show scores explains when no live round exists and sends no overlay", async () => {
  const source = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function showScoreboard()");
  const end = source.indexOf("async function showManualScoreboard()", start);
  assert.ok(start >= 0 && end > start);
  const overlays = [], statusNode={textContent:"",className:"status"};
  const context = {
    $: id => id === "scoreActionStatus" ? statusNode : null,
    canonicalRead: async action => { assert.equal(action, "live_status"); return { live: { active: false, entries: [] } }; },
    canonicalOverlayBridge: () => ({ overlay: async (...args) => overlays.push(args) }),
  };
  vm.runInNewContext(source.slice(start, end), context);
  await context.showScoreboard();
  assert.equal(statusNode.textContent,"No live round is active. Start a Skins or Glow round, then show scores.");
  assert.equal(statusNode.className,"status bad");
  assert.equal(overlays.length, 0, "no active round must not send a Matrix overlay");
});

test("Show scores distinguishes an active round that has no score entries", async () => {
  const source = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function showScoreboard()");
  const end = source.indexOf("async function showManualScoreboard()", start);
  const statusNode={textContent:"",className:"status"}, overlays=[];
  const context = {
    $: id => id === "scoreActionStatus" ? statusNode : null,
    canonicalRead: async () => ({ live: { active: true, label:"F9", entries: [] } }),
    canonicalOverlayBridge: () => ({ overlay: async (...args) => overlays.push(args) }),
  };
  vm.runInNewContext(source.slice(start, end), context);
  await context.showScoreboard();
  assert.equal(statusNode.textContent,"A round is active, but no scores are available yet. Enter scores, then show them.");
  assert.equal(statusNode.className,"status bad");
  assert.equal(overlays.length,0,"an empty active round must not send a Matrix overlay");
});

test("Show scores sends the active round after its data is confirmed", async () => {
  const source = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function showScoreboard()");
  const end = source.indexOf("async function showManualScoreboard()", start);
  const overlays = [], statusNode={textContent:"",className:"status"};
  const context = {
    $: id => id === "scoreActionStatus" ? statusNode : null,
    canonicalRead: async () => ({ live: { active: true, label: "F9", entries: ["A 3", "B 2"] } }),
    canonicalOverlayBridge: () => ({ overlay: async (...args) => overlays.push(args) }),
  };
  vm.runInNewContext(source.slice(start, end), context);
  await context.showScoreboard();
  assert.equal(overlays.length, 1);
  assert.equal(overlays[0][0], "scoreboard");
  assert.deepEqual(JSON.parse(JSON.stringify(overlays[0][1])), { label: "F9", entries: ["A 3", "B 2"] });
  assert.equal(statusNode.textContent, "Scores are showing on the Cart.");
});
