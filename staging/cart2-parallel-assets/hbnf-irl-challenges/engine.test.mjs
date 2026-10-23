import test from 'node:test';
import assert from 'node:assert/strict';
import {createPuttingGame,currentPuttingChallenge,recordPuttingAttempt,puttingStandings,restorePuttingGame} from './engine.mjs';

const start=(mode='gauntlet',players=['AND','JAM'], opts={})=>createPuttingGame({mode,players,seed:1,...opts});
const submit=(s,made)=>recordPuttingAttempt(s,{expectedRevision:s.revision,made});
test('Gauntlet starts with deterministic, short display and consistent stance',()=>{
 const s=start(); const p=currentPuttingChallenge(s);
 assert.deepEqual([p.feet,p.stance,p.player,p.round],[10,'STRADDLE','AND',1]);
 assert.ok(p.prompt.length<=63);
});
test('All players get same challenge each round',()=>{
 let s=start();let a=currentPuttingChallenge(s);s=submit(s,true);let b=currentPuttingChallenge(s);
 assert.equal(a.feet,b.feet);assert.equal(a.stance,b.stance);assert.equal(b.player,'JAM');
});
test('Gauntlet advances one round only when every player has attempted',()=>{
 let s=start();s=submit(s,true);assert.equal(s.round,0);s=submit(s,false);
 assert.equal(s.round,1);assert.deepEqual(s.attempts,[1,1]);assert.deepEqual(s.makes,[1,0]);
});
test('Gauntlet finishes exactly at round limit and ranks makes',()=>{
 let s=start('gauntlet',['AND','JAM'],{maxRounds:2});
 for(let k=0;k<4;k++)s=submit(s,k%2===0);
 assert.equal(s.done,true);assert.equal(s.round,2);assert.equal(currentPuttingChallenge(s),null);
 assert.deepEqual(puttingStandings(s).map(z=>z.name),['AND','JAM']);
 assert.throws(()=>submit(s,true),/finished/);
});
test('Ladder advances only on make, miss repeats same rung',()=>{
 let s=start('ladder',['AND']);const first=currentPuttingChallenge(s);
 s=submit(s,false);assert.equal(currentPuttingChallenge(s).feet,first.feet);
 s=submit(s,true);assert.equal(currentPuttingChallenge(s).feet,15);
});
test('Ladder finishes after completing full 35ft rung',()=>{
 let s=start('ladder',['AND'],{maxRounds:12});
 for(let k=0;k<6;k++)s=submit(s,true);
 assert.equal(s.done,true);assert.equal(s.rungs[0],6);assert.equal(s.round,6);
});
test('Ladder last equal-turn round before finish',()=>{
 let s=start('ladder',['AND','JAM'],{maxRounds:12});
 for(let k=0;k<5;k++){s=submit(s,true);s=submit(s,false)}
 s=submit(s,true);assert.equal(s.done,false);
 s=submit(s,false);assert.equal(s.done,true);assert.deepEqual(s.attempts,[6,6]);
});
test('Stale result/double tap cannot mutate existing state',()=>{
 const s=start();let n=submit(s,true);assert.throws(()=>recordPuttingAttempt(n,{expectedRevision:s.revision,made:true}),/duplicate/);
 assert.equal(s.revision,0);assert.equal(n.revision,1);
});
test('Reject invalid player names, duplicates, mode and rounds',()=>{
 assert.throws(()=>start('unknown'),/unsupported/);
 assert.throws(()=>start('gauntlet',['A','a']),/duplicate/);
 assert.throws(()=>start('gauntlet',['A\nB']),/safe/);
 assert.throws(()=>start('gauntlet',[]),/1 to 12/);
 assert.throws(()=>start('gauntlet',['A'],{maxRounds:25}),/1-24/);
});
test('Reject nonboolean and missing attempt acknowledgments',()=>{
 const s=start();assert.throws(()=>recordPuttingAttempt(s,{expectedRevision:0,made:1}),/make or miss/);
 assert.throws(()=>recordPuttingAttempt(s,{made:true}),/stale/);
});
test('JSON snapshot restores and rejects malformed/replayed records',()=>{
 let s=submit(start(),true);
 assert.deepEqual(restorePuttingGame(JSON.stringify(s)),s);
 assert.throws(()=>restorePuttingGame(JSON.stringify({...s,revision:-1})),/revision/);
 assert.throws(()=>restorePuttingGame(JSON.stringify({...s,rungs:[-1,0]})),/progress/);
});
test('No external side effects or network transport exist in the core',async()=>{
 let fs=await import('node:fs');const src=fs.readFileSync(new URL('./engine.mjs', import.meta.url),'utf8');
 for(const t of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.', 'localStorage.', 'http://', 'https://']) assert.ok(!src.includes(t), t);
});
