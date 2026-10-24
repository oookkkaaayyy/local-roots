import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("hbnf-final-controller/hbnf-cart.html", "utf8");
const css = fs.readFileSync("hbnf-final-controller/hbnf-cart-ui-v6.css", "utf8");
const controller = fs.readFileSync("hbnf-final-controller/hbnf-cart.js", "utf8");

const details = html.match(/<details class="panel truth-panel"[\s\S]*?<\/details>/);
assert.ok(details, "troubleshooting section exists");
assert.doesNotMatch(details[0].slice(0, 100), /\bopen\b/i, "troubleshooting starts collapsed");
assert.match(details[0], /<summary>Troubleshooting<\/summary>/);
assert.match(details[0], /id="refresh"[^>]*>Check Cart status<\/button>/);

const quickControls = html.match(/<nav class="primary-actions"[\s\S]*?<\/nav>/)?.[0] || "";
for (const expected of ["Lights &amp; looks", "Text", "Refresh scores", "Show scores"]) {
  assert.ok(quickControls.includes(expected), `quick controls include ${expected}`);
}

const statusSection = html.match(/<section class="panel course-status-panel"[\s\S]*?<\/section>/)?.[0] || "";
assert.match(statusSection, /<span>Cart<\/span>/);
assert.match(statusSection, /<span>Internet<\/span>/);
assert.match(statusSection, /<span>Matrix<\/span>/);
assert.doesNotMatch(statusSection, /Supabase|acknowledged|updated_at|IPAD|HTTP/i);
assert.match(statusSection, /check the display to confirm what you can see/i);

const guestSection = html.match(/<section class="panel guest-quick-panel"[\s\S]*?<\/section>/)?.[0] || "";
assert.match(guestSection, /id="guestModeStatus"/);
assert.match(guestSection, /id="guestModeOpen"/);
assert.match(guestSection, /id="guestModeClose"/);
assert.match(guestSection, /hbnf-guest-qr\.png/);
assert.ok(html.indexOf('class="panel guest-quick-panel"') < html.indexOf('id="lightsPanel"'), "guest controls appear before detailed light controls");

assert.match(controller, /Cart, Matrix & underglow responding/);
assert.match(controller, /Matrix and underglow confirmed the change/);
assert.doesNotMatch(controller, /readback|DDP synchronization|Open Troubleshooting for details/);
assert.match(controller, /Controls unavailable/);
assert.match(controller, /guestDefaultEnableNeeded/);
assert.match(controller, /Guest access status is unavailable\. Reconnect to the Cart to check it\./);

assert.match(css, /\.primary-actions a,\.primary-actions button\{[^}]*min-height:52px/s);
assert.match(css, /\.guest-invite\{[^}]*padding:14px/s);
assert.match(css, /\.guest-invite img\{[^}]*padding:8px/s);
assert.match(css, /summary::?-webkit-details-marker/);
assert.match(css, /@media\(max-width:699px\)/);
assert.match(css, /body>main\{width:min\(100%,920px\)!important;max-width:920px!important/);

const uiModule = fs.readFileSync("hbnf-final-controller/hbnf-cart-ui-v6.mjs", "utf8");
assert.match(uiModule, /@media\(min-width:900px\) and \(min-height:680px\) and \(orientation:landscape\)/);
assert.match(uiModule, /#ownerViewShow>#textPanel\{grid-column:1\/-1\}/);
assert.match(uiModule, /@media\(max-width:800px\)\{\.hero-v6\{flex-wrap:wrap\}\.hero-v6>#status\{flex-basis:100%\}\}/);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, "Owner PWA IDs remain unique after moving controls");
console.log("PASS: iPad quick controls, truthful status, guest defaults, collapsed troubleshooting, QR spacing, and 44pt targets");
