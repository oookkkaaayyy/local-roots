const assert = require('node:assert/strict');
const { deleteWeek, restoreWeek, TABLES } = require('../public/skins-week-recovery.js');

const date = '2026-10-27';
const otherDate = '2026-11-03';
const week = { finalized: false, front: { cards: [{ playersText: 'A\nB', winners: { 1: 'A' } }] }, back: { cards: [] } };
const tag = (table, d, id, revision=1) => table === TABLES[0]
  ? { round_date:d,event_type:'skins',player_key:id,player_name:id,tag_number:7,status:'active',revision,created_at:'old',updated_at:'old',client_edit_id:'edit-'+id }
  : { round_date:d,event_type:'skins',tag_number:Number(id),source:'round',notes:'',revision,created_at:'old',updated_at:'old',client_edit_id:'edit-'+id };

function provider(options={}) {
  let revision=1, nowTick=0;
  const events=[];
  const state={root:{skins:{weeks:{[date]:structuredClone(week),[otherDate]:{finalized:true,front:{cards:[]},back:{cards:[]}}},deletedWeeks:{},restoredWeeks:{}},bagTags:{balances:{Fox:3}},other:{keep:true},__backups:[{id:'ordinary',label:'retain'}]},tags:{}};
  for(const table of TABLES) state.tags[table]=[tag(table,date,table===TABLES[0]?'player-a':'7'),tag(table,otherDate,table===TABLES[0]?'player-z':'8')];
  return Object.assign({events,state,now:()=>`2026-10-24T00:00:${String(++nowTick).padStart(2,'0')}.000Z`,
    async readRoot(){events.push('root-read');return{root:structuredClone(state.root),revision:String(revision)}},
    async casRoot(expected,next){events.push('root-cas');if(options.rootConflict){options.rootConflict=false;revision++;return{acknowledged:false}}if(String(revision)!==expected)return{acknowledged:false};state.root=structuredClone(next);revision++;events.push('root-ack');return{acknowledged:true}},
    async readTagRows(table,d){events.push('rows-read:'+table);return structuredClone(state.tags[table].filter(x=>x.round_date===d).sort((a,b)=>String(a.player_key||a.tag_number).localeCompare(String(b.player_key||b.tag_number))))},
    async readTagRow(table,row){return structuredClone(state.tags[table].find(x=>x.round_date===row.round_date&&x.event_type===row.event_type&&(x.player_key===row.player_key||x.tag_number===row.tag_number))||null)},
    async deleteTagRow(table,row){events.push('tag-delete:'+table);if(options.revisionConflict){options.revisionConflict=false;const r=state.tags[table].find(x=>x.round_date===row.round_date);r.revision++;r.notes='newer';return{acknowledged:false}}if(options.partialDelete){options.partialDelete=false;return{acknowledged:false}}const i=state.tags[table].findIndex(x=>x.round_date===row.round_date&&x.event_type===row.event_type&&(x.player_key===row.player_key||x.tag_number===row.tag_number)&&x.revision===row.revision);if(i<0)return{acknowledged:false};state.tags[table].splice(i,1);return{acknowledged:true}},
    async insertTagRow(table,row){events.push('tag-insert:'+table);if(options.partialInsert){options.partialInsert=false;throw new Error('injected interrupted restore')}if(await this.readTagRow(table,row))return{acknowledged:true};state.tags[table].push(structuredClone(row));return{acknowledged:true}}
  },{findEnvelope(){return state.root.__backups.find(x=>x.kind==='hbnf-week-recovery-v1')},revision:()=>revision});
}

(async()=>{
  {
    const p=provider();const out=await deleteWeek(p,date);assert.equal(out.status,'deleted');
    const firstDelete=p.events.findIndex(x=>x.startsWith('tag-delete:'));
    const preparedReadback=p.events.findIndex((x,i)=>x==='root-read'&&i>0);assert.ok(preparedReadback>=0&&preparedReadback<firstDelete,'snapshot/root readback must precede tag deletion');
    assert.ok(!p.state.root.skins.weeks[date]);assert.ok(p.state.root.skins.weeks[otherDate]);assert.equal(p.state.root.bagTags.balances.Fox,3);assert.deepEqual(p.state.tags[TABLES[0]].map(x=>x.round_date),[otherDate]);
    const id=p.findEnvelope().id;await restoreWeek(p,id);assert.deepEqual(p.state.root.skins.weeks[date],week);assert.ok(p.state.root.skins.weeks[otherDate]);assert.equal(p.state.root.other.keep,true);assert.equal(p.state.root.bagTags.balances.Fox,3);assert.equal(p.findEnvelope().status,'restored');
    assert.equal((await restoreWeek(p,id)).idempotent,true,'restore retry should be idempotent');
  }
  {
    const p=provider({rootConflict:true});await assert.rejects(()=>deleteWeek(p,date),/revision conflict/);assert.ok(p.state.root.skins.weeks[date]);assert.equal(p.events.some(x=>x.startsWith('tag-delete:')),false);
  }
  {
    const p=provider({revisionConflict:true});await assert.rejects(()=>deleteWeek(p,date),/not acknowledged|revision changed/);assert.equal(p.state.tags[TABLES[0]][0].revision,2);assert.equal(p.state.tags[TABLES[0]][0].notes,'newer');assert.ok(p.findEnvelope());
  }
  {
    const p=provider({partialDelete:true});await assert.rejects(()=>deleteWeek(p,date),/not acknowledged/);assert.equal(p.findEnvelope().status,'recovery-required');assert.ok(p.state.root.skins.deletedWeeks[date]);await restoreWeek(p,p.findEnvelope().id);assert.deepEqual(p.state.root.skins.weeks[date],week);
  }
  {
    const p=provider({partialInsert:true});await deleteWeek(p,date);const id=p.findEnvelope().id;await assert.rejects(()=>restoreWeek(p,id),/interrupted restore/);assert.ok(p.findEnvelope());await restoreWeek(p,id);assert.deepEqual(p.state.root.skins.weeks[date],week);for(const t of TABLES)assert.equal(p.state.tags[t].filter(x=>x.round_date===date).length,1);
  }
  {
    const p=provider();await deleteWeek(p,date);const id=p.findEnvelope().id;p.state.tags[TABLES[0]].push(tag(TABLES[0],date,'player-a',9));await assert.rejects(()=>restoreWeek(p,id),/conflict/);assert.equal(p.state.tags[TABLES[0]].find(x=>x.round_date===date).revision,9);assert.ok(!p.state.root.skins.weeks[date]);
  }
  console.log('PASS: ACK/readback-before-delete, root CAS conflict, tag revision conflict, partial delete recovery, partial restore retry/idempotence, unrelated state preservation, restore conflict refusal');
})().catch(error=>{console.error(error);process.exitCode=1});
