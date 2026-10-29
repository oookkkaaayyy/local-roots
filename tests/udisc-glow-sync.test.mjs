import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseUdiscAoA,publishSnapshot} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-preview.mjs';
import {buildGlowProposal} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-reconcile.mjs';
import {prepareGlowWeekSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-sync.mjs';

const dates=['2026-03-03','2026-04-18','2026-05-23','2026-06-20'];
const getFixture=async date=>JSON.parse(await readFile(new URL(`./fixtures/authentic-udisc/${date}.json`,import.meta.url),'utf8'));
const toAoA=fixture=>[['division','position','position_raw','name','event_relative_score','event_total_score','usernames',...Array.from({length:18},(_,i)=>`hole_${i+1}`)],...fixture.rows.map(row=>[row.division,row.position,row.position_raw,row.name,row.event_relative_score,row.event_total_score,row.usernames,...Array.from({length:18},(_,i)=>row[`hole_${i+1}`])])];
const makeProposal=(rows,eventId,observedAtLocal='2026-10-26T12:00:00Z')=>buildGlowProposal(publishSnapshot(null,parseUdiscAoA(rows,{eventId,observedAtLocal})).model,{aliases:{},historicalNames:[],tagEvidence:[]});
const readFixtureProposal=async date=>{const fixture=await getFixture(date);return{fixture,proposal:makeProposal(toAoA(fixture),date)}};

function emptyWeek(date){return{
  date,activeWeek:date,scoresLocked:false,
  cards:[{id:'C1',finalized:false,players:[{id:'E1_1',partner1:'',partner2:''}]}],
  players:[],scorecardText:{holePars:{1:'3'},holeNotes:{4:'Keep note'}},payouts:{entryFee:5,manualAdjustment:2},tagAssignments:{'Glow Member':'A'},aceWinner:'Glow Member',customWeekField:'keep',
}}

function existingWeek(proposal,date){
 const cards=[{id:'C1',finalized:false,players:proposal.destination.week.players.map((player,index)=>({id:`HBNF_${index+1}`,partner1:player.partner1,partner2:player.partner2,entryExtra:'keep'}))}];
 const players=cards[0].players.map((entry,index)=>({id:entry.id,name:`${entry.partner1} / ${entry.partner2}`,partner1:entry.partner1,partner2:entry.partner2,cardId:'C1',scores:Array(18).fill('9'),removed:false,localExtra:`keep-${index+1}`}));
 return{date,activeWeek:date,scoresLocked:false,cards,players,scorecardText:{holePars:{1:'3'},holeNotes:{4:'Keep note'}},payouts:{entryFee:5,manualAdjustment:2},tagAssignments:{tag:'keep'},aceWinner:'Glow Member'};
}

test('all four authentic-derived fixtures build a week while retaining ranks and full 18-hole provenance',async()=>{
 let rows=0;
 for(const date of dates){
  const{fixture,proposal}=await readFixtureProposal(date),result=await prepareGlowWeekSync(emptyWeek(date),proposal);
  assert.equal(result.changed,true);assert.equal(result.week.date,date);assert.equal(result.week.activeWeek,date);
  assert.equal(result.week.players.length,fixture.teamCount);assert.equal(result.week.udiscSync.latest.rows.length,fixture.teamCount);
  assert.equal(result.week.udiscSync.latest.rowOrderPreserved,true);
  for(let i=0;i<fixture.teamCount;i++){
   const row=fixture.rows[i],synced=result.week.players.find(player=>player.id===result.week.udiscSync.latest.rows[i].glowTeamId);
   assert.equal(synced.scores.length,18);assert.deepEqual(synced.scores,Array.from({length:18},(_,hole)=>String(row[`hole_${hole+1}`])));
   assert.equal(result.week.udiscSync.latest.rows[i].sourceRank,String(row.position));
   assert.equal(result.week.udiscSync.latest.rows[i].sourceRankRaw,String(row.position_raw));
   assert.equal(result.week.udiscSync.latest.rows[i].relativeScore,row.event_relative_score);
   assert.equal(result.week.udiscSync.latest.rows[i].strokeTotal,row.event_total_score);
  }
  rows+=fixture.teamCount;
 }
 assert.equal(rows,25);
});

test('replaying identical event data is a no-op and preserves existing Glow fields',async()=>{
 const{proposal}=await readFixtureProposal('2026-03-03'),first=await prepareGlowWeekSync(emptyWeek('2026-03-03'),proposal),repeat=await prepareGlowWeekSync(first.week,proposal);
 assert.equal(repeat.changed,false);assert.equal(repeat.reason,'same_snapshot');assert.equal(repeat.week,first.week);
 assert.deepEqual(first.week.scorecardText,{holePars:{1:'3'},holeNotes:{4:'Keep note'}});
 assert.deepEqual(first.week.payouts,{entryFee:5,manualAdjustment:2});assert.deepEqual(first.week.tagAssignments,{'Glow Member':'A'});
 assert.equal(first.week.aceWinner,'Glow Member');assert.equal(first.week.customWeekField,'keep');
});

test('a score correction updates the same Glow teams and appends source history without replacing payouts/tags',async()=>{
 const fixture=await getFixture('2026-04-18'),rows=toAoA(fixture),initial=makeProposal(rows,'2026-04-18'),first=await prepareGlowWeekSync(emptyWeek('2026-04-18'),initial);
 const changed=rows.map(row=>row.slice()),headers=changed[0],scoreColumn=headers.indexOf('hole_1'),relativeColumn=headers.indexOf('event_relative_score'),totalColumn=headers.indexOf('event_total_score');changed[1][scoreColumn]=Number(changed[1][scoreColumn])+1;changed[1][relativeColumn]=Number(changed[1][relativeColumn])+1;changed[1][totalColumn]=Number(changed[1][totalColumn])+1;
 const corrected=makeProposal(changed,'2026-04-18','2026-10-26T12:01:00Z'),second=await prepareGlowWeekSync(first.week,corrected);
 assert.equal(second.changed,true);assert.equal(second.reason,'snapshot_changed');assert.equal(second.week.players[0].id,first.week.players[0].id);
 assert.notEqual(second.week.players[0].scores[0],first.week.players[0].scores[0]);assert.equal(second.week.udiscSync.history.length,1);
 assert.deepEqual(second.week.payouts,first.week.payouts);assert.deepEqual(second.week.tagAssignments,first.week.tagAssignments);
});

test('incomplete live snapshots can update the event without clearing unrelated Glow state',async()=>{
 const fixture=await getFixture('2026-05-23'),rows=toAoA(fixture),header=rows[0],hole1=header.indexOf('hole_1'),initial=makeProposal(rows,'2026-05-23');
 const first=await prepareGlowWeekSync(emptyWeek('2026-05-23'),initial),partial=rows.map(row=>row.slice());partial[1][hole1]='';
 const incomplete=makeProposal(partial,'2026-05-23','2026-10-26T12:01:00Z'),next=await prepareGlowWeekSync(first.week,incomplete);
 assert.equal(next.week.players[0].scores[0],first.week.players[0].scores[0]);assert.equal(next.week.players[0].scores.length,18);
 assert.deepEqual(next.week.scorecardText,first.week.scorecardText);assert.deepEqual(next.week.payouts,first.week.payouts);
 const corrected=rows.map(row=>row.slice()),relative=header.indexOf('event_relative_score'),total=header.indexOf('event_total_score');corrected[1][hole1]=Number(corrected[1][hole1])+1;corrected[1][relative]=Number(corrected[1][relative])+1;corrected[1][total]=Number(corrected[1][total])+1;
 const correction=await prepareGlowWeekSync(next.week,makeProposal(corrected,'2026-05-23','2026-10-26T12:02:00Z'));
 assert.equal(correction.week.players[0].scores[0],String(corrected[1][hole1]));
});

test('a manual correction wins over later UDisc snapshots and is retained in provenance',async()=>{
 const fixture=await getFixture('2026-04-18'),rows=toAoA(fixture),initial=makeProposal(rows,'2026-04-18'),first=await prepareGlowWeekSync(emptyWeek('2026-04-18'),initial);
 const correctedRows=rows.map(row=>row.slice()),header=correctedRows[0];
 correctedRows[1][header.indexOf('hole_1')]=Number(correctedRows[1][header.indexOf('hole_1')])+1;
 correctedRows[1][header.indexOf('event_relative_score')]=Number(correctedRows[1][header.indexOf('event_relative_score')])+1;
 correctedRows[1][header.indexOf('event_total_score')]=Number(correctedRows[1][header.indexOf('event_total_score')])+1;
 const manual=structuredClone(first.week);manual.players[0].scores[0]='99';
 const result=await prepareGlowWeekSync(manual,makeProposal(correctedRows,'2026-04-18','2026-10-26T12:01:00Z'));
 assert.equal(result.week.players[0].scores[0],'99');
 assert.deepEqual(result.week.udiscSync.latest.manualOverrides,[{glowTeamId:result.week.players[0].id,hole:1,keptScore:'99',sourceScore:String(correctedRows[1][header.indexOf('hole_1')])}]);
});

test('duplicate source team identities are rejected before producing a replacement',async()=>{
 const fixture=await getFixture('2026-03-03'),rows=toAoA(fixture),duplicate=rows.map(row=>row.slice());duplicate.push(duplicate[1].slice());
 await assert.rejects(()=>prepareGlowWeekSync(emptyWeek('2026-03-03'),makeProposal(duplicate,'2026-03-03','2026-10-26T12:01:00Z')),/duplicate team identity|reuses a canonical/);
});

test('existing Glow team IDs and card placement survive exact-name matching',async()=>{
 const{proposal}=await readFixtureProposal('2026-06-20'),current=existingWeek(proposal,'2026-06-20'),result=await prepareGlowWeekSync(current,proposal);
 assert.equal(result.week.players.length,current.players.length);assert.equal(result.week.cards[0].players.length,current.cards[0].players.length);
 assert.deepEqual(result.week.players.map(player=>player.id),current.players.map(player=>player.id));
 assert.ok(result.week.players.every(player=>player.cardId==='C1'&&player.localExtra==='keep-1'||player.localExtra?.startsWith('keep-')));
 assert.ok(result.week.cards[0].players.every(entry=>entry.entryExtra==='keep'));
});

test('a unique returning partner can carry a changed partnership; ambiguous matches fail closed',async()=>{
 const fixture=await getFixture('2026-03-03'),rows=toAoA(fixture),original=makeProposal(rows,'2026-03-03'),current=existingWeek(original,'2026-03-03');
 const changed=rows.map(row=>row.slice()),nameColumn=changed[0].indexOf('name');
 const parts=String(changed[1][nameColumn]).split(/\s*&\s*/);changed[1][nameColumn]=`${parts[0]} & Fixture New Partner`;
 const revised=makeProposal(changed,'2026-03-03','2026-10-26T12:01:00Z'),updated=await prepareGlowWeekSync(current,revised);
 assert.equal(updated.week.players[0].id,'HBNF_1');assert.equal(updated.week.players[0].partner2,'Fixture New Partner');
 const ambiguous=structuredClone(current);ambiguous.cards[0].players[1].partner1=ambiguous.cards[0].players[0].partner1;
 ambiguous.players[1].partner1=ambiguous.players[0].partner1;
 await assert.rejects(()=>prepareGlowWeekSync(ambiguous,revised),/ambiguous|multiple Glow teams/);
});

test('date mismatch, locked weeks, and finalized cards are rejected without mutation',async()=>{
 const{proposal}=await readFixtureProposal('2026-03-03');
 await assert.rejects(()=>prepareGlowWeekSync(emptyWeek('2026-03-04'),proposal),/does not match/);
 const locked=emptyWeek('2026-03-03');locked.scoresLocked=true;await assert.rejects(()=>prepareGlowWeekSync(locked,proposal),/locked/);
 const finalized=emptyWeek('2026-03-03');finalized.cards[0].finalized=true;await assert.rejects(()=>prepareGlowWeekSync(finalized,proposal),/finalized/);
});
