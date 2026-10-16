import test from 'node:test';
import assert from 'node:assert/strict';
import { detectClubMoments, planClubMomentOverlay } from './moments.mjs';
const BEFORE = '2026-10-16T16:59:30.000Z';
const AFTER = '2026-10-16T17:00:00.000Z';
const NOW = Date.parse(AFTER) + 1000;
function state() {
  const participant = [{ id:'c1_p_0',name:'Alex' },{ id:'c1_p_1',name:'Ben' }];
  const front = [{id:'c1',participants:participant,holes:Array.from({length:9},(_,i)=>({hole:i+1,winner_id:'',winner_name:''})),tiebreaker:{winner_id:'',winner_name:'',carry:2}}];
  const back = [{id:'c2',participants:[{id:'c2_team_0',name:'Alex / Ben'}],holes:Array.from({length:9},(_,i)=>({hole:i+10,winner_id:'',winner_name:''})),tiebreaker:{winner_id:'',winner_name:'',carry:1}}];
  return {round_date:'2026-10-16',updated_at:BEFORE,sections:{front,back},ace:{front:{winner_name:'',participants:[{id:'Alex',name:'Alex'},{id:'Ben',name:'Ben'}]},back:{winner_name:'',participants:[{id:'Alex',name:'Alex'},{id:'Ben',name:'Ben'}]}}};
}
function pair(change) {const before=state(),after=structuredClone(before);after.updated_at=AFTER;change(after);return [before,after]}
const scan = (a,b,opts={}) => detectClubMoments(a,b,{now:NOW,...opts});
const gate = e => ({now:NOW,authoritativeReadConfirmed:true,cartOnline:true,matrixObservedReady:true,ownerAllowsMoments:true,guestCloudPathQualified:true,gameActive:false,ownerTextActive:false,activeOverlays:[],acknowledgedIds:[],...e});

