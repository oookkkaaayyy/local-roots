import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
const features = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8");
const controller = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");

test("palette and Saved Looks are hidden while Show style and scoring controls remain available", () => {
  assert.match(html, /<div id="palettePanel"[^>]*\bhidden\b/, "Colors controls are withheld");
  assert.match(html, /<details class="panel sub-controls" aria-label="Saved looks and advanced color"[^>]*\bhidden\b/, "Saved Looks controls are withheld");

  for (const id of ["featurePalette", "featureColor", "featureApplyPalette", "featureLookName", "featureSavedLooks", "featureApplyLook", "featureSaveLook", "featureApplySaved", "featureDeleteSaved"])
    assert.ok(html.includes(`id="${id}"`), `${id} remains in source for later re-enable`);

  assert.match(html, /<select id="scene">/, "Independent Show style selector remains available");
  assert.match(controller, /command\("SCENE", \{ sceneId: \$\(id\)\.value/, "Show style still uses the existing scene command");
  for (const id of ["featureRefreshLive", "featureScoreboard", "featureAcePot", "skinsRefresh", "skinsSave"])
    assert.ok(html.includes(`id="${id}"`), `${id} remains available for scoring and rounds`);

  assert.match(features, /function readSavedLooks\(\)[\s\S]*?localStorage\.getItem\(SAVED_LOOKS_KEY\)/, "saved data remains readable");
  assert.match(features, /function writeSavedLooks\(list\)[\s\S]*?localStorage\.setItem\(SAVED_LOOKS_KEY/, "saved data remains writable for later re-enable");
});
