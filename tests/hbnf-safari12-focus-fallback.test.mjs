import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const source = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const css = source("public/hbnf-bone-ink-theme.css");
const pilot = css.slice(css.indexOf("/* Glow/Skins focus pilot."));
const page = (name) => source(`public/${name}.html`);

test("page scoping exists exactly once on both Glow and Skins, not through :has", () => {
  for (const name of ["glow", "skins"]) {
    const html = page(name);
    assert.equal((html.match(/<body class="hbnf-score-page">/g) || []).length, 1, name);
    assert.match(html, /<link rel="stylesheet" href="\/hbnf-bone-ink-theme\.css/);
  }
  assert.ok(pilot.startsWith("/* Glow/Skins focus pilot."));
  assert.doesNotMatch(pilot, /:has\s*\(/);
});

test("Safari 12 basic focus selector supplies a visible ring even without :focus-visible", () => {
  assert.match(pilot, /body\.hbnf-score-page :focus\s*\{[^}]*outline:\s*var\(--ui-focus-width\) solid var\(--ui-focus\) !important/s);
  assert.match(pilot, /body\.hbnf-score-page :focus\s*\{[^}]*box-shadow:\s*0 0 0 3px/s);
  assert.ok(pilot.indexOf("body.hbnf-score-page :focus {") < pilot.indexOf("body.hbnf-score-page :focus-visible {"));
});

test("modern pointer-only ring suppression cannot erase the older-browser :focus fallback", () => {
  assert.match(pilot, /body\.hbnf-score-page :focus:not\(:focus-visible\)\s*\{[^}]*outline:\s*none/s);
  assert.match(pilot, /body\.hbnf-score-page :focus-visible\s*\{[^}]*outline:/s);
  assert.doesNotMatch(pilot, /:is\s*\(/);
});

test("44px touch targets are scoped to Glow/Skins control selectors", () => {
  assert.match(pilot, /--ui-target-min:\s*44px/);
  assert.match(pilot, /body\.hbnf-score-page #weekSelect,\s*body\.hbnf-score-page \.tools-menu-button\s*\{[^}]*min-height:\s*var\(--ui-target-min\) !important;[^}]*min-width:\s*var\(--ui-target-min\) !important/s);
});

test("Cart Control implements all shared roles using unchanged existing Cart values",()=>{
  const cart=source("public/hbnf-cart-ui-v6.css");
  const roles={
    "--ui-canvas":"--cart-canvas",
    "--ui-surface":"--cart-cream",
    "--ui-surface-raised":"--cart-sand",
    "--ui-text":"--cart-root",
    "--ui-text-muted":"--cart-muted",
    "--ui-accent":"--cart-forest",
    "--ui-selected-bg":"--cart-sage-light",
    "--ui-selected-text":"--cart-root",
    "--ui-disabled-bg":"--cart-cream",
    "--ui-disabled-text":"--cart-muted",
    "--ui-font-heading":"--ui-font-body"
  };
  for(const [name,referent] of Object.entries(roles)){
    const rule=name+":var("+referent+");";
    assert.ok(cart.includes(rule),rule);
    assert.equal(cart.split(rule).length-1,1,rule);
  }
  assert.match(cart,/--ui-font-body:-apple-system,BlinkMacSystemFont/);
  assert.match(cart,/--cart-canvas:#141916;/);
  assert.match(cart,/--cart-root:#f1eadc;/);
  assert.match(cart,/--cart-forest:#a5b68e;/);
});
