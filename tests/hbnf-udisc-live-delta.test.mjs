import test from 'node:test';
import assert from 'node:assert/strict';
import {ingestAuthorizedLiveDelta,buildVerifiedGlowCartProof} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-live-delta.review.mjs';
import {submitVerifiedGlowCartIntent} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-auto-sync.review.mjs';
// All players, teams, source receipts, and scores below are SYNTHETIC TEST DATA,
// not an actual Nov10 UDisc feed, approval, signed response, or provider result.
const date='2026-11-10', eventId='hb-glow-doubles-af85rU';
const window={event_id:eventId,event_date:date,window_start:'2026-11-11T01:30:00Z',window_end:'2026-11-11T07:30:00Z'};
const now='2026-11-11T02:15:00Z';
const envelope=()=>({schema:'hbnf.udisc.authorized-live-delta.v1',eventId,weekDate:date,roundId:'synthetic-round-1',
  cursor:1,sourceUpdatedAt:'2026-11-11T02:14:00Z',details:{layoutId:'fixture-layout'},
  teams:[{sourceTeamId:'fixture-team-1',participantIds:['fixture-p1','fixture-p2'],names:['Synthetic Player One','Synthetic Player Two']}],
  changes:[{kind:'hole',sourceTeamId:'fixture-team-1',hole:1,strokes:3,corrected:false},
    {kind:'result',sourceTeamId:'fixture-team-1',position:1,total:3,thru:1}]});
const crosswalk={eventId,weekDate:date,teams:[{sourceTeamId:'fixture-team-1',glowTeamId:'FIXTURE_GLOW_TEAM_1',
  cardId:'C1',participantIds:['fixture-p1','fixture-p2'],partner1:'Synthetic Player One',partner2:'Synthetic Player Two',allowCreate:true}]};
