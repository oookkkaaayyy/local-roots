import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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
  assert.match(html, /Manual Show Scores[^<]*works offline/);
  assert.match(html, /not live standings/i);
  assert.match(html, /Show live standings · internet/);
});
