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
const localUi = readFileSync("firmware/phase2/integration-r6-f89-compact-font/usermod/hbnf_local_ui.h", "utf8");
const edge = readFileSync("staging/coordinated-backend/hbnf-cart-control/index.ts", "utf8");
const relay = readFileSync("staging/coordinated-backend/opal/hbnf-skins-relay", "utf8");
const liveRenderer = source.slice(source.indexOf("static void hbnfRenderLiveOverlay"), source.indexOf("static bool hbnfAcceptLiveSnapshot"));
const liveAcceptor = source.slice(source.indexOf("static bool hbnfAcceptLiveSnapshot"), source.indexOf("// AI: end", source.indexOf("static bool hbnfAcceptLiveSnapshot")));
assert.match(edge, /selectorVersion:\s*"skins-front-lock-v1"/, "the relay requires the exact staged front-lock selector version");
assert.match(relay, /POLL_SECONDS=15/);
assert.match(relay, /REDISPLAY_SECONDS=240/);
assert.match(relay, /skins_redisplay_due/);
assert.match(relay, /if ! post_matrix "\$SNAPSHOT"; then/, "a fresh identical score snapshot renews the Matrix renderer lease");
assert.match(source, /if\(!hbnfRenderCommandOverlay\(f\.controls\.matrixBrightness,f\.vibe\)\)hbnfRenderLiveOverlay/);
assert.doesNotMatch(source, /hbnfMatrixSkinsPollTask|esp_http_client/, "firmware reuses the installed external relay architecture");
assert.match(source, /char entries\[20\]\[64\]/);
assert.match(source, /n>63/);
assert.match(source, /pageDwellMs\[0\]=5500u/);
assert.match(source, /pageCount=\(uint8_t\)\(2u\+\(next\.count\+1u\)\/2u\)/);
assert.doesNotMatch(liveRenderer, /(?:^|[^0-9])(?:1900|20000)u/, "no 1.9-second cycle or 20-second cutoff remains");
assert.doesNotMatch(liveAcceptor, /(?:^|[^0-9])20000u|constrain\(pages/, "overlay duration follows the complete number of screens");
assert.match(source, /hbnfDrawLiveText\(first,1/);
assert.match(source, /hbnfDrawLiveText\(second,10/);
assert.match(source, /next\.overlayStartMs=changed\?now:hbnfLive\.overlayStartMs/);
assert.match(source, /"AMOUNT N\/A"/, "the count-valued current acePot contract is not rendered as money");
const matrixLiveEntryLine = localUi.split("\n").find(line => line.startsWith("function matrixLiveEntry("));
assert.ok(matrixLiveEntryLine, "embedded dashboard has a bounded full-name wire formatter");
const matrixLiveEntry = new Function(`${matrixLiveEntryLine}; return matrixLiveEntry;`)();
assert.equal(matrixLiveEntry("Ava Thompson 1"), "Ava Thompson 1", "embedded dashboard preserves complete names");
assert.equal(matrixLiveEntry("Cy / Dee 2"), "Cy/Dee 2", "team names remain distinct and supported");
assert.equal(matrixLiveEntry(`${"A".repeat(58)} 1`), `${"A".repeat(58)} 1`, "maximum supported names are retained");
assert.equal(matrixLiveEntry(`${"A".repeat(59)} 1`), null, "oversized names fail closed rather than being clipped");
assert.equal(matrixLiveEntry("José 1"), null, "unsupported glyph names fail closed rather than being silently rewritten");
assert.match(localUi, /skinsHasNames\(week\.back,true\)&&skinsSectionLocked\(week\.front\)/, "embedded dashboard withholds preloaded Back 9 until Front 9 is locked");
assert.match(localUi, /entries\.some\(x=>!x\)\)\)return/, "invalid names suppress the entire posted roster instead of dropping individual players");
assert.doesNotMatch(localUi, /slice\(0,5\)/, "the embedded scoreboard path no longer reduces names to five characters");
console.log("PASS: F9/B9 data selection, existing Opal polling/redisplay authority, full bounded names, readable two-row schedule and no unsupported currency output");
