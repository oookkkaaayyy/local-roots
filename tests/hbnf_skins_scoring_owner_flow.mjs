import assert from "node:assert/strict";
import { applySkinsWinner, applySkinsTiebreaker, applySkinsAceWinner, buildSkinsScoreState, writeSkinsWinner, writeSkinsTiebreaker, writeSkinsAceWinner } from "../staging/coordinated-backend/hbnf-cart-control/skins_scoring.ts";
import { skinsAcePot } from "../staging/coordinated-backend/hbnf-cart-control/live.ts";
import { readFileSync } from "node:fs";

const root={skins:{weeks:{
"2026-09-29":{
  front:{cards:[{id:"prev_front",playersText:"Ava\nBo",winners:{}}]},
  back:{cards:[{id:"prev_back",teamsText:"Ava / Bo",winners:{}}]},
},
"2026-10-06":{
  front:{cards:[{id:"front_a",playersText:"Ava\nBo",winners:{"1":"front_a_p_0"}}]},
  back:{cards:[{id:"back_a",teamsText:"Ava / Bo\nCy / Dee",winners:{}}]},
}}}};
const view=buildSkinsScoreState(root,"2026-10-06");
assert.equal(view.active_section,"back");
assert.equal(view.sections.front[0].holes[0].winner_name,"Ava");
assert.equal(view.sections.front[0].holes[1].winner_id,"");
assert.equal(view.sections.front[0].tiebreaker.carry,8);
assert.equal(view.sections.back[0].participants[0].id,"back_a_team_0");
assert.equal(view.sections.back[0].participants[0].name,"Ava / Bo");
assert.equal(view.sections.back[0].tiebreaker.carry,9);
assert.deepEqual(view.ace.back.participants.map(x=>x.name),["Ava","Bo","Cy","Dee"]);
assert.equal(view.ace.pot,skinsAcePot(root));
assert.equal(view.ace.pot,10);

const saved=applySkinsWinner(root,{roundDate:"2026-10-06",sectionName:"front",cardId:"front_a",hole:2,winnerId:"front_a_p_1",expectedWinnerId:""});
assert.deepEqual(saved,{entry_type:"hole",round_date:"2026-10-06",section:"front",card_id:"front_a",hole:2,winner_id:"front_a_p_1",winner_name:"Bo"});
assert.equal(root.skins.weeks["2026-10-06"].front.cards[0].winners["2"],"front_a_p_1");
const cleared=applySkinsWinner(root,{roundDate:"2026-10-06",sectionName:"back",cardId:"back_a",hole:10,winnerId:"",expectedWinnerId:""});
assert.equal(cleared.winner_name,null);
assert.equal(Object.hasOwn(root.skins.weeks["2026-10-06"].back.cards[0].winners,"10"),false);

const tb=applySkinsTiebreaker(root,{roundDate:"2026-10-06",sectionName:"front",cardId:"front_a",winnerId:"front_a_p_1",expectedWinnerId:""});
assert.equal(tb.entry_type,"tiebreaker");assert.equal(tb.carry,7);assert.equal(tb.winner_name,"Bo");
assert.equal(root.skins.weeks["2026-10-06"].front.cards[0].winners.tb,"front_a_p_1");
assert.throws(()=>applySkinsTiebreaker(root,{roundDate:"2026-10-06",sectionName:"front",cardId:"front_a",winnerId:"front_a_p_0",expectedWinnerId:""}),/changed on another device/);

const ace=applySkinsAceWinner(root,{roundDate:"2026-10-06",sectionName:"front",winnerName:"Bo",expectedWinnerName:""});
assert.equal(ace.entry_type,"ace");assert.equal(ace.winner_name,"Bo");
assert.equal(root.skins.weeks["2026-10-06"].front.aceWinner,"Bo");
assert.equal(buildSkinsScoreState(root,"2026-10-06").ace.pot,4);
assert.throws(()=>applySkinsAceWinner(root,{roundDate:"2026-10-06",sectionName:"back",winnerName:"Not Here",expectedWinnerName:""}),/not in this Skins section/);

for(const input of [
 {roundDate:"2026-10-06",sectionName:"front",cardId:"front_a",hole:10,winnerId:"front_a_p_0",expectedWinnerId:""},
 {roundDate:"2026-10-06",sectionName:"back",cardId:"back_a",hole:12,winnerId:"missing",expectedWinnerId:""},
 {roundDate:"2026-10-06",sectionName:"front",cardId:"missing",hole:1,winnerId:"",expectedWinnerId:""},
])assert.throws(()=>applySkinsWinner(root,input));
const beforeStale=structuredClone(root);
assert.throws(()=>applySkinsWinner(root,{roundDate:"2026-10-06",sectionName:"front",cardId:"front_a",hole:1,winnerId:"front_a_p_1",expectedWinnerId:""}),/changed on another device/);
assert.deepEqual(root,beforeStale);
const locked={skins:{weeks:{d:{front:{scoresLocked:true,cards:[{id:"c",playersText:"Ava"}]}}}}};
assert.throws(()=>applySkinsWinner(locked,{roundDate:"d",sectionName:"front",cardId:"c",hole:1,winnerId:"c_p_0",expectedWinnerId:""}),/locked/);
assert.throws(()=>applySkinsAceWinner(locked,{roundDate:"d",sectionName:"front",winnerName:"Ava",expectedWinnerName:""}),/locked/);
assert.throws(()=>buildSkinsScoreState(root,"missing"),/No Skins round/);

