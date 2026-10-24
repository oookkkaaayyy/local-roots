import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../hbnf-final-controller/hbnf-cart-ui-v6.css", import.meta.url), "utf8");
const ui = readFileSync(new URL("../hbnf-final-controller/hbnf-cart-ui-v6.mjs", import.meta.url), "utf8");
const js = readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../hbnf-final-controller/hbnf-cart-sw.js", import.meta.url), "utf8");

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + .05) / (darker + .05);
}

test("Cart uses a restrained dark earth palette and owner-approved HBNF mark", () => {
  for (const token of ["color-scheme:dark", "--hbnf-bg:#141916", "--hbnf-panel:#202722", "--hbnf-panel2:#29312b", "--hbnf-text:#f1eadc", "--hbnf-muted:#c9bea9", "--hbnf-accent:#9eae81"]) {
    assert.ok(css.includes(token), `missing established HBNF token ${token}`);
  }
  for (const token of ["--cart-cream:#202722", "--cart-sage-light:#354137", "--cart-sage:#788660", "--cart-forest:#a5b68e", "--cart-clay:#cf8964"]) {
    assert.ok(css.includes(token), `missing documented Local Roots token ${token}`);
  }
  assert.match(css, /body\{[^}]*background:var\(--cart-canvas\);color:var\(--cart-root\);font:16px\/1\.4 -apple-system/s);
  assert.match(html, /<img class="cart-mark" src="\.\/hbnf-faded-phosphor\.png\?v=20261024-hbnf-faded-phosphor-r1" alt="HBNF Night Flyers" width="48" height="48">/);
  assert.match(css, /\.cart-mark\{[^}]*background:transparent/);
  assert.doesNotMatch(html, /local-roots-(?:lr|full)\.svg/);
  assert.doesNotMatch(css, /#4ce19f|#fffdf8|#fff8ee/i, "the retired neon and glaring white surfaces are absent");
  assert.doesNotMatch(css, /Georgia|Times New Roman/);
  assert.doesNotMatch(html, /Set the scene|Choose a Vibe, then set the brightness|Choose how the lights move|YOUR SHOW/);
  assert.doesNotMatch(ui, /Next changes the look|broad speed range|second holds/);
});

test("visible text and control states keep readable contrast on the earth palette", () => {
  assert.ok(contrast("#f1eadc", "#202722") >= 4.5, "main text on dark panel");
  assert.ok(contrast("#c9bea9", "#202722") >= 4.5, "muted text on dark panel");
  assert.ok(contrast("#202722", "#a5b68e") >= 4.5, "button text on sage control");
  assert.ok(contrast("#f1eadc", "#354137") >= 4.5, "text on selected control surface");
  assert.ok(contrast("#f2cf7a", "#493e2c") >= 4.5, "warning text on warning surface");
  assert.ok(contrast("#ffdfd3", "#50352e") >= 4.5, "error text on error surface");
  assert.ok(contrast("#bdb3a2", "#343a36") >= 4.5, "disabled text on disabled surface");
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
  assert.match(css, /\.scene-button\{[^}]*justify-items:center[^}]*text-align:center/);
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
  assert.match(css, /grid-template-areas:"actions actions" "lights motion" "text text"/);
  assert.match(ui, /move\("\.course-status-panel", "system"\)/);
  assert.match(ui, /statusDetails\.className = "panel status-details-panel"/);
  assert.match(ui, /statusDetails\.append\(summary, status\)/);
  assert.doesNotMatch(ui, /header\.appendChild\(status\)/);
  assert.match(html, /id="truthBadge"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(js, /function updateCompactStatus\(\)/);
  assert.match(js, /label = "Connection issue"/);
  assert.match(js, /badge\.textContent = "Connection issue"/);
  assert.match(ui, /className = "panel show-device-actions"/);
  assert.match(ui, /append\(heading, commandRow\)/);
  assert.match(ui, /commandPanel\.remove\(\)/);
  assert.match(css, /#ownerViewShow>#showStylePanel\{grid-area:motion\}/);
  assert.match(css, /\.vibe-options\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(88px,1fr\)\);gap:6px\}/);
  assert.match(css, /\.show-device-actions \.row\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /min-height:48px/);
  assert.match(css, /input\[type=range\].*min-height:44px/s);
  assert.match(ui, /aria-controls="ownerViewShow"/);
  assert.match(ui, /aria-controls="ownerViewScores"/);
  assert.match(ui, /aria-controls="ownerViewSystem"/);
});

test("changed Owner PWA assets use a fresh matching cache revision", () => {
  const revision = "20261024-cart-control-home-r5";
  assert.match(html, /hbnf-cart-ui-v6\.css\?v=20261024-hbnf-faded-phosphor-r1/);
  assert.match(html, /hbnf-cart-manifest\.webmanifest\?v=20261024-cart-night-earth-r2/);
  assert.match(serviceWorker, /hbnf-faded-phosphor\.png\?v=20261024-hbnf-faded-phosphor-r1/);
  assert.match(serviceWorker, /v18-hbnf-mark-20261024/);
  for (const asset of ["hbnf-cart.js", "hbnf-cart-ui-v6.mjs", "hbnf-cart-features.mjs", "hbnf-cart-skins-score.mjs"]) {
    assert.match(html, new RegExp(`${asset.replaceAll(".", "\\.")}\\?v=${revision}`));
  }
  assert.match(html, /hbnf-cart2-owner-control-home-r6-20261024/);
  for (const source of [js, readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs", import.meta.url), "utf8")]) {
    assert.match(source, /hbnf-cart-readiness\.mjs\?v=20261024-cart-control-home-r4/);
  }
});

test("owner-approved HBNF mark is exact and included in strict offline package closures", async () => {
  const { createHash } = await import("node:crypto");
  const mark = readFileSync(new URL("../hbnf-final-controller/hbnf-faded-phosphor.png", import.meta.url));
  assert.equal(createHash("sha256").update(mark).digest("hex"), "043f68e0b44d7c658051a996ec276906c834edbb1f3f19fae7726e93ecf7fbdf");
  for (const path of ["../scripts/hbnf_build_local_owner_pwa.py", "../scripts/hbnf_build_owner_guest_package.py", "../hbnf-ui-v6-package/install_ui_v6.py"]) {
    assert.match(readFileSync(new URL(path, import.meta.url), "utf8"), /hbnf-faded-phosphor\.png/);
  }
});

test("retained Cart app-icon assets and strict package inputs stay unchanged", () => {
  const manifest = JSON.parse(readFileSync(new URL("../hbnf-final-controller/hbnf-cart-manifest.webmanifest", import.meta.url), "utf8"));
  assert.deepEqual(manifest.icons.map(icon => icon.src), ["/hbnf-cart-icon-192.png", "/hbnf-cart-icon-512.png"]);
  assert.match(html, /apple-touch-icon" sizes="180x180" href="\.\/hbnf-cart-icon-180\.png/);
  for (const source of [serviceWorker, readFileSync(new URL("../scripts/hbnf_build_local_owner_pwa.py", import.meta.url), "utf8"), readFileSync(new URL("../.github/workflows/hbnf-coordinated-release-ci.yml", import.meta.url), "utf8")]) {
    assert.doesNotMatch(source, /local-roots-lr\.svg/);
  }
});
