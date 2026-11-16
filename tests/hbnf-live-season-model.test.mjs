import test from 'node:test';
import assert from 'node:assert/strict';
import {relativeToPar,competitionRanks,approvedSeasonFinals,liveFeedStatus,certifiedSkinAwards}
 from '../scripts/review/hbnf-live-season/model.mjs';

test('scores require complete positive strokes and pars',()=>{
 assert.equal(relativeToPar([2,4],[3,4]),-1);
 assert.equal(relativeToPar([3,3],[3,4]),-1);
 assert.equal(relativeToPar([4,4],[3,4]),1);
 for(const [s,p] of [[[2],[3,4]],[[2,4],[3,null]],[[0,4],[3,4]],[[],[]]])assert.equal(relativeToPar(s,p),null);
});
test('competition ranks retain 1,1,3 without front/back tiebreaks or name identity merging',()=>{
 const glow=competitionRanks([{id:'A',label:'Alex',score:4},{id:'B',label:'Alex',score:4},{id:'C',label:'Cam',score:2}]);
 assert.deepEqual(glow.map(x=>x.rank),[1,1,3]);
 const skins=competitionRanks([{id:'A',label:'Ana',score:10,front:7},{id:'B',label:'Ben',score:10,front:2},{id:'C',label:'Cam',score:9,front:4}]);
 assert.deepEqual(skins.map(x=>x.rank),[1,1,3]);
 assert.deepEqual(competitionRanks([{id:'A',score:-1},{id:'B',score:-1},{id:'C',score:1}],{ascending:true}).map(x=>x.rank),[1,1,3]);
 assert.throws(()=>competitionRanks([{id:'A',score:1},{id:'A',score:2}]),/Duplicate participant/);
});
test('latest approved final wins over draft, one-off, synthetic and past season',()=>{
 const start='2026-01-01T00:00:00-08:00',end='2027-01-01T00:00:00-08:00';
 const r={roundId:'glow-nov10',revision:1,startsAt:'2026-11-10T17:30:00-08:00',
   official:true,approvedFinal:true,adjudicated:true,winner:'AB'};
 const rounds=[
  r,{...r,revision:2,winner:'CD'},
  {...r,revision:3,approvedFinal:false,winner:'EF'},
  {...r,roundId:'bad-oneoff',oneOff:true},
  {...r,roundId:'bad-fixture',synthetic:true},
  {...r,roundId:'not-adjudicated',adjudicated:false},
  {...r,roundId:'too-late',startsAt:end},
  {...r,roundId:'too-early',startsAt:'2025-12-31T23:59:59-08:00'}
 ];
 const finals=approvedSeasonFinals(rounds,start,end);
 assert.deepEqual(finals.map(x=>[x.roundId,x.revision,x.winner]),[['glow-nov10',2,'CD']]);
 assert.deepEqual(approvedSeasonFinals([r,r],start,end).map(x=>x.roundId),['glow-nov10']);
 assert.throws(()=>approvedSeasonFinals([r,{...r,winner:'EF'}],start,end),/Conflicting certified/);
 assert.throws(()=>approvedSeasonFinals([r],start,'2027-01-01'),/explicit timezones/);
});
test('freshness is measured by last accepted scored hole, independent of availability and finalization',()=>{
 const last='2026-11-17T18:00:00-08:00',base=Date.parse(last);
 assert.deepEqual(liveFeedStatus({roundStatus:'Live',lastScoredAt:last,readOk:true,now:base+300_000}),
   {roundStatus:'Live',feed:'Feed available',ageSeconds:300,freshness:'Current'});
 assert.deepEqual(liveFeedStatus({roundStatus:'Live',lastScoredAt:last,readOk:false,now:base+301_000}),
   {roundStatus:'Live',feed:'Feed unavailable',ageSeconds:301,freshness:'Stale'});
 const fin=liveFeedStatus({roundStatus:'Final',lastScoredAt:last,readOk:false,now:base+360_000});
 assert.equal(fin.roundStatus,'Final');assert.equal(fin.freshness,'Stale');
 assert.equal(liveFeedStatus({roundStatus:'Scheduled',lastScoredAt:null,readOk:true,now:base}).freshness,null);
 assert.equal(liveFeedStatus({roundStatus:'Live',lastScoredAt:base+10,readOk:true,now:base}).freshness,null);
});
test('certified skins carry; unresolved carry withholds awards',()=>{
 const first=certifiedSkinAwards([{winner:null},{winner:null},{winner:'A'}]);
 assert.equal(first.awards.get('A'),3);assert.equal(first.unresolvedCarry,0);
 const unresolved=certifiedSkinAwards([{winner:null},{winner:null}]);
 assert.equal(unresolved.unresolvedCarry,2);assert.equal(unresolved.awards.size,0);
 const certified=certifiedSkinAwards([{winner:null},{winner:null}],{tiebreakWinner:'CD'});
 assert.equal(certified.awards.get('CD'),2);assert.equal(certified.unresolvedCarry,0);
 assert.throws(()=>certifiedSkinAwards([{winner:undefined}]),/Unrecognized winner/);
});
