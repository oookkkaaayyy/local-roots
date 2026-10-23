import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
const nav = html.split('<nav class="quick-links" aria-label="Everyday tools">')[1]?.split("</nav>")[0] || "";

test("Owner keeps existing scoring anchor and adds original scoring routes", () => {
  assert.match(nav, /href="#scoresPanel"/);
  assert.match(nav, /href="https:\/\/hbnightflyers\.com\/skins\.html"/);
  assert.match(nav, /href="https:\/\/hbnightflyers\.com\/glow\.html"/);
});
test("Owner site navigation is independent of guest authorization", () => {
  assert.doesNotMatch(nav, /disabled|data-guest-action|onclick=/);
  assert.doesNotMatch(nav, /target="_blank"/);
});
test("Owner navigation preserves standalone scoring and icon references", () => {
  assert.match(html, /href="\.\/hbnf-cart-icon-180\.png\?v=/);
  assert.match(html, /id="guestMode"/);
  assert.match(html, /id="manualOfflineScorePanel"/);
});
