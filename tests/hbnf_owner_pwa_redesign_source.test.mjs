import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../hbnf-final-controller/hbnf-cart-ui-v6.css", import.meta.url), "utf8");
const ui = readFileSync(new URL("../hbnf-final-controller/hbnf-cart-ui-v6.mjs", import.meta.url), "utf8");

test("Cart redesign preserves the canonical HBNF palette and documented LR accents", () => {
  for (const token of ["--hbnf-bg:#06100d", "--hbnf-panel:#0a1713", "--hbnf-panel2:#0d211a", "--hbnf-text:#eff8f3", "--hbnf-muted:#8eaa9d", "--hbnf-accent:#4ce19f"]) {
    assert.ok(css.includes(token), `missing established HBNF token ${token}`);
  }
  for (const token of ["--cart-cream:#fff8ee", "--cart-sage-light:#dee6cf", "--cart-sage:#8c956a", "--cart-forest:#243a2d", "--cart-clay:#a7623a"]) {
    assert.ok(css.includes(token), `missing documented Local Roots token ${token}`);
  }
});

test("Show style remains visible and uses the existing scene selector and command handlers", () => {
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
  assert.match(css, /body\{width:auto;max-width:none!important/);
  assert.match(css, /@media\(min-width:900px\).*orientation:landscape/s);
  assert.match(css, /#ownerViewShow>#showStylePanel,#ownerViewShow>\.cart-commands\{grid-column:1\/-1;min-width:0\}/);
  assert.match(css, /min-height:52px/);
  assert.match(css, /input\[type=range\].*min-height:48px/s);
  assert.match(ui, /aria-controls="ownerViewShow"/);
  assert.match(ui, /aria-controls="ownerViewScores"/);
  assert.match(ui, /aria-controls="ownerViewSystem"/);
});

test("changed Owner PWA assets use a fresh matching cache revision", () => {
  const revision = "20261024-cart-field-desk-r2";
  for (const asset of ["hbnf-cart-ui-v6.css", "hbnf-cart.js", "hbnf-cart-ui-v6.mjs", "hbnf-cart-features.mjs", "hbnf-cart-skins-score.mjs"]) {
    assert.match(html, new RegExp(`${asset.replaceAll(".", "\\.")}\\?v=${revision}`));
  }
  assert.match(html, /hbnf-cart2-owner-field-desk-r2-20261024/);
  assert.match(readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8"), new RegExp(`hbnf-cart-readiness\\.mjs\\?v=${revision}`));
  assert.match(readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8"), new RegExp(`hbnf-cart-readiness\\.mjs\\?v=${revision}`));
});
