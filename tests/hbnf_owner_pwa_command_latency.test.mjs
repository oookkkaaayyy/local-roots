import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const controller = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
const local = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-local.mjs", import.meta.url), "utf8");
const features = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");

test("a command dispatches after tune acceptance without waiting for device convergence", () => {
  assert.match(controller, /await flushTune\(\{ waitForApplied: false \}\)/);
  assert.match(controller, /if \(options\.waitForApplied === false\) return/);
  assert.match(controller, /await tuneDispatchPromise/);
  assert.match(controller, /pendingRevision = revision/);
});

test("local command preflight reuses only fresh verified state and keeps device acknowledgments", () => {
  assert.match(local, /this\.transport\.controlReady\(\)/);
  assert.match(local, /this\.auxInfo && this\.auxState && this\.auxStateAt && Date\.now\(\) - this\.auxStateAt <= 15000/);
  assert.match(local, /await this\.transport\.command\(commandType, commandPayload\)/);
  assert.match(local, /await this\.readAux\(""\)/);
  assert.match(local, /matrix: \{ confirmed: true/);
  assert.match(local, /reachable: !!\(this\.auxState && this\.auxInfo\)/);
});

test("command controls provide prompt feedback, suppress repeats, and report phase timings", () => {
  assert.match(controller, /statusNode\.textContent = "Sending Cart command…"/);
  assert.match(controller, /activeCommandKeys\.has\(commandKey\)/);
  assert.match(controller, /sourceButton\.setAttribute\("aria-busy", "true"\)/);
  assert.match(controller, /getLastCommandTiming/);
  assert.match(controller, /tuneFlushMs: tuneFlushMs/);
  assert.match(controller, /deviceAckWaitMs: deviceAckWaitMs/);
  assert.match(controller, /button\.dataset\.command/);
  assert.match(controller, /command\("VIBE"/);
  assert.match(controller, /command\("VIBE_AUTO"/);
  assert.match(controller, /command\("SCENE"/);
  assert.match(features, /n\.setAttribute\("aria-busy","true"\)/);
  assert.match(features, /id==="featureSendText"\?"textActionStatus"/);
  assert.match(features, /"scoreActionStatus"/);
  assert.match(features, /"paletteActionStatus"/);
});

test("iPad command feedback and feature coverage retain Text, Refresh, Show Scores, and Palette actions", () => {
  const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
  for (const id of ["featureSendText", "featureRefreshLive", "featureScoreboard", "featureApplyPalette"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(features, /bind\("featureSendText",sendText\)/);
  assert.match(features, /bind\("featureRefreshLive",refreshLive\)/);
  assert.match(features, /bind\("featureScoreboard",showScoreboard\)/);
  assert.match(features, /bind\("featureApplyPalette",applyPalette\)/);
});
