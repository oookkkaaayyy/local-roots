import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareGlowCleanupReview} from '../scripts/hbnf-glow-week-cleanup-preflight.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const ts='2026-11-01 22:33:40.372437+00';
const commit='33ff65caeb609533b0a4eea634100a78fb34ec08';
const releaseId='hbnf-nov3-test-cleanup-fixture-20261102';
const scope='remove only the verified rehearsal rows and aliases from the Nov 3 Glow week';
function input(){
 const test=['Test Player A','Test Player B','Test Player C','Test Player D'];
 const teams=[
  {id:'T1',partner1:test[0],partner2:test[1]},
  {id:'T2',partner1:test[2],partner2:test[1]},
  {id:'T3',partner1:'Andrew',partner2:test[3]}];
 const players=[
  {id:'P1',name:test[0],partner1:test[0],partner2:test[1],scores:['3','4','2']},
  {id:'P2',name:test[2],partner1:test[2],partner2:test[1],scores:['4','3','2']},
  {id:'P3',name:'Andrew',partner1:'Andrew',partner2:test[3],scores:['3','4','2']}];
 const state_json={
  glow:{activeWeek:'2026-11-03',playerAliases:Object.fromEntries(test.map(x=>[x,x])),
   weeks:{'2026-11-03':{scoresLocked:false,cards:[{id:'C1',players:teams}],players},
    '2026-10-28':{cards:[],players:[{name:'historical'}]}}},
  skins:{lastWeek:'old'},bagTags:{players:[],manual:{}},__backups:[{name:'historical'}]
 };
 const snapshotBytes=Buffer.from(JSON.stringify({id:1,updated_at:ts,state_json}));
 const backup={driveFileId:'ci-only-private-snapshot',bytes:snapshotBytes.length,
  sha256:sha(snapshotBytes),downloadBackVerified:true};
 return {snapshotBytes,backup,sourceCommit:commit,releaseId};
}
const approval={confirmed:true,evidence:'SYNTHETIC TEST ONLY',scope};
function readback(operation){
 return {projectId:'phcpbvuqibyarpfrftgx',
  row:{id:1,updatedAt:'2026-11-01T22:33:40.372437+00:00',
    activeWeek:'2026-11-03',cards:1,teams:3,playerRows:3,enteredScores:9,
    testAliases:4,testAliasKeysMd5:operation.testAliasKeysMd5,scoresLocked:false,
    rowFingerprint:'a'.repeat(32),stateJsonMd5:'b'.repeat(32)},
  cleanedStateMd5:'c'.repeat(32),tagProjectionMatches:true,
  matrix:{autoLive:false,queueFingerprint:'b'.repeat(32),
    queueStateUpdatedAt:'2026-11-01T22:33:40.372437+00:00',
    cinematicEventCount:27}};
}
test('exact snapshot and source-bound rehearsal identities produce review-only operation hashes',()=>{
 const f=input(),r=prepareGlowCleanupReview(f);
 assert.equal(r.status,'REVIEW_ONLY');
 assert.equal(r.productionWrites,0);
 assert.deepEqual(r.operation.expectedCounts,{cards:1,teams:3,playerRows:3,enteredScores:9,testAliases:4});
 assert.equal(r.identityChecks.allTeamsHaveTestMarker,true);
 assert.equal(r.identityChecks.allPlayersHaveTestMarker,true);
 assert.equal(r.identityChecks.noFinalizedCards,true);
 assert.equal(r.pendingManifest,null);
 assert.equal(r.blockers.length,2);
});
test('owner approval and fresh exact provider readback are required for PENDING, never ADMISSION_PASS',()=>{
 const f=input(),review=prepareGlowCleanupReview(f);
 assert.equal(prepareGlowCleanupReview({...f,readback:readback(review.operation)}).pendingManifest,null);
 assert.equal(prepareGlowCleanupReview({...f,ownerApproval:approval}).pendingManifest,null);
 const pending=prepareGlowCleanupReview({...f,readback:readback(review.operation),ownerApproval:approval});
 assert.equal(pending.status,'PENDING_ADMISSION');
 assert.equal(pending.pendingManifest.phase,'PENDING');
 assert.equal(pending.pendingManifest.ownerAuthorization.evidence,'SYNTHETIC TEST ONLY');
 assert.equal(pending.pendingManifest.operation.testAliasKeysMd5,review.operation.testAliasKeysMd5);
 assert.equal(pending.pendingManifest.operation.cleanedStateMd5,'c'.repeat(32));
 assert.equal(pending.pendingManifest.sourceCommit,commit);
 assert.equal(pending.productionWrites,0);
});
test('stale even by one microsecond, stale queue, or mismatched fingerprint fail closed',()=>{
 const f=input(),review=prepareGlowCleanupReview(f),fresh=readback(review.operation);
 const micro=structuredClone(fresh);micro.row.updatedAt='2026-11-01T22:33:40.372438+00:00';
 assert.throws(()=>prepareGlowCleanupReview({...f,readback:micro,ownerApproval:approval}),/revision or cleanup hash differs/);
 const q=structuredClone(fresh);q.matrix.queueFingerprint='0'.repeat(32);
 assert.throws(()=>prepareGlowCleanupReview({...f,readback:q,ownerApproval:approval}),/revision or cleanup hash differs/);
 const n=structuredClone(fresh);n.row.testAliasKeysMd5='f'.repeat(32);
 assert.throws(()=>prepareGlowCleanupReview({...f,readback:n,ownerApproval:approval}),/revision or cleanup hash differs/);
});
test('tampered recovery bytes, non-test entry and locked rehearsal week are rejected',()=>{
 const f=input();
 assert.throws(()=>prepareGlowCleanupReview({...f,backup:{...f.backup,sha256:'0'.repeat(64)}}),/verified backup identity/);
 const j=JSON.parse(f.snapshotBytes.toString('utf8'));j.state_json.glow.weeks['2026-11-03'].players[0].name='Real';
 j.state_json.glow.weeks['2026-11-03'].players[0].partner1='Real';
 j.state_json.glow.weeks['2026-11-03'].players[0].partner2='Real';
 const bytes=Buffer.from(JSON.stringify(j));
 assert.throws(()=>prepareGlowCleanupReview({...f,snapshotBytes:bytes,
   backup:{...f.backup,bytes:bytes.length,sha256:sha(bytes)}}),/test-player identity/);
 j.state_json.glow.weeks['2026-11-03'].scoresLocked=true;
 const locked=Buffer.from(JSON.stringify(j));
 assert.throws(()=>prepareGlowCleanupReview({...f,snapshotBytes:locked,
   backup:{...f.backup,bytes:locked.length,sha256:sha(locked)}}),/wrong or locked week/);
});
