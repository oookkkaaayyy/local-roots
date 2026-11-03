import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/glow.html',import.meta.url),'utf8');
const extract=(start,end)=>{const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert(a>=0&&b>a,'actual Glow financial function remains extractable');
 return html.slice(a,b);
};
const complete=(a=18)=>Array.from({length:18},(_,i)=>i<a?'3':'');
const week=scores=>({date:'2026-11-03',players:scores.map((values,i)=>({
 id:'T'+(i+1),partner1:'Player '+(i+1),partner2:'Partner '+(i+1),removed:false,scores:values
})),cards:[{id:'C1',finalized:false,players:[]}]});
const source=extract('function settledTeamsForWeek(w){','function winterSummaryRows(){');
const context=vm.createContext({
 completedHoles:p=>p.scores.filter(v=>String(v).trim()!=='').length,
 uniqueTeamParts:p=>[p.partner1,p.partner2].filter(Boolean),
 scoredTeamsForWeek:w=>w.players.filter(p=>p.scores.some(Boolean)).map(p=>({player:p,partners:[p.partner1,p.partner2]}))
});
vm.runInContext(source,context);
test('actual Glow settled teams ignore incomplete three-hole real or QI test cards',()=>{
 const incomplete=week([complete(3),complete(3),complete(3)]);
 assert.equal(vm.runInContext('settledTeamsForWeek',context)(incomplete).length,0);
 const mixed=week([complete(18),complete(17)]);
 assert.equal(vm.runInContext('settledTeamsForWeek',context)(mixed).length,0);
 const completeWeek=week([complete(),complete()]);
 assert.equal(vm.runInContext('settledTeamsForWeek',context)(completeWeek).length,2);
});
test('Glow ace-pot carry and summer winner payouts use only complete source weeks',()=>{
 assert.match(html,/function aceStateBeforeWeek\([^)]*\)[^\n]*applyAceWeekToState\(st,w,key,true\)/);
 assert.match(html,/function computeGlowFinancials\(\)[^\n]*const teams=settledTeamsForWeek\(w\);const aceInfo=applyAceWeekToState\(aceState,w,key,true\)/);
 const ace=extract('function applyAceWeekToState(st,w,key,settlementOnly=false){','function acePreviewForWeek(w,targetKey){');
 const state=vm.createContext({
 playerCountForWeek:w=>w.players.length*2,
 scoredTeamsForWeek:w=>w.players.filter(p=>p.scores.some(Boolean)).map(p=>({player:p})),
 settledTeamsForWeek:vm.runInContext('settledTeamsForWeek',context),
 cloneAceState:s=>({...s}),
 routeAceMoney:(s,count)=>{s.reserve+=count;return{toReserve:count,toMain:0}},
 aceWinnersForWeek:()=>[],
 GLOW_ACE_RULE_BASE_AFTER:'2026-06-20',GLOW_ACE_SHARE:3,GLOW_ACE_FIRST_RESERVE_TARGET:200
 });
 vm.runInContext(ace,state);
 const fn=vm.runInContext('applyAceWeekToState',state);
 const partial=week([complete(3),complete(3)]);
 const a={main:500,reserve:79,mode:'reserve',mainTarget:500,reserveTarget:200};
 const settled=fn({...a},partial,'2026-11-03',true);
 assert.equal(settled.addedToAcePot,0);
 const preview=fn({...a},partial,'2026-11-03',false);
 assert.equal(preview.addedToAcePot,12);
});
test('all historic fully scored even if unlocked remain eligible without forcing new finalized flag',()=>{
 const historical=week([complete(18)]);
 historical.date='2026-09-02';historical.scoresLocked=false;historical.cards[0].finalized=false;
 assert.equal(vm.runInContext('settledTeamsForWeek',context)(historical).length,1);
});
