import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {projectSkinsForMatrix,chooseLive,laDate,skinsAcePot,isMatrixLiveReadPath,MATRIX_LIVE_READ_PATH} from "../staging/coordinated-backend/hbnf-cart-control/live.ts";
const ui=fs.readFileSync(new URL("../firmware/phase2/integration-r6-compositor-timing/usermod/hbnf_local_ui.h",import.meta.url),"utf8");
const start=ui.indexOf("const laDate=()=>");
const end=ui.indexOf("function liveDisplayKey",start);
assert.ok(start>=0&&end>start,"installed UI live parser block exists");
const parserContext={Intl,Date,Math,Number,String,Array,Object,JSON};
vm.runInNewContext(ui.slice(start,end)+"\nglobalThis.validateLiveSnapshot=validateLiveSnapshot;",parserContext);

const today=laDate();
const front={cards:[{id:"front1",playersText:"Alex\nSam",winners:{"1":"front1_p_0","2":"front1_p_1"}}]};
const back={cards:[{id:"back1",teamsText:"Alex / Sam\nLee / Jo",winners:{"10":"back1_team_0"}}]};
const source={weeks:{
  "2026-10-05":{front:{cards:[{playersText:"Past Player",winners:{"1":"ignored"},scores:{long:"ignored"}}],irrelevant:"x".repeat(6000)},back:{cards:[{teamsText:"Past Team",winners:{"10":"ignored"}}]},legacyUnused:"s".repeat(6200)},
  [today]:{front,back}
}};
const oversizedRoot={historical_archive:"x".repeat(2_168_032),skins:source};

const inProgress=projectSkinsForMatrix(oversizedRoot.skins,today);
assert.ok(inProgress,"skins projection exists");
assert.equal(inProgress.skins.weeks[today].back,undefined,"preloaded Back 9 is withheld until Front 9 is finalized");
assert.ok(inProgress.skins.weeks["2026-10-05"].back,"historical Skins data remains for ace-pot calculation");
assert.equal(inProgress.skins.weeks["2026-10-05"].front.irrelevant,undefined,"unneeded historical fields are stripped");
assert.equal(inProgress.skins.weeks["2026-10-05"].front.cards[0].winners,undefined,"historical per-hole winners are stripped");
assert.equal(chooseLive(inProgress).label,"F9","the installed selector receives Front 9 while it is incomplete");
assert.equal(skinsAcePot(inProgress),skinsAcePot({skins:source}),"deferring Back 9 does not undercount its current participants in the ace pot");
assert.ok(Object.keys(inProgress.skins.weeks).some(key=>key.endsWith("~pending-back-ace")),"deferred Back 9 contributes only its ace-pot participant count");

front.scoresLocked=true;
const finalized=projectSkinsForMatrix(oversizedRoot.skins,today);
assert.ok(finalized.skins.weeks[today].back,"Back 9 becomes visible after the authoritative lock marker");
assert.equal(chooseLive(finalized).label,"B9","the existing installed selector can now select Back 9");
assert.equal(skinsAcePot(finalized),skinsAcePot({skins:source}),"visible Back 9 keeps the same ace-pot total");

const wrapped=[{state_json:inProgress,updated_at:"2026-10-12T18:00:00.000Z"}];
const json=JSON.stringify(wrapped);
const encoder=new TextEncoder();
const fullBytes=encoder.encode(JSON.stringify([{state_json:oversizedRoot,updated_at:wrapped[0].updated_at}])).byteLength;
const skinsBytes=encoder.encode(JSON.stringify(source)).byteLength;
const projectedBytes=encoder.encode(json).byteLength;
assert.ok(fullBytes>2_168_032,"full source row reproduces the installed-reader overflow condition");
assert.ok(skinsBytes>12000&&skinsBytes<20000,`fixture Skins document is approximately 13 KB (actual ${skinsBytes} bytes)`);
assert.ok(projectedBytes<524288,"projected response fits installed 512 KiB reader cap");
const parsed=parserContext.validateLiveSnapshot(wrapped[0].state_json,wrapped[0].updated_at);
assert.ok(parsed&&parsed.active,"actual installed UI validator accepts the unchanged PostgREST row shape");
assert.equal(parsed.label,"F9");

const functionSource=fs.readFileSync(new URL("../staging/coordinated-backend/hbnf-cart-control/index.ts",import.meta.url),"utf8");
for(const [pattern,message] of [
  [/isMatrixLiveReadPath\(requestUrl\.pathname\)/,"the actual request handler uses the tested Matrix route matcher"],
  [/Access-Control-Allow-Methods":"GET, OPTIONS"/,"Matrix dashboard GET/OPTIONS preflight is allowed"],
  [/"http:\/\/192\.168\.77\.10"/,"Matrix local origin is explicitly allowed"],
  [/select\("skins:state_json->skins,updated_at"\)/,"Postgres JSON path selects only Skins at source"],
  [/state_json:projected,updated_at:league\.updated_at/,"response preserves the browser's row shape and authoritative revision"],
  [/byteLength>524288/,"server fails closed if projection exceeds the embedded reader cap"],
])assert.match(functionSource,pattern,message);

const corsStart=functionSource.indexOf("function matrixLiveCors(req:Request){");
const corsEnd=functionSource.indexOf("\nconst matrixLiveResponse",corsStart);
assert.ok(corsStart>=0&&corsEnd>corsStart,"dedicated projection CORS helper exists");
const corsContext={Deno:{env:{get:()=>null}},Set};
const corsCode=functionSource.slice(corsStart,corsEnd).replace("function matrixLiveCors(req:Request){","function matrixLiveCors(req){").replace("const headers:Record<string,string>=","const headers=");
vm.runInNewContext(corsCode+"\nglobalThis.matrixLiveCors=matrixLiveCors;",corsContext);
const allowedCors=corsContext.matrixLiveCors({headers:new Headers({Origin:"http://192.168.77.10"})});
assert.equal(allowedCors["Access-Control-Allow-Origin"],"http://192.168.77.10");
assert.equal(allowedCors["Access-Control-Allow-Methods"],"GET, OPTIONS");
assert.match(allowedCors["Access-Control-Allow-Headers"],/apikey, authorization, accept/);
const deniedCors=corsContext.matrixLiveCors({headers:new Headers({Origin:"https://untrusted.example"})});
assert.equal(deniedCors["Access-Control-Allow-Origin"],undefined,"untrusted web origins are not allowed");

// Exercise the real Supabase URL and the function path delivered to its handler.
// Supabase removes /functions/v1 at the gateway but retains the function-name prefix.
const matrixSpecificBase="https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-cart-control";
const browserRequestUrl=new URL(`${matrixSpecificBase}/rest/v1/league_state?select=state_json,updated_at&id=eq.1`);
const handlerPath=browserRequestUrl.pathname.replace(/^\/functions\/v1/,"");
assert.equal(handlerPath,MATRIX_LIVE_READ_PATH,"Supabase gateway route retains the function-name prefix for the Edge handler");
assert.equal(isMatrixLiveReadPath(handlerPath),true,"correctly prefixed request reaches the Matrix projection handler");
assert.equal(isMatrixLiveReadPath("/rest/v1/league_state"),false,"old unprefixed subpath is rejected");

console.log(`Matrix live projection PASS: full=${fullBytes}B, skins=${skinsBytes}B, returned=${projectedBytes}B; embedded parser, Front/Back gate, ace-pot, CORS PASS`);
