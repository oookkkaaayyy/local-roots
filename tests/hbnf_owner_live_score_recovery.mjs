import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
const start = source.indexOf("function resumeLiveRefresh()");
const end = source.indexOf('window.addEventListener("hbnf-canonical-capabilities"', start);
assert.ok(start >= 0 && end > start, "live-score lifecycle wiring should be present in the feature module");
const lifecycle = source.slice(start, end);
const refreshStart = source.indexOf("async function refreshLive(silent)");
const refreshEnd = source.indexOf("async function showScoreboard()", refreshStart);
assert.ok(refreshStart >= 0 && refreshEnd > refreshStart, "live-score refresh implementation should be present");
const refresh = source.slice(refreshStart, refreshEnd);
assert.match(refresh, /finally\s*\{\s*liveRefreshInFlight=false;\s*flushPendingLiveRefresh\(\);/, "a queued resume refresh must run after an in-flight read settles");

test("live scores refresh when WAN returns or the PWA resumes", async () => {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const intervalCallbacks = [];
  const document = { hidden: false, addEventListener: (name, fn) => documentListeners.set(name, fn) };
  let liveRefreshes = 0;
  const context = {
    window: { addEventListener: (name, fn) => windowListeners.set(name, fn) },
    document,
    matrixLocal: () => true,
    refreshOtaResult: () => Promise.resolve(),
    refreshLive: () => { liveRefreshes += 1; return Promise.resolve(); },
    liveRefreshInFlight: false,
    liveRefreshPending: false,
    liveRefreshPendingSilent: true,
    setTimeout: () => 1,
    setInterval: fn => { intervalCallbacks.push(fn); return intervalCallbacks.length; },
  };
  vm.runInNewContext(lifecycle, context);

  windowListeners.get("online")();
  assert.equal(liveRefreshes, 1, "WAN online event should refresh scores immediately");

  document.hidden = true;
  windowListeners.get("online")();
  assert.equal(liveRefreshes, 1, "a hidden PWA should not issue a background refresh");

  document.hidden = false;
  documentListeners.get("visibilitychange")();
  assert.equal(liveRefreshes, 2, "returning to the foreground should refresh scores immediately");

  windowListeners.get("pageshow")();
  assert.equal(liveRefreshes, 3, "restoring the PWA page should refresh scores immediately");

  intervalCallbacks[0]();
  assert.equal(liveRefreshes, 4, "the existing periodic refresh remains active");

  context.liveRefreshInFlight = true;
  windowListeners.get("online")();
  assert.equal(liveRefreshes, 4, "an online event coalesces while a score read is already running");
  assert.equal(context.liveRefreshPending, true, "the skipped online refresh is retained until the current read settles");
  context.liveRefreshInFlight = false;
  context.flushPendingLiveRefresh();
  assert.equal(liveRefreshes, 5, "the queued WAN recovery read starts immediately after the previous read settles");
  assert.equal(context.liveRefreshPending, false, "the queued refresh is consumed exactly once");

  context.liveRefreshInFlight = true;
  windowListeners.get("online")();
  document.hidden = true;
  context.liveRefreshInFlight = false;
  context.flushPendingLiveRefresh();
  assert.equal(liveRefreshes, 5, "a queued resume read does not run in the background");
  assert.equal(context.liveRefreshPending, true, "a hidden-page pending refresh remains queued");
  document.hidden = false;
  documentListeners.get("visibilitychange")();
  assert.equal(liveRefreshes, 6, "the next foreground event performs one current refresh");
  assert.equal(context.liveRefreshPending, false, "foreground refresh consumes the old pending marker without a duplicate");
});

test("manual Refresh Scores queues behind an active poll and reports feedback", async () => {
  const statuses = [];
  const context = {
    probeHbnfEndpoint: () => {},
    liveRefreshInFlight: true,
    liveRefreshPending: false,
    liveRefreshPendingSilent: true,
    setFeatureStatus: value => statuses.push(value),
    renderScoreActionStatus: value => statuses.push(value),
  };
  vm.runInNewContext(refresh, context);
  await context.refreshLive(false);
  assert.equal(context.liveRefreshPending, true, "manual refresh is not silently dropped when a poll is active");
  assert.equal(context.liveRefreshPendingSilent, false, "queued manual refresh retains interactive feedback");
  assert.deepEqual(statuses, ["Refresh queued…", "A score refresh is already running. One more refresh is queued."]);
});