function setup(overrides={}) {
  let league={state_json:{glow:{activeWeek:date,weeks:{'2026-11-03':{immutable:'S1 genuine historical source protected'},
    [date]:{date,activeWeek:date,scoresLocked:false,cards:[{id:'C1',finalized:false,players:[]}],players:[],
      scorecardText:{holePars:Object.fromEntries(Array.from({length:18},(_,i)=>[String(i+1),'3']))}}}},
    skins:{fixture:'untouched'},bagTags:{fixture:'untouched'},__backups:{fixture:'untouched'}},
    updated_at:'2026-11-11T02:14:20Z'};
  let reads=0,writes=0;
  const deps={
    receiptNow:()=>now,
    getBinding:async()=>[window],
    reviewedCrosswalk:async()=>crosswalk,
    verifyAuthorizedReceipt:async({envelope,digest})=>({verified:true,permissionReference:'synthetic-permission-only',
      sourceIdentity:envelope.eventId,eventDate:envelope.weekDate,sourceRoundId:envelope.roundId,sourceCursor:envelope.cursor,sourceUpdatedAt:envelope.sourceUpdatedAt,
      envelopeDigest:digest,scope:['read-in-progress-hole-scores','store-league-score-snapshots']}),
    readLeague:async()=>{reads++;return JSON.parse(JSON.stringify(league));},
    applyWeek:async({p_expected_week,p_replacement_week,p_expected_active_week,p_week_date})=>{
      writes++;
      assert.equal(p_week_date,date);assert.equal(p_expected_active_week,date);
      if(JSON.stringify(p_expected_week)!==JSON.stringify(league.state_json.glow.weeks[date]))return {applied:false};
      league.state_json.glow.weeks[date]=JSON.parse(JSON.stringify(p_replacement_week));
      league.updated_at=new Date(Date.parse(league.updated_at)+5000).toISOString();return {applied:true};
    }
  };
  return {deps:{...deps,...overrides},getLeague:()=>league,counts:()=>({reads,writes})};
}
test('synthetic authorized source receipt maps roster, per-hole, result, provenance and preserves S1/unrelated root with guarded CAS/readback',async()=>{
  const f=setup(),result=await ingestAuthorizedLiveDelta(envelope(),f.deps);
  assert.equal(result.status,'SAVED_AND_INDEPENDENTLY_VERIFIED');
  assert.equal(result.readbackVerified,true);assert.equal(result.cartIntent,'NOT_REQUESTED');
  assert.equal(result.hasVerifiedScoredHoles,true);
  assert.deepEqual(f.counts(),{reads:2,writes:1});
  const root=f.getLeague().state_json;
  assert.equal(root.glow.weeks[date].players[0].scores[0],'3');
  assert.equal(root.glow.weeks[date].udiscSync.status.state,'fresh');
  assert.equal(root.glow.weeks[date].udiscLive.results.FIXTURE_GLOW_TEAM_1.position,1);
  assert.equal(root.glow.weeks[date].udiscLive.teams['fixture-team-1'],'FIXTURE_GLOW_TEAM_1');
  assert.equal(root.glow.weeks[date].udiscLive.permissionReference,'synthetic-permission-only');
  assert.deepEqual(root.glow.weeks[date].udiscLive.audit.map(x=>({hole:x.hole,to:x.to,correction:x.correction})),[{hole:1,to:'3',correction:false}]);
  assert.equal(root.glow.weeks['2026-11-03'].immutable,'S1 genuine historical source protected');
  assert.deepEqual(root.skins,{fixture:'untouched'});
});
test('Controls Cart proof is constructed only from independently read-back scored state',async()=>{
 const f=setup(),saved=await ingestAuthorizedLiveDelta(envelope(),f.deps);
 const proof=buildVerifiedGlowCartProof(saved);
 assert.equal(proof.eligible,true);assert.equal(proof.owner,'CONTROLS_ONLY');
 assert.equal(proof.saved.eventId,eventId);assert.equal(proof.saved.weekDate,date);
 assert.equal(proof.saved.sourceRevision,saved.sourceRevision);
 assert.match(proof.saved.signature,/^[a-f0-9]{64}$/);
 let cartRequest;
 const accepted=await submitVerifiedGlowCartIntent(async(url,options)=>{
   cartRequest={url,options};
   return new Response(JSON.stringify({status:'COMMITTED',relayStatus:'PENDING_OPAL_PULL',
     scoreFingerprint:'b'.repeat(32),sourceRevision:proof.saved.sourceRevision}),{status:202});
 },{supabaseUrl:'https://fixture.supabase.co',serviceKey:'TEST_ONLY_REVIEW_FIXTURE_KEY'},proof.saved);
 assert.equal(accepted.status,'COMMITTED');
 assert.equal(cartRequest.url,'https://fixture.supabase.co/functions/v1/hbnf-cart-control');
 assert.deepEqual(JSON.parse(cartRequest.options.body),{action:'glow_scoreboard_intent',weekDate:date});
 assert.equal(cartRequest.options.body.includes('TEST_ONLY_REVIEW_FIXTURE_KEY'),false);
 for(const changed of [
   {...saved,readbackVerified:false},
   {...saved,hasVerifiedScoredHoles:false},
   {...saved,downstream:{...saved.downstream,owner:'SCORING'}},
   {...saved,sourceRevision:'drift'},
   {...saved,weekDate:'2026-11-09',downstream:{...saved.downstream,weekDate:'2026-11-09'}},
   {...saved,downstream:{...saved.downstream,signedEnvelopeDigest:'bad'}},
 ]) assert.deepEqual(buildVerifiedGlowCartProof(changed),{
   eligible:false,reason:'INDEPENDENT_SCORED_READBACK_REQUIRED'});
 const rosterOnly=envelope();rosterOnly.changes=[{kind:'result',sourceTeamId:'fixture-team-1',position:null,total:null,thru:0}];
 const unscored=await ingestAuthorizedLiveDelta(rosterOnly,setup().deps);
 assert.equal(buildVerifiedGlowCartProof(unscored).eligible,false);
});
test('source cursor duplicate is independently reread but neither score nor freshness timestamp rewritten',async()=>{
  const f=setup();await ingestAuthorizedLiveDelta(envelope(),f.deps);
  const first=f.getLeague().state_json.glow.weeks[date].udiscSync.status.lastSuccessAt;
  const result=await ingestAuthorizedLiveDelta(envelope(),f.deps);
  assert.equal(result.status,'DUPLICATE_READBACK_VERIFIED');
  assert.equal(f.counts().writes,1);
  assert.equal(f.getLeague().state_json.glow.weeks[date].udiscSync.status.lastSuccessAt,first);
});
test('source revision-monotonic correction applies only against accepted source lineage; manual override is protected',async()=>{
  const f=setup();await ingestAuthorizedLiveDelta(envelope(),f.deps);
  const revised=envelope();revised.cursor=2;revised.sourceUpdatedAt='2026-11-11T02:14:20Z';
  revised.changes=[{kind:'hole',sourceTeamId:'fixture-team-1',hole:1,strokes:4,corrected:true,previousStrokes:3}];
  const a=await ingestAuthorizedLiveDelta(revised,f.deps);
  assert.equal(a.status,'SAVED_AND_INDEPENDENTLY_VERIFIED');
  assert.equal(f.getLeague().state_json.glow.weeks[date].players[0].scores[0],'4');
  assert.equal(f.getLeague().state_json.glow.weeks[date].udiscLive.audit.at(-1).correction,true);
  f.getLeague().state_json.glow.weeks[date].players[0].scores[0]='7'; // concurrent HUMAN input, test-only
  const third=envelope();third.cursor=3;third.sourceUpdatedAt='2026-11-11T02:14:30Z';
  third.changes=[{kind:'hole',sourceTeamId:'fixture-team-1',hole:1,strokes:5,corrected:true,previousStrokes:4}];
  const b=await ingestAuthorizedLiveDelta(third,f.deps);
  assert.equal(b.reason,'MANUAL_SCORE_CONFLICT');assert.equal(f.counts().writes,2);
  assert.equal(f.getLeague().state_json.glow.weeks[date].players[0].scores[0],'7');
});
test('blank partial updates never clear previous hole strokes',async()=>{
  const f=setup();await ingestAuthorizedLiveDelta(envelope(),f.deps);
  const e=envelope();e.cursor=2;e.sourceUpdatedAt='2026-11-11T02:14:25Z';
  e.changes=[{kind:'hole',sourceTeamId:'fixture-team-1',hole:2,strokes:4,corrected:false}];
  const v=await ingestAuthorizedLiveDelta(e,f.deps);
  assert.equal(v.status,'SAVED_AND_INDEPENDENTLY_VERIFIED');
  assert.equal(f.getLeague().state_json.glow.weeks[date].players[0].scores[0],'3');
  assert.equal(f.getLeague().state_json.glow.weeks[date].players[0].scores[1],'4');
});
test('missing trusted verifier, failed attestation and unsupported scope never touch SQL',async()=>{
  for(const change of [{verifyAuthorizedReceipt:undefined},
    {verifyAuthorizedReceipt:async()=>({verified:true})},
    {verifyAuthorizedReceipt:async({envelope,digest})=>({verified:true,permissionReference:'synthetic-only',sourceIdentity:envelope.eventId,eventDate:envelope.weekDate,sourceRoundId:envelope.roundId,sourceCursor:envelope.cursor,sourceUpdatedAt:envelope.sourceUpdatedAt,envelopeDigest:digest,scope:[]})}]){
    const f=setup(change),v=await ingestAuthorizedLiveDelta(envelope(),f.deps);
    assert.equal(v.wrote,false);assert.equal(f.counts().writes,0);
  }
});
test('uninitialized/locked/false-par week, unreviewed aliases or team, and prior organizer XLSX all fail closed',async()=>{
  const changes=[
    f=>{delete f.getLeague().state_json.glow.weeks[date];},
    f=>{f.getLeague().state_json.glow.weeks[date].scoresLocked=true;},
    f=>{delete f.getLeague().state_json.glow.weeks[date].scorecardText.holePars['18'];},
    f=>{f.getLeague().state_json.glow.weeks[date].udiscSync={source:'UDisc event XLSX export'};}
  ];
  for(const edit of changes){const f=setup();edit(f);const r=await ingestAuthorizedLiveDelta(envelope(),f.deps);assert.equal(r.status,'REJECTED');assert.equal(f.counts().writes,0);}
  const f=setup();const e=envelope();e.teams[0].names[0]='Unreviewed Person';
  const r=await ingestAuthorizedLiveDelta(e,f.deps);assert.equal(r.reason,'UNREVIEWED_SOURCE_ALIAS');assert.equal(f.counts().writes,0);
});
test('source freshness, future time, wrong binding event, window and scope cannot be self-asserted',async()=>{
  const e=envelope();e.sourceUpdatedAt='2026-11-11T02:03:00Z';const f=setup();
  assert.equal((await ingestAuthorizedLiveDelta(e,f.deps)).reason,'SOURCE_NOT_FRESH');
  const e2=envelope();e2.sourceUpdatedAt='2026-11-11T03:03:00Z';
  assert.equal((await ingestAuthorizedLiveDelta(e2,f.deps)).reason,'SOURCE_NOT_FRESH');
  const f2=setup({getBinding:async()=>[{...window,event_id:'hb-glow-doubles-XxY123'}]});
  assert.equal((await ingestAuthorizedLiveDelta(envelope(),f2.deps)).reason,'EVENT_BINDING_MISMATCH');
  const f3=setup({getBinding:async()=>[]});
  assert.equal((await ingestAuthorizedLiveDelta(envelope(),f3.deps)).reason,'SINGLE_AUTHENTICATED_BINDING_REQUIRED');
  assert.equal(f.counts().writes+f2.counts().writes+f3.counts().writes,0);
});
test('guarded CAS conflict does not retry and ambiguous transport never claims a save',async()=>{
  const f=setup({applyWeek:async()=>({applied:false})});
  assert.equal((await ingestAuthorizedLiveDelta(envelope(),f.deps)).status,'GUARDED_CAS_CONFLICT');
  const g=setup({applyWeek:async()=>{throw Error('provider timeout')}});
  const a=await ingestAuthorizedLiveDelta(envelope(),g.deps);assert.equal(a.status,'WRITE_OUTCOME_AMBIGUOUS');assert.equal(a.wrote,null);
  const h=setup({applyWeek:async()=>({applied:true})});
  const b=await ingestAuthorizedLiveDelta(envelope(),h.deps);assert.equal(b.status,'ACKNOWLEDGED_BUT_READBACK_MISMATCH');
  assert.equal(b.readbackVerified,false);
});
test('source revision same cursor with changed bytes and older cursor fail closed without replay',async()=>{
  const f=setup();await ingestAuthorizedLiveDelta(envelope(),f.deps);
  const different=envelope();different.changes[0].strokes=4;
  assert.equal((await ingestAuthorizedLiveDelta(different,f.deps)).reason,'SOURCE_CURSOR_REUSED_DIFFERENT_PAYLOAD');
  const older=envelope();older.cursor=1;older.changes[0].strokes=4;
  assert.equal((await ingestAuthorizedLiveDelta(older,f.deps)).reason,'SOURCE_CURSOR_REUSED_DIFFERENT_PAYLOAD');
  assert.equal(f.counts().writes,1);
});
test('roster-only and results-only authorized source is not misrepresented as fresh scored Cart data',async()=>{
  const f=setup(),e=envelope();e.changes=[{kind:'result',sourceTeamId:'fixture-team-1',position:null,total:null,thru:0}];
  const v=await ingestAuthorizedLiveDelta(e,f.deps);
  assert.equal(v.status,'SAVED_AND_INDEPENDENTLY_VERIFIED');assert.equal(v.hasVerifiedScoredHoles,false);
  assert.equal(v.downstream.eligibleForSeparateSourceReview,false);
  assert.equal(f.getLeague().state_json.glow.weeks[date].udiscSync.status.state,'awaiting_scores');
});
test('duplicate hole deltas, unsupported change types and fake prior correction all rejected before persistence',async()=>{
  for(const mutate of [e=>e.changes.push({...e.changes[0]}),
     e=>{e.changes[0].kind='payout'},
     e=>{e.changes[0].strokes=0}]){
    const f=setup(),e=envelope();mutate(e);
    const v=await ingestAuthorizedLiveDelta(e,f.deps);assert.equal(v.status,'REJECTED');assert.equal(f.counts().writes,0);
  }
});


