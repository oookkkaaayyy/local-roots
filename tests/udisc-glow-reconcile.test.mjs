import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUdiscAoA, publishSnapshot } from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-preview.mjs';
import { buildProposedPayload, memberSourceKey, reconcileSnapshot } from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-reconcile.mjs';

const headers=['division','position','position_raw','name','event_relative_score','event_total_score','usernames','round_relative_score','round_total_score',...Array.from({length:18},(_,i)=>'hole_'+(i+1))];
const row=(name,usernames='')=>['GEN','T1',1,name,-10,44,usernames,-10,44,...Array.from({length:18},(_,i)=>i<10?2:3)];
const snapshot=(rows,eventId='reconcile-test')=>parseUdiscAoA([headers,...rows],{eventId,observedAtLocal:'2026-10-26T12:00:00Z'});
const modelFor=(rows,eventId)=>publishSnapshot(null,snapshot(rows,eventId)).model;
const roster=[{playerId:'p-alex',displayName:'Alex One',udiscUsernames:['alex_ud'],aliases:['Alexander']},{playerId:'p-blair',displayName:'Blair Two',udiscUsernames:['blair_ud']},{playerId:'p-other',displayName:'Other Person',udiscUsernames:['other_ud'],aliases:['Alexander']}];

test('reconciles exact usernames; name-only aliases stay ambiguous; unresolved names stay unmatched',()=>{
 const m=modelFor([row('Alex One & Blair Two','alex_ud, blair_ud'),row('Alexander & Nobody','unknown, absent')]);
 const result=reconcileSnapshot(m,roster);assert.deepEqual(result.teams[0].members.map(x=>x.status),['confirmed','confirmed']);assert.deepEqual(result.teams[1].members.map(x=>x.status),['ambiguous','unmatched']);assert.equal(result.teams[0].sourceRank,'T1');assert.equal(result.teams[0].relativeScore,-10);assert.equal(result.teams[0].strokeTotal,44);assert.equal(result.teams[0].scores.length,18);
});

test('conflicting username and name evidence requires review; explicit decision is auditable',()=>{
 const m=modelFor([row('Other Person & Blair Two','alex_ud, blair_ud')]);const first=reconcileSnapshot(m,roster);assert.equal(first.teams[0].members[0].status,'conflict');
 const decisions={[memberSourceKey('Other Person','alex_ud')]:{playerId:'p-alex'}};const resolved=reconcileSnapshot(m,roster,decisions);assert.equal(resolved.teams[0].members[0].status,'confirmed');assert.equal(resolved.teams[0].members[0].method,'explicit_review');assert.equal(resolved.teams[0].members[0].issue,'manual_resolution_overrode_conflicting_identifiers');
 assert.throws(()=>reconcileSnapshot(m,roster,{[memberSourceKey('Other Person','alex_ud')]:{playerId:'missing'}}),/unknown playerId/);
});

test('duplicate canonical assignments become conflicts and do not form team IDs',()=>{
 const m=modelFor([row('Alex One & Blair Two','alex_ud, blair_ud'),row('Alex One & Other Person','alex_ud, other_ud')]);const result=reconcileSnapshot(m,roster);assert.equal(result.teams[0].members[0].status,'conflict');assert.equal(result.teams[1].members[0].status,'conflict');assert.equal(result.teams[0].teamId,null);assert.equal(result.teams[1].teamId,null);
});

test('proposal keeps UDisc source order and freshness uncertainty and has no write target',()=>{
 const m=modelFor([row('Alex One & Blair Two','alex_ud, blair_ud'),row('Nobody & Else','x, y')],'offline-event');const result=reconcileSnapshot(m,roster);const payload=buildProposedPayload(result);
 assert.equal(payload.schema,'hbnf.glow.score-delivery-proposal.v1');assert.equal(payload.disposition,'PROPOSED_ONLY_NOT_DELIVERED');assert.equal(payload.writeTarget,null);assert.equal(payload.event.sourceFreshness,'upstream_freshness_unknown');assert.deepEqual(payload.teams.map(x=>x.sourceRank),['T1','T1']);assert.deepEqual(payload.teams.map(x=>x.sourceRow),[2,3]);assert.deepEqual(payload.teams[0].holeScores,result.teams[0].scores);assert.equal(payload.readyForHumanReview,false);assert.equal(payload.teams[1].players[0].matchStatus,'unmatched');
});
