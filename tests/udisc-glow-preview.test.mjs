import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {eventDateFromUdiscFile,parseUdiscAoA,publishSnapshot,standingsForPreview} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-preview.mjs';

const dates=['2026-03-03','2026-04-18','2026-05-23','2026-06-20'];
const load=async date=>JSON.parse(await readFile(new URL(`./fixtures/authentic-udisc/${date}.json`,import.meta.url),'utf8'));
const toAoA=f=>[['division','position','position_raw','name','event_relative_score','event_total_score','usernames','round_relative_score','round_total_score',...Array.from({length:18},(_,i)=>`hole_${i+1}`)],...f.rows.map(r=>[r.division,r.position,r.position_raw,r.name,r.event_relative_score,r.event_total_score,r.usernames,r.round_relative_score,r.round_total_score,...Array.from({length:18},(_,i)=>r[`hole_${i+1}`])])];
const snapshot=(aoa,eventId='test-event',extra={})=>parseUdiscAoA(aoa,{eventId,observedAtLocal:'2026-10-26T12:00:00Z',...extra});

test('authentic-workbook structural fixtures preserve team order, all UDisc ranks/ties, score meanings and 18 holes',async()=>{
 for(const date of dates){const fixture=await load(date);assert.equal(fixture.teamCount,fixture.rows.length);assert.equal(fixture.sourceRowOrderPreserved,true);const parsed=snapshot(toAoA(fixture),date);assert.equal(parsed.rows.length,fixture.teamCount);assert.deepEqual(parsed.rows.map(r=>r.sourceRank),fixture.rows.map(r=>String(r.position)));assert.deepEqual(parsed.rows.map(r=>r.sourceRankRaw),fixture.rows.map(r=>String(r.position_raw)));for(let i=0;i<parsed.rows.length;i++){const got=parsed.rows[i],src=fixture.rows[i];assert.equal(got.sourceTeam,src.name);assert.equal(got.relativeScore,src.event_relative_score);assert.equal(got.strokeTotal,src.event_total_score);assert.equal(got.holesCompleted,18);assert.equal(got.holeStrokesTotal,src.event_total_score);assert.equal(got.memberAlignment,got.members.length===got.usernames.length);}}
});

test('preserves tied UDisc rank labels, row order, paired names/usernames and display-only aliases',async()=>{
 const f=await load('2026-04-18'),m=publishSnapshot(null,snapshot(toAoA(f),'event')).model;const tied=m.snapshots[0].rows.filter(r=>r.sourceRank.startsWith('T'));assert.equal(tied.length,4);assert.deepEqual(tied.slice(0,2).map(r=>r.sourceRank),['T1','T1']);const row=m.snapshots[0].rows.find(r=>r.members.length===2);assert.equal(row.usernames.length,2);const aliases={[row.members[0]]:'Player A',[row.usernames[1]]:'Player B'};assert.equal(standingsForPreview(m,aliases).find(r=>r.team==='Player A / Player B').rank,row.sourceRank);
});

test('an authentic event correction produces a new immutable snapshot while retaining source order and rank',async()=>{
 const fixture=await load('2026-04-18'),aoa=toAoA(fixture),base=snapshot(aoa,'2026-04-18'),model=publishSnapshot(null,base).model,changed=aoa.map(r=>r.slice());
 const headers=changed[0],hole=headers.indexOf('hole_1'),relative=headers.indexOf('event_relative_score'),strokes=headers.indexOf('event_total_score');changed[1][hole]+=1;changed[1][relative]+=1;changed[1][strokes]+=1;
 const result=publishSnapshot(model,snapshot(changed,'2026-04-18'));assert.equal(result.disposition,'published');const rows=standingsForPreview(result.model);assert.equal(rows[0].rank,'T1');assert.equal(rows[0].relativeScore,fixture.rows[0].event_relative_score+1);assert.equal(rows[0].strokeTotal,fixture.rows[0].event_total_score+1);assert.equal(rows[0].scores[0],fixture.rows[0].hole_1+1);assert.equal(rows[1].rank,'T1');assert.equal(model.snapshots.length,1);
});

