import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
const controller = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
const start = source.indexOf("async function sendText()");
const end = source.indexOf("function renderLive(", start);
assert.ok(start >= 0 && end > start, "Text command function should be available for focused verification");
const sendTextSource = source.slice(start, end);
const textPanelStart = html.indexOf('<section id="textPanel"');
const textPanelEnd = html.indexOf("</section>", textPanelStart);
assert.ok(textPanelStart >= 0 && textPanelEnd > textPanelStart, "Text panel should be present");
const textPanel = html.slice(textPanelStart, textPanelEnd);
assert.match(textPanel, /id="textActionStatus"[^>]*role="status"[^>]*aria-live="polite"/, "Text feedback must be announced beside its control");

function fixture({ text = "HELLO", overlay = async () => ({ accepted: true, acknowledged: true }) } = {}) {
  const elements = {
    featureText: { value: text },
    featureColor: { value: "#12ABEF" },
    featureFontIndex: { value: "2" },
  };
  const feedback = [];
  const commands = [];
  const context = {
    $: id => elements[id],
    setFeatureStatus: value => feedback.push(["global", value]),
    renderTextActionStatus: value => feedback.push(["text", value]),
    canonicalOverlayBridge: () => ({ overlay: async (...args) => { commands.push(args); return overlay(...args); } }),
    canonicalCapabilities: () => ({ nativeTextFontIndexV1: true }),
  };
  vm.runInNewContext(sendTextSource, context);
  return { context, elements, feedback, commands };
}

test("Text command reports device acknowledgment next to Send without claiming physical display", async () => {
  const f = fixture();
  await f.context.sendText();
  assert.equal(JSON.stringify(f.commands), JSON.stringify([["text", { text: "HELLO", color: "#12ABEF", fontIndex: 2 }]]));
  assert.equal(f.elements.featureText.value, "", "input clears only after the command resolves");
  assert.ok(f.feedback.some(([where, text]) => where === "text" && /acknowledged by Cart devices/.test(text) && /Physical display is not verified/.test(text)));
});

test("failed Text command keeps the draft and reports that acknowledgment is missing", async () => {
  const f = fixture({ overlay: async () => { throw new Error("Cart offline"); } });
  await assert.rejects(f.context.sendText(), /Cart offline/);
  assert.equal(f.elements.featureText.value, "HELLO", "failed command preserves the user's text");
  assert.ok(f.feedback.some(([where, text]) => where === "text" && /not confirmed/.test(text)));
});

test("Text command preserves the draft when Cart accepts it but device acknowledgment is pending", async () => {
  const f = fixture({ overlay: async () => ({ accepted: true, acknowledged: false }) });
  await assert.rejects(f.context.sendText(), /device acknowledgment is still pending/);
  assert.equal(f.elements.featureText.value, "HELLO", "unconfirmed delivery must not clear the draft");
  assert.ok(f.feedback.some(([where, text]) => where === "text" && /accepted; device acknowledgment is still pending/.test(text)));
});

test("Text command reports an explicit control-plane rejection without clearing the draft", async () => {
  const f = fixture({ overlay: async () => ({ accepted: false, error: "stale revision" }) });
  await assert.rejects(f.context.sendText(), /stale revision/);
  assert.equal(f.elements.featureText.value, "HELLO");
  assert.ok(f.feedback.some(([where, text]) => where === "text" && /not confirmed/.test(text)));
});

test("empty Text command is explained beside the control and is never sent", async () => {
  const f = fixture({ text: "   " });
  await assert.rejects(f.context.sendText(), /Type a message first/);
  assert.equal(f.commands.length, 0);
  assert.ok(f.feedback.some(([where, text]) => where === "text" && /Enter a message/.test(text)));
});

function controllerCommandFixture(snapshot) {
  const start = controller.indexOf("async function command(type, payload = {}) {");
  const end = controller.indexOf("\nwindow.HBNFCanonical =", start);
  assert.ok(start >= 0 && end > start, "canonical command bridge should be available for focused verification");
  const context = {
    revision: 1,
    flushTune: async () => {},
    newCommandId: () => "test-command",
    call: async () => ({ revision: 2, accepted: true }),
    refresh: async () => snapshot,
    statusNode: { textContent: "" },
    setTimeout: callback => { callback(); return 0; },
    Date,
    Promise,
    Error,
  };
  vm.runInNewContext(controller.slice(start, end), context);
  return context;
}

test("canonical command returns acknowledgment only for current-revision device reports", async () => {
  const snapshot = { observed: ["matrix", "aux"].map(device_id => ({
    device_id, desired_revision: 2, status: "online", reported: { confirmed: true },
  })) };
  const context = controllerCommandFixture(snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(await context.command("OVERLAY_START", {}))), { accepted: true, acknowledged: true });
});

test("canonical command rejects when a device reports a failed command", async () => {
  const snapshot = { observed: [{ desired_revision: 2, status: "failed", reported: { confirmed: false, error: "device rejected" } }] };
  const context = controllerCommandFixture(snapshot);
  await assert.rejects(context.command("OVERLAY_START", {}), /device reported failure/);
});

function scoreboardFixture(overlay) {
  const start = source.indexOf("async function showScoreboard()");
  const end = source.indexOf("async function showManualScoreboard()", start);
  assert.ok(start >= 0 && end > start, "Show Scores command should be available for focused verification");
  const statuses = [];
  const paths = [];
  const context = {
    setFeatureStatus: value => statuses.push(value),
    renderScoreActionStatus: value => statuses.push(value),
    renderScorePathStatus: value => paths.push(value),
    canonicalRead: async () => ({ live: { active: true, label: "Skins", entries: ["Ava 1"] }, updated_at: "2026-10-21T17:42:00Z" }),
    updateScoreNetworkTruth: () => {},
    updateDisplayedLiveSnapshot: () => "Source row updated_at 2026-10-21T17:42:00Z.",
    canonicalOverlayBridge: () => ({ overlay }),
    matrixLiveSourceRevisionStatus: async () => "Matrix source revision unverified.",
    Math,
    String,
    Error,
  };
  vm.runInNewContext(source.slice(start, end), context);
  return { context, statuses, paths };
}

test("Show Scores reports accepted-but-unacknowledged delivery without claiming success", async () => {
  const f = scoreboardFixture(async () => ({ accepted: true, acknowledged: false }));
  await f.context.showScoreboard();
  assert.ok(f.statuses.some(value => /accepted; device acknowledgment is still pending/.test(value)));
  assert.ok(f.paths.some(value => /Matrix live-standings receipt: not reported/.test(value)));
  assert.ok(!f.statuses.some(value => /acknowledged by Cart devices/.test(value)));
});

test("Show Scores reports device acknowledgment only after current device readback", async () => {
  const f = scoreboardFixture(async () => ({ accepted: true, acknowledged: true }));
  await f.context.showScoreboard();
  assert.ok(f.statuses.some(value => /acknowledged by Cart devices/.test(value)));
  assert.ok(f.statuses.some(value => /Physical display is not verified/.test(value)));
});

test("Show Scores reports a rejected command as unconfirmed", async () => {
  const f = scoreboardFixture(async () => ({ accepted: false, error: "revision conflict" }));
  await assert.rejects(f.context.showScoreboard(), /revision conflict/);
  assert.ok(f.statuses.some(value => /Standings command was not confirmed/.test(value)));
  assert.ok(!f.statuses.some(value => /acknowledged by Cart devices/.test(value)));
});
