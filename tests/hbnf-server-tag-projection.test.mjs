import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {TextEncoder} from 'node:util';

const source=await readFile(new URL('../public/hbnf-league-state-sync.js',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function syncHelper(){
  const window={crypto:webcrypto,TextEncoder};
  vm.runInNewContext(source,{window,TextEncoder,Uint8Array,Set,Object,Array,JSON,Date,Number,Math,Error,String,Promise});
  return window.HBNFLeagueStateSync;
}
const initial=()=>({skins:{weeks:{test:{front:{winners:{1:'Mason'}}}}},glow:{payouts:{winner:'Mason',amount:20},acePots:{main:500,reserve:200}},admin:{backups:[{id:'prior-history'}]},random:{},bagTags:{players:[],manual:{}}});
function db(root,{projectTags=true,corruptPayout=false,onWrite=()=>{}}={}){
  let row={id:1,state_json:clone(root),updated_at:'2026-11-02T08:00:00.000Z'},reads=0,writes=0;
  const client={
    from(name){assert.equal(name,'league_state');return{select(){return{eq(){return{single:async()=>{reads++;return{data:clone(row),error:null}}}}}}}},
    async rpc(name,params){
      assert.equal(name,'hbnf_save_league_state_v1');writes++;
      onWrite({row,set(value){row=clone(value)},writes});
      if(params.p_expected_updated_at!==row.updated_at)return{data:[],error:null};
      row={id:1,state_json:clone(params.p_state_json),updated_at:new Date(Date.parse(row.updated_at)+1).toISOString()};
      if(projectTags)row.state_json.bagTags={...row.state_json.bagTags,players:[{tag:1,name:'Mason'}],manual:{Mason:1}};
      if(corruptPayout)row.state_json.glow.payouts={winner:'wrong',amount:-1};
      return{data:[clone(row)],error:null};
    }
  };
  return{client,get:()=>clone(row),counts:()=>({reads,writes})};
}
test('server-owned tag projection does not falsely reject confirmed score; payout/ace/history and reopen survive',async()=>{
  const sync=syncHelper(),server=db(initial()),base=await sync.read(server.client),draft=clone(base.root);
  draft.skins.weeks.test.front.winners[2]='Tony';
  const saved=await sync.save(server.client,base,draft);
  assert.equal(server.counts().writes,1);
  assert.equal(saved.root.skins.weeks.test.front.winners[2],'Tony');
  assert.deepEqual(saved.root.glow,initial().glow);
  assert.deepEqual(saved.root.admin,initial().admin);
  assert.deepEqual(saved.root.bagTags.manual,{Mason:1});
  assert.deepEqual((await sync.read(server.client)).root,saved.root);
});
test('authored tag change and unrelated payout corruption still fail closed',async t=>{
  await t.test('authored tag edit',async()=>{
    const sync=syncHelper(),server=db(initial()),base=await sync.read(server.client),draft=clone(base.root);
    draft.bagTags.manual={Someone:42};
    await assert.rejects(sync.save(server.client,base,draft),/acknowledgment did not match/);
  });
  await t.test('payout corruption',async()=>{
    const sync=syncHelper(),server=db(initial(),{corruptPayout:true}),base=await sync.read(server.client),draft=clone(base.root);
    draft.skins.weeks.test.front.winners[2]='Tony';
    await assert.rejects(sync.save(server.client,base,draft),/acknowledgment did not match/);
  });
});
test('second-device stale CAS retries without erasing remote score, payout or history',async()=>{
  let once=false;
  const server=db(initial(),{onWrite({row,set}){if(once)return;once=true;const newer=clone(row);newer.state_json.random={otherDevice:'saved'};newer.updated_at='2026-11-02T08:00:00.002Z';set(newer)}});
  const sync=syncHelper(),base=await sync.read(server.client),draft=clone(base.root);
  draft.skins.weeks.test.front.winners[3]='Andrew';
  const saved=await sync.save(server.client,base,draft);
  assert.equal(server.counts().writes,2);
  assert.equal(saved.root.skins.weeks.test.front.winners[3],'Andrew');
  assert.equal(saved.root.random.otherDevice,'saved');
  assert.deepEqual(saved.root.glow,initial().glow);
  assert.deepEqual(saved.root.admin,initial().admin);
  assert.deepEqual((await sync.read(server.client)).root,saved.root);
});
test('actual Skins carry/tiebreaker payout formula survives save and reopen',async()=>{
  const html=await readFile(new URL('../public/skins.html',import.meta.url),'utf8');
  const start=html.indexOf('function calcCard(card,type,startHole)'),end=html.indexOf('function calcCardNetByRow(',start);
  assert(start>=0&&end>start);
  const ctx={};
  vm.runInNewContext("function frontRows(c){return c.playersText.split('\\n').map((name,i)=>({id:c.id+'_p_'+i,name,players:[name]}))}\nfunction backRows(c){return c.rows}\nfunction cardPlayerCount(r){return r.reduce((a,v)=>a+v.players.length,0)}\n"+html.slice(start,end)+"\nglobalThis.calcCard=calcCard;",ctx);
  const root=initial();root.skins.weeks.test.front.cards=[{id:'C1',playersText:'Mason\nTony\nJason',winners:{1:'C1_p_0',3:'C1_p_1',tb:'C1_p_2'}}];
  const server=db(root),sync=syncHelper(),base=await sync.read(server.client),draft=clone(base.root);
  draft.skins.weeks.test.front.cards[0].winners[4]='C1_p_0';
  const ack=await sync.save(server.client,base,draft);
  const result=ctx.calcCard(ack.root.skins.weeks.test.front.cards[0],'front',1);
  assert.deepEqual({...result.totals},{C1_p_0:4,C1_p_1:4,C1_p_2:10});
  assert.equal(result.unclaimed,0);
  assert.deepEqual((await sync.read(server.client)).root.skins.weeks.test.front.cards[0].winners,ack.root.skins.weeks.test.front.cards[0].winners);
});