test('local snapshot identity does not invent upstream version or time; duplicate and timestamp staleness are safe',()=>{
 const aoa=[['name','position','event_relative_score','event_total_score',...Array.from({length:18},(_,i)=>`hole_${i+1}`)],['A','1',0,54,...Array(18).fill(3)]];const first=snapshot(aoa);assert.equal(first.sourceUpdatedAt,null);assert.equal('version'in first,false);const model=publishSnapshot(null,first).model;assert.equal(model.snapshots[0].freshness,'upstream_freshness_unknown');assert.equal(publishSnapshot(model,first).disposition,'duplicate');const timestamped=aoa.map(r=>r.slice());timestamped[1][4]=4;timestamped[1][2]=1;timestamped[1][3]=55;const newer=publishSnapshot(model,snapshot(timestamped,'test-event',{sourceUpdatedAt:'2026-10-25T00:00:00Z'})).model;assert.equal(newer.snapshots.at(-1).sourceUpdatedAt,'2026-10-25T00:00:00.000Z');const changed=aoa.map(r=>r.slice());changed[1][4]=4;changed[1][2]=3;changed[1][3]=55;const stale=publishSnapshot(newer,snapshot(changed,'test-event',{sourceUpdatedAt:'2026-10-24T00:00:00Z'}));assert.equal(stale.disposition,'stale');assert.equal(stale.model,newer);
});

test('rejects missing columns, malformed ranks, holes and inconsistent totals without changing prior data',()=>{
 const good=[['name','position','event_relative_score','event_total_score',...Array.from({length:18},(_,i)=>`hole_${i+1}`)],['A','1',0,54,...Array(18).fill(3)]];const model=publishSnapshot(null,snapshot(good)).model;assert.throws(()=>snapshot([['name','position','hole_1'],['A','1',3]]),/missing required hole columns/);assert.throws(()=>snapshot(good.map((r,i)=>i?[...r.slice(0,1),'T?',...r.slice(2)]:r)),/invalid UDisc position/);assert.throws(()=>snapshot(good.map((r,i)=>i?[...r.slice(0,4),'x',...r.slice(5)]:r)),/hole 1 must be numeric/);assert.throws(()=>snapshot(good.map((r,i)=>i?[...r.slice(0,3),1,...r.slice(4)]:r)),/do not match the absolute/);assert.throws(()=>snapshot(good.map((r,i)=>i?[...r.slice(0,2),'','',...r.slice(4)]:r)),/neither relative score nor absolute stroke total/);assert.equal(model.snapshots.length,1);
});

test('allows a genuinely incomplete snapshot but labels hole completeness; rejects malformed workbook identity',()=>{
 const aoa=[['name','position','event_relative_score','event_total_score',...Array.from({length:18},(_,i)=>`hole_${i+1}`)],['A','1',0,54,...Array(17).fill(3),'']];const partial=aoa.map((r,i)=>i?[...r.slice(0,21),'']:r);const row=snapshot(partial).rows[0];assert.equal(row.holesComplete,false);assert.equal(row.holesCompleted,17);assert.equal(row.holeStrokesTotal,null);assert.throws(()=>snapshot(aoa,''),/Choose the event identity/);assert.throws(()=>snapshot([['name','position'],['A','1']]),/missing required hole columns/);
});

test('derives event date from dated UDisc filename or export start-time column without a separate date field',()=>{
 assert.equal(eventDateFromUdiscFile('hb-night-flyers-glow-2026-10-24.xlsx',[]),'2026-10-24');
 assert.equal(eventDateFromUdiscFile('leaderboard-export.xlsx',[['name','start_time'],['Team A & Team B','Oct 24, 2026, 6:17 PM']]),'2026-10-24');
 assert.equal(eventDateFromUdiscFile('leaderboard-export.xlsx',[['name','start_time'],['Team A & Team B',46323]]),'2026-10-28');
 assert.equal(eventDateFromUdiscFile('leaderboard-export.xlsx',[['name'],['Team A & Team B']]),null);
});