test('participant IDs cannot be shared between scored teams and arbitrary event fields never reach the database',async()=>{
  const f=setup(),e=envelope();
  e.teams.push({sourceTeamId:'fixture-team-2',participantIds:['fixture-p1','fixture-p3'],names:['Synthetic Player One','Synthetic Player Three']});
  assert.equal((await ingestAuthorizedLiveDelta(e,f.deps)).reason,'PARTICIPANT_IN_MULTIPLE_TEAMS');
  const f2=setup(),e2=envelope();e2.details.adminToken='forbidden';
  assert.equal((await ingestAuthorizedLiveDelta(e2,f2.deps)).reason,'UNSUPPORTED_EVENT_DETAILS');
  assert.equal(f.counts().writes+f2.counts().writes,0);
});
test('newer source cursor with older timestamp refuses chronology regression even within event window',async()=>{
  const f=setup();await ingestAuthorizedLiveDelta(envelope(),f.deps);
  const e=envelope();e.cursor=2;e.sourceUpdatedAt='2026-11-11T02:13:30Z';
  e.changes=[{kind:'hole',sourceTeamId:'fixture-team-1',hole:2,strokes:4,corrected:false}];
  assert.equal((await ingestAuthorizedLiveDelta(e,f.deps)).reason,'SOURCE_UPDATED_AT_REGRESSED');
  assert.equal(f.counts().writes,1);
});
test('existing manual scores alone cannot make a roster/result-only source update appear as live scored UDisc data',async()=>{
  const f=setup(),week=f.getLeague().state_json.glow.weeks[date];
  week.players=[{id:'FIXTURE_GLOW_TEAM_1',name:'Synthetic Player One / Synthetic Player Two',partner1:'Synthetic Player One',partner2:'Synthetic Player Two',cardId:'C1',scores:['3',...Array(17).fill('')]}];
  week.cards[0].players=[{id:'FIXTURE_GLOW_TEAM_1',partner1:'Synthetic Player One',partner2:'Synthetic Player Two'}];
  const e=envelope();e.changes=[{kind:'result',sourceTeamId:'fixture-team-1',position:null,total:null,thru:0}];
  const result=await ingestAuthorizedLiveDelta(e,f.deps);
  assert.equal(result.status,'SAVED_AND_INDEPENDENTLY_VERIFIED');
  assert.equal(result.hasVerifiedScoredHoles,false);
  assert.equal(f.getLeague().state_json.glow.weeks[date].udiscSync.status.state,'awaiting_scores');
});
