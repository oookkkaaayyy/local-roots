/** Local-only UDisc snapshot normalization. No persistence, network, or HBNF writes. */
const clean = value => String(value ?? '').trim();
const key = value => clean(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const scoreHeaders = Array.from({length:18},(_,i)=>[`hole_${i+1}`,`hole ${i+1}`,`h${i+1}`]);
const aliases = {
  names:['name','team','team_name','team name','players'],
  rank:['position','position_raw','rank','place','finish'],
  usernames:['usernames','username','udisc_usernames','udisc usernames'],
  eventRelative:['event_relative_score','event relative score'],
  eventStrokes:['event_total_score','event total score'],
  roundRelative:['round_relative_score','round relative score'],
  roundStrokes:['round_total_score','round total score'],
  division:['division']
};
const canonical = header => key(header).replace(/\s+/g,'_');
const numeric = (value,label,allowBlank=false) => {
  if(value===''||value==null){if(allowBlank)return null;throw Error(`${label} is missing.`);}
  const n=Number(value);if(!Number.isFinite(n))throw Error(`${label} must be numeric.`);return n;
};
const splitNames = value => clean(value).split(/\s*&\s*/).map(clean).filter(Boolean);
const splitUsernames = value => clean(value).split(/\s*,\s*/).map(clean).filter(Boolean);
const jsonEqual = (a,b) => JSON.stringify(a)===JSON.stringify(b);

export function parseUdiscAoA(aoa,{eventId,observedAtLocal=new Date().toISOString(),sourceUpdatedAt=null}={}) {
  if(!Array.isArray(aoa)||aoa.length<2)throw Error('Workbook has no standings rows.');
  if(!clean(eventId))throw Error('Choose the event identity for this snapshot.');
  const headers=aoa[0].map(canonical), col=choices=>headers.findIndex(h=>choices.map(canonical).includes(h));
  const nameCol=col(aliases.names),rankCol=col(aliases.rank),userCol=col(aliases.usernames);
  const rawRankCol=col(['position_raw']);
  if(nameCol<0||rankCol<0)throw Error('Required UDisc team name or position column is missing.');
  const holeCols=scoreHeaders.map(col);
  const missing=holeCols.map((i,n)=>i<0?n+1:null).filter(Boolean);
  if(missing.length)throw Error(`Workbook is missing required hole columns: ${missing.join(', ')}.`);
  const getCol=field=>col(aliases[field]);
  const relativeCol=getCol('eventRelative')>=0?getCol('eventRelative'):getCol('roundRelative');
  const strokesCol=getCol('eventStrokes')>=0?getCol('eventStrokes'):getCol('roundStrokes');
  const rows=aoa.slice(1).map((r,index)=>({r,index})).filter(({r})=>Array.isArray(r)&&r.some(v=>clean(v)!=='' )).map(({r,index})=>{
    const sourceTeam=clean(r[nameCol]), sourceRank=clean(r[rankCol]);
    if(!/^(?:T?\d+|T?\d+\s*[-–]\s*T?\d+)$/i.test(sourceRank))throw Error(`Row ${index+2} has an invalid UDisc position.`);
    if(!sourceTeam)throw Error(`Row ${index+2} has scores/data but no team name.`);
    if(!sourceRank)throw Error(`Row ${index+2} has no UDisc position.`);
    const scores=holeCols.map((c,i)=>{
      const n=numeric(r[c],`Row ${index+2}, hole ${i+1}`,true);
      if(n!==null&&(!Number.isInteger(n)||n<1||n>99))throw Error(`Row ${index+2}, hole ${i+1} must be an integer stroke count from 1 to 99.`);
      return n;
    });
    const complete=scores.every(n=>n!==null);
    const eventRelative=relativeCol<0?null:numeric(r[relativeCol],`Row ${index+2}, relative-to-par score`,true);
    const strokeTotal=strokesCol<0?null:numeric(r[strokesCol],`Row ${index+2}, absolute stroke total`,true);
    if(eventRelative===null&&strokeTotal===null)throw Error(`Row ${index+2} has neither relative score nor absolute stroke total.`);
    if(complete&&strokeTotal!==null&&scores.reduce((a,n)=>a+n,0)!==strokeTotal)throw Error(`Row ${index+2} hole scores do not match the absolute stroke total.`);
    const members=splitNames(sourceTeam), usernames=userCol<0?[]:splitUsernames(r[userCol]);
    return Object.freeze({
      sourceRow:index+2,division:getCol('division')<0?'':clean(r[getCol('division')]),
      sourceRank,sourceRankRaw:rawRankCol<0?'':clean(r[rawRankCol]),sourceTeam,
      members:Object.freeze(members),usernames:Object.freeze(usernames),
      memberAlignment:members.length===usernames.length,
      relativeScore:eventRelative,strokeTotal,holeStrokesTotal:complete?scores.reduce((a,n)=>a+n,0):null,
      scores:Object.freeze(scores),holesComplete:complete,holesCompleted:scores.filter(n=>n!==null).length
    });
  });
  if(!rows.length)throw Error('Workbook has no recognizable UDisc teams.');
  const observed=new Date(observedAtLocal);
  if(!Number.isFinite(observed.getTime()))throw Error('Local observation time is invalid.');
  let sourceUpdated=null;
  if(sourceUpdatedAt!==null&&sourceUpdatedAt!==undefined&&sourceUpdatedAt!==''){
    sourceUpdated=new Date(sourceUpdatedAt);if(!Number.isFinite(sourceUpdated.getTime()))throw Error('Source-provided update time is invalid.');sourceUpdated=sourceUpdated.toISOString();
  }
  const content=rows.map(({sourceRow,division,sourceRank,sourceRankRaw,sourceTeam,members,usernames,relativeScore,strokeTotal,scores})=>({sourceRow,division,sourceRank,sourceRankRaw,sourceTeam,members,usernames,relativeScore,strokeTotal,scores}));
  return Object.freeze({eventId:clean(eventId),observedAtLocal:observed.toISOString(),sourceUpdatedAt:sourceUpdated,rows:Object.freeze(rows),contentSignature:JSON.stringify(content)});
}

export function publishSnapshot(model,snapshot) {
  if(!snapshot?.rows?.length)throw Error('Cannot add an empty snapshot.');
  if(model?.eventId&&model.eventId!==snapshot.eventId)throw Error('Snapshot event does not match this read model.');
  const history=model?.snapshots||[];
  if(history.some(existing=>existing.contentSignature===snapshot.contentSignature))return{model,disposition:'duplicate'};
  const previous=history.at(-1);
  if(previous?.sourceUpdatedAt&&snapshot.sourceUpdatedAt&&Date.parse(snapshot.sourceUpdatedAt)<Date.parse(previous.sourceUpdatedAt))return{model,disposition:'stale'};
  const next=Object.freeze({...snapshot,localImportNumber:history.length+1,freshness:previous?.sourceUpdatedAt&&snapshot.sourceUpdatedAt?'source_timestamp_checked':'upstream_freshness_unknown'});
  return{disposition:'published',model:Object.freeze({eventId:snapshot.eventId,snapshots:Object.freeze([...history,next])})};
}

export function standingsForPreview(model,playerAliases={}) {
  const snap=model?.snapshots?.at(-1);if(!snap)return[];
  const map=new Map(Object.entries(playerAliases).map(([a,b])=>[key(a),clean(b)]));
  return snap.rows.map(row=>{
    const members=row.members.length?row.members:row.usernames;
    const display=members.map((member,index)=>map.get(key(member))||map.get(key(row.usernames[index]))||member);
    return{rank:row.sourceRank,team:display.join(' / ')||row.sourceTeam,relativeScore:row.relativeScore,strokeTotal:row.strokeTotal,scores:row.scores,holesComplete:row.holesComplete,holesCompleted:row.holesCompleted,memberAlignment:row.memberAlignment};
  });
}

export function renderStandings(container,model,playerAliases={}) {
  const rows=standingsForPreview(model,playerAliases);if(!rows.length){container.textContent='No snapshot loaded.';return;}
  const table=document.createElement('table'),head=table.createTHead().insertRow();
  for(const label of ['UDisc rank','Team','To par','Strokes','Holes','Hole scores']){const th=document.createElement('th');th.textContent=label;head.append(th);}
  const body=table.createTBody();for(const row of rows){const tr=body.insertRow();const values=[row.rank,row.team,row.relativeScore??'—',row.strokeTotal??'—',`${row.holesCompleted}/18`,row.scores.map((n,i)=>n==null?'':`${i+1}:${n}`).filter(Boolean).join(' · ')];for(const value of values){const td=tr.insertCell();td.textContent=String(value);}}
  container.replaceChildren(table);
}
