/** Source-only UDisc snapshot adapter. No persistence or network access. */
const clean = v => String(v ?? '').trim();
const key = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const holes = Array.from({length:18},(_,i)=>[`hole ${i+1}`,`hole_${i+1}`,`h${i+1}`]);
const names = ['team','team name','team_name','players','player','name','username','usernames'];

export function parseUdiscAoA(aoa, {eventId,capturedAt,version}={}) {
  if (!Array.isArray(aoa) || aoa.length<2) throw Error('Snapshot has no standings rows.');
  if (!eventId || !capturedAt || !Number.isFinite(Number(version))) throw Error('Snapshot metadata is incomplete.');
  const headers=aoa[0].map(key), col=choices=>headers.findIndex(h=>choices.map(key).includes(h));
  const team=col(names), rank=col(['rank','position','place','finish']), total=col(['total','score','round total','round_total_score']);
  if(team<0||rank<0) throw Error('Required team or UDisc rank column is missing.');
  const holeCols=holes.map(col);
  const rows=aoa.slice(1).filter(r=>Array.isArray(r)&&clean(r[team])).map(r=>{
    const scores=holeCols.map(i=>i<0||r[i]===''||r[i]==null?null:Number(r[i]));
    if(scores.some(n=>n!==null&&(!Number.isInteger(n)||n<1||n>99))) throw Error(`Invalid hole score for ${clean(r[team])}.`);
    const sum=scores.reduce((a,n)=>a+(n||0),0), t=total<0||r[total]===''||r[total]==null?sum:Number(r[total]);
    if(!Number.isFinite(t)) throw Error(`Invalid total for ${clean(r[team])}.`);
    return Object.freeze({sourceRank:clean(r[rank]),sourceTeam:clean(r[team]),scores:Object.freeze(scores),total:t});
  });
  if(!rows.length) throw Error('Snapshot has no recognizable teams.');
  return Object.freeze({eventId:String(eventId),capturedAt:new Date(capturedAt).toISOString(),version:Number(version),rows:Object.freeze(rows)});
}

export function publishSnapshot(model,snapshot) {
  if(!snapshot?.rows?.length) throw Error('Cannot publish an empty snapshot.');
  if(model?.eventId&&model.eventId!==snapshot.eventId) throw Error('Snapshot event does not match this read model.');
  const prev=model?.snapshots?.at(-1);
  if(prev&&snapshot.version<prev.version)return{model,disposition:'stale'};
  if(prev&&snapshot.version===prev.version){
    if(JSON.stringify(prev.rows)===JSON.stringify(snapshot.rows))return{model,disposition:'duplicate'};
    throw Error('Snapshot version was reused with different standings.');
  }
  return{disposition:'published',model:Object.freeze({eventId:snapshot.eventId,snapshots:Object.freeze([...(model?.snapshots||[]),snapshot])})};
}

export function standingsForPreview(model,aliases={}) {
  const snap=model?.snapshots?.at(-1);if(!snap)return[];
  const map=new Map(Object.entries(aliases).map(([a,b])=>[key(a),clean(b)]));
  return snap.rows.map(r=>({rank:r.sourceRank,team:r.sourceTeam.split(/\s*(?:\/|\+|&)\s*/).map(n=>map.get(key(n))||n).join(' / '),sourceTeam:r.sourceTeam,total:r.total,scores:r.scores}));
}

export function renderStandings(container,model,aliases={}) {
  const rows=standingsForPreview(model,aliases);if(!rows.length){container.textContent='No snapshot loaded.';return;}
  const table=document.createElement('table'),head=table.createTHead().insertRow();
  for(const label of ['UDisc rank','Team','Total','Hole scores']){const th=document.createElement('th');th.textContent=label;head.append(th);}
  const body=table.createTBody();for(const r of rows){const tr=body.insertRow();const vals=[r.rank,r.team,r.total,r.scores.map((n,i)=>n==null?'':`${i+1}:${n}`).filter(Boolean).join(' · ')];for(const v of vals){const td=tr.insertCell();td.textContent=String(v);}}
  container.replaceChildren(table);
}
