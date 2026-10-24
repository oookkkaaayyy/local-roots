import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const owner = read("../hbnf-final-controller/hbnf-cart.html");
const guest = read("../hbnf-final-controller/guest/hbnf-cart/index.html");
const controller = read("../hbnf-final-controller/hbnf-cart.js");
const features = read("../hbnf-final-controller/hbnf-cart-features.mjs");
const guestRuntime = read("../hbnf-final-controller/guest/hbnf-cart/guest.js");
const markup = `${owner}\n${guest}`;
const copy = `${markup}\n${controller}\n${features}\n${guestRuntime}`;

function decodeText(value) {
  return value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

test("Cart copy uses concise labels and keeps scoring links understandable", () => {
  for (const outdated of [
    "Everyday tools", "Fine-tune the show", "Choose a look for the Cart.",
    "Show scores on Cart", "Cart status", "Guest Mode", "Cart Auto",
    "Animation & color", "READY/CHECK", "BLOCKED ·", "Score-update time is unknown",
    "Saved looks and colors", "Saved looks and advanced color", "Firmware and diagnostics", "Advanced audio",
    "Run rollout preflight", "Open trusted installer", "Refresh install result", "Scene default",
    "Audio emphasis", "Reaction style", "Show text", "Choice sent. Waiting for the Cart.",
    "Palette controls aren’t ready", "Signed update not checked yet.", "Preflight not run.",
    "Choose a palette first.", "Applying palette…", "Palette wasn’t confirmed.",
    "last score update time is unknown", "Score data connection needs internet", "Score data connection not confirmed",
  ]) assert.ok(!copy.includes(outdated), `outdated or internal copy remains: ${outdated}`);

  for (const phrase of [
    "Show scores on Matrix", "Show ace pot on Matrix", "Show entered scores (offline)",
    "Scores refreshed. The last update time isn’t available.", "Connect to Cart Wi-Fi to load colors.",
    "Saved looks", "Updates and status", "Sound",
    "Matrix and underglow confirmed the lighting setting.", "Choice sent. Waiting for confirmation.",
    "Check device readiness", "Color controls aren’t ready. No change was sent.",
    "Sound and motion", "Text message", "Check for update", "Open installer", "Check install status",
    "Choose a color style first.", "Couldn’t refresh scores. Showing saved results; the score update time isn’t available.",
    "Score data not confirmed",
  ]) assert.ok(copy.includes(phrase), `expected concise copy is missing: ${phrase}`);

  for (const href of ["skins.html", "glow.html"]) {
    const matches = [...markup.matchAll(new RegExp(`<a\\b[^>]*href="[^"]*${href}"[^>]*>([\\s\\S]*?)<\\/a>`, "g"))];
    assert.ok(matches.length >= 1, `${href} link should remain available`);
    for (const [, inner] of matches) {
      assert.match(inner, /^(?:Skins|Glow)$/);
    }
  }
});

test("buttons and message inputs retain accessible names; icons are not ad hoc", () => {
  for (const match of markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const [, attrs, contents] = match;
    const label = attrs.match(/\baria-label="([^"]+)"/i)?.[1] || "";
    assert.ok(label || decodeText(contents), `button has no accessible name: ${match[0]}`);
  }

  assert.match(owner, /id="featureText"[^>]*aria-label="Message"/);
  assert.match(guest, /id="guestText"[^>]*aria-label="Message"/);
  assert.match(owner, /aria-label="Underglow brightness"/);
  assert.match(guest, /Underglow brightness is independent\./);
  assert.doesNotMatch(markup, /\(AUX\)/, "the technical AUX label is kept out of visible copy");
  for (const label of ["Saved looks", "Updates and status", "Sound"]) {
    assert.match(owner, new RegExp(`<summary>${label}</summary>`));
  }
  assert.match(owner, /aria-label="Saved looks"[\s\S]*?<summary>Saved looks<\/summary>/);
  assert.match(owner, /aria-label="Updates and status"[\s\S]*?<summary>Updates and status<\/summary>/);

  const svgTags = [...markup.matchAll(/<svg\b([^>]*)>/gi)];
  for (const [, attrs] of svgTags) {
    const hidden = /\baria-hidden="true"/i.test(attrs);
    const named = /\brole="img"/i.test(attrs) && (/\baria-label="[^"]+"/i.test(attrs) || /\baria-labelledby="[^"]+"/i.test(attrs));
    assert.ok(hidden || named, `SVG must be decorative or have an accessible name: ${attrs}`);
  }
  assert.equal(svgTags.length, 0, "There is no established in-app icon set; keep controls text-labeled instead of adding ad hoc icons.");
  for (const [, attrs] of markup.matchAll(/<img\b([^>]*)>/gi)) assert.match(attrs, /\balt="[^"]*"/i, "images need alternative text");
  assert.doesNotMatch(copy, /(?:lucide|fontawesome|bootstrap-icons|heroicons)/i, "no icon dependency is established for these screens");
});

test("updated command feedback keeps failures visually marked", () => {
  const match = controller.match(/actionStatus\.className\s*=\s*\/([^/]+)\/i\.test\(actionStatus\.textContent\)/);
  assert.ok(match, "command feedback should classify failed results by status text");
  const failure = new RegExp(match[1], "i");
  for (const message of [
    "Couldn’t apply that change. Check connection details.",
    "Controls aren’t ready. No change was sent.",
    "No update yet. Check connection details.",
  ]) assert.ok(failure.test(message), `failure styling must match: ${message}`);
  assert.equal(failure.test("Change sent. Waiting for an update…"), false, "pending commands should not be styled as failures");
  assert.equal(failure.test("Settings updated. Matrix and underglow are responding."), false, "confirmed commands should not be styled as failures");
  assert.match(features, /Message request sent\./);
  assert.match(features, /Couldn’t send the message\. Check the connection and try again\./);
  assert.match(guestRuntime, /Matrix and underglow confirmed the setting\./);
});

test("plain device readiness messages preserve the existing stop conditions", () => {
  assert.match(features, /if \(mac!==EXPECTED_MATRIX_MAC\) checks\.push\("Wrong Matrix device"\)/);
  assert.match(features, /catch \(e\) \{ checks\.push\("Matrix not responding"\); \}/);
  assert.match(features, /checks\.push\("Update security check "\+\(sigOk && macOk && baseOk \? "passed" : "failed"\)\)/);
  assert.match(features, /const hardFail=checks\.some\(x=>\/Matrix not responding\|Wrong Matrix device\|Update security check failed\/\.test\(x\)\)/);
  assert.match(features, /out\.textContent=\(hardFail \? "Not ready · " : "Checks complete · "\)/);
});
