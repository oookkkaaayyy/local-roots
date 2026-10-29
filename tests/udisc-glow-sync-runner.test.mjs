import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deflateRawSync} from 'node:zlib';
import {runGlowSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/index.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/authentic-udisc/2026-04-18.json', import.meta.url),'utf8'));
const eventId='hb-night-flyers-hb-glow-doubles-ZUDJEk';
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

const scheduleHtml=`<a href="https://udisc.com/events/${eventId}/leaderboard">Sat, Apr 18, 2026 HB Glow Doubles</a>`;
const initializedWeek={date:'2026-04-18',activeWeek:'2026-04-18',scoresLocked:false,cards:[{id:'C1',finalized:false,players:[]}],players:[],scorecardText:{holePars:{1:'3'}},entryFee:5,payoutPercent:100,aceWinner:'',tiebreakerWinner:''};

test('scheduled runner applies fixture scores through a mocked atomic RPC and correction/replay simulations', async () => {
  const aliases={};
  for(const row of fixture.rows) for(const name of row.name.split(/\s*&\s*/)) aliases[name]=name;
  let state={glow:{weeks:{'2026-04-18':structuredClone(initializedWeek)},activeWeek:'2026-04-18',playerAliases:aliases}};
  let rpcCalls=0;
  let activeWorkbook=workbookBytes();
  const fetchMock=async (input,init={})=>{
    const url=String(input);
    if(url==='https://udisc.com/leagues/hb-night-flyers-he7y5I/schedule') return new Response(scheduleHtml,{status:200,headers:{'Content-Type':'text/html'}});
    if(url===`https://udisc.com/events/${eventId}/leaderboard/export`) return new Response(activeWorkbook,{status:200,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
    if(url.includes('/rest/v1/league_state?')) return Response.json([{state_json:state}]);
    if(url.endsWith('/rest/v1/rpc/hbnf_apply_udisc_glow_week')) {
      rpcCalls++;
      const body=JSON.parse(init.body);
      assert.equal(body.p_week_date,'2026-04-18');
      assert.equal(body.p_expected_active_week,state.glow.activeWeek);
      state={...state,glow:{...state.glow,weeks:{...state.glow.weeks,[body.p_week_date]:body.p_replacement_week},activeWeek:body.p_week_date}};
      return Response.json({applied:true});
    }
    throw Error(`Unexpected simulated request ${url}`);
  };
  const env={SUPABASE_URL:'https://project.example',SUPABASE_SERVICE_ROLE_KEY:'test-only'};
  const now=()=>new Date('2026-04-19T01:00:00.000Z');
  const first=await runGlowSync(env,{fetch:fetchMock,now});
  assert.equal(first.disposition,'updated');
  assert.equal(first.teamCount,fixture.rows.length);
  assert.equal(rpcCalls,1);
  assert.equal(state.glow.activeWeek,'2026-04-18');
  assert.equal(state.glow.weeks['2026-04-18'].players[0].scores.length,18);

  const replay=await runGlowSync(env,{fetch:fetchMock,now});
  assert.equal(replay.disposition,'unchanged');
  assert.equal(rpcCalls,1);

  const corrected=fixture.rows.map((row,index)=>index===0?{...row,hole_1:Number(row.hole_1)+1,event_total_score:Number(row.event_total_score)+1}:row);
  activeWorkbook=workbookBytes(corrected);
  const correction=await runGlowSync(env,{fetch:fetchMock,now});
  assert.equal(correction.disposition,'updated');
  assert.equal(rpcCalls,2);
  assert.equal(state.glow.weeks['2026-04-18'].udiscSync.history.length,1);
  assert.equal(state.glow.weeks['2026-04-18'].players[0].scores[0],String(corrected[0].hole_1));
});

test('scheduled runner skips when there is no event for the local date and never reads Glow', async () => {
  let calls=0;
  const fetchMock=async()=>{calls++;return new Response('<html></html>',{status:200,headers:{'Content-Type':'text/html'}});};
  const result=await runGlowSync({}, {fetch:fetchMock,now:()=>new Date('2026-04-19T16:00:00.000Z')});
  assert.equal(result.disposition,'no_event');
  assert.equal(calls,1);
});

test('scheduled runner will not switch the active Glow week or create an uninitialized week', async () => {
  const aliases={};
  for(const row of fixture.rows) for(const name of row.name.split(/\s*&\s*/)) aliases[name]=name;
  let rpcCalls=0,readCalls=0;
  const fetchMock=async input=>{
    const url=String(input);
    if(url==='https://udisc.com/leagues/hb-night-flyers-he7y5I/schedule')return new Response(scheduleHtml,{status:200,headers:{'Content-Type':'text/html'}});
    if(url.endsWith('/leaderboard/export'))return new Response(workbookBytes(),{status:200,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
    if(url.includes('/rest/v1/league_state?')){readCalls++;return Response.json([{state_json:{glow:{weeks:{'2026-04-18':{date:'2026-04-18',players:[],cards:[]}},activeWeek:'2026-04-19',playerAliases:aliases}}}]);}
    if(url.endsWith('/hbnf_apply_udisc_glow_week')){rpcCalls++;return Response.json({applied:true});}
    throw Error('Unexpected simulated request');
  };
  const result=await runGlowSync({SUPABASE_URL:'https://project.example',SUPABASE_SERVICE_ROLE_KEY:'test-only'},{fetch:fetchMock,now:()=>new Date('2026-04-19T01:00:00.000Z')});
  assert.equal(result.disposition,'active_week_mismatch');
  assert.equal(readCalls,1);assert.equal(rpcCalls,0);

  const noWeekFetch=async(input,init)=>{
    const url=String(input);
    if(url==='https://udisc.com/leagues/hb-night-flyers-he7y5I/schedule')return new Response(scheduleHtml,{status:200,headers:{'Content-Type':'text/html'}});
    if(url.endsWith('/leaderboard/export'))return new Response(workbookBytes(),{status:200,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
    if(url.includes('/rest/v1/league_state?'))return Response.json([{state_json:{glow:{weeks:{},activeWeek:'2026-04-18',playerAliases:aliases}}}]);
    if(url.endsWith('/hbnf_apply_udisc_glow_week')){rpcCalls++;return Response.json({applied:true});}
    throw Error(`Unexpected simulated request ${url}`);
  };
  const missing=await runGlowSync({SUPABASE_URL:'https://project.example',SUPABASE_SERVICE_ROLE_KEY:'test-only'},{fetch:noWeekFetch,now:()=>new Date('2026-04-19T01:00:00.000Z')});
  assert.equal(missing.disposition,'week_not_initialized');assert.equal(rpcCalls,0);
});

test('runner rejects identity ambiguity before invoking the write RPC', async () => {
  const aliases={};
  for(const row of fixture.rows) for(const name of row.name.split(/\s*&\s*/)) aliases[name]=name;
  const duplicate=fixture.rows[0].name.split(/\s*&\s*/)[0];
  aliases[duplicate.toLocaleLowerCase()]='CONFLICTING_CANONICAL';
  let rpcCalls=0;
  const fetchMock=async input=>{
    const url=String(input);
    if(url==='https://udisc.com/leagues/hb-night-flyers-he7y5I/schedule')return new Response(scheduleHtml,{status:200,headers:{'Content-Type':'text/html'}});
    if(url.endsWith('/leaderboard/export'))return new Response(workbookBytes(),{status:200,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
    if(url.includes('/rest/v1/league_state?'))return Response.json([{state_json:{glow:{weeks:{'2026-04-18':structuredClone(initializedWeek)},activeWeek:'2026-04-18',playerAliases:aliases}}}]);
    if(url.endsWith('/hbnf_apply_udisc_glow_week')){rpcCalls++;return Response.json({applied:true});}
    throw Error('Unexpected simulated request');
  };
  await assert.rejects(()=>runGlowSync({SUPABASE_URL:'https://project.example',SUPABASE_SERVICE_ROLE_KEY:'test-only'},{fetch:fetchMock,now:()=>new Date('2026-04-19T01:00:00.000Z')}),/one-time review/);
  assert.equal(rpcCalls,0);
});
