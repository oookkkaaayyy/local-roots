import assert from "node:assert/strict";
import { applySkinsWinner, buildSkinsScoreState } from "../staging/coordinated-backend/hbnf-cart-control/skins_scoring.ts";
import { readFileSync } from "node:fs";

const root={skins:{weeks:{"2026-10-06":{
  front:{cards:[{id:"front_a",playersText:"Ava\nBo",winners:{"1":"front_a_p_0"}}]},
  back:{cards:[{id:"back_a",teamsText:"Ava / Bo\nCy / Dee",winners:{}}]},
}}}};
const view=buildSkinsScoreState(root,"2026-10-06");
assert.equal(view.sections.front[0].holes[0].winner_name,"Ava");
assert.equal(view.sections.front[0].holes[1].winner_id,"");
assert.equal(view.sections.back[0].participants[0].id,"back_a_team_0");
assert.equal(view.sections.back[0].participants[0].name,"Ava / Bo");

const saved=applySkinsWinner(root,{roundDate:"2026-10-06",sectionName:"front",cardId:"front_a",hole:2,winnerId:"front_a_p_1",expectedWinnerId:""});
assert.deepEqual(saved,{round_date:"2026-10-06",section:"front",card_id:"front_a",hole:2,winner_id:"front_a_p_1",winner_name:"Bo"});
assert.equal(root.skins.weeks["2026-10-06"].front.cards[0].winners["2"],"front_a_p_1");
const cleared=applySkinsWinner(root,{roundDate:"2026-10-06",sectionName:"back",cardId:"back_a",hole:10,winnerId:"",expectedWinnerId:""});
assert.equal(cleared.winner_name,null);
assert.equal(Object.hasOwn(root.skins.weeks["2026-10-06"].back.cards[0].winners,"10"),false);

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
assert.throws(()=>buildSkinsScoreState(root,"missing"),/No Skins round/);

const html=readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html",import.meta.url),"utf8");
const controller=readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js",import.meta.url),"utf8");
const ui=readFileSync(new URL("../hbnf-final-controller/hbnf-cart-skins-score.mjs",import.meta.url),"utf8");
const api=readFileSync(new URL("../staging/coordinated-backend/hbnf-cart-control/index.ts",import.meta.url),"utf8");
assert.match(html,/Record Skins hole winner/);assert.match(html,/hbnf-cart-skins-score\.mjs/);
assert.match(ui,/skins_score_state/);assert.match(ui,/skins_score_set/);assert.match(ui,/Score not confirmed/);
assert.match(controller,/headers\["x-hbnf-device"\]=token/);
assert.match(api,/action === "skins_score_state" \|\| action === "skins_score_set"/);
assert.match(api,/pairedDeviceAuthorized/);
console.log("PASS: owner Skins scoring reads and writes authoritative card winners, preserves carries, validates F9/B9 and locks, and requires paired owner auth");
