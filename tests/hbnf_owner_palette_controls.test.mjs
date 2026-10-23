import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
const panelStart = html.indexOf('<section id="palettePanel"');
const panelEnd = html.indexOf("</section>", panelStart);
assert.ok(panelStart >= 0 && panelEnd > panelStart, "Palette controls should have a dedicated panel");
const palettePanel = html.slice(panelStart, panelEnd);
const markupBeforePanel = html.slice(0, panelStart);
assert.equal((markupBeforePanel.match(/<details\b/g) || []).length, (markupBeforePanel.match(/<\/details>/g) || []).length,
  "Palette controls must not be inside a collapsed details section");
assert.match(palettePanel, /aria-label="Cart color palette"/);
assert.match(palettePanel, /id="featurePalette"[^>]*aria-describedby="paletteActionStatus"/);
assert.match(palettePanel, /id="featureColor"/);
assert.match(palettePanel, /id="featureApplyPalette"/);
assert.match(palettePanel, /id="paletteActionStatus"[^>]*role="status"[^>]*aria-live="polite"/);
assert.equal((html.match(/id="featurePalette"/g) || []).length, 1, "Palette selector ID must remain unique");
assert.equal((html.match(/id="featureColor"/g) || []).length, 1, "Color input ID must remain unique");
assert.match(source, /bind\("featureApplyPalette",applyPalette\)/, "Visible apply button must use the existing feature binding");

const start = source.indexOf("async function applyPalette()");
const end = source.indexOf("function readSavedLooks()", start);
assert.ok(start >= 0 && end > start, "Palette action should be available for focused verification");
const applyPaletteSource = source.slice(start, end);

function fixture({ selection = "wled-7", initial = "wled-1", capability = true, mismatch = false, unknownInitial = false, readFails = false } = {}) {
  let current = initial;
  let commands = [];
  const actionFeedback = [];
  const globalFeedback = [];
  let sendCount = 0;
  const bridge = {
    refresh: async () => {
      if (readFails) throw new Error("Cart offline");
      return { desired: { state: unknownInitial ? null : { paletteId: current } } };
    },
    command: async (name, payload) => {
      commands.push([name, payload]);
      sendCount++;
      current = mismatch && sendCount === 1 ? "wled-unexpected" : (payload.paletteId === "hbnf-balanced" ? "legacy" : payload.paletteId);
    },
  };
  const context = {
    canonicalBridge: () => bridge,
    canonicalCapabilities: () => ({ canonicalPaletteIntentV1: capability }),
    paletteIdFromControls: () => selection,
    desiredState: snapshot => snapshot && snapshot.desired && snapshot.desired.state ? snapshot.desired.state : null,
    paletteCommandId: id => String(id || "")==="legacy" ? "hbnf-balanced" : String(id || ""),
    renderPaletteStatus: value => actionFeedback.push(value),
    setFeatureStatus: (value, bad) => globalFeedback.push([value, !!bad]),
  };
  vm.runInNewContext(applyPaletteSource, context);
  return { apply: context.applyPalette, commands, actionFeedback, globalFeedback };
}

test("visible palette action changes only palette and reports readback without claiming physical output", async () => {
  const f = fixture();
  await f.apply();
  assert.deepEqual(JSON.parse(JSON.stringify(f.commands)), [["PALETTE", { paletteId: "wled-7" }]]);
  assert.match(f.actionFeedback.at(-1), /Cart settings now match/);
  assert.match(f.actionFeedback.at(-1), /lights weren’t checked/i);
  assert.doesNotMatch(f.actionFeedback.at(-1), /acknowledg|readback|physical output/i);
});

test("palette failure attempts and verifies restoration of the prior palette", async () => {
  const f = fixture({ mismatch: true });
  await assert.rejects(f.apply(), /Palette was not confirmed/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.commands)), [
    ["PALETTE", { paletteId: "wled-7" }],
    ["PALETTE", { paletteId: "wled-1" }],
  ]);
  assert.match(f.actionFeedback.at(-1), /Previous palette is back in Cart settings/);
});

test("generic legacy state is restored with a firmware alias without claiming a named preset", async () => {
  const f = fixture({ mismatch: true, initial: "legacy" });
  await assert.rejects(f.apply(), /Palette was not confirmed/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.commands)), [
    ["PALETTE", { paletteId: "wled-7" }],
    ["PALETTE", { paletteId: "hbnf-balanced" }],
  ]);
  assert.match(f.actionFeedback.at(-1), /Previous palette is back in Cart settings/);
});

test("unavailable palette intent and unknown current state fail before any command", async () => {
  const unavailable = fixture({ capability: false });
  await assert.rejects(unavailable.apply(), /controls aren’t ready/);
  assert.equal(unavailable.commands.length, 0);

  const unknown = fixture({ unknownInitial: true });
  await assert.rejects(unknown.apply(), /no palette change was sent/);
  assert.equal(unknown.commands.length, 0);
});

