import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
  xlsxSha256,attachLocalSnapshotEvidence,shouldPauseForRateLimit
} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-snapshot-mode.review.mjs';

const eventId='synthetic-integration-event';
const weekDate='2026-11-10';
const observedAt='2026-11-11T02:30:00Z';
const scores=(first='')=>[first,...Array(17).fill('')];
function model(score='3'){
  return {
    date:weekDate,players:[{id:'T1',scores:scores(score)}],
    udiscSync:{
      eventId,weekDate,
      latest:{rows:[{glowTeamId:'T1',holeScores:scores(score)}]},
    },
  };
}

test('integrated Worker import and Glow UI recognize local XLSX snapshot provenance',async()=>{
  const worker=await readFile(new URL('../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-auto-sync.review.mjs',import.meta.url),'utf8');
  const html=await readFile(new URL('../public/glow.html',import.meta.url),'utf8');
  assert.ok(worker.includes("from './udisc-glow-snapshot-mode.review.mjs'"));
  assert.ok(html.includes('HBNF_LOCAL_XLSX_OBSERVATION_NOT_UDISC_METADATA'));
  assert.ok(html.includes("status.state==='standings_only'"));
  assert.ok(html.includes('SOURCE_RATE_LIMITED'));
});

test('integrated snapshot evidence advances only a real accepted scored-hole change',()=>{
  const before={date:weekDate,players:[{id:'T1',scores:scores('')}],udiscSync:null};
  const prepared={changed:true,week:model('3')};
  const receipt=attachLocalSnapshotEvidence({
    before,prepared,sha256:'a'.repeat(64),observedAt,eventId,weekDate,
  });
  assert.equal(receipt.acceptedChanges.length,1);
  assert.equal(receipt.sequence,1);
  assert.equal(receipt.week.udiscSync.status.state,'fresh');
  assert.equal(receipt.week.udiscSync.status.lastSuccessAt,observedAt);
  assert.equal(receipt.week.udiscSync.latest.hbnfLocalSnapshot.providerRevision,null);
  assert.equal(receipt.week.udiscSync.latest.hbnfLocalSnapshot.providerUpdatedAt,null);

  const unchangedScores=structuredClone(receipt.week);
  const standings=structuredClone(unchangedScores);
  standings.udiscSync.latest.rows[0].rank=2; // results-only update, no scored hole
  const next=attachLocalSnapshotEvidence({
    before:unchangedScores,prepared:{changed:true,week:standings},
    sha256:'b'.repeat(64),observedAt:'2026-11-11T02:35:00Z',eventId,weekDate,
  });
  assert.equal(next.acceptedChanges.length,0);
  assert.equal(next.sequence,2);
  assert.equal(next.week.udiscSync.status.state,'standings_only');
  assert.equal(next.week.udiscSync.status.lastSuccessAt,observedAt);
  assert.equal(next.week.udiscSync.latest.hbnfLocalSnapshot.observedAt,'2026-11-11T02:35:00Z');
});

test('full XLSX bytes use local digest, and 429/503 hold uses saved local attempt',async()=>{
  const bytes=new Uint8Array(24);
  bytes[0]=0x50; bytes[1]=0x4b;
  assert.equal(await xlsxSha256(bytes),createHash('sha256').update(bytes).digest('hex'));
  await assert.rejects(xlsxSha256(new Uint8Array(24)),/exact, bounded XLSX/);
  const week={udiscSync:{status:{
    state:'failed',errorCode:'SOURCE_RATE_LIMITED',lastAttemptAt:'2026-11-11T02:30:00Z',
  }}};
  assert.equal(shouldPauseForRateLimit(week,new Date('2026-11-11T02:34:59Z')),true);
  assert.equal(shouldPauseForRateLimit(week,new Date('2026-11-11T02:35:00Z')),false);
});
