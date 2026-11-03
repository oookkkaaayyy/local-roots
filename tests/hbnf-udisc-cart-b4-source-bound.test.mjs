import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGlowWeekSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-sync.mjs';
import {qualifiedGlowScorePars} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-auto-sync.review.mjs';
import {chooseLive} from './fixtures/hbnf-cart-control-live-v35.ts';
import {runGlowIntentAction} from '../build/cart116-b4-glow-source/glow-intent-service.mjs';

const date='2026-11-03',eventId='hb-glow-doubles-tAP8Y5';
const ts=Date.parse('2026-11-04T02:00:00Z');
const revision='2026-11-04 01:59:50.123456+00';
const fakeCredential='0000000000000000000000000000000000000000000000000000000000000000';
function previousWeek(){
 return {
  date,entryFee:10,payoutPercent:20,payouts:{first:12,second:8},aceWinner:'',
  tagExchangeExceptions:{'A':'Keep tag'},
  scorecardText:{holePars:{'1':'3','2':'4'},holeNotes:{'1':'Nov3 A1→B8','2':'Nov3 B8→C3'}},
  scoresLocked:false,history:[{event:'previous'}],
  cards:[{id:'C1',finalized:false,payoutOverride:{first:12},
    players:[{id:'stable-team',partner1:'A',partner2:'B'}]}],
  players:[{id:'stable-team',name:'A / B',partner1:'A',partner2:'B',cardId:'C1',
    scores:['5','',...Array(16).fill('')],removed:false,manualFlag:'owner-kept'}],
  udiscSync:{source:'UDisc event XLSX export',eventId,weekDate:date,
    latest:{signature:'b'.repeat(64),rows:[{
      glowTeamId:'stable-team',acceptedHoleScores:['3',...Array(17).fill('')]
    }]},history:[]}
 };
}
function proposal(){
 return {schema:'hbnf.glow.proposed-week.v1',disposition:'PROPOSED_ONLY_NOT_DELIVERED',
 event:{eventId,weekDate:date,observedAtLocal:'2026-11-04T01:59:50Z'},
 destination:{week:{date,activeWeek:date,players:[{
   partner1:'A',partner2:'B',scores:['4','4',...Array(16).fill('')]
 }]}},
 sourceProvenance:{rowEvidence:[{sourceRow:2,sourceTeam:'A/B',sourceRank:1,
    sourceRankRaw:'1',division:'mixed',relativeScore:1,strokeTotal:8,holeStrokesTotal:8}]},
 issues:{unresolvedIdentityCount:0,duplicateCanonicalTeamRows:0}};
}
async function stateFixture(){
 const original=previousWeek();
 const prepared=await prepareGlowWeekSync(original,proposal(),{aliases:{}});
 assert.equal(prepared.changed,true);
 prepared.week.udiscSync.status={state:'fresh',
  lastSuccessAt:'2026-11-04T01:59:50Z',lastAttemptAt:'2026-11-04T01:59:50Z',errorCode:null};
 return {original,week:prepared.week,signature:prepared.signature,
  state:{glow:{activeWeek:date,weeks:{[date]:prepared.week}},skins:{weeks:{}}}};
}
function cartFixture(){
 return {desired:{revision:135,state:{power:'on',overlays:[]}},
 fence:{active:true,epoch:5,release_id:'fixture-existing-release'}};
}
function withV35Date(fn){
 const ActualDate=globalThis.Date;
 class FixedDate extends ActualDate {
   constructor(...args){super(...(args.length?args:[ts]));}
   static now(){return ts;}
 }
 globalThis.Date=FixedDate;
 try{return fn();}
 finally{globalThis.Date=ActualDate;}
}
function serviceArgs(fixture,cart,commitLog) {
 return {body:{action:'glow_scoreboard_intent',weekDate:date},
  authorization:'Bearer '+fakeCredential,serviceKey:fakeCredential,now:ts,
  deps:{
   source:async()=>({
    state_json:fixture.state,week:fixture.week,fingerprint:'a'.repeat(32),
    source_revision:revision,event_date:date,event_id:eventId,
    window_start:'2026-11-04T01:30:00Z',window_end:'2026-11-04T07:30:00Z'
   }),
   cart:async()=>cart,
   chooseLive:state=>withV35Date(()=>chooseLive(state)),
   reduceCartCommand:(state,type,payload,id,expectedRevision)=>{
    assert.equal(type,'OVERLAY_START');assert.equal(expectedRevision,135);
    assert.equal(payload.kind,'scoreboard');assert.equal(payload.data.label,'GLOW');
    return {...state,overlays:[{id,priority:payload.priority,kind:payload.kind,expiresAt:ts+payload.ttlMs}]};
   },
   commit:async args=>{commitLog.push(args);return {status:'COMMITTED',desired_revision:136};}
  }};
}
test('actual existing UDisc merge preserves manual overrides, Nov3 pars/notes, payouts, tags, team IDs and prior history',async()=>{
 const f=await stateFixture();const old=f.original, w=f.week;
 assert.deepEqual(w.scorecardText,old.scorecardText);
 assert.deepEqual(w.payouts,old.payouts);
 assert.deepEqual(w.tagExchangeExceptions,old.tagExchangeExceptions);
 assert.equal(w.entryFee,old.entryFee);
 assert.equal(w.payoutPercent,old.payoutPercent);
 assert.deepEqual(w.cards[0].payoutOverride,old.cards[0].payoutOverride);
 assert.equal(w.players[0].id,'stable-team');
 assert.equal(w.players[0].scores[0],'5'); // A manual score wins over corrected source 4
 assert.equal(w.players[0].scores[1],'4'); // A newly completed hole is additive
 assert.equal(w.players[0].manualFlag,'owner-kept');
 assert.equal(w.udiscSync.latest.manualOverrides.length,1);
 assert.equal(w.udiscSync.history.length,1);
 assert.equal(qualifiedGlowScorePars(w).ready,true);
 assert.equal(old.players[0].scores[1],''); // original remains untouched
});
test('real v35 Glow selector feeds exact b4c0f0d backend canonical intent via one source-bound interface',async()=>{
 const f=await stateFixture(),cart=cartFixture(),log=[];
 const out=await runGlowIntentAction(serviceArgs(f,cart,log));
 assert.equal(out.status,202);
 assert.equal(out.body.status,'COMMITTED');
 assert.equal(out.body.relayStatus,'PENDING_OPAL_PULL');
 assert.equal(out.body.deviceReadback,'NOT_CHECKED');
 assert.equal(out.body.visibleScoreboard,'NOT_CHECKED');
 assert.equal(log.length,1);
 assert.equal(log[0].p_week_date,date);
 assert.equal(log[0].p_source_revision,revision);
 assert.equal(log[0].p_signature,f.signature);
 assert.equal(log[0].p_fingerprint,'a'.repeat(32));
 assert.equal(log[0].p_cart_revision,135);
 assert.equal(log[0].p_fence_epoch,5);
 assert.equal(log[0].p_next_state.overlays[0].kind,'scoreboard');
 assert.equal(log[0].p_next_state.overlays[0].priority,20);
 assert.equal(log[0].p_next_state.glowScoreIntentCursor.sourceRevision,revision);
});
test('existing owner overlay prevents automatic Glow Cart commit even after source save',async()=>{
 const f=await stateFixture(),cart=cartFixture(),log=[];
 cart.desired.state.overlays=[{priority:60,expiresAt:ts+20_000}];
 const out=await runGlowIntentAction(serviceArgs(f,cart,log));
 assert.equal(out.status,409);
 assert.equal(log.length,0);
});
test('incomplete Nov3 scorecard metadata is a pre-Cart fail-closed condition, never a June20 fallback',async()=>{
 const f=await stateFixture(),cart=cartFixture(),log=[];
 delete f.week.scorecardText.holePars['2'];
 f.week.layoutTemplates={'2026-06-20':{holePars:{'1':'3','2':'4'}}};
 assert.equal(qualifiedGlowScorePars(f.week).reason,'hole_pars_not_verified');
 assert.equal(log.length,0); // Caller must not invoke the dedicated backend.
});
