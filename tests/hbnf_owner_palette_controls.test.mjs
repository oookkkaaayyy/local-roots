import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
const controllerSource = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
const serviceWorker = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-sw.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-manifest.webmanifest", import.meta.url), "utf8"));
const appVersion = "20261023-cart-ux-v5";
assert.match(html, new RegExp(`\\?v=${appVersion}`), "HTML assets must use the current shell version");
assert.doesNotMatch(html, /20261016-course-ready-ux-v1/, "stale asset URLs must not be reused by browser caches");
assert.match(controllerSource, new RegExp(`hbnf-cart-(?:net|semantic)\\.mjs\\?v=${appVersion}`));
assert.match(serviceWorker, new RegExp(`const VERSION = "${appVersion}"`));
assert.match(serviceWorker, /hbnf-owner-pwa-v17-cart-ux-20261023/);
assert.equal(manifest.start_url, `/hbnf-cart.html?app=${appVersion}`);
const panelStart = html.indexOf('<section id="palettePanel"');
const panelEnd = html.indexOf("</section>", panelStart);
assert.ok(panelStart >= 0 && panelEnd > panelStart, "Palette controls should have a dedicated panel");
const palettePanel = html.slice(panelStart, panelEnd);
const markupBeforePanel = html.slice(0, panelStart);
assert.equal((markupBeforePanel.match(/<details\b/g) || []).length, (markupBeforePanel.match(/<\/details>/g) || []).length,
  "Palette controls must not be inside a collapsed details section");
assert.match(palettePanel, /aria-label="Colors"/);
assert.match(palettePanel, /id="featurePalette"[^>]*aria-describedby="paletteActionStatus"/);
assert.match(palettePanel, /id="featureColor"/);
assert.match(palettePanel, /id="featureApplyPalette"/);
assert.match(palettePanel, /id="paletteActionStatus"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(html, /id="vibeAvailability"[^>]*role="status">Checking lighting controls…/,
  "Vibe readiness should be reported only after the Cart capability check");
assert.match(html, /id="vibeActionStatus"[^>]*aria-live="polite" hidden/,
  "Vibe update feedback must be available beside the selected control");
assert.match(html, /id="commandActionStatus"[^>]*aria-live="polite" hidden/,
  "Show-control feedback must be available beside its buttons");
assert.match(html, /id="textActionStatus"[^>]*aria-live="polite" hidden/,
  "Message feedback must be available beside its button");
assert.match(fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-ui-v6.css", import.meta.url), "utf8"),
  /\.quick-links\[aria-label="Quick links"\]\{grid-template-columns:1fr\}/,
  "the scores shortcut should use the available width in portrait and landscape");
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
  let refreshCount = 0;
  const bridge = {
    refresh: async () => {
      if (readFails) throw new Error("Cart offline");
      const paletteId=unknownInitial && refreshCount++===0 ? "" : current;
      return { desired: { state: { paletteId } } };
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
  assert.match(f.actionFeedback.at(-1), /Colors updated/);
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
  assert.match(f.actionFeedback.at(-1), /Previous colors are restored/);
});

test("generic legacy state is restored with a firmware alias without claiming a named preset", async () => {
  const f = fixture({ mismatch: true, initial: "legacy" });
  await assert.rejects(f.apply(), /Palette was not confirmed/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.commands)), [
    ["PALETTE", { paletteId: "wled-7" }],
    ["PALETTE", { paletteId: "hbnf-balanced" }],
  ]);
  assert.match(f.actionFeedback.at(-1), /Previous colors are restored/);
});

test("unavailable palette intent blocks; unknown prior palette still applies the selected choice", async () => {
  const unavailable = fixture({ capability: false });
  await assert.rejects(unavailable.apply(), /controls aren’t ready/);
  assert.equal(unavailable.commands.length, 0);

  const unknown = fixture({ unknownInitial: true });
  await unknown.apply();
  assert.deepEqual(JSON.parse(JSON.stringify(unknown.commands)), [["PALETTE", { paletteId: "wled-7" }]]);
  assert.match(unknown.actionFeedback.at(-1), /Colors updated/);
  assert.match(unknown.actionFeedback.at(-1), /lights weren’t checked/i);
});

