import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../hbnf-final-controller/hbnf-cart-ui-v6.css", import.meta.url), "utf8");
const ui = readFileSync(new URL("../hbnf-final-controller/hbnf-cart-ui-v6.mjs", import.meta.url), "utf8");

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + .05) / (darker + .05);
}

test("Cart uses the documented earth palette with HBNF green as a restrained accent", () => {
  for (const token of ["--hbnf-bg:#06100d", "--hbnf-panel:#0a1713", "--hbnf-panel2:#0d211a", "--hbnf-text:#eff8f3", "--hbnf-muted:#8eaa9d", "--hbnf-accent:#4ce19f"]) {
    assert.ok(css.includes(token), `missing established HBNF token ${token}`);
  }
  for (const token of ["--cart-cream:#fff8ee", "--cart-sage-light:#dee6cf", "--cart-sage:#8c956a", "--cart-forest:#243a2d", "--cart-clay:#a7623a"]) {
    assert.ok(css.includes(token), `missing documented Local Roots token ${token}`);
  }
  assert.match(css, /body\{[^}]*background:var\(--cart-canvas\);color:var\(--cart-root\);font:16px\/1\.4 -apple-system/s);
  assert.match(css, /\.cart-mark-wrap\{[^}]*background:var\(--cart-forest\)/);
  assert.match(css, /\.cart-mark\{[^}]*mix-blend-mode:screen/);
  assert.doesNotMatch(css, /Georgia|Times New Roman/);
  assert.doesNotMatch(html, /Set the scene|Choose a Vibe, then set the brightness|Choose how the lights move|YOUR SHOW/);
  assert.doesNotMatch(ui, /Next changes the look|broad speed range|second holds/);
});

test("visible text and control states keep readable contrast on the earth palette", () => {
  assert.ok(contrast("#3a2618", "#fff8ee") >= 4.5, "main text on cream");
  assert.ok(contrast("#5a5147", "#f2ecdf") >= 4.5, "muted text on canvas");
  assert.ok(contrast("#243a2d", "#dee6cf") >= 4.5, "forest text on sage controls");
  assert.ok(contrast("#70440b", "#f2e2c4") >= 4.5, "warning text on warning surface");
  assert.ok(contrast("#712a20", "#eed0c7") >= 4.5, "error text on error surface");
  assert.match(css, /button,select,input:not\(\[type=range\]\),textarea\{[^}]*border:1px solid var\(--cart-forest\)/);
  assert.match(css, /:focus-visible\{outline:3px solid var\(--cart-forest\)/);
});

test("Motion remains visible and uses the independent existing scene selector and command handlers", () => {
  assert.match(html, /id="showStylePanel"/);
  assert.match(html, /id="showStyleOptions"/);
  assert.match(html, /id="sceneButtons"/);
  assert.match(html, /id="scene"/);
  assert.match(ui, /showStyleOptions\.appendChild\(sceneButtonsHost\)/);
  assert.match(ui, /select\.dispatchEvent\(new Event\("change"/);
  assert.match(ui, /setAttribute\("aria-pressed",String\(selected\)\)/);
});

test("deferred palette and saved look controls stay hidden with their source data intact", () => {
  assert.match(html, /id="palettePanel"[^>]*hidden/);
  assert.match(html, /aria-label="Saved looks and advanced color" hidden/);
  for (const id of ["featureLook", "featureLookName", "featureSavedLooks", "featureApplySaved", "featureSaveLook", "featureDeleteSaved"]) {
    assert.ok(html.includes(`id="${id}"`), `saved look control/data path ${id} was removed`);
  }
  assert.match(html, /id="showStylePanel"/);
});

test("layout uses available wide screens and preserves touch-sized primary controls", () => {
  assert.match(css, /@media\(min-width:900px\).*orientation:landscape/s);
  assert.match(css, /grid-template-areas:"lights motion" "text power"/);
  assert.match(css, /#ownerViewShow>#showStylePanel\{grid-area:motion\}/);
  assert.match(css, /min-height:48px/);
  assert.match(css, /input\[type=range\].*min-height:44px/s);
  assert.match(ui, /aria-controls="ownerViewShow"/);
  assert.match(ui, /aria-controls="ownerViewScores"/);
  assert.match(ui, /aria-controls="ownerViewSystem"/);
});

test("changed Owner PWA assets use a fresh matching cache revision", () => {
  const revision = "20261024-cart-field-desk-r3";
  for (const asset of ["hbnf-cart-ui-v6.css", "hbnf-cart.js", "hbnf-cart-ui-v6.mjs", "hbnf-cart-features.mjs", "hbnf-cart-skins-score.mjs"]) {
    assert.match(html, new RegExp(`${asset.replaceAll(".", "\\.")}\\?v=${revision}`));
  }
  assert.match(html, /hbnf-cart2-owner-field-desk-r3-20261024/);
  assert.match(readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8"), new RegExp(`hbnf-cart-readiness\\.mjs\\?v=${revision}`));
  assert.match(readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8"), new RegExp(`hbnf-cart-readiness\\.mjs\\?v=${revision}`));
});
