import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
test('page has every control expected by standalone phone UI',()=>{
  for(const id of ['setup','game','mode','players','rounds','start','error','prompt','roundLabel','status','leaderboard','made','missed','undo','reset','resume','restore','storageNote','finish','summary','banner'])
    assert.match(html,new RegExp('id="'+id+'"'),id);
  assert.match(html, /<script type="module" src="\.\/app\.mjs"><\/script>/);
});
test('touch, safe text and offline/cellular semantics present',()=>{
  assert.match(html,/min-height:54px/);assert.match(html,/:focus-visible/);
  assert.match(html,/does not change Cart lights, submit HBNF scores, or require Wi-Fi/);
  assert.match(js,/cell\.textContent = part/);
  assert.doesNotMatch(js,/\.innerHTML\s*=/);
  assert.doesNotMatch(js,/\.replaceChildren\(/); // unsupported on Safari 12
});