test("unreachable current state reports the failure and sends no palette command", async () => {
  const f = fixture({ readFails: true });
  await assert.rejects(f.apply(), /Cart offline/);
  assert.equal(f.commands.length, 0);
  assert.match(f.actionFeedback.at(-1), /No change was sent/);
});

test("Keep current is not sent as a palette command", async () => {
  const f = fixture({ selection: "" });
  await assert.rejects(f.apply(), /Choose a palette before applying/);
  assert.equal(f.commands.length, 0);
});

const featureSource = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
assert.match(featureSource, /window\.addEventListener\("online",retryPaletteLoad\)/, "palette loading must retry after the browser reconnects");
assert.match(featureSource, /window\.addEventListener\("pageshow",retryPaletteLoad\)/, "palette loading must retry when the page returns");
assert.match(featureSource, /document\.addEventListener\("visibilitychange",function\(\)\{ if \(!document\.hidden\) retryPaletteLoad\(\); \}\)/, "palette loading must retry when the page becomes visible");
const controllerSource = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
const vibeHandlerStart = controllerSource.indexOf('document.querySelectorAll(".vibe-option").forEach(button => {', controllerSource.indexOf("window.HBNFCanonical ="));
const vibeHandlerEnd = controllerSource.indexOf('for (const id of ["scene"', vibeHandlerStart);
const vibeHandler = controllerSource.slice(vibeHandlerStart, vibeHandlerEnd);
const vibePendingStart = controllerSource.indexOf("function setVibePending(pending)");
const vibePendingEnd = controllerSource.indexOf("function updateVibeSelection", vibePendingStart);
const vibePendingSource = controllerSource.slice(vibePendingStart, vibePendingEnd);
assert.ok(vibeHandlerStart >= 0 && vibeHandlerEnd > vibeHandlerStart, "Vibe controls must have a single focused click handler");
assert.ok(vibePendingStart >= 0 && vibePendingEnd > vibePendingStart, "Vibe pending state must have a focused implementation");
assert.match(vibeHandler, /option\.setAttribute\("aria-pressed", option === button \? "true" : "false"\)/, "selected Vibe must respond immediately to the tap");
assert.match(vibeHandler, /refresh\(\{ hydrate: true \}\)/, "confirmed server state must replace optimistic Vibe selection");
assert.match(vibePendingSource, /aria-busy/, "Vibe updates must expose pending state to assistive technology");
assert.match(vibePendingSource, /button\.disabled = pending \|\| !ready/, "pending Vibe commands must block duplicate taps");

test("Vibe tap updates immediately, then reconciles or rolls back on failure", async () => {
  const buttons = ["chill", "groove"].map(vibe => ({
    dataset: { vibe }, disabled: false, attrs: { "aria-pressed": vibe === "chill" ? "true" : "false" },
    listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; },
    setAttribute(name, value) { this.attrs[name] = value; }, getAttribute(name) { return this.attrs[name]; },
  }));
  const group = { attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } };
  const auto = {
    disabled: true, attrs: { "aria-pressed": "false" }, listeners: {},
    addEventListener(name, fn) { this.listeners[name] = fn; },
    setAttribute(name, value) { this.attrs[name] = value; }, getAttribute(name) { return this.attrs[name]; },
  };
  const statusNode = { textContent: "" };
  let resolveCommand, rejectRefresh, hydrated = false, confirmedVibe = "groove";
  const context = {
    Array, document: { querySelectorAll: () => buttons },
    $: id => id === "vibeOptions" ? group : auto,
    canonicalCapabilities: { phase2VibeRuntimeV1: true, autoVibeControlV1: true },
    statusNode,
    command: () => new Promise(resolve => { resolveCommand = resolve; }),
    refresh: async options => {
      hydrated = options.hydrate === true;
      if (rejectRefresh) throw new Error("offline");
      buttons.forEach(button => button.setAttribute("aria-pressed", button.dataset.vibe === confirmedVibe ? "true" : "false"));
      auto.setAttribute("aria-pressed", confirmedVibe === "auto" ? "true" : "false");
    },
    showError() {},
  };
  vm.runInNewContext(vibePendingSource + vibeHandler, context);
  buttons[1].listeners.click();
  assert.equal(buttons[0].attrs["aria-pressed"], "false");
  assert.equal(buttons[1].attrs["aria-pressed"], "true");
  assert.equal(buttons[1].disabled, true, "pending Vibe must prevent duplicate taps");
  assert.equal(group.attrs["aria-busy"], "true");
  assert.equal(statusNode.textContent, "Updating Vibe…");
  buttons[0].listeners.click();
  assert.equal(buttons[1].attrs["aria-pressed"], "true", "a second tap during a pending command must be ignored");
  resolveCommand();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(hydrated, true);
  assert.equal(group.attrs["aria-busy"], "false");

  hydrated = false;
  rejectRefresh = true;
  context.command = async () => { throw new Error("command failed"); };
  buttons[0].listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(buttons[0].attrs["aria-pressed"], "false", "failed, unconfirmed selection must roll back");
  assert.equal(buttons[1].attrs["aria-pressed"], "true");
  assert.equal(group.attrs["aria-busy"], "false");

  auto.disabled = false;
  auto.listeners.click();
  assert.equal(auto.attrs["aria-pressed"], "true", "Auto Vibe must respond immediately too");
  assert.equal(buttons[1].attrs["aria-pressed"], "false");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(auto.attrs["aria-pressed"], "false", "unconfirmed Auto Vibe must roll back");
  assert.equal(buttons[1].attrs["aria-pressed"], "true");

  rejectRefresh = false;
  confirmedVibe = "auto";
  context.command = () => new Promise(resolve => { resolveCommand = resolve; });
  auto.listeners.click();
  assert.equal(auto.attrs["aria-pressed"], "true");
  resolveCommand();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(auto.attrs["aria-pressed"], "true", "confirmed Auto Vibe must reconcile successfully");
  assert.equal(group.attrs["aria-busy"], "false");

  rejectRefresh = true;
  context.command = async () => { throw new Error("command failed"); };
  buttons[0].listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(buttons[0].attrs["aria-pressed"], "false");
  assert.equal(auto.attrs["aria-pressed"], "true", "failed manual Vibe must restore previously selected Auto Vibe");
});

