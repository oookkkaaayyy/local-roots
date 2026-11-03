import test from 'node:test';
import assert from 'node:assert/strict';
import {planSavedGlowOverlay} from '../scripts/hbnf-glow-cart-intent.mjs';
const t=Date.parse('2026-11-04T02:00:00Z');
const s='a'.repeat(64);
const baseline=()=>({
 at:t,
 binding:{eventDate:'2026-11-03',eventId:'hb-glow-doubles-tAP8Y5',windowStart:'2026-11-04T01:30:00Z',windowEnd:'2026-11-04T07:30:00Z',verifiedLeagueRevision:'2026-11-04T02:00:00.000001Z'},
 liveStatus:{updated_at:'2026-11-04T02:00:00.000001Z',selectorVersion:'skins-front-lock-v1',live:{active:true,event:'glow',label:'GLOW',entries:['Team A/Team B -2','Team C/Team D E','Team E/Team F +3'],acePot:500}},
 week:{date:'2026-11-03',scoresLocked:false,cards:[{finalized:false}],udiscSync:{source:'UDisc event XLSX export',eventId:'hb-glow-doubles-tAP8Y5',weekDate:'2026-11-03',latest:{signature:s},status:{state:'fresh',lastSuccessAt:'2026-11-04T01:59:30Z'}}},
 cartContext:{desired:{revision:16,state:{power:'on',overlays:[]}},fence:{active:true,epoch:8,release_id:'review-fence'}}
});
test('saved authentic Glow projection plans a GLOW scoreboard without WLED/MQTT actuation',()=>{
 const p=planSavedGlowOverlay(baseline());
 assert.equal(p.kind,'canonical_command_candidate');
 assert.equal(p.type,'OVERLAY_START');
 assert.equal(p.payload.data.label,'GLOW');
 assert.deepEqual(p.payload.data.entries,['Team A/Team B -2','Team C/Team D E','Team E/Team F +3']);
 assert.ok(p.payload.priority<60);
 assert.equal(p.expectedRevision,16);
 assert.deepEqual(p.requiredFence,{epoch:8,releaseId:'review-fence'});
 assert.equal(p.deviceReadbackRequired,true);
 assert.equal('mqtt' in p,false);
});
test('does not display November 3 rehearsal data lacking saved UDisc signature',()=>{
 const x=baseline();delete x.week.udiscSync;
 assert.equal(planSavedGlowOverlay(x).reason,'SAVED_SOURCE_REVISION_NOT_CONFIRMED');
});
test('pre-window, wrong ID or expired window cannot issue commands',()=>{
 for(const change of [
 x=>x.at=Date.parse('2026-11-04T01:29:59Z'),
 x=>x.binding.eventId='another-event',
 x=>x.at=Date.parse('2026-11-04T07:30:01Z')]){
  const x=baseline();change(x);
  assert.equal(planSavedGlowOverlay(x).reason,'EVENT_BINDING_NOT_ACTIVE');
 }
});
test('stale or mismatched persisted revision and UDisc freshness fail closed',()=>{
 const x=baseline();x.liveStatus.updated_at='2026-11-04T01:00:00Z';
 assert.equal(planSavedGlowOverlay(x).reason,'SAVED_SOURCE_REVISION_NOT_CONFIRMED');
 const y=baseline();y.week.udiscSync.status.lastSuccessAt='2026-11-04T01:40:00Z';
 assert.equal(planSavedGlowOverlay(y).reason,'SAVED_SOURCE_REVISION_NOT_CONFIRMED');
 const z=baseline();z.week.udiscSync.status.state='failed';
 assert.equal(planSavedGlowOverlay(z).reason,'SAVED_SOURCE_REVISION_NOT_CONFIRMED');
});
test('Manual Owner overlay prevents score takeover; normal Owner priority outranks proposed 20',()=>{
 const x=baseline();x.cartContext.desired.state.overlays=[{priority:60,expiresAt:t+3000}];
 assert.equal(planSavedGlowOverlay(x).reason,'MANUAL_OR_HIGHER_PRIORITY_OVERLAY_ACTIVE');
});
test('Missing relay release fence, power-off or unavailable revision reject',()=>{
 for(const mutate of [
 x=>delete x.cartContext.fence,
 x=>x.cartContext.desired.state.power='off',
 x=>x.cartContext.desired.revision=-1]){
  const x=baseline();mutate(x);assert.equal(planSavedGlowOverlay(x).reason,'CART_COMMAND_FENCE_UNAVAILABLE');
 }
});
test('correction changes signature; repeated identical intent is idempotent per four-minute window',()=>{
 const x=baseline(),first=planSavedGlowOverlay(x);
 assert.equal(planSavedGlowOverlay({...x,priorDispatch:{key:first.key,sourceRevision:x.liveStatus.updated_at}}).reason,'SCORE_INTENT_ALREADY_DISPATCHED');
 const y=baseline();y.week.udiscSync.latest.signature='b'.repeat(64);
 assert.notEqual(planSavedGlowOverlay(y).key,first.key);
 const z=baseline();z.at+=240000;assert.notEqual(planSavedGlowOverlay(z).key,first.key);
});
test('oversize/empty/invalid scoreboard refuses truncation, not partial acceptance',()=>{
 for(const entries of [[],Array(13).fill('X E'),['A'.repeat(49)],['Bad\nName E']]){
  const x=baseline();x.liveStatus.live.entries=entries;
  assert.equal(planSavedGlowOverlay(x).reason,'SCOREBOARD_ENTRIES_UNSUPPORTED');
 }
});
test('Skins source and finalized Glow card cannot be issued as an automatic Glow intent',()=>{
 const x=baseline();x.liveStatus.live.event='skins';
 assert.equal(planSavedGlowOverlay(x).reason,'NO_ACTIVE_GLOW_SCOREBOARD');
 const y=baseline();y.week.cards[0].finalized=true;
 assert.equal(planSavedGlowOverlay(y).reason,'WEEK_NOT_ADMISSIBLE');
});
