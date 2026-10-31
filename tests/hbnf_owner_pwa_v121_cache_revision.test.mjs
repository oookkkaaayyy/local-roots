import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../hbnf-final-controller/", import.meta.url);
const html = readFileSync(new URL("hbnf-cart.html", root), "utf8");
const js = readFileSync(new URL("hbnf-cart.js", root), "utf8");
const revision = "20261031-cart116-v121-a3-r1";

test("v1.0.21 marks the candidate and gives changed control modules fresh cache keys", () => {
  assert.match(html, /hbnf-build" content="hbnf-cart2-owner-control-home-r6-20261031-v1\.0\.21-a3"/);
  assert.ok(html.includes(`hbnf-cart.js?v=${revision}`), "main controller URL must change with its bytes");
  assert.ok(html.includes(`hbnf-cart-features.mjs?v=${revision}`), "feature module URL must change with its bytes");
  assert.ok(js.includes(`hbnf-cart-local.mjs?v=${revision}`), "local transport module URL must change with its bytes");
});
