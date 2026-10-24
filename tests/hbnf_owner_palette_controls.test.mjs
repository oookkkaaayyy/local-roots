import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
const panelStart = html.indexOf('<div id="palettePanel"');
const panelEnd = html.indexOf("</div>\n  </section>", panelStart);
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
assert.match(source, /bind\("featureApplyPalette",applyPalette\)/, "Deferred palette action retains its existing binding for later re-enable");

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
      current = mismatch && sendCount === 1 ? "wled-unexpected" : payload.paletteId;
    },
  };
  const context = {
    canonicalBridge: () => bridge,
    canonicalCapabilities: () => ({ canonicalPaletteIntentV1: capability }),
    paletteIdFromControls: () => selection,
    desiredState: snapshot => snapshot && snapshot.desired && snapshot.desired.state ? snapshot.desired.state : null,
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
  assert.match(f.actionFeedback.at(-1), /acknowledged and read back/);
  assert.match(f.actionFeedback.at(-1), /Physical output is not verified/);
});

test.skip("DEFERRED: palette failure restoration will be revalidated when palette controls return", async () => {
  const f = fixture({ mismatch: true });
  await assert.rejects(f.apply(), /Palette was not confirmed/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.commands)), [
    ["PALETTE", { paletteId: "wled-7" }],
    ["PALETTE", { paletteId: "wled-1" }],
  ]);
  assert.match(f.actionFeedback.at(-1), /Previous palette restored and read back/);
});

test("unavailable palette intent and unknown current state fail before any command", async () => {
  const unavailable = fixture({ capability: false });
  await assert.rejects(unavailable.apply(), /backend is not ready/);
  assert.equal(unavailable.commands.length, 0);

  const unknown = fixture({ unknownInitial: true });
  await assert.rejects(unknown.apply(), /no palette change was sent/);
  assert.equal(unknown.commands.length, 0);
});

test("unreachable current state reports the failure and sends no palette command", async () => {
  const f = fixture({ readFails: true });
  await assert.rejects(f.apply(), /Cart offline/);
  assert.equal(f.commands.length, 0);
  assert.match(f.actionFeedback.at(-1), /no change was sent/);
});

test("Keep current is not sent as a palette command", async () => {
  const f = fixture({ selection: "" });
  await assert.rejects(f.apply(), /Choose a palette before applying/);
  assert.equal(f.commands.length, 0);
});