test("palette choices reload after Cart reconnect and overlapping lifecycle events share one request", async () => {
  const select = { options: [], appendChild(option) { this.options.push(option); }, remove(index) { this.options.splice(index, 1); } };
  const windowHandlers = {}, documentHandlers = {};
  const statuses = [];
  const timers = new Map();
  let timerId = 0, local = false, fetchCount = 0, finishFetch, failFetch;
  const loadSourceStart = featureSource.indexOf("async function loadPalettes()");
  const loadSourceEnd = featureSource.indexOf("function desiredState", loadSourceStart);
  const retrySourceStart = featureSource.indexOf("function schedulePaletteRetry()");
  const retrySourceEnd = featureSource.indexOf('bind("featureApplyLook"', retrySourceStart);
  const source = "let paletteOptionsReady=false; let paletteLoadInFlight=false; let paletteRetryTimer=null; let paletteRetryAttempt=0; const PALETTE_RETRY_DELAYS_MS=[1000,3000,8000];\n" +
    featureSource.slice(loadSourceStart, loadSourceEnd) +
    featureSource.slice(retrySourceStart, retrySourceEnd) +
    "window.paletteIsReady=()=>paletteOptionsReady;";
  const context = {
    window: { addEventListener: (name, fn) => { windowHandlers[name] = fn; } },
    document: { hidden: false, addEventListener: (name, fn) => { documentHandlers[name] = fn; }, createElement: () => ({}) },
    matrixLocal: () => local, matrixApiUrl: path => path,
    fetchJson: async () => { fetchCount++; return new Promise((resolve,reject) => { finishFetch = resolve; failFetch = reject; }); },
    renderPaletteStatus: value => statuses.push(value), syncOverlayAvailability() {},
    setTimeout: (fn, delay) => { const id=++timerId; timers.set(id,{fn,delay}); return id; },
    clearTimeout: id => timers.delete(id),
    $: id => id === "featurePalette" ? select : null,
  };
  vm.runInNewContext(source, context);
  await context.loadPalettes();
  assert.match(statuses.at(-1), /Connect to the Cart network/);
  assert.equal(fetchCount, 0);

  local = true;
  windowHandlers.online();
  assert.equal(fetchCount, 1, "reconnect must start palette loading");
  failFetch(new Error("temporary Cart API failure"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers.size, 1, "a transient failed retry must schedule a bounded follow-up");
  assert.equal([...timers.values()][0].delay, 1000, "first follow-up should use the bounded backoff");
  const [timerKey, timer] = [...timers.entries()][0];
  timers.delete(timerKey);
  timer.fn();
  assert.equal(fetchCount, 2, "scheduled follow-up must make another palette request");
  windowHandlers.pageshow();
  documentHandlers.visibilitychange();
  assert.equal(fetchCount, 2, "overlapping return events must not duplicate the palette request");
  finishFetch(["Rainbow", "RSVD", "Ocean"]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.window.paletteIsReady(), true, "successful retry must enable palette options");
  assert.equal(timers.size, 0, "success must clear any retry timer");
  assert.deepEqual(select.options.map(option => [option.value, option.textContent]), [
    ["", "Keep current"], ["solid", "Solid color"], ["wled-0", "Rainbow"], ["wled-2", "Ocean"],
  ]);
  assert.match(statuses.at(-1), /Color choices loaded/);
});
