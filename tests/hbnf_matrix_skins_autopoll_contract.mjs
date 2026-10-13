import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chooseLive, laDate } from "../staging/coordinated-backend/hbnf-cart-control/live.ts";

const date = laDate();
const state = { skins: { weeks: { [date]: {
  front: { cards: [{ playersText: "Ava\nBo", winners: { "1": "front_p_0" } }] },
  back: { cards: [] },
} } } };
let selected = chooseLive(state);
assert.equal(selected.active, true);
assert.equal(selected.event, "skins");
assert.equal(selected.label, "F9");
assert.deepEqual(selected.entries, ["Ava 1", "Bo 0"]);
const unchanged = chooseLive(state);
assert.deepEqual(unchanged.entries, selected.entries, "unchanged source scores yield an identical projection");
state.skins.weeks[date].front.cards[0].winners["1"] = "front_p_1";
selected = chooseLive(state);
assert.deepEqual(selected.entries, ["Ava 0", "Bo 1"], "a score change changes the projected standings");
state.skins.weeks[date].front.cards[0].winners["1"] = "front_p_0";

state.skins.weeks[date].back.cards.push({ teamsText: "Ava / Bo\nCy / Dee", winners: { "10": "back_team_1" } });
selected = chooseLive(state);
assert.equal(selected.label, "F9", "a populated Back 9 stays suppressed until Front 9 is locked");
state.skins.weeks[date].front.scoresLocked = true;
selected = chooseLive(state);
assert.equal(selected.label, "B9");
assert.deepEqual(selected.entries, ["Ava/Bo 0", "Cy/Dee 1"]);

state.skins.weeks[date].front.cards[0].winners["1"] = "front_p_1";
selected = chooseLive(state);
assert.equal(selected.label, "B9", "a locked Front 9 keeps the selector on Back 9");

state.skins.weeks[date].back.cards = [];
selected = chooseLive(state);
assert.equal(selected.label, "F9", "removing back-side names returns the selector to Front 9");

const source = readFileSync("firmware/phase2/integration-r6-f89-compact-font/usermod/usermod_hbnf_foundation_v1.cpp", "utf8");
const edge = readFileSync("staging/coordinated-backend/hbnf-cart-control/index.ts", "utf8");
assert.match(edge, /selectorVersion:\s*"skins-front-lock-v1"/, "the relay requires the exact staged front-lock selector version");
assert.match(source, /functions\/v1\/hbnf-cart-control"/);
assert.ok(source.includes('"{\\"action\\":\\"live_status\\"}"'), "firmware request is not the read-only live_status action");
assert.match(source, /HBNF_MATRIX_ANON_KEY/);
assert.match(source, /crt_bundle_attach=esp_crt_bundle_attach/);
assert.match(source, /timeout_ms=3500/);
assert.match(source, /HBNF_LIVE_POLL_MS=15000u/);
assert.match(source, /HBNF_LIVE_REDISPLAY_MS=240000u/);
assert.match(source, /now-live\.lastSeenMs\)>=120000u/);
assert.match(source, /changed\|\|recovered\|\|scheduleRedisplay\|\|old\.displayPending/);
assert.match(source, /if\(hbnfFetchMatrixSkins\(snapshotDoc\)\)/, "failed HTTP calls do not refresh snapshot freshness");
assert.match(source, /hbnfRenderCommandOverlay\(f\.controls\.matrixBrightness,f\.vibe\)\)hbnfRenderLiveOverlay/);
assert.match(source, /xTaskCreatePinnedToCore\(hbnfMatrixSkinsPollTask/);
const loop = source.slice(source.indexOf("  void loop() override {"), source.indexOf("  void addToJsonState(JsonObject& root) override {"));
assert.doesNotMatch(loop, /esp_http_client|hbnfFetchMatrixSkins/);
console.log("PASS: canonical live_status selector keeps B9 hidden until Front 9 lock, projects F9/B9 score changes, and firmware source binds bounded TLS polling, stale expiry, overlay precedence, and 15s/4min schedules");
