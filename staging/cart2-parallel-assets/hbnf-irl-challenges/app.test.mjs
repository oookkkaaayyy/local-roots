import test from 'node:test';
import assert from 'node:assert/strict';
import {startSession,commitAttempt,undoAttempt,readSession,writeSession,clearSession,gameView,GAME_KEY} from './app.mjs';
function memoryStore() {
  const m=new Map();return {
    getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),raw:m
  };
}
test('New standalone session has playable first turn and no undo',()=>{
  const s=startSession({mode:'gauntlet',players:['AND','JAM'],maxRounds:2});
  assert.deepEqual([s.game.revision,gameView(s).challenge.player,gameView(s).canUndo],[0,'AND',false]);
});
test('Make and miss advance exactly one player, record standings',()=>{
  let s=startSession({mode:'gauntlet',players:['AND','JAM'],maxRounds:2});
  s=commitAttempt(s,0,true);
  assert.deepEqual([s.game.revision,gameView(s).challenge.player,gameView(s).standings[0].name],[1,'JAM','AND']);
  s=commitAttempt(s,1,false);
  assert.equal(gameView(s).round,2);
  assert.deepEqual(s.game.attempts,[1,1]);
});
test('Undo restores one move and clears pending undo, without altering source',()=>{
  const a=startSession({mode:'gauntlet',players:['AND','JAM'],maxRounds:2});
  const b=commitAttempt(a,0,true);const c=undoAttempt(b);
  assert.deepEqual(c.game,a.game);assert.equal(gameView(c).canUndo,false);
  assert.equal(a.game.revision,0);assert.equal(b.game.revision,1);
  assert.throws(()=>undoAttempt(c),/no attempt/);
});
test('Storage saves, reloads and clears identical state with no network',()=>{
  const store=memoryStore();const a=startSession({mode:'ladder',players:['AND'],maxRounds:6});
  assert.equal(writeSession(store,a),true);
  const b=readSession(store);assert.deepEqual(b,a);
  const c=commitAttempt(b,0,true);writeSession(store,c);
  assert.deepEqual(readSession(store),c);
  clearSession(store);assert.equal(readSession(store),null);
});
test('Corrupt storage, stale revisions and untrusted snapshots fail closed',()=>{
  const store=memoryStore(),a=startSession({mode:'gauntlet',players:['AND']});
  store.setItem(GAME_KEY,'{bad');assert.equal(readSession(store),null);
  store.setItem(GAME_KEY,'X'.repeat(9000));assert.equal(readSession(store),null);
  assert.throws(()=>commitAttempt(a,99,true),/stale or duplicate/);
  assert.throws(()=>writeSession(store,{...a,game:{...a.game,players:['<script>']}}),/safe characters/);
});
test('Private mode/storage unavailable retains playable session without persistence',()=>{
  const store={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
  const s=startSession({mode:'gauntlet',players:['AND']});
  assert.equal(readSession(store),null);assert.equal(writeSession(store,s),false);assert.equal(clearSession(store),false);
  assert.equal(gameView(commitAttempt(s,0,true)).done,false);
});
test('Pressure ladder standings favor rung advancement over raw attempts',()=>{
  let s=startSession({mode:'ladder',players:['AND','JAM'],maxRounds:2});
  s=commitAttempt(s,0,false);s=commitAttempt(s,1,true);
  assert.deepEqual(gameView(s).standings.map(x=>x.name),['JAM','AND']);
});
test('No direct API, device or scoring writes in app controller',async()=>{
  const fs=await import('node:fs'); const js=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
  for(const literal of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'http://', 'https://', 'POST','/json/state'])
    assert.ok(!js.includes(literal),literal);
});