function mockService(initial,options={}){
  let state=structuredClone(initial),updatedAt="v1",writes=0,reads=0;
  return {service:{from(){const q={select(){return q;},eq(){return q;},async single(){reads++;return {data:{state_json:structuredClone(state),updated_at:updatedAt}};},update(patch){q.patch=patch;return q;},async maybeSingle(){writes++;if(options.conflictOnce&&writes===1){state.skins.weeks["2026-10-06"].front.cards[0].winners["3"]="front_a_p_0";updatedAt="v2";return {data:null};}state=q.patch.state_json;updatedAt="v2";return {data:{updated_at:updatedAt}};}};return q;}},counts:()=>({reads,writes}),state:()=>state};
}
const writable=mockService(root);
const persisted=await writeSkinsWinner(writable.service,{roundDate:"2026-10-06",sectionName:"front",cardId:"front_a",hole:3,winnerId:"front_a_p_0",expectedWinnerId:""});
assert.equal(persisted.winner_id,"front_a_p_0");assert.equal(persisted.updated_at,"v2");assert.equal(writable.counts().writes,1);
const concurrent=mockService(root,{conflictOnce:true});
await assert.rejects(()=>writeSkinsWinner(concurrent.service,{roundDate:"2026-10-06",sectionName:"front",cardId:"front_a",hole:3,winnerId:"front_a_p_1",expectedWinnerId:""}),/changed on another device/);
assert.equal(concurrent.counts().writes,1);assert.equal(concurrent.state().skins.weeks["2026-10-06"].front.cards[0].winners["3"],"front_a_p_0");

const writableTbRoot=structuredClone(root);delete writableTbRoot.skins.weeks["2026-10-06"].front.cards[0].winners.tb;
const writableTb=mockService(writableTbRoot);
const persistedTb=await writeSkinsTiebreaker(writableTb.service,{roundDate:"2026-10-06",sectionName:"front",cardId:"front_a",winnerId:"front_a_p_0",expectedWinnerId:""});
assert.equal(persistedTb.entry_type,"tiebreaker");assert.equal(persistedTb.winner_name,"Ava");

const writableAceRoot=structuredClone(root);delete writableAceRoot.skins.weeks["2026-10-06"].back.aceWinner;
const writableAce=mockService(writableAceRoot);
const persistedAce=await writeSkinsAceWinner(writableAce.service,{roundDate:"2026-10-06",sectionName:"back",winnerName:"Cy",expectedWinnerName:""});
assert.equal(persistedAce.entry_type,"ace");assert.equal(persistedAce.winner_name,"Cy");

const html=readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html",import.meta.url),"utf8");
const controller=readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js",import.meta.url),"utf8");
const ui=readFileSync(new URL("../hbnf-final-controller/hbnf-cart-skins-score.mjs",import.meta.url),"utf8");
const api=readFileSync(new URL("../staging/coordinated-backend/hbnf-cart-control/index.ts",import.meta.url),"utf8");
assert.match(html,/Record Skins scoring/);assert.match(html,/skinsAceWinner/);assert.match(html,/skinsAceSummary/);assert.match(html,/hbnf-cart-skins-score\.mjs/);
assert.match(ui,/skins_score_state/);assert.match(ui,/skins_score_set/);assert.match(ui,/skins_tiebreaker_set/);assert.match(ui,/skins_ace_set/);
assert.match(ui,/Save status is uncertain/);assert.match(ui,/authoritative readback unavailable/);assert.match(ui,/expected_winner_id/);assert.match(ui,/expected_winner_name/);
assert.doesNotMatch(ui,/winnerNode\.addEventListener\("change"/);assert.doesNotMatch(ui,/aceWinnerNode\.addEventListener\("change"/);
assert.match(controller,/headers\["x-hbnf-device"\]=token/);
assert.match(controller,/observed\.every/);assert.match(controller,/fullyApplied/);
assert.match(api,/skins_score_state/);assert.match(api,/skins_tiebreaker_set/);assert.match(api,/skins_ace_set/);assert.match(api,/pairedDeviceAuthorized/);
console.log("PASS: owner Mission Control scoring covers authoritative F9 singles/B9 doubles, hole edits, pushes/carry, tiebreaker, ace winner/pot state, stale/concurrent protection, confirmed readback, paired-owner auth, and confirmed cart-control state");
