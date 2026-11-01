import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deflateRawSync} from 'node:zlib';
import {runGlowSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/index.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/authentic-udisc/2026-04-18.json', import.meta.url),'utf8'));
const eventId='hb-night-flyers-hb-glow-doubles-ZUDJEk';
const eventDate='2026-04-21';
const xmlEscape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const colName=index=>{let n=index+1,out='';while(n){const r=(n-1)%26;out=String.fromCharCode(65+r)+out;n=Math.floor((n-1)/26);}return out;};
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function makeZip(files){
  const locals=[],centrals=[];let offset=0;
  for(const[name,raw]of Object.entries(files)){
    const nameBytes=Buffer.from(name),data=Buffer.from(raw),compressed=deflateRawSync(data),crc=crc32(data);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26);
    locals.push(local,nameBytes,compressed);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(nameBytes.length,28);central.writeUInt32LE(offset,42);
    centrals.push(central,nameBytes);offset+=local.length+nameBytes.length+compressed.length;
  }
  const centralBytes=Buffer.concat(centrals),centralOffset=offset;
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(centralBytes.length,12);end.writeUInt32LE(centralOffset,16);
  const archive=Buffer.concat([...locals,centralBytes,end]);return archive.buffer.slice(archive.byteOffset,archive.byteOffset+archive.byteLength);
}

