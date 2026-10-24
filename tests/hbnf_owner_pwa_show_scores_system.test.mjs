import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html",import.meta.url),"utf8");
const shell=fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-ui-v6.mjs",import.meta.url),"utf8");
const controller=fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js",import.meta.url),"utf8");
const features=fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart-features.mjs",import.meta.url),"utf8");
test("Owner PWA exposes Show, Scores and System without duplicating controls",()=>{
  for(const view of ["show","scores","system"]) assert.match(shell,new RegExp('data-owner-view="'+view+'"'));
  for(const id of ["lightsPanel","featureText","featureSendText","featureRefreshLive","featureScoreboard","featureAcePot","truthPanel","guestModeOpen","featureOtaCheck"]){
    if(id==="truthPanel") assert.match(html,/class="panel truth-panel"/); else assert.ok(html.includes('id="'+id+'"'),"missing existing control "+id);
  }
  assert.match(shell,/move\("#lightsPanel", "show"\)/);
  assert.match(shell,/move\("\.course-status-panel", "show"\)/);
  assert.match(shell,/className = "panel show-device-actions"/);
  assert.match(shell,/querySelector\(":scope > \.row"\)/);
  assert.match(shell,/commandPanel\.remove\(\)/);
  assert.match(shell,/move\("#scoresPanel", "scores"\)/);
  assert.match(shell,/move\("\.truth-panel", "system"\)/);
  assert.match(shell,/\["#featureRefreshLive", "#featureScoreboard"\]/);
});
test("redesigned view preserves existing command, score-read and owner-only paths",()=>{
  assert.match(controller,/OPAL_LOCAL_COMMANDS = new Set/);
  assert.match(controller,/no cloud fallback was sent for this control/);
  assert.match(controller,/localOwnerControl\.command/);
  assert.match(features,/canonicalRead\("live_status"/);
  assert.match(features,/bind\("featureSendText",sendText\)/);
  assert.match(features,/bind\("featureRefreshLive",refreshLive\)/);
  assert.match(features,/bind\("featureScoreboard",showScoreboard\)/);
  assert.match(features,/bind\("featureOtaInstall"/);
  assert.match(shell,/aria-current/);
  assert.match(shell,/scrollTo\(0, 0\)/);
});
