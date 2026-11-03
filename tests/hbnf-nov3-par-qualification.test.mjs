import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifiedGlowScorePars} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-auto-sync.review.mjs';
const week=()=>({
 scorecardText:{holePars:{'1':'3','2':'4'},holeNotes:{'1':'Nov3 observed layout'}},
 players:[{removed:false,scores:['3','5',...Array(16).fill('')]}]
});
test('actual entered pars qualify only scored holes; notes and identifiers are not interpreted as pars',()=>{
 assert.deepEqual(qualifiedGlowScorePars(week()),{ready:true,scoredHoles:2});
});
test('an absent Nov3 par cannot be guessed as 3 from the installed v35 selector fallback',()=>{
 const w=week(); delete w.scorecardText.holePars['2'];
 assert.deepEqual(qualifiedGlowScorePars(w),{ready:false,reason:'hole_pars_not_verified',missingCount:1,scoredHoles:2});
});
test('the June20 layout or a proposed UDisc source par cannot replace Nov3 saved holePars',()=>{
 const w=week();w.scorecardText={holeNotes:{},holePars:{}};
 w.layoutTemplates={'2026-06-20':{holePars:{'1':'3','2':'4'}}};
 w.udiscSync={sourcePar:{'1':'3','2':'4'}};
 assert.equal(qualifiedGlowScorePars(w).reason,'hole_pars_not_verified');
});
test('an empty score snapshot is not a scoreboard ready event',()=>{
 const w=week();w.players[0].scores=Array(18).fill('');
 assert.equal(qualifiedGlowScorePars(w).reason,'no_scored_holes');
});
test('removed participants and empty holes cannot invent metadata dependencies',()=>{
 const w=week();w.players[0].scores=['3',...Array(17).fill('')];
 w.players.push({removed:true,scores:[...Array(17).fill(''),'9']});
 assert.deepEqual(qualifiedGlowScorePars(w),{ready:true,scoredHoles:1});
});
test('invalid safari par values fail closed instead of reverting to par 3',()=>{
 for(const invalid of ['', '0','10','4.5','3abc','NaN']) {
  const w=week();w.scorecardText.holePars['2']=invalid;
  assert.equal(qualifiedGlowScorePars(w).ready,false,invalid);
 }
});

test('the verified installed manual scorecard input admits entered 1–9 pars without extra invented restrictions',()=>{
 for(const par of ['1','9']){
  const w=week();w.scorecardText.holePars['2']=par;
  assert.deepEqual(qualifiedGlowScorePars(w),{ready:true,scoredHoles:2});
 }
});
