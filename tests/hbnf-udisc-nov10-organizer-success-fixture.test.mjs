import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {handleOrganizerImportRequest} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-organizer-http.review.mjs';
import {parseUdiscWorkbook} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-sync-runner.mjs';
import {standingsForPreview} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/worker-private/udisc-glow-preview.mjs';
import {NOV10_MAIN_LAYOUT} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-nov10-main-layout.review.mjs';

const eventId='hb-glow-doubles-af85rU',weekDate='2026-11-10';
const binding={event_id:eventId,event_date:weekDate,
  window_start:'2026-11-11T01:30:00+00:00',window_end:'2026-11-11T07:30:00+00:00'};
const token='TEST_ONLY_NON_PRODUCTION_SCORING_OPERATOR_SECRET_0123456789abcdef';
const fixture=new URL('./fixtures/hbnf-udisc-nov10-synthetic.xlsx',import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const pars=Object.fromEntries(NOV10_MAIN_LAYOUT.holes.map(hole=>[String(hole.number),String(hole.par)]));
const parLayout={layoutId:NOV10_MAIN_LAYOUT.layoutId,layoutName:NOV10_MAIN_LAYOUT.layoutName,
  courseId:NOV10_MAIN_LAYOUT.courseId,evidenceSha256:NOV10_MAIN_LAYOUT.evidenceSha256,
  layoutSha256:NOV10_MAIN_LAYOUT.layoutSha256};

test('operator-attested organizer XLSX persists, gates exact corrections, renders in Glow, and yields Controls intents',async()=>{
  const bytes=await readFile(fixture);
  let state={glow:{activeWeek:weekDate,playerAliases:{'Fixture A':'Fixture A','Fixture B':'Fixture B'},
    weeks:{[weekDate]:{date:weekDate,eventId,eventWindow:{start:NOV10_MAIN_LAYOUT.windowStart,end:NOV10_MAIN_LAYOUT.windowEnd},
      parLayout,scoresLocked:false,scorecardText:{holePars:pars},
      cards:[{id:'C1',finalized:false,players:[]}],players:[]}}}};
  let updatedAt='2026-11-06T18:00:00.000Z';
  const requests=[];
  const cartPayloads=[];
  const fetchImpl=async(url,options={})=>{
    const u=String(url),method=options.method||'GET';requests.push({url:u,method});
    if(u.includes('/hbnf_udisc_glow_event_bindings?'))return new Response(JSON.stringify([binding]),{status:200});
    if(u.includes('/league_state?id=eq.1')&&method==='GET')return new Response(JSON.stringify([{state_json:state,updated_at:updatedAt}]),{status:200});
    if(u.includes('/rpc/hbnf_apply_udisc_glow_week')&&method==='POST'){
      const body=JSON.parse(options.body);
      const current=state.glow.weeks[weekDate];
      if(state.glow.activeWeek!==body.p_expected_active_week||
         JSON.stringify(current)!==JSON.stringify(body.p_expected_week))
        return new Response(JSON.stringify({applied:false}),{status:200});
      state={...state,glow:{...state.glow,weeks:{...state.glow.weeks,[weekDate]:body.p_replacement_week}}};
      updatedAt=new Date(Date.parse(updatedAt)+1000).toISOString();
      return new Response(JSON.stringify({applied:true}),{status:200});
    }
    if(u.endsWith('/functions/v1/hbnf-cart-control')&&method==='POST'){
      const payload=JSON.parse(options.body);cartPayloads.push(payload);
      return new Response(JSON.stringify({status:'COMMITTED',relayStatus:'PENDING_OPAL_PULL',
        scoreFingerprint:'b'.repeat(32),sourceRevision:updatedAt}),{status:202});
    }
    throw Error(`Unexpected provider operation ${method} ${u}`);
  };
  const env={HBNF_UDISC_OPERATOR_IMPORT_ENABLED:'true',HBNF_UDISC_ORGANIZER_IMPORT_TOKEN:token,
    SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'TEST_ONLY_NON_PRODUCTION_PROVIDER_SERVICE_ROLE_SECRET'};
  const uploadRequest=(correctionApprovals)=>{
    const form=new FormData();
    form.append('xlsx',new File([bytes],'synthetic-nov10.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    form.append('eventId',eventId);form.append('weekDate',weekDate);form.append('officialExportConfirmed','yes');
    form.append('freshSnapshotConfirmed','yes');
    if(correctionApprovals!==undefined)form.append('scoreCorrectionApprovals',JSON.stringify(correctionApprovals));
    form.append('reviewedDecisions',JSON.stringify({
      'udisc:fixture a':{canonicalName:'Fixture A'},'udisc:fixture b':{canonicalName:'Fixture B'}
    }));
    return new Request('https://hbnf.example/internal/udisc-glow-organizer-import',{
      method:'POST',headers:{Authorization:`Bearer ${token}`},body:form
    });
  };
  const options={fetchImpl,now:()=>new Date('2026-11-11T03:30:00.000Z')};
  const response=await handleOrganizerImportRequest(uploadRequest(),env,options);
  assert.equal(response.status,200);
  const receipt=await response.json();
  assert.equal(receipt.disposition,'SAVED_AND_READBACK_VERIFIED');
  assert.equal(receipt.readbackVerified,true);assert.equal(receipt.wrote,true);
  assert.equal(receipt.eventId,eventId);assert.equal(receipt.weekDate,weekDate);
  assert.equal(receipt.sha256,digest(bytes));assert.equal(receipt.scoredHoles,18);
  assert.equal(receipt.sourceFreshness,'OPERATOR_ATTESTED_CAPTURE_TIME');assert.equal(receipt.cartIntent,'PENDING_OPAL_PULL');
  const saved=state.glow.weeks[weekDate];
  assert.equal(saved.players.length,1);assert.equal(saved.players[0].scores.reduce((n,x)=>n+Number(x),0),54);
  assert.equal(saved.udiscSync.status.state,'fresh');
  assert.equal(saved.udiscSync.status.captureAuthority,'authenticated_organizer_immediate_export_attestation');
  assert.equal(saved.udiscSync.status.lastSuccessAt,'2026-11-11T03:30:00.000Z');
  assert.equal(saved.scorecardText.holePars['18'],'3');
  assert.equal(saved.udiscSync.status.sourceFreshness,'OPERATOR_ATTESTED_CAPTURE_TIME');
  // An exact source change can amend a previously imported score only after
  // the authenticated Scoring operator reviews the old and replacement value.
  const team=saved.players[0],accepted=saved.udiscSync.latest.rows.find(row=>row.glowTeamId===team.id);
  const replacementScore=String(team.scores[0]);
  team.scores[0]=String(Number(replacementScore)+1);
  accepted.acceptedHoleScores[0]=team.scores[0];
  saved.udiscSync.latest.signature='c'.repeat(64);
  updatedAt='2026-11-06T18:00:02.000Z';
  const beforeRejectedCorrection=requests.length;
  const rejected=await handleOrganizerImportRequest(uploadRequest(),env,options);
  assert.equal(rejected.status,409);
  assert.equal((await rejected.json()).disposition,'SCORE_CORRECTION_REQUIRES_P0_REVIEW');
  assert.equal(requests.slice(beforeRejectedCorrection).filter(x=>x.url.includes('/rpc/hbnf_apply_udisc_glow_week')).length,0);
  const approval=[{decision:'ACCEPT_SCORE_CORRECTION',eventId,weekDate,sourceSha256:digest(bytes),
    teamId:team.id,hole:1,previousScore:team.scores[0],replacementScore}];
  const beforeInvalidApproval=requests.length;
  const invalid=await handleOrganizerImportRequest(uploadRequest([{...approval[0],sourceSha256:'0'.repeat(64)}]),env,options);
  assert.equal(invalid.status,400);
  assert.equal((await invalid.json()).disposition,'CORRECTION_APPROVALS_INVALID');
  assert.equal(requests.length,beforeInvalidApproval,'approval bound to another XLSX must stop before provider access');
  const corrected=await handleOrganizerImportRequest(uploadRequest(approval),env,options);
  assert.equal(corrected.status,200);
  const correctionReceipt=await corrected.json();
  assert.equal(correctionReceipt.disposition,'SAVED_AND_READBACK_VERIFIED');
  assert.equal(correctionReceipt.readbackVerified,true);
  assert.equal(state.glow.weeks[weekDate].players[0].scores[0],replacementScore);
  const duplicate=await handleOrganizerImportRequest(uploadRequest(approval),env,options);
  assert.equal(duplicate.status,200);
  assert.equal((await duplicate.json()).disposition,'DUPLICATE_VERIFIED');
  assert.equal(requests.filter(x=>x.url.includes('/rpc/hbnf_apply_udisc_glow_week')).length,2,'duplicate source snapshot must not cause a third CAS');
  assert.equal(cartPayloads.length,2,'duplicate snapshot must not produce a third Cart intent');
  assert.deepEqual(cartPayloads[0],{action:'glow_scoreboard_intent',weekDate});
  const snapshot=await parseUdiscWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),
    {eventId,weekDate,observedAt:'2026-11-11T03:30:00.000Z'});
  const rows=standingsForPreview({eventId,snapshots:[snapshot]},{'Fixture A':'Fixture A','Fixture B':'Fixture B'});
  assert.equal(rows.length,1);assert.equal(rows[0].team,'Fixture A / Fixture B');assert.equal(rows[0].strokeTotal,54);
  const glowHtml=await readFile(new URL('../public/glow.html',import.meta.url),'utf8');
  assert.match(glowHtml,/function renderScoring\(\)/);
  assert.match(glowHtml,/function renderStandings\(\)/);
  assert.match(glowHtml,/function renderGlowDashboard\(\)/);
  assert.match(glowHtml,/const weekRows=standingsForWeek\(getWeek\(\)\)/);
  assert.match(glowHtml,/Operator-attested fresh UDisc export received by HBNF/);
  assert.match(glowHtml,/status\.captureAuthority==='authenticated_organizer_immediate_export_attestation'/);
  assert.equal(requests.filter(x=>x.url.includes('/hbnf_udisc_glow_event_bindings?')).length,4);
  assert.equal(requests.filter(x=>x.url.includes('/league_state?id=eq.1')).length,7);
  assert.equal(requests.filter(x=>x.url.includes('/rpc/hbnf_apply_udisc_glow_week')).length,2);
  assert.equal(cartPayloads.length,2);
});
