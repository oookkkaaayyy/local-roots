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

test('synthetic organizer XLSX passes event-bound guarded import, becomes Glow standings data, and emits no live Cart intent',async()=>{
  const bytes=await readFile(fixture);
  let state={glow:{activeWeek:weekDate,playerAliases:{'Fixture A':'Fixture A','Fixture B':'Fixture B'},
    weeks:{[weekDate]:{date:weekDate,eventId,eventWindow:{start:NOV10_MAIN_LAYOUT.windowStart,end:NOV10_MAIN_LAYOUT.windowEnd},
      parLayout,scoresLocked:false,scorecardText:{holePars:pars},
      cards:[{id:'C1',finalized:false,players:[]}],players:[]}}}};
  let updatedAt='2026-11-06T18:00:00.000Z';
  const requests=[];
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
      updatedAt='2026-11-06T18:00:01.000Z';
      return new Response(JSON.stringify({applied:true}),{status:200});
    }
    throw Error(`Unexpected provider operation ${method} ${u}`);
  };
  const env={HBNF_UDISC_OPERATOR_IMPORT_ENABLED:'true',HBNF_UDISC_ORGANIZER_IMPORT_TOKEN:token,
    SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'TEST_ONLY_NON_PRODUCTION_PROVIDER_SERVICE_ROLE_SECRET'};
  const uploadRequest=()=>{
    const form=new FormData();
    form.append('xlsx',new File([bytes],'synthetic-nov10.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    form.append('eventId',eventId);form.append('weekDate',weekDate);form.append('officialExportConfirmed','yes');
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
  assert.equal(receipt.sourceFreshness,'NOT_ASSERTED');assert.equal(receipt.cartIntent,'NOT_REQUESTED');
  const saved=state.glow.weeks[weekDate];
  assert.equal(saved.players.length,1);assert.equal(saved.players[0].scores.reduce((n,x)=>n+Number(x),0),54);
  assert.equal(saved.udiscSync.status.state,'organizer_upload_persisted');
  assert.equal(saved.scorecardText.holePars['18'],'3');
  assert.equal(saved.udiscSync.status.sourceFreshness,'NOT_ASSERTED');
  const duplicate=await handleOrganizerImportRequest(uploadRequest(),env,options);
  assert.equal(duplicate.status,200);
  assert.equal((await duplicate.json()).disposition,'DUPLICATE_VERIFIED');
  assert.equal(requests.filter(x=>x.method==='POST').length,1,'same source snapshot must not cause a second CAS');
  const snapshot=await parseUdiscWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),
    {eventId,weekDate,observedAt:'2026-11-11T03:30:00.000Z'});
  const rows=standingsForPreview({eventId,snapshots:[snapshot]},{'Fixture A':'Fixture A','Fixture B':'Fixture B'});
  assert.equal(rows.length,1);assert.equal(rows[0].team,'Fixture A / Fixture B');assert.equal(rows[0].strokeTotal,54);
  const glowHtml=await readFile(new URL('../public/glow.html',import.meta.url),'utf8');
  assert.match(glowHtml,/function renderScoring\(\)/);
  assert.match(glowHtml,/function renderStandings\(\)/);
  assert.match(glowHtml,/function renderGlowDashboard\(\)/);
  assert.match(glowHtml,/const weekRows=standingsForWeek\(getWeek\(\)\)/);
  assert.deepEqual(requests.map(x=>x.method),['GET','GET','POST','GET','GET','GET','GET']);
  assert.equal(requests.some(x=>x.url.includes('cart')),false,'organizer upload must not generate live Cart output');
});