function workbookBytes(rows=fixture.rows) {
  const headers=['position','position_raw','name','usernames','division','event_relative_score','event_total_score',...Array.from({length:18},(_,i)=>`hole_${i+1}`)];
  const strings=[], stringIndex=new Map();
  const addString=value=>{const text=String(value??'');if(!stringIndex.has(text)){stringIndex.set(text,strings.length);strings.push(text);}return stringIndex.get(text);};
  const xmlRows=[headers,...rows.map(row=>[row.position,row.position_raw,row.name,row.usernames,row.division,row.event_relative_score,row.event_total_score,...Array.from({length:18},(_,i)=>row[`hole_${i+1}`]??'')])];
  const sheetRows=xmlRows.map((row,r)=>`<row r="${r+1}">${row.map((value,c)=>{
    const ref=`${colName(c)}${r+1}`;
    if(typeof value==='number')return `<c r="${ref}"><v>${value}</v></c>`;
    const index=addString(value);return `<c r="${ref}" t="s"><v>${index}</v></c>`;
  }).join('')}</row>`).join('');
  const shared=strings.map(value=>`<si><t>${xmlEscape(value)}</t></si>`).join('');
  const files={
    'xl/workbook.xml':new TextEncoder().encode('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Event results" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels':new TextEncoder().encode('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml':new TextEncoder().encode(`<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`),
    'xl/sharedStrings.xml':new TextEncoder().encode(`<sst>${shared}</sst>`),
  };
  return makeZip(files);
}

const initializedWeek={date:eventDate,activeWeek:eventDate,scoresLocked:false,cards:[{id:'C1',finalized:false,players:[]}],players:[],scorecardText:{holePars:{1:'3'}},entryFee:5,payoutPercent:100,aceWinner:'',tiebreakerWinner:''};
const attemptAt='2026-04-21T19:00:00.000Z';
const binding={event_id:eventId,event_date:eventDate,window_start:'2026-04-21T19:00:00.000Z',window_end:'2026-04-22T00:00:00.000Z'};
const env={UDISC_GLOW_ACCESS_APPROVED:'true',SUPABASE_URL:'https://project.example',SUPABASE_SERVICE_ROLE_KEY:'test-only'};
const now=()=>new Date(attemptAt);

function makeFetch(initialGlow, workbookRef, sourceBinding=binding) {
  let root={glow:structuredClone(initialGlow),skins:{unchanged:true}}, updatedAt='2026-04-18T15:00:00.000Z';
  const calls={udisc:0,reads:0,bindingReads:0,writes:0,failures:0};
  const fetch=async(input,init={})=>{
    const url=String(input);
    if(url.includes('/rest/v1/hbnf_udisc_glow_event_bindings?')){calls.bindingReads++;return Response.json([sourceBinding]);}
    if(url.includes('/rest/v1/league_state?')){calls.reads++;return Response.json([{id:1,state_json:root,updated_at:updatedAt}]);}
    if(url===`https://udisc.com/events/${sourceBinding.event_id}/leaderboard/export`){calls.udisc++;return new Response(workbookRef.value,{status:200,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});}
    if(url.endsWith('/rest/v1/rpc/hbnf_apply_udisc_glow_week')){
      calls.writes++;
      const body=JSON.parse(init.body);
      assert.equal(body.p_week_date,sourceBinding.event_date);
      assert.equal(body.p_expected_active_week,sourceBinding.event_date);
      if(JSON.stringify(root.glow.weeks[sourceBinding.event_date])!==JSON.stringify(body.p_expected_week))return Response.json({applied:false,reason:'concurrent_change'});
      root={...root,glow:{...root.glow,weeks:{...root.glow.weeks,[body.p_week_date]:body.p_replacement_week}}};
      updatedAt=`2026-04-21T19:${String(calls.writes).padStart(2,'0')}:00.000Z`;
      return Response.json({applied:true});
    }
    if(url.endsWith('/rest/v1/rpc/hbnf_record_udisc_glow_sync_status')){
      calls.failures++;
      const body=JSON.parse(init.body), week=root.glow.weeks[body.p_week_date];
      week.udiscSync={...(week.udiscSync||{}),status:{state:'failed',lastAttemptAt:body.p_attempted_at,lastSuccessAt:week.udiscSync?.status?.lastSuccessAt??null,errorCode:body.p_error_code}};
      return Response.json({recorded:true});
    }
    throw Error(`Unexpected simulated request ${url}`);
  };
  return {fetch,calls,get root(){return root},setGlow(glow){root={...root,glow}},setUpdatedAt(value){updatedAt=value}};
}

const aliasesForFixture=()=>Object.fromEntries(fixture.rows.flatMap(row=>row.name.split(/\s*&\s*/).map(name=>[name,name])));
const glowWithWeek=(week=structuredClone(initializedWeek))=>({weeks:{[eventDate]:week},activeWeek:eventDate,playerAliases:aliasesForFixture()});

test('scheduled runner applies fixture scores with independently verified readback; replay and corrections are idempotent', async () => {
  const workbook={value:workbookBytes()};
  const fake=makeFetch(glowWithWeek(),workbook);
  const first=await runGlowSync(env,{fetch:fake.fetch,now});
  assert.equal(first.disposition,'updated');assert.equal(first.teamCount,fixture.rows.length);
  assert.equal(fake.calls.udisc,1);assert.equal(fake.calls.writes,1);assert.ok(fake.calls.reads>=2);
  assert.equal(fake.root.glow.weeks[eventDate].players[0].scores.length,18);
  assert.equal(fake.root.skins.unchanged,true);

  const replay=await runGlowSync(env,{fetch:fake.fetch,now});
  assert.equal(replay.disposition,'unchanged');assert.equal(fake.calls.writes,1);

  const corrected=fixture.rows.map((row,index)=>index===0?{...row,hole_1:Number(row.hole_1)+1,event_total_score:Number(row.event_total_score)+1}:row);
  workbook.value=workbookBytes(corrected);
  const correction=await runGlowSync(env,{fetch:fake.fetch,now});
  assert.equal(correction.disposition,'updated');assert.equal(fake.calls.writes,2);
  assert.equal(fake.root.glow.weeks[eventDate].udiscSync.history.length,1);
  assert.equal(fake.root.glow.weeks[eventDate].players[0].scores[0],String(corrected[0].hole_1));

  fake.root.glow.weeks[eventDate].players[0].scores[0]='99';
  const laterCorrection=corrected.map((row,index)=>index===0?{...row,hole_1:Number(row.hole_1)+1,event_total_score:Number(row.event_total_score)+1}:row);
  workbook.value=workbookBytes(laterCorrection);
  await runGlowSync(env,{fetch:fake.fetch,now});
  assert.equal(fake.root.glow.weeks[eventDate].players[0].scores[0],'99');
  assert.equal(fake.root.glow.weeks[eventDate].udiscSync.latest.manualOverrides[0].keptScore,'99');
});

test('scheduled runner binds a current new-format UDisc event only to its exact initialized Glow Tuesday',async()=>{
  const sourceBinding={event_id:'hb-glow-doubles-tAP8Y5',event_date:'2026-11-03',window_start:'2026-11-04T01:30:00+00:00',window_end:'2026-11-04T07:30:00+00:00'};
  const week={...structuredClone(initializedWeek),date:sourceBinding.event_date,activeWeek:sourceBinding.event_date};
  const glow={weeks:{[sourceBinding.event_date]:week},activeWeek:sourceBinding.event_date,playerAliases:aliasesForFixture()};
  const fake=makeFetch(glow,{value:workbookBytes()},sourceBinding);
  const at=()=>new Date('2026-11-04T02:00:00.000Z');
  const result=await runGlowSync(env,{fetch:fake.fetch,now:at});
  assert.equal(result.disposition,'updated');
  assert.equal(result.date,'2026-11-03');
  assert.equal(result.eventId,'hb-glow-doubles-tAP8Y5');
  assert.equal(fake.calls.udisc,1);
  assert.equal(fake.root.glow.weeks['2026-11-03'].udiscSync.eventId,'hb-glow-doubles-tAP8Y5');
});

test('unapproved or unconfigured access makes no request; out-of-window binding makes no score or UDisc request', async () => {
  let calls=0;const fetch=async()=>{calls++;throw Error('network must not run')};
  assert.equal((await runGlowSync({}, {fetch,now})).disposition,'source_access_disabled');
  assert.equal((await runGlowSync({...env,UDISC_GLOW_ACCESS_APPROVED:'false'}, {fetch,now})).disposition,'source_access_disabled');
  const missing={...env};delete missing.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal((await runGlowSync(missing,{fetch,now})).disposition,'credentials_not_configured');
  assert.equal(calls,0);
  let outOfWindowCalls=0;
  const noActiveBinding=async input=>{outOfWindowCalls++;assert.match(String(input),/hbnf_udisc_glow_event_bindings/);return Response.json([]);};
  assert.equal((await runGlowSync(env,{fetch:noActiveBinding,now:()=>new Date('2026-04-21T23:00:00.000Z')})).disposition,'outside_event_window');
  assert.equal(outOfWindowCalls,1);
});

test('active-week and initialization preflight complete before any UDisc request', async () => {
  const workbook={value:workbookBytes()};
  const wrong=makeFetch({...glowWithWeek(),activeWeek:'2026-04-28'},workbook);
  assert.equal((await runGlowSync(env,{fetch:wrong.fetch,now})).disposition,'active_week_mismatch');
  assert.equal(wrong.calls.udisc,0);
  const missingWeek=makeFetch({weeks:{},activeWeek:eventDate,playerAliases:aliasesForFixture()},workbook);
  assert.equal((await runGlowSync(env,{fetch:missingWeek.fetch,now})).disposition,'week_not_initialized');
  assert.equal(missingWeek.calls.udisc,0);
  const lockedWeek=makeFetch(glowWithWeek({...structuredClone(initializedWeek),scoresLocked:true}),workbook);
  assert.equal((await runGlowSync(env,{fetch:lockedWeek.fetch,now})).disposition,'week_locked');
  assert.equal(lockedWeek.calls.udisc,0);
});

test('identity ambiguity fails before score write and records verified error status', async () => {
  const aliases=aliasesForFixture(),duplicate=fixture.rows[0].name.split(/\s*&\s*/)[0];
  aliases[duplicate.toLocaleLowerCase()]='CONFLICTING_CANONICAL';
  const fake=makeFetch({...glowWithWeek(),playerAliases:aliases},{value:workbookBytes()});
  await assert.rejects(()=>runGlowSync(env,{fetch:fake.fetch,now}),/one-time review/);
  assert.equal(fake.calls.writes,0);assert.equal(fake.calls.failures,1);
  assert.equal(fake.root.glow.weeks[eventDate].udiscSync.status.state,'failed');
});


test('offline full-chain boundary: real XLSX sync to actual Glow standings renderer then Cart overlay interface',async()=>{
  // All traffic is a local fake fetch. No Cloudflare, Supabase, UDisc, Cart, or owner device access.
  const vm=(await import('node:vm')).default;
  const localPublicRoot=new URL('../source-snapshots/hbnf-worker-d1a5f936-20261024/public/',import.meta.url);
  const glowHtml=await readFile(new URL('glow.html',localPublicRoot),'utf8');
  const cartJs=await readFile(new URL('hbnf-cart-features.mjs',localPublicRoot),'utf8');
  const block=(source,start,end)=>{
    const a=source.indexOf(start), b=source.indexOf(end,a+start.length);
    assert.ok(a>=0 && b>a, 'cannot isolate ACTUAL source block: '+start);
    return source.slice(a,b);
  };
  const workbook={value:workbookBytes()};
  const fake=makeFetch(glowWithWeek(),workbook);
  const imported=await runGlowSync(env,{fetch:fake.fetch,now});
  assert.equal(imported.disposition,'updated');
  assert.equal(fake.calls.writes,1);
  assert.equal(fake.calls.udisc,1);
  assert.equal(fake.root.skins.unchanged,true);
  const week=fake.root.glow.weeks[eventDate];
  assert.equal(week.players.length,fixture.teamCount);
  const standingsNode={innerHTML:''};
  const glowContext={
    console, window:{},
    qs:selector=>selector==='#weekStandings'?standingsNode:null,
    canonicalGlowName:name=>String(name??'').trim(),
    getWeek:()=>week,
    bagTagFor:()=> '—',
    escapeHtml:name=>String(name).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    renderLegacyPanels:()=>{},renderBagTagsPanel:()=>{},
    hbnfRenderBackupPanel:()=>{},makeStandingTablesScrollable:()=>{}
  };
  const actualGlowFunctions=[
    block(glowHtml,'function hbnfFlatMap(items,fn)','const fmtMoney='),
    block(glowHtml,'const teamParts=','const GLOW_ENTRY_FEE'),
    block(glowHtml,'const totalForPlayer=','const getPlayerById='),
    block(glowHtml,'function standingsForWeek(w)','function winterSummaryRows()'),
    block(glowHtml,'function renderStandings()','window.HBNFGlowRoundTagAdapter=')
  ].join('\n');
  vm.runInNewContext(actualGlowFunctions+
    '\nthis.renderActualGlow=renderStandings;this.getActualGlowRows=()=>standingsForWeek(getWeek());',
    glowContext,{timeout:1000});
  glowContext.renderActualGlow();
  const rows=Array.from(glowContext.getActualGlowRows());
  assert.ok(rows.length>0,'actual Glow standings did not derive any rows');
  assert.match(standingsNode.innerHTML,/<table>/);
  assert.match(standingsNode.innerHTML,/#1/);
  assert.doesNotMatch(standingsNode.innerHTML,/No scores yet/);
  for(const row of rows)assert.ok(standingsNode.innerHTML.includes(glowContext.escapeHtml(row.name)),
    'actual Glow-rendered table is missing '+row.name);
  // Cart currently asks an independent canonical live_status adapter for entries.
  // Supplying that adapter here is an EXPLICIT fixture seam, NOT proof of the
  // real upstream projection or automatic Cloudflare/Opal/Matrix delivery.
  const captured=[],reads=[];
  const fakeLive={active:true,label:'GLOW',entries:rows.map(r=>r.name+' '+r.total)};
  const cartContext={
    console,
    setFeatureStatus:()=>{},renderScoreActionStatus:()=>{},
    canonicalRead:async(action)=>{reads.push(action);return {updated_at:'fixture-rev',live:fakeLive}},
    updateScoreNetworkTruth:()=>{},updateDisplayedLiveSnapshot:()=> 'Fixture revision',
    canonicalOverlayBridge:()=>({overlay:async(type,payload,ttl)=>{
      captured.push({type,payload,ttl});return {accepted:true,acknowledged:false};
    }}),
    matrixLiveSourceRevisionStatus:async()=> 'Not device verified',
    renderScorePathStatus:()=>{}
  };
  vm.runInNewContext(block(cartJs,'async function showScoreboard()','async function showManualScoreboard()')+
    '\nthis.sendActualCartScoreboard=showScoreboard;',cartContext,{timeout:1000});
  await cartContext.sendActualCartScoreboard();
  assert.deepEqual(reads,['live_status']);
  assert.equal(captured.length,1);
  assert.equal(captured[0].type,'scoreboard');
  assert.equal(captured[0].payload.label,'GLOW');
  assert.deepEqual(Array.from(captured[0].payload.entries),fakeLive.entries.slice(0,12));
  assert.ok(captured[0].ttl>=8000&&captured[0].ttl<=30000);
  // Fail-closed: unproven root -> canonical live_status adapter must NOT be
  // mistaken for real automatic Cart integration.
  let unsafeOverlay=0;
  const missingAdapter={...cartContext,
    canonicalRead:async()=>({updated_at:'fixture-rev',live:null}),
    canonicalOverlayBridge:()=>({overlay:async()=>{unsafeOverlay++;return {accepted:true}}})};
  vm.runInNewContext(block(cartJs,'async function showScoreboard()','async function showManualScoreboard()')+
    '\nthis.sendActualCartScoreboard=showScoreboard;',missingAdapter,{timeout:1000});
  await assert.rejects(()=>missingAdapter.sendActualCartScoreboard(),/No active Skins or Glow scores/);
  assert.equal(unsafeOverlay,0);
  console.log('OFFLINE_CHAIN=PASS XLSX→scheduled sync→Glow real standings HTML→Cart overlay with test-only live_status injection');
  console.log('UNPROVEN_LINK=real root→canonical live_status projection, Cart relay/device receipt and physical display NOT TESTED');
});


test('source-pinned Cart v35 chooseLive projects three cached UDisc teams and 3→4 hole-two correction into actual Cart showScoreboard',async()=>{
  // Cached 2026-04-18 published anonymized UDisc fixture, not owner Oct30 XLSX.
  // Exact archived Cart v35 live.ts is copied without byte modification from
  // PR130 source SHA 6457ab65..., blob b5f72cc38269bfdad3feea8446ea32e389eea345.
  // No network, device, Supabase project, or active Nov3 week is read or mutated.
  const {chooseLive,laDate}=await import('./fixtures/hbnf-cart-control-v35-live.ts');
  const vm=(await import('node:vm')).default;
  const actualCart=await readFile(new URL('../source-snapshots/hbnf-worker-d1a5f936-20261024/public/hbnf-cart-features.mjs',import.meta.url),'utf8');
  const start=actualCart.indexOf('async function showScoreboard()');
  const end=actualCart.indexOf('async function showManualScoreboard()',start);
  assert.ok(start>=0&&end>start,'missing source-bound Cart scoreboard implementation');
  const cartSource=actualCart.slice(start,end);
  const three=fixture.rows.slice(0,3).map(row=>({...row}));
  assert.equal(three.length,3);
  assert.equal(Number(three[0].hole_2),3,'fixture must start at original hole two 3');

  const workbook={value:workbookBytes(three)};
  const fake=makeFetch(glowWithWeek(),workbook);
  const first=await runGlowSync(env,{fetch:fake.fetch,now});
  assert.equal(first.disposition,'updated');
  assert.equal(fake.root.glow.weeks[eventDate].players.length,3);
  assert.equal(fake.calls.udisc,1);
  assert.equal(fake.calls.writes,1);

  // Actual Cart chooses the local-calendar-day week, so remap ONLY the isolated
  // fixture week's key. This does not alter a real calendar, event, or user week.
  const selectedDate=laDate();
  const makeProjection=()=>({
    glow:{activeWeek:selectedDate,weeks:{[selectedDate]:structuredClone(fake.root.glow.weeks[eventDate])}},
    skins:{...fake.root.skins}
  });
  const before=chooseLive(makeProjection());
  assert.equal(before.active,true);
  assert.equal(before.label,'GLOW');
  assert.equal(before.event,'glow');
  assert.equal(before.entries.length,3);
  assert.ok(before.entries.every(x=>typeof x==='string'&&x.length>0));

  // Apply the retained "hole 2 = 4" scenario, but via local workbookBytes,
  // not by requesting the external UDisc export (which previously hung).
  const corrected=three.map((row,i)=>i===0
    ?{...row,hole_2:4,event_total_score:Number(row.event_total_score)+1,
      round_total_score:Number(row.round_total_score)+1}
    :row);
  workbook.value=workbookBytes(corrected);
  const updated=await runGlowSync(env,{fetch:fake.fetch,now});
  assert.equal(updated.disposition,'updated');
  assert.equal(fake.calls.udisc,2);
  assert.equal(fake.calls.writes,2);
  const persisted=fake.root.glow.weeks[eventDate];
  assert.equal(persisted.players.length,3);
  assert.equal(persisted.players[0].scores[1],'4','isolated score readback must show hole two 4');
  assert.equal(fake.root.skins.unchanged,true,'Skins must remain unchanged');
  const after=chooseLive(makeProjection());
  assert.equal(after.active,true);
  assert.equal(after.label,'GLOW');
  assert.equal(after.entries.length,3);
  assert.notEqual(after.entries[0],before.entries[0],'hole two correction must change projected score');
  assert.deepEqual(after.entries.slice(1),before.entries.slice(1),'unaffected team projections stable');

  const seen=[],readActions=[];
  const context={
    console,setFeatureStatus:()=>{},renderScoreActionStatus:()=>{},
    canonicalRead:async(action)=>{
      readActions.push(action);
      assert.equal(action,'live_status');
      return {updated_at:'local-fixture-only',live:after};
    },
    updateScoreNetworkTruth:()=>{},
    updateDisplayedLiveSnapshot:()=> 'Local fixture revision only',
    canonicalOverlayBridge:()=>({overlay:async(type,payload,ttl)=>{
      seen.push({type,payload,ttl});
      return {accepted:true,acknowledged:false};
    }}),
    matrixLiveSourceRevisionStatus:async()=> 'Not physically verified',
    renderScorePathStatus:()=>{}
  };
  vm.runInNewContext(cartSource+'\nthis.actualShowScoreboard=showScoreboard;',context,{timeout:1000});
  await context.actualShowScoreboard();
  assert.deepEqual(readActions,['live_status']);
  assert.equal(seen.length,1);
  assert.equal(seen[0].type,'scoreboard');
  assert.equal(seen[0].payload.label,'GLOW');
  assert.deepEqual(Array.from(seen[0].payload.entries),after.entries.slice(0,12));
  assert.ok(seen[0].ttl>=8000&&seen[0].ttl<=30000);
  assert.notDeepEqual(seen[0].payload.entries,before.entries);

  // A 3-team parsed preview or "Saved" text is not automatically a Cart feed.
  // Missing/suppressed live data must not cause a bogus overlay.
  const blockedContext={...context,
    canonicalRead:async()=>({updated_at:'local-fixture-only',live:chooseLive({glow:{weeks:{}},skins:{}})}),
    canonicalOverlayBridge:()=>({overlay:async()=>{throw Error('unconfirmed feed sent to Cart')}})};
  vm.runInNewContext(cartSource+'\nthis.actualShowScoreboard=showScoreboard;',blockedContext,{timeout:1000});
  await assert.rejects(()=>blockedContext.actualShowScoreboard(),/No active Skins or Glow scores/);

  console.log('CHOOSE_LIVE_CHAIN=PASS cached anonymized 3-team XLSX→real UDisc handler→3→4 isolated readback→exact archived Cart v35 chooseLive→real Cart showScoreboard→fake overlay');
  console.log('CHOOSE_LIVE_LIMITS=Cart v35 source byte-equal to authenticated installed Edge v35 readback (Nov1); production handler invocation, Cart relay/device output, and owner confirmation NOT TESTED');
});