test("unknown prior palette is not guessed during recovery after apply cannot be confirmed", async () => {
  const unknown = fixture({ unknownInitial: true, mismatch: true });
  await assert.rejects(unknown.apply(), /previous colors were unknown/i);
  assert.deepEqual(JSON.parse(JSON.stringify(unknown.commands)), [["PALETTE", { paletteId: "wled-7" }]],
    "the UI must not guess a rollback palette when the previous value was unknown");
  assert.match(unknown.actionFeedback.at(-1), /previous colors were unknown, so they weren’t restored/i);
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
  const vibeActionStatus = { textContent: "", hidden: true, className: "apply-note" };
  let resolveCommand, rejectRefresh, hydrated = false, confirmedVibe = "groove";
  const context = {
    Array, document: { querySelectorAll: () => buttons },
    $: id => id === "vibeOptions" ? group : id === "vibeActionStatus" ? vibeActionStatus : auto,
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
  assert.equal(statusNode.textContent, "Updating lighting style…");
  assert.equal(vibeActionStatus.hidden,false,"the update message must appear beside the selected control");
  assert.equal(vibeActionStatus.textContent,"Updating lighting style…");
  buttons[0].listeners.click();
  assert.equal(buttons[1].attrs["aria-pressed"], "true", "a second tap during a pending command must be ignored");
  resolveCommand({ status: "confirmed" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(hydrated, true);
  assert.equal(group.attrs["aria-busy"], "false");
  assert.equal(vibeActionStatus.textContent,"Matrix and underglow confirmed the lighting setting.");

  hydrated = false;
  rejectRefresh = true;
  context.command = async () => { throw new Error("command failed"); };
  buttons[0].listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(buttons[0].attrs["aria-pressed"], "false", "failed, unconfirmed selection must roll back");
  assert.equal(buttons[1].attrs["aria-pressed"], "true");
  assert.equal(group.attrs["aria-busy"], "false");
  assert.match(vibeActionStatus.textContent,/Couldn’t confirm/);

  rejectRefresh = false;
  confirmedVibe = "chill";
  context.command = async () => ({ status: "failed" });
  buttons[0].listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(vibeActionStatus.textContent,"Couldn’t apply that lighting change. Check connection details.");
  assert.equal(vibeActionStatus.className,"apply-note bad");

  context.command = async () => ({ status: "pending" });
  buttons[1].listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(vibeActionStatus.textContent,"Request sent; Matrix and underglow haven’t confirmed the change yet.");
  assert.equal(vibeActionStatus.className,"apply-note warn");

  rejectRefresh = true;
  context.command = async () => { throw new Error("command failed"); };
  auto.disabled = false;
  auto.listeners.click();
  assert.equal(auto.attrs["aria-pressed"], "true", "Auto Vibe must respond immediately too");
  assert.equal(buttons[1].attrs["aria-pressed"], "false");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(auto.attrs["aria-pressed"], "false", "unconfirmed Auto Vibe must roll back");
  assert.equal(buttons[0].attrs["aria-pressed"], "true");

  rejectRefresh = false;
  confirmedVibe = "auto";
  context.command = () => new Promise(resolve => { resolveCommand = resolve; });
  auto.listeners.click();
  assert.equal(auto.attrs["aria-pressed"], "true");
  resolveCommand({ status: "confirmed" });
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

test("Cart command distinguishes confirmed, failed, and pending device outcomes", async () => {
  const start = controllerSource.indexOf("async function command(type, payload = {})");
  const end = controllerSource.indexOf("window.HBNFCanonical =", start);
  assert.ok(start >= 0 && end > start, "command must have a focused, reviewable implementation");
  const commandSource = controllerSource.slice(start, end);
  async function run(observed, pending = false) {
    let nowCalls = 0;
    const context = {
      flushTune: async () => {},
      call: async () => ({ revision: 7 }),
      refresh: async () => ({ observed }),
      newCommandId: () => "test-command",
      statusNode: { textContent: "" },
      revision: 0,
      pendingRevision: null,
      Date: pending ? { now: () => nowCalls++ === 0 ? 1000 : 8000 } : Date,
    };
    vm.runInNewContext(commandSource, context);
    return context.command("VIBE", { vibe: "chill" });
  }
  const confirmed = [1,2].map(() => ({ desired_revision:7,status:"online",reported:{confirmed:true} }));
  const failed = [{ desired_revision:7,status:"failed",reported:{confirmed:false,error:"offline"} }];
  const submitted = [1,2].map(() => ({ desired_revision:7,status:"submitted",reported:{confirmed:false} }));
  assert.equal((await run(confirmed)).status,"confirmed");
  assert.equal((await run(failed)).status,"failed");
  assert.equal((await run(submitted,true)).status,"pending");
});

test("Vibe availability distinguishes a disconnected Cart from unsupported controls", () => {
  const start = controllerSource.indexOf("function updateVibeSelection(_state)");
  const end = controllerSource.indexOf("function setRange(", start);
  assert.ok(start >= 0 && end > start);
  const updateSource = controllerSource.slice(start, end);
  const buttons = ["chill","groove"].map(vibe => ({
    dataset:{vibe}, disabled:true, attrs:{"aria-pressed":"false"},
    setAttribute(name,value){this.attrs[name]=value;},
  }));
  const options={hidden:false};
  const availability={hidden:false,textContent:"Checking lighting controls…"};
  const auto={hidden:true,disabled:true,attrs:{"aria-pressed":"false"},setAttribute(name,value){this.attrs[name]=value;}};
  const context={
    canonicalCapabilities:{},
    cartStatusChecked:false,
    cartConnectionUnavailable:false,
    document:{querySelectorAll:()=>buttons},
    $:id=>({vibeOptions:options,vibeAvailability:availability,vibeAuto:auto})[String(id).replace(/^#/,"")],
  };
  vm.runInNewContext(updateSource,context);
  context.updateVibeSelection({});
  assert.equal(availability.hidden,false);
  assert.equal(availability.textContent,"Checking lighting controls…");
  context.cartStatusChecked=true;
  context.cartConnectionUnavailable=true;
  context.updateVibeSelection({});
  assert.equal(availability.textContent,"Can’t connect to the Cart. Check the connection and try again.");
  context.cartConnectionUnavailable=false;
  context.updateVibeSelection({});
  assert.equal(availability.textContent,"Lighting styles aren’t available.");
  assert.equal(buttons[0].disabled,true);
  context.canonicalCapabilities.phase2VibeRuntimeV1=true;
  context.updateVibeSelection({selectedVibe:"chill"});
  assert.equal(availability.hidden,true);
  assert.equal(buttons[0].disabled,false);
  assert.equal(buttons[0].attrs["aria-pressed"],"true");
  assert.match(updateSource,/cartConnectionUnavailable[\s\S]*Can’t connect to the Cart\. Check the connection and try again\./);
});

test("failed Cart request marks the connection unavailable before reconciling Vibe controls", async () => {
  const updateStart=controllerSource.indexOf("function updateVibeSelection(_state)");
  const updateEnd=controllerSource.indexOf("function setRange(",updateStart);
  const cloudStart=controllerSource.indexOf("async function callCloud(body)");
  const cloudEnd=controllerSource.indexOf("\nfunction hydrateLocalControls",cloudStart);
  assert.ok(updateStart>=0 && updateEnd>updateStart && cloudStart>=0 && cloudEnd>cloudStart);
  const buttons=[{dataset:{vibe:"chill"},disabled:false,attrs:{},setAttribute(name,value){this.attrs[name]=value;}}];
  const availability={hidden:true,textContent:""};
  const options={hidden:false};
  const auto={hidden:false,disabled:false,setAttribute(){}};
  const context={
    canonicalCapabilities:{phase2VibeRuntimeV1:true},
    cartStatusChecked:true,
    cartConnectionUnavailable:false,
    authHeaders:async()=>({headers:{},mode:"guest"}),
    fetchWithDeadline:async()=>{throw new Error("network timeout");},
    fetch:async()=>{}, endpoint:"https://cart.test/control", HBNF_API_TIMEOUT_MS:10,
    backendHealth:{textContent:"Reachable"},
    document:{querySelectorAll:()=>buttons},
    $:id=>({vibeOptions:options,vibeAvailability:availability,vibeAuto:auto})[String(id).replace(/^#/,"")],
  };
  vm.runInNewContext(controllerSource.slice(updateStart,updateEnd)+"\n"+controllerSource.slice(cloudStart,cloudEnd),context);
  await assert.rejects(context.callCloud({action:"command"}),/network timeout/);
  assert.equal(context.canonicalCapabilities.phase2VibeRuntimeV1,undefined);
  assert.equal(context.cartStatusChecked,true);
  assert.equal(context.cartConnectionUnavailable,true);
  assert.equal(availability.textContent,"Can’t connect to the Cart. Check the connection and try again.");
  assert.equal(buttons[0].disabled,true);
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
    "window.paletteIsReady=()=>paletteOptionsReady; window.markPaletteUnavailable=()=>{paletteOptionsReady=false;};";
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
  assert.match(statuses.at(-1), /Connect to Cart Wi-Fi/);
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
  failFetch(new Error("transient retry failure"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 3000, "subsequent failures should back off");
  windowHandlers.pageshow();
  documentHandlers.visibilitychange();
  assert.equal(fetchCount, 3, "page return should retry while the backoff timer remains pending");
  assert.equal(timers.size, 1, "the scheduled backoff must remain pending during an event-triggered load");
  finishFetch(["Rainbow", "RSVD", "Ocean"]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.window.paletteIsReady(), true, "successful retry must enable palette options");
  assert.equal(timers.size, 0, "success must cancel the still-pending retry timer");
  assert.match(statuses.at(-1), /Colors loaded/);
  context.window.markPaletteUnavailable();
  windowHandlers.online();
  assert.equal(fetchCount, 4);
  failFetch(new Error("next transient failure"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal([...timers.values()][0].delay, 1000, "success must reset the backoff sequence");
  timers.clear();
  assert.deepEqual(select.options.map(option => [option.value, option.textContent]), [
    ["", "Keep current"], ["solid", "Solid color"], ["wled-0", "Rainbow"], ["wled-2", "Ocean"],
  ]);
});
