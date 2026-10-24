import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { makeInertPreview } from "../scripts/cart_inert_preview.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "hbnf-final-controller/hbnf-cart.html"), "utf8");
const css = fs.readFileSync(path.join(root, "hbnf-final-controller/hbnf-cart-ui-v6.css"), "utf8");

test("offline visual preview retains current Cart markup but cannot execute or connect", () => {
  const preview = makeInertPreview(source, css);
  assert.match(preview, /Offline visual preview · controls are inactive · no network requests or commands/);
  assert.match(preview, /connect-src 'none'/);
  assert.match(preview, /default-src 'none'/);
  assert.match(preview, /script-src 'none'/);
  assert.match(preview, /name="hbnf-preview-source-sha256" content="[a-f0-9]{64}"/);
  assert.match(preview, /name="hbnf-preview-css-sha256" content="[a-f0-9]{64}"/);
  assert.doesNotMatch(preview, /<script\b/i);
  assert.doesNotMatch(preview, /<(?:iframe|object|embed|form)\b/i);
  assert.doesNotMatch(preview, /\s+on(?:click|load|error|submit)=/i);
  assert.doesNotMatch(preview, /href=(['"])https?:\/\//i);
  assert.doesNotMatch(preview, /src=(['"])https?:\/\//i);
  assert.match(preview, /href="\.\/hbnf-cart-ui-v6\.css\?/);
  assert.match(preview, /id="featureRefreshLive"/);
  assert.match(preview, /id="featureScoreboard"/);
  assert.match(preview, /id="featureSendText"/);
  assert.match(preview, /id="featureApplyLook"/);
  assert.match(preview, /id="featureApplyPalette"/);
  assert.match(preview, /id="featureApplySaved"/);
  assert.match(preview, /id="showStylePanel"[^>]*aria-label="show style"/i);
  assert.match(preview, /id="cartLanTruth"[^>]*>Offline preview</);
  assert.match(preview, /id="internetTruth"[^>]*>Not connected</);
  assert.doesNotMatch(preview, /<button[^>]*>\s*(?:Colors|Saved Looks)\s*</i);
});

test("offline preview fails closed if the stylesheet introduces remote resources", () => {
  assert.throws(() => makeInertPreview(source, `${css}\n@import url(https://example.invalid/remote.css);`), /remote resource/);
  assert.throws(() => makeInertPreview(source.replace("<body>", '<body><img src="https://example.invalid/track.png">'), css), /active or remote resource/);
});
