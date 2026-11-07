import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const source=process.env.HBNF_QUICK_IMPORT_SOURCE || fileURLToPath(new URL('../public/glow.html',import.meta.url));
const html=await readFile(source,'utf8');
const names=['splitImportedTeamName','normalizeImportHeader','importField','udiscRowsToImportRows','previewQuickUdiscImport','confirmQuickUdiscImport'];
const functions=names.map(name=>{
 const prefix=(name==='previewQuickUdiscImport'?'async ':'')+'function '+name+'(';
 const found=html.split('\n').find(line=>line.startsWith(prefix));
 assert(found,'actual Glow page function is present: '+name);
 return found;
}).join('\n');
const partial={name:'Mason / Tony',hole_1:'3',hole_2:'4',round_total_score:'58',position:'DNF'};
function fixture(){
 const date='2026-11-03';
 const week={date,players:[{id:'ORIGINAL',partner1:'Mason',partner2:'Tony',cardId:'C3',scores:['3','4',...Array(16).fill('')]}],
 cards:[{id:'C3',finalized:true,players:[{id:'ORIGINAL',partner1:'Mason',partner2:'Tony'}]}],
 scoresLocked:true,tiebreakerWinner:'ORIGINAL',aceWinner:'Mason',acePots:{main:500,reserve:200},
 payouts:{winner:20},udiscSync:{eventId:'known-event',latest:{signature:'prior-import'}}};
 const root={glow:{weeks:{[date]:week}},skins:{winner:'historical'},bagTags:{manual:{Mason:2}},history:{previous:'preserved'}};
 const state={activeWeek:date,weeks:{[date]:week},playerAliases:{saved:'alias'}};
 const writes={alias:0,local:0,remote:0,render:0,pages:0};
 const nodes={'#quickUdiscFileInput':{files:[{name:'partial.xlsx'}]},'#quickImportPreview':{style:{display:'none'},innerHTML:''},'#quickImportConfirmBtn':{disabled:true},'#quickImportStatus':{textContent:''}};
 const ctx={state,rootState:root,remoteUpdatedAt:'rev1',quickImportRows:[],saveCoordinator:{hasPending:true},renderAll(){writes.render++},pushRoot(){writes.remote++}};
 const context={ctx,qs:s=>{
 if(s.startsWith('[data-quick-import-player]'))return {value:s.includes('data-import-part="0"')?'Mason':'Tony'};
 return nodes[s]||null;
 },getWeek:()=>week,saveImportAlias(){writes.alias++},saveLocal(){writes.local++},setActivePage(){writes.pages++},
 confirm:()=>true,alert:()=>{},prettyDate:s=>s,mk:(id,partner1,partner2)=>({id,partner1,partner2}),
 teamName:p=>[p.partner1,p.partner2].join(' / '),teamParts:p=>[p.partner1,p.partner2],
 readQuickImportFile:async()=>[],guessImportAliasName:n=>n,escapeHtml:x=>String(x),escapeAttr:x=>String(x)};
 vm.createContext(context);
 vm.runInContext(functions+'\nglobalThis.__actual={parse:udiscRowsToImportRows,preview:previewQuickUdiscImport,confirm:confirmQuickUdiscImport}',context);
 return {week,root,state,ctx,context,nodes,writes,actual:context.__actual};
}
const snapshot=x=>JSON.stringify(x);
const noWrites=f=>assert.deepEqual(f.writes,{alias:0,local:0,remote:0,render:0,pages:0});

test('actual page cannot invent hole 1 from total-only UDisc export',()=>{
 const f=fixture();assert.throws(()=>f.actual.parse([{name:'Mason / Tony',round_total_score:'58'}]),/hole-level|aggregate total/);
});
test('partial export retains only real hole strokes rather than reported full total',()=>{
 const f=fixture(),rows=f.actual.parse([partial]);
 assert.equal(rows.length,1);assert.equal(rows[0].scores[0],'3');assert.equal(rows[0].scores[1],'4');
 assert.deepEqual(Array.from(rows[0].scores.slice(2)),Array(16).fill(''));assert.equal(rows[0].total,7);
});
test('duplicate UDisc identities and invalid holes fail closed',()=>{
 const f=fixture();
 assert.throws(()=>f.actual.parse([partial,partial]),/Duplicate/);
 assert.throws(()=>f.actual.parse([{...partial,hole_3:'DNF'}]),/Invalid hole/);
});
test('actual page preview remains disabled even for partial XLSX with suggested mappings',async()=>{
 const f=fixture(),before=snapshot(f.root);
 f.context.readQuickImportFile=async()=>[partial];await f.actual.preview();
 assert.equal(f.nodes['#quickImportConfirmBtn'].disabled,true);
 assert.match(f.nodes['#quickImportStatus'].textContent,/Read-only preview/);
 assert.equal(snapshot(f.root),before);noWrites(f);
});
test('actual Confirm cannot replace finalized/scored week or modify money, tags, winners and history',()=>{
 const f=fixture(),before=snapshot({root:f.root,state:f.state});
 f.ctx.quickImportRows=f.actual.parse([partial]);
 assert.equal(f.actual.confirm(),false);
 assert.equal(snapshot({root:f.root,state:f.state}),before);noWrites(f);
 assert.equal(f.nodes['#quickImportConfirmBtn'].disabled,true);
});
test('repeat, corrected partial export and missing event binding never write or create QI identities',()=>{
 const f=fixture(),before=snapshot({root:f.root,state:f.state});
 for(const row of [partial,partial,{...partial,hole_1:'5'}]){
 f.ctx.quickImportRows=f.actual.parse([row]);
 assert.equal(f.actual.confirm(),false);
 }
 assert.equal(snapshot({root:f.root,state:f.state}),before);noWrites(f);
});
test('stale server revision plus pending local draft cannot be overwritten by direct handler call',()=>{
 const f=fixture(),before=snapshot({root:f.root,state:f.state});
 f.ctx.remoteUpdatedAt='stale-revision';
 f.ctx.saveCoordinator={hasPending:true,pending:{branchState:{weeks:{'2026-11-03':{draft:'5'}}}}};
 f.ctx.quickImportRows=f.actual.parse([{...partial,hole_2:'6'}]);
 assert.equal(f.actual.confirm(),false);noWrites(f);
 assert.equal(snapshot({root:f.root,state:f.state}),before);
 assert.equal(f.ctx.saveCoordinator.pending.branchState.weeks['2026-11-03'].draft,'5');
});
