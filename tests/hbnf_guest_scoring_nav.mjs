import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../hbnf-final-controller/guest/hbnf-cart/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../hbnf-final-controller/guest/hbnf-cart/guest.css", import.meta.url), "utf8");

test("guest scoring uses actual website routes without duplicating score entry", () => {
  for (const route of ["skins.html", "glow.html"]) {
    assert.match(html, new RegExp('href="https://hbnightflyers\\.com/' + route.replace(".", "\\.") + '"'));
  }
  assert.doesNotMatch(html, /target="_blank"|guest-score-save|score-submit/);
});
test("links remain available independent of guest command permissions", () => {
  assert.match(html, /<section class="boot-card" aria-label="HBNF scorecards">/);
  assert.ok(html.indexOf('aria-label="HBNF scorecards"') > html.indexOf('id="guestBadge"'));
  assert.doesNotMatch(html.split('aria-label="HBNF scorecards"')[1].split("</section>")[0], /disabled|data-guest-action/);
});
test("guest cellular access requirement is stated and not contradicted", () => {
  assert.match(html, /own cellular data/);
  assert.match(html, /No connection to HBNF-Cart Wi-Fi or the owner's personal hotspot/);
});
test("scoring buttons meet touch and keyboard interaction requirements", () => {
  assert.match(css, /\.score-links a\{[^}]*min-height:52px/);
  assert.match(css, /\.score-links a:focus-visible\{/);
  assert.match(html, /guest\.css\?v=20261016-guest-scores/);
});
