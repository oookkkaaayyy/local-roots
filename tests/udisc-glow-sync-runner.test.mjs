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