test('new authoritative hole winner makes one short, bounded moment',()=>{
  const [a,b]=pair(s=>Object.assign(s.sections.front[0].holes[0],{winner_id:'c1_p_0',winner_name:'Alex'}));
  const r=scan(a,b);assert.equal(r.length,1);assert.deepEqual([r[0].kind,r[0].text,r[0].priority],['hole','ALEX WINS H1',40]);
  assert.ok(r[0].text.length<=31);assert.match(r[0].id,/^club-[a-f0-9]{16}$/);
});
test('first observation, duplicate identical read and clock regression never celebrate',()=>{
  const [a,b]=pair(s=>Object.assign(s.sections.front[0].holes[0],{winner_id:'c1_p_0',winner_name:'Alex'}));
  assert.deepEqual(scan(null,b),[]);assert.deepEqual(scan(b,b),[]);assert.deepEqual(scan(b,a),[]);
});
test('known winner corrected to another winner is not a fresh award',()=>{
  const [a,b]=pair(s=>Object.assign(s.sections.front[0].holes[0],{winner_id:'c1_p_1',winner_name:'Ben'}));
  a.sections.front[0].holes[0].winner_id='c1_p_0';a.sections.front[0].holes[0].winner_name='Alex';
  assert.deepEqual(scan(a,b),[]);
});
test('deleting a winner or ace does not celebrate',()=>{
  const [a,b]=pair(()=>{});a.sections.front[0].holes[0].winner_id='c1_p_0';a.sections.front[0].holes[0].winner_name='Alex';
  a.ace.front.winner_name='Alex';assert.deepEqual(scan(a,b),[]);
});
test('valid new ace outranks hole, uses separate visual and never depends on pot value',()=>{
  const [a,b]=pair(s=>{s.ace.front.winner_name='Ben';Object.assign(s.sections.front[0].holes[1],{winner_id:'c1_p_0',winner_name:'Alex'})});
  const r=scan(a,b);assert.deepEqual(r.map(e=>e.kind),['ace','hole']);assert.equal(r[0].text,'ACE! BEN');assert.equal(r[0].color,'#FFD066');
});
test('ace correction is not another celebration, unrelated participant rejected',()=>{
  let [a,b]=pair(s=>s.ace.front.winner_name='Ben');a.ace.front.winner_name='Alex';assert.deepEqual(scan(a,b),[]);
  [a,b]=pair(s=>s.ace.front.winner_name='INTRUDER');assert.deepEqual(scan(a,b),[]);
});
test('tiebreaker winner is sourced from known participants with positive carries',()=>{
  const [a,b]=pair(s=>Object.assign(s.sections.back[0].tiebreaker,{winner_id:'c2_team_0',winner_name:'Alex / Ben',carry:1}));
  const r=scan(a,b);assert.equal(r.length,1);assert.equal(r[0].kind,'tiebreaker');assert.match(r[0].text,/WINS TIEBREAK/);
  b.sections.back[0].tiebreaker.carry=0;assert.deepEqual(scan(a,b),[]);
});
test('unknown winner ID or freshly added card cannot create moment',()=>{
  const [a,b]=pair(s=>Object.assign(s.sections.front[0].holes[0],{winner_id:'outsider',winner_name:'Alex'}));assert.deepEqual(scan(a,b),[]);
  b.sections.front.push({...structuredClone(b.sections.front[0]),id:'newcard'});assert.deepEqual(scan(a,b),[]);
});
test('old scorecard, date switch, bad timestamps and bulk updates remain silent',()=>{
  const [a,b]=pair(s=>Object.assign(s.sections.front[0].holes[0],{winner_id:'c1_p_0',winner_name:'Alex'}));
  assert.deepEqual(scan(a,b,{now:NOW+121_000}),[]);b.round_date='2026-10-17';assert.deepEqual(scan(a,b),[]);
  b.round_date='2026-10-16';b.updated_at='untrusted';assert.deepEqual(scan(a,b),[]);b.updated_at=AFTER;
  for(let i=1;i<6;i++)Object.assign(b.sections.front[0].holes[i],{winner_id:'c1_p_0',winner_name:'Alex'});
  assert.deepEqual(scan(a,b),[]);
});
test('seen acknowledged IDs suppress replay without mutating caller state',()=>{
  const [a,b]=pair(s=>Object.assign(s.sections.front[0].holes[0],{winner_id:'c1_p_0',winner_name:'Alex'}));const id=scan(a,b)[0].id;
  const seen=[id];assert.deepEqual(scan(a,b,{seenIds:seen}),[]);assert.deepEqual(seen,[id]);
});
test('overlay proposal exactly matches qualified existing text contract and avoids global settings',()=>{
  const [a,b]=pair(s=>Object.assign(s.sections.front[0].holes[0],{winner_id:'c1_p_0',winner_name:'Alex'}));const m=scan(a,b)[0];
  const x=planClubMomentOverlay(m,gate());assert.deepEqual(x,{type:'OVERLAY_START',payload:{overlayId:m.id,kind:'text',priority:40,ttlMs:5500,data:{text:'ALEX WINS H1',color:'#B9FF72',fontIndex:4}}});
  assert.equal('brightness' in x.payload,false);assert.equal('scene' in x.payload,false);
});
test('never interrupt game, manual text, active overlay or unqualified/closed relay',()=>{
  const [a,b]=pair(s=>Object.assign(s.sections.front[0].holes[0],{winner_id:'c1_p_0',winner_name:'Alex'}));const m=scan(a,b)[0];
  const blockers=[{gameActive:true},{ownerTextActive:true},{activeOverlays:[{priority:1,expiresAt:NOW+10}]},{guestCloudPathQualified:false},{matrixObservedReady:false},{ownerAllowsMoments:false},{authoritativeReadConfirmed:false},{cartOnline:false},{activeOverlays:null},{acknowledgedIds:[m.id]}];
  for(const change of blockers)assert.equal(planClubMomentOverlay(m,gate(change)),null,JSON.stringify(change));
});
test('invalid or stale event never makes an overlay',()=>{
  const [a,b]=pair(s=>Object.assign(s.sections.front[0].holes[0],{winner_id:'c1_p_0',winner_name:'Alex'}));const m=scan(a,b)[0];
  assert.equal(planClubMomentOverlay({...m,id:'evil'},gate()),null);
  assert.equal(planClubMomentOverlay({...m,text:'X'.repeat(80)},gate()),null);
  assert.equal(planClubMomentOverlay(m,gate({now:NOW+121_000})),null);
});
test('pure source performs no network calls, scoring writes, subscriptions or DOM writes',async()=>{
  const fs=await import('node:fs');const s=fs.readFileSync(new URL('./moments.mjs',import.meta.url),'utf8');
  for(const x of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'POST', '/json/state', '.from(', 'document.', 'localStorage'])assert.ok(!s.includes(x),x);
});
