import assert from "node:assert/strict";
import fs from "node:fs";
const html = fs.readFileSync(new URL("./hbnf-cart.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("./hbnf-cart.js", import.meta.url), "utf8");
const deploy = fs.readFileSync(new URL("./DEPLOY_HBNF_CART_UI.command", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("./hbnf-cart-manifest.webmanifest", import.meta.url), "utf8"));

for (const command of ["OFF", "ON", "NEXT", "AUTO", "LOCK", "VIBE_AUTO", "TEMPO_AUTO"]) {
  assert.match(html, new RegExp(`data-command="${command}"`));
}
assert.match(html, /data-brightness="matrix"/);
assert.match(html, /data-brightness="aux"/);
assert.match(html, /Scene <select/);
assert.match(html, /Palette <select/);
assert.match(html, /Vibe <select/);
assert.match(html, /hbnf-cart-canonical-v1/);
assert.match(html, /hbnf-cart-manifest\.webmanifest/);
assert.match(html, /id="authPanel"/);
assert.match(html, /id="sendMagicLink"/);

assert.match(js, /createClient/);
assert.match(js, /phcpbvuqibyarpfrftgx\.supabase\.co/);
assert.match(js, /sb_publishable_/);
assert.match(js, /auth\.getSession\(\)/);
assert.match(js, /auth\.signInWithOtp/);
assert.match(js, /expectedRevision: revision/);
assert.match(js, /crypto\.randomUUID\(\)/);
assert.match(js, /functions\/v1\/hbnf-cart-control/);
assert.doesNotMatch(js, /hbnf-cart-orchestrator/);
assert.doesNotMatch(js, /mqtt:\/\//i);

assert.match(deploy, /hbnf-cart\.html/);
assert.match(deploy, /hbnf-cart\.js/);
assert.match(deploy, /HBNF_CART_UI_TEST\.js/);
assert.match(deploy, /CANONICAL_CART_UI_DEPLOY=PASS/);
assert.doesNotMatch(deploy, /matrix-control\.js/);

assert.equal(manifest.start_url, "/hbnf-cart.html");
assert.equal(manifest.display, "standalone");
console.log("PASS canonical HBNF cart UI auth / routing / deployment contract");
