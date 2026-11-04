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
const source=extract('function isSept02FixtureWeek(w,key){','function winterSummaryRows(){');
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
 assert.match(html,/function computeGlowFinancials\(\)[^\n]*const teams=settledTeamsForWeek\(w,key\);const aceInfo=applyAceWeekToState\(aceState,w,key,true\)/);
 const ace=extract('function applyAceWeekToState(st,w,key,settlementOnly=false){','function acePreviewForWeek(w,targetKey){');
 const state=vm.createContext({
 playerCountForWeek:w=>w.players.length*2,
 scoredTeamsForWeek:w=>w.players.filter(p=>p.scores.some(Boolean)).map(p=>({player:p})),
 settledTeamsForWeek:vm.runInContext('settledTeamsForWeek',context),
 isSept02FixtureWeek:vm.runInContext('isSept02FixtureWeek',context),
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

test('September 2 six fully scored Fixture teams are excluded from genuine financial settlement',()=>{
 const fake=week([complete(18),complete(18),complete(18),complete(18),complete(18),complete(18)]);
 fake.date='2026-09-02';
 fake.players.forEach((p,i)=>{p.id='G'+(i+1);p.name='Fixture Test '+(i+1)+' / Fixture Partner';});
 const real=week([complete(18)]);real.date='2026-09-02';
 const settle=vm.runInContext('settledTeamsForWeek',context);
 assert.equal(settle(fake,'2026-09-02').length,0);
 assert.equal(settle(real,'2026-09-02').length,1,'genuine source on that date is not blanket-excluded');
 fake.players[0].name='Real Player / Real Partner';
 assert.equal(settle(fake,'2026-09-02').length,0,'mixed source is quarantined pending review');
 assert.equal(settle(fake,'2026-08-22').length,6,'other valid dates remain unaffected');
});
test('synthetic Fixture ace contributions and cash winner entries are zero on actual settlement path',()=>{
 const fake=week([complete(18),complete(18)]);fake.date='2026-09-02';
 fake.players.forEach((p,i)=>{p.name='Fixture Player '+i+' / Fixture Partner';});
 const state=vm.createContext({
 playerCountForWeek:w=>w.players.length*2,
 scoredTeamsForWeek:w=>w.players.filter(p=>p.scores.some(Boolean)).map(p=>({player:p})),
 isSept02FixtureWeek:vm.runInContext('isSept02FixtureWeek',context),
 settledTeamsForWeek:vm.runInContext('settledTeamsForWeek',context),
 cloneAceState:x=>({...x}),
 routeAceMoney:(s,count)=>{s.reserve+=count;return{toReserve:count,toMain:0}},
 aceWinnersForWeek:()=>[],GLOW_ACE_RULE_BASE_AFTER:'2026-06-20',
 GLOW_ACE_SHARE:3,GLOW_ACE_FIRST_RESERVE_TARGET:200
 });
 vm.runInContext(extract('function applyAceWeekToState(st,w,key,settlementOnly=false){',
  'function acePreviewForWeek(w,targetKey){'),state);
 const a={main:500,reserve:79,mode:'reserve',mainTarget:500,reserveTarget:200};
 const result=vm.runInContext('applyAceWeekToState',state)({...a},fake,'2026-09-02',true);
 assert.equal(result.count,0);
 assert.equal(result.addedToAcePot,0);
 assert.equal(result.acePayout,0);
 assert.equal(result.availableEnd,500);
 assert.equal(result.reserveEnd,79);
 const preview=vm.runInContext('applyAceWeekToState',state)({...a},fake,'2026-09-02',false);
 assert.equal(preview.count,0,'historical UI ace preview also excludes synthetic entrants');
 assert.equal(preview.addedToAcePot,0,'historical UI preview cannot reintroduce fake $3 entries');
 assert.equal(preview.availableEnd,500);
 assert.match(html,/const teams=settledTeamsForWeek\(w,key\)/);
 assert.match(html,/September 2 synthetic Fixture data is retained for audit only/);
});
test('glow 2026 PAR standings exclude September 2 Fixture trophy, while retaining historic audit',()=>{
 const fixture=week([complete(18)]);fixture.date='2026-09-02';
 fixture.players[0].name='Fixture Jason / Fixture Partner A';
 const audit=[{partners:['Fixture Jason','Fixture Partner A'],raw:54,rel:-6}];
 const state={weeks:{'2026-09-02':fixture},trophyHistory:{'2026-09-02':audit}};
 const before=JSON.stringify(state);
 const c=vm.createContext({
 ctx:{state},isSept02FixtureWeek:vm.runInContext('isSept02FixtureWeek',context),
 GLOW_2026_TROPHY_SEED:{},GLOW_REMOVED_WEEK_DATES:[],
 hbnfMergeTrophyHistory:(a,b)=>({...a,...b}),
 hbnfApplyAuthoritativeTrophySeed:x=>({...x}),
 hbnfWeekToTrophyRows:()=>audit,canonicalGlowName:x=>x
 });
 vm.runInContext(extract('function glow2026ParRows(){','function renderLegacyPanels(){'),c);
 assert.equal(vm.runInContext('glow2026ParRows',c)().length,0);
 assert.equal(JSON.stringify(state),before,'the permanent fixture history was not deleted');
});

test('Nov3 actual-score-derived team ranks are competition ranks 1/T2/T2/4 shared by both partners',()=>{
 const teams=[
  {player:{id:'A',cardId:'C1'},partners:['Fox','Jason'],total:48,relTotal:-11},
  {player:{id:'B',cardId:'C1'},partners:['Andrew','Matt'],total:52,relTotal:-7},
  {player:{id:'C',cardId:'C1'},partners:['Kyle','Dylan'],total:52,relTotal:-7},
  {player:{id:'D',cardId:'C1'},partners:['Karl','Tony'],total:57,relTotal:-2}
 ];
 const c=vm.createContext({
  scoredTeamsForWeek:()=>teams,
  hbnfFlatMap:(items,fn)=>items.flatMap(fn)
 });
 vm.runInContext(extract('function standingsForWeek(w){','function weekHasScores(w){'),c);
 const standings=vm.runInContext('standingsForWeek',c)({scoresLocked:true,cards:[{id:'C1',finalized:true}]});
 assert.deepEqual(Array.from(standings,r=>r.rankLabel),['1','1','T2','T2','T2','T2','4','4']);
 assert.deepEqual(Array.from(standings,r=>r.rank),[1,1,2,2,2,2,4,4]);
 assert.deepEqual(Array.from(standings.filter(r=>r.isTeamLead),r=>r.teamName),
  ['Fox / Jason','Andrew / Matt','Kyle / Dylan','Karl / Tony']);
 assert.equal(standings.every(r=>r.status==='Finalized'),true);
});
test('Nov3 rank UI shows team-first dashboard and shared teammate rank in standings, not individual indexes',()=>{
 assert.match(html,/const dashboardTeams=weekRows\.filter\(r=>r\.isTeamLead\)/);
 assert.match(html,/dashboardTeams\.slice\(0,5\)\.map\(r=>/);
 assert.match(html,/\$\{r\.rankLabel\}<\/span><\/td><td>\$\{escapeHtml\(r\.teamName\)\}/);
 assert.match(html,/weekRows\.map\(r=>/);
 assert.doesNotMatch(html,/weekRows\.map\(\(r,i\)=>/);
});
test('all modeled Glow monetary panels clearly disclaim unverified collections, ace balances and disbursements',()=>{
 const payout=extract('function renderPayout(){','function glowScorecardTagLabel(');
 const history=extract('function renderLegacyPanels(){','function makeStandingTablesScrollable(){');
 const dashboard=extract('function renderGlowDashboard(){','function renderStandings(){');
 for(const [name,src] of [['payout',payout],['history',history],['dashboard',dashboard]]){
  assert.match(src,/PROJECTED \/ UNVERIFIED/,name+' must disclaim cash');
 }
 assert.match(payout,/October 24 Jason ace: \$500 already PAID, \$0 owed/);
 assert.match(payout,/Ace payout \(PROJECTED \/ UNVERIFIED, not paid record\)/);
 assert.match(history,/Main Ace Pot \(PROJECTED \/ UNVERIFIED\)/);
 assert.match(history,/Summer Payout \(PROJECTED \/ UNVERIFIED\)/);
 assert.match(history,/Reserve \(PROJECTED \/ UNVERIFIED\)/);
 assert.match(dashboard,/Winner Pool \(PROJECTED \/ UNVERIFIED\)/);
 assert.match(dashboard,/Ace Pot \(PROJECTED \/ UNVERIFIED\)/);
 assert.match(dashboard,/Award not verified paid/);
});
