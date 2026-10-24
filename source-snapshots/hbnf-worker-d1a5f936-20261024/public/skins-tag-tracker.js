/*
 * HB Night Flyers — Live Bag Tag Tracker
 * Build: 9.8.26_1
 *
 * Non-destructive scorecard enhancement. It projects the selected week's
 * bag-tag redistribution through a chosen hole by reusing the site's existing
 * incoming-tag and redistribution rules. It does not save or overwrite tags.
 */
(function(){
  'use strict';

  const BUILD='9.8.26_1';
  const PANEL_ID='hbnfLiveTagTracker';
  const STYLE_ID='hbnfLiveTagTrackerStyles';
  const STORAGE_PREFIX='hbnf_skins_live_tag_through_';
  let observedFront=null;
  let observedBack=null;
  let renderQueued=false;

  function q(selector,root){return (root||document).querySelector(selector)}
  function qa(selector,root){return Array.from((root||document).querySelectorAll(selector))}
  function safeText(value){return String(value==null?'':value)}
  function cleanName(value){
    try{if(typeof btCleanName==='function')return btCleanName(value)}catch(_e){}
    return safeText(value).trim();
  }
  function escHtml(value){
    try{if(typeof esc==='function')return esc(value)}catch(_e){}
    return safeText(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function uniqueNamesLocal(values){
    try{if(typeof uniqueNames==='function')return uniqueNames(values)}catch(_e){}
    const seen=new Set(),out=[];
    (values||[]).forEach(value=>{
      const name=cleanName(value),key=name.toLowerCase();
      if(name&&!seen.has(key)){seen.add(key);out.push(name)}
    });
    return out;
  }
  function getWeekSafe(){
    try{if(typeof getWeek==='function')return getWeek()}catch(err){console.error('Live tag tracker could not read week',err)}
    return null;
  }
  function getWeekKey(){
    try{if(typeof ctx!=='undefined'&&ctx&&ctx.state&&ctx.state.activeWeek)return String(ctx.state.activeWeek)}catch(_e){}
    const select=q('#weekSelect');
    return select&&select.value?String(select.value):'unknown';
  }
  function storageKey(){return STORAGE_PREFIX+getWeekKey()}
  function clampHole(value){
    const num=Math.round(Number(value)||0);
    return Math.max(0,Math.min(18,num));
  }
  function storedThrough(){
    try{
      const value=localStorage.getItem(storageKey());
      if(value!==null&&value!=='')return clampHole(value);
    }catch(_e){}
    return latestCheckedHole();
  }
  function saveThrough(value){
    const through=clampHole(value);
    try{localStorage.setItem(storageKey(),String(through))}catch(_e){}
    return through;
  }
  function latestCheckedHole(){
    let latest=0;
    qa('.skin-check:checked').forEach(input=>{
      const hole=Number(input.dataset&&input.dataset.hole);
      if(Number.isFinite(hole)&&hole>=1&&hole<=18)latest=Math.max(latest,hole);
    });
    return latest;
  }
  function tagNumber(map,name){
    try{if(typeof tagNumForName==='function')return Number(tagNumForName(map,name))||0}catch(_e){}
    const key=cleanName(name).toLowerCase();
    const match=Object.entries(map||{}).find(entry=>cleanName(entry[0]).toLowerCase()===key);
    return match?Number(match[1])||0:0;
  }
  function incomingTags(){
    try{
      if(typeof window.HBNFIncomingTagMap==='function'&&typeof tagRootState==='function'){
        return window.HBNFIncomingTagMap(tagRootState(),getWeekKey())||{};
      }
      if(typeof bagTagMapBeforeDate==='function'&&typeof tagRootState==='function'){
        return bagTagMapBeforeDate(tagRootState(),getWeekKey())||{};
      }
    }catch(err){console.error('Live tag tracker incoming-tag calculation failed',err)}
    return {};
  }
  function rowNames(row,type){
    if(type==='front')return uniqueNamesLocal([row&&row.name]);
    const players=row&&Array.isArray(row.players)&&row.players.length?row.players:[row&&row.name];
    return uniqueNamesLocal(players);
  }
  function rowsForCard(card,type){
    try{
      if(type==='front'&&typeof frontRows==='function')return frontRows(card)||[];
      if(type==='back'&&typeof backRows==='function')return backRows(card)||[];
    }catch(err){console.error('Live tag tracker row calculation failed',err)}
    return [];
  }
  function getRecord(records,name){
    const clean=cleanName(name),key=clean.toLowerCase();
    if(!clean)return null;
    if(!records.has(key))records.set(key,{name:clean,score:0});
    return records.get(key);
  }
  function collectRound(records,round,type,startHole,through){
    if(!round||!Array.isArray(round.cards))return;
    const includeRound=type==='front'||through>=10;
    if(!includeRound)return;
    const lastHole=Math.min(startHole+8,through);
    round.cards.forEach(card=>{
      const rows=rowsForCard(card,type);
      rows.forEach(row=>rowNames(row,type).forEach(name=>getRecord(records,name)));
      if(lastHole<startHole)return;
      let carry=1;
      for(let hole=startHole;hole<=lastHole;hole++){
        const winnerId=card&&card.winners&&card.winners[String(hole)];
        const winner=rows.find(row=>row.id===winnerId);
        if(winner){
          rowNames(winner,type).forEach(name=>{
            const record=getRecord(records,name);
            if(record)record.score+=carry;
          });
          carry=1;
        }else{
          carry++;
        }
      }
      if(through>=startHole+8){
        const tieId=card&&card.winners&&card.winners.tb;
        const tieWinner=rows.find(row=>row.id===tieId);
        if(tieWinner&&carry>1){
          rowNames(tieWinner,type).forEach(name=>{
            const record=getRecord(records,name);
            if(record)record.score+=(carry-1);
          });
        }
      }
    });
  }
  function partialRows(through){
    const week=getWeekSafe(),records=new Map();
    if(!week)return [];
    collectRound(records,week.front,'front',1,through);
    collectRound(records,week.back,'back',10,through);
    return Array.from(records.values());
  }
  function partialRowsFor(type,through){
    const week=getWeekSafe(),records=new Map();
    if(!week)return [];
    if(type==='front')collectRound(records,week.front,'front',1,Math.min(9,through));
    else collectRound(records,week.back,'back',10,through);
    return Array.from(records.values());
  }
  function projectTags(incoming,rows){
    const projected=Object.assign({},incoming||{});
    const event={
      type:'skins-live-projection',
      date:getWeekKey(),
      order:1,
      rows:(rows||[]).map(row=>({name:row.name,score:Number(row.score)||0})),
      compare:function(a,b,current){
        return (Number(b.score||0)-Number(a.score||0))||
          ((tagNumber(current,a.name)||9999)-(tagNumber(current,b.name)||9999))||
          cleanName(a.name).localeCompare(cleanName(b.name));
      }
    };
    try{
      if(typeof redistributeTags==='function')redistributeTags(projected,event);
      else console.warn('Live tag tracker: redistributeTags is unavailable.');
    }catch(err){console.error('Live tag tracker projection failed',err)}
    return projected;
  }
  function rankRows(rows,incoming){
    return (rows||[]).slice().sort((a,b)=>(Number(b.score||0)-Number(a.score||0))||
      ((tagNumber(incoming,a.name)||9999)-(tagNumber(incoming,b.name)||9999))||
      cleanName(a.name).localeCompare(cleanName(b.name)));
  }
  function projectionModel(through){
    through=clampHole(through);
    const authoritative=(window.HBNFRoundTags&&typeof window.HBNFRoundTags.projectThrough==='function')?window.HBNFRoundTags.projectThrough(getWeekSafe(),through):null;
    const startOfDay=authoritative&&authoritative.initial?authoritative.initial:incomingTags();
    const isBack=through>=10;
    let afterFront=null,checkpointIncoming=startOfDay,rows=[],projected=startOfDay;
    if(authoritative){
      afterFront=authoritative.frontProjected||(isBack?authoritative.checkpointIncoming:null);
      checkpointIncoming=authoritative.checkpointIncoming||startOfDay;
      rows=Array.isArray(authoritative.rows)?authoritative.rows:[];
      projected=authoritative.projected||checkpointIncoming;
    }else if(isBack){
      const frontRanked=rankRows(partialRowsFor('front',9),startOfDay);
      afterFront=projectTags(startOfDay,frontRanked);
      checkpointIncoming=afterFront;
      rows=partialRowsFor('back',through);
      projected=projectTags(checkpointIncoming,rankRows(rows,checkpointIncoming));
    }else{
      rows=partialRowsFor('front',through);
      projected=projectTags(startOfDay,rankRows(rows,startOfDay));
    }
    const ranked=rankRows(rows,checkpointIncoming);
    const tagRows=ranked.filter(row=>tagNumber(startOfDay,row.name)>0||tagNumber(checkpointIncoming,row.name)>0);
    return{through,isBack,startOfDay,afterFront:afterFront||startOfDay,checkpointIncoming,projected,ranked,tagRows,untaggedCount:ranked.length-tagRows.length};
  }
  function movementLabel(from,to){
    if(!from||!to)return'<span class="tag-move neutral">—</span>';
    const change=from-to;
    if(change>0)return'<span class="tag-move up" aria-label="Improves '+change+' tags">↑'+change+'</span>';
    if(change<0)return'<span class="tag-move down" aria-label="Drops '+Math.abs(change)+' tags">↓'+Math.abs(change)+'</span>';
    return'<span class="tag-move neutral">—</span>';
  }
  function checkpointLabel(through){
    if(through<=0)return'Incoming order before Hole 1';
    if(through<=9)return'Through Hole '+through+' · Front 9 singles';
    if(through<18)return'Front complete · Back through Hole '+through;
    return'Final projection through Hole 18'+(qa('.skin-check[data-hole="tb"]:checked').length?' + tiebreaker':'');
  }
  function optionLabel(hole){
    if(hole===0)return'Before Hole 1';
    if(hole<=9)return'Through Hole '+hole+' (Front)';
    return'Through Hole '+hole+' (Back)';
  }
  function optionsHtml(selected){
    let html='';
    for(let hole=0;hole<=18;hole++)html+='<option value="'+hole+'"'+(hole===selected?' selected':'')+'>'+optionLabel(hole)+'</option>';
    return html;
  }
  function ensureStyles(){
    if(q('#'+STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
#${PANEL_ID}{border-color:rgba(216,255,136,.30);background:linear-gradient(180deg,rgba(20,42,25,.96),rgba(8,22,12,.96))}
#${PANEL_ID} .live-tag-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
#${PANEL_ID} .live-tag-title{margin:0;color:var(--bright)}
#${PANEL_ID} .live-tag-controls{display:flex;align-items:end;gap:8px;flex-wrap:wrap;margin:12px 0 10px}
#${PANEL_ID} .live-tag-controls label{min-width:190px;flex:1 1 210px}
#${PANEL_ID} .live-tag-controls select{width:100%;min-height:44px}
#${PANEL_ID} .live-tag-controls .btn{min-height:44px}
#${PANEL_ID} .live-tag-status{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid rgba(57,255,20,.16);border-radius:14px;background:rgba(0,0,0,.16);margin-bottom:10px}
#${PANEL_ID} .live-tag-status strong{color:var(--bright)}
#${PANEL_ID} .live-tag-top-five{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin:10px 0}
#${PANEL_ID} .live-tag-chip{min-width:0;padding:9px 7px;border-radius:13px;border:1px solid rgba(57,255,20,.16);background:rgba(255,255,255,.025);text-align:center}
#${PANEL_ID} .live-tag-chip b{display:block;color:var(--bright);font-size:.78rem;letter-spacing:.06em}
#${PANEL_ID} .live-tag-chip span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:800;margin-top:2px}
#${PANEL_ID} .live-tag-table-wrap{width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;border:1px solid rgba(57,255,20,.14);border-radius:14px}
#${PANEL_ID} table{width:100%;min-width:0!important;table-layout:fixed;margin:0}
#${PANEL_ID} th,#${PANEL_ID} td{text-align:left;padding:9px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${PANEL_ID} .tag-rank-col{width:3.5rem}
#${PANEL_ID} .tag-player-col{width:auto}
#${PANEL_ID} .tag-score-col{width:4.7rem;text-align:center}
#${PANEL_ID} .tag-number-col{width:5.8rem;text-align:center}
#${PANEL_ID} .tag-projected-col{width:8.2rem;text-align:right}
#${PANEL_ID} .live-tag-table-wrap.is-back table{min-width:650px!important}
#${PANEL_ID} .tag-route{font-weight:900;color:var(--bright)}
#${PANEL_ID} .tag-stage{display:inline-flex;align-items:center;justify-content:center;min-width:2.5rem;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.035);border:1px solid rgba(168,219,115,.13);color:var(--bright);font-weight:900}
#${PANEL_ID} .tag-stage.front-stage{color:#d7ffa8;background:rgba(125,205,98,.08)}
#${PANEL_ID} .live-tag-stage-note{margin:0 0 10px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,212,111,.22);background:rgba(255,212,111,.055);color:rgba(244,247,239,.72);font-size:.82rem;line-height:1.4}
#${PANEL_ID} .live-tag-stage-note strong{color:#ffe29a}
#${PANEL_ID} .tag-move{display:inline-block;min-width:2.2rem;text-align:center;margin-left:5px;border-radius:999px;padding:2px 5px;font-size:.78rem}
#${PANEL_ID} .tag-move.up{background:rgba(121,224,113,.16);color:#b8ff8a}
#${PANEL_ID} .tag-move.down{background:rgba(255,111,125,.15);color:#ff9eaa}
#${PANEL_ID} .tag-move.neutral{color:var(--muted)}
#${PANEL_ID} .live-tag-empty{padding:16px;color:var(--muted);font-style:italic}
#${PANEL_ID} .live-tag-footnote{margin:9px 0 0;color:var(--muted);font-size:.82rem;line-height:1.35}
@media(max-width:620px){
 #${PANEL_ID} .live-tag-top-five{grid-template-columns:repeat(3,minmax(0,1fr));overflow:visible;padding-bottom:0}
 #${PANEL_ID} .live-tag-top-five .live-tag-chip{min-height:0!important;padding:8px 6px}
 #${PANEL_ID} .live-tag-controls{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:end}
 #${PANEL_ID} .live-tag-controls label{min-width:0;grid-column:2}
 #${PANEL_ID} .live-tag-controls [data-live-tag-prev]{grid-column:1;grid-row:1}
 #${PANEL_ID} .live-tag-controls [data-live-tag-next]{grid-column:3;grid-row:1}
 #${PANEL_ID} .live-tag-controls [data-live-tag-latest]{grid-column:1 / -1;width:100%}
 #${PANEL_ID} th,#${PANEL_ID} td{padding:8px 5px;font-size:.78rem}
 #${PANEL_ID} th{font-size:.58rem;letter-spacing:.04em}
 #${PANEL_ID} .tag-rank-col{width:2.8rem}
 #${PANEL_ID} .tag-score-col{width:3.9rem}
 #${PANEL_ID} .tag-number-col{width:5.2rem}
 #${PANEL_ID} .tag-projected-col{width:7.2rem}
 #${PANEL_ID} .live-tag-table-wrap.is-back{overflow-x:hidden!important;border:0!important;background:transparent!important}
 #${PANEL_ID} .live-tag-table-wrap.is-back table{display:block;min-width:0!important;width:100%!important}
 #${PANEL_ID} .live-tag-table-wrap.is-back thead{display:none}
 #${PANEL_ID} .live-tag-table-wrap.is-back tbody{display:grid;gap:8px}
 #${PANEL_ID} .live-tag-table-wrap.is-back tr{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;padding:10px;border:1px solid rgba(168,219,115,.14);border-radius:14px;background:rgba(255,255,255,.018)}
 #${PANEL_ID} .live-tag-table-wrap.is-back td{width:auto!important;min-width:0!important;padding:0!important;border:0!important;overflow:visible;white-space:normal;text-overflow:clip}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-player-col{grid-column:1 / 5;grid-row:1;font-size:.92rem;font-weight:900;align-self:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-rank-col{grid-column:5;grid-row:1;text-align:center}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-score-col{grid-column:6;grid-row:1;text-align:center}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-start-col{grid-column:1 / 3;grid-row:2;text-align:center}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-front-col{grid-column:3 / 5;grid-row:2;text-align:center}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-projected-col{grid-column:5 / 7;grid-row:2;text-align:center;padding:7px 5px!important;border:1px solid rgba(168,219,115,.28)!important;border-radius:12px;background:rgba(125,205,98,.10)}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-rank-col:before,#${PANEL_ID} .live-tag-table-wrap.is-back .tag-score-col:before,#${PANEL_ID} .live-tag-table-wrap.is-back .tag-start-col:before,#${PANEL_ID} .live-tag-table-wrap.is-back .tag-front-col:before,#${PANEL_ID} .live-tag-table-wrap.is-back .tag-projected-col:before{display:block;margin-bottom:2px;color:rgba(244,247,239,.46);font-size:.52rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-rank-col:before{content:'Rank'}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-score-col:before{content:'Skins'}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-start-col:before{content:'Start'}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-front-col:before{content:'After 9'}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-projected-col:before{content:'Projected';color:#cfff9c}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-projected-col .tag-route{font-size:1.05rem}
 #${PANEL_ID} .live-tag-table-wrap.is-back .tag-stage{min-width:2.35rem;padding:4px 6px}
 #${PANEL_ID} .tag-move{min-width:1.8rem;margin-left:2px;padding:1px 3px}
 #${PANEL_ID} .live-tag-stage-note{font-size:.76rem;line-height:1.35;padding:9px 10px}
}
`;
    document.head.appendChild(style);
  }
  function ensurePanel(){
    ensureStyles();
    let panel=q('#'+PANEL_ID);
    if(panel)return panel;
    const scorecards=q('#scorecards');
    if(!scorecards)return null;
    panel=document.createElement('div');
    panel.id=PANEL_ID;
    panel.className='panel live-tag-tracker-panel';
    const firstPanel=q('.panel',scorecards);
    if(firstPanel&&firstPanel.nextSibling)scorecards.insertBefore(panel,firstPanel.nextSibling);
    else scorecards.appendChild(panel);
    return panel;
  }
  function renderTracker(){
    renderQueued=false;
    const panel=ensurePanel();
    if(!panel)return;
    const through=storedThrough();
    const model=projectionModel(through),startOfDay=model.startOfDay,afterFront=model.afterFront,projected=model.projected,tagRows=model.tagRows,untaggedCount=model.untaggedCount;
    const projectedHolders=tagRows.slice().sort((a,b)=>(tagNumber(projected,a.name)||9999)-(tagNumber(projected,b.name)||9999));
    const topFive=[];
    for(let tag=1;tag<=5;tag++){
      const holder=projectedHolders.find(row=>tagNumber(projected,row.name)===tag);
      topFive.push('<div class="live-tag-chip"><b>#'+tag+'</b><span title="'+escHtml(holder?holder.name:'Unchanged / absent')+'">'+escHtml(holder?holder.name:'—')+'</span></div>');
    }
    let lastScore=null,place=0;
    const body=tagRows.map((row,index)=>{
      const score=Number(row.score)||0;
      if(lastScore===null||score!==lastScore)place=index+1;
      lastScore=score;
      const startTag=tagNumber(startOfDay,row.name),frontTag=tagNumber(afterFront,row.name),to=tagNumber(projected,row.name);
      if(model.isBack)return '<tr><td class="tag-rank-col">'+place+'</td><td class="tag-player-col" title="'+escHtml(row.name)+'">'+escHtml(row.name)+'</td><td class="tag-score-col">'+score+'</td><td class="tag-number-col tag-start-col"><span class="tag-stage">#'+startTag+'</span></td><td class="tag-number-col tag-front-col"><span class="tag-stage front-stage">#'+frontTag+'</span></td><td class="tag-projected-col"><span class="tag-route">#'+to+'</span>'+movementLabel(startTag,to)+'</td></tr>';
      return '<tr><td class="tag-rank-col">'+place+'</td><td class="tag-player-col" title="'+escHtml(row.name)+'">'+escHtml(row.name)+'</td><td class="tag-score-col">'+score+'</td><td class="tag-projected-col"><span class="tag-route">#'+startTag+' → #'+to+'</span>'+movementLabel(startTag,to)+'</td></tr>';
    }).join('');
    panel.innerHTML=`
      <div class="live-tag-head">
        <div><h3 class="live-tag-title">Live Bag Tag Projection</h3><p class="helper">See the projected handoff order while the round is still in progress.</p></div>
        <span class="pill">Build ${BUILD}</span>
      </div>
      <div class="live-tag-controls">
        <button class="btn" type="button" data-live-tag-prev aria-label="Previous hole">←</button>
        <label>Projection checkpoint<select id="liveTagThrough" aria-label="Project bag tags through hole">${optionsHtml(through)}</select></label>
        <button class="btn" type="button" data-live-tag-next aria-label="Next hole">→</button>
        <button class="btn" type="button" data-live-tag-latest>Use latest entered winner</button>
      </div>
      <div class="live-tag-status" aria-live="polite"><strong>${escHtml(checkpointLabel(through))}</strong><span>${tagRows.length} participating tag holder${tagRows.length===1?'':'s'}${untaggedCount?' · '+untaggedCount+' untagged entrant'+(untaggedCount===1?'':'s'):''}</span></div>
      <div class="live-tag-top-five" aria-label="Projected top five tags">${topFive.join('')}</div>
      ${model.isBack?'<p class="live-tag-stage-note"><strong>Back 9:</strong> Start of Day = physical tag brought to Hole 1. After Front 9 = calculation-only checkpoint unless tags were actually exchanged at the turn. Projected = tag owed now.</p>':''}
      <div class="live-tag-table-wrap ${model.isBack?'is-back':'is-front'}">${tagRows.length?(model.isBack?`<table><thead><tr><th class="tag-rank-col">Rank</th><th class="tag-player-col">Player</th><th class="tag-score-col">Back skins</th><th class="tag-number-col">Start of day</th><th class="tag-number-col">After Front 9</th><th class="tag-projected-col">Projected</th></tr></thead><tbody>${body}</tbody></table>`:`<table><thead><tr><th class="tag-rank-col">Rank</th><th class="tag-player-col">Player</th><th class="tag-score-col">Front skins</th><th class="tag-projected-col">Start → projected</th></tr></thead><tbody>${body}</tbody></table>`):'<div class="live-tag-empty">No participating players with incoming bag tags were found for this checkpoint.</div>'}</div>
      <p class="live-tag-footnote">A checked winner advances the checkpoint automatically. For a pushed hole, leave the scorecard blank and tap the right arrow. Round Tags is the authoritative Start of Day record; duplicates remain visible as warnings and never trigger automatic swaps.</p>`;
  }
  function scheduleRender(){
    if(renderQueued)return;
    renderQueued=true;
    window.requestAnimationFrame(renderTracker);
  }
  function observeScorecards(){
    const front=q('#frontScorecard'),back=q('#backScorecard');
    const config={childList:true,subtree:true};
    if(front&&front!==observedFront){
      observedFront=front;
      new MutationObserver(scheduleRender).observe(front,config);
    }
    if(back&&back!==observedBack){
      observedBack=back;
      new MutationObserver(scheduleRender).observe(back,config);
    }
  }
  document.addEventListener('change',event=>{
    const target=event.target;
    if(!target)return;
    if(target.id==='liveTagThrough'){
      saveThrough(target.value);
      scheduleRender();
      return;
    }
    if(target.id==='weekSelect'){
      window.setTimeout(()=>{observeScorecards();scheduleRender()},0);
      return;
    }
    if(target.classList&&target.classList.contains('skin-check')&&target.checked){
      const hole=Number(target.dataset&&target.dataset.hole);
      if(Number.isFinite(hole)&&hole>=1&&hole<=18){
        const current=storedThrough();
        if(hole>current)saveThrough(hole);
      }else if(target.dataset&&target.dataset.hole==='tb'){
        saveThrough(18);
      }
      window.setTimeout(scheduleRender,0);
    }
  });
  document.addEventListener('click',event=>{
    const button=event.target&&event.target.closest?event.target.closest('button'):null;
    if(!button)return;
    if(button.hasAttribute('data-live-tag-prev')){
      saveThrough(storedThrough()-1);scheduleRender();
    }else if(button.hasAttribute('data-live-tag-next')){
      saveThrough(storedThrough()+1);scheduleRender();
    }else if(button.hasAttribute('data-live-tag-latest')){
      saveThrough(latestCheckedHole());scheduleRender();
    }else if(button.dataset&&button.dataset.page==='scorecards'){
      window.setTimeout(scheduleRender,0);
    }
  });
  document.addEventListener('hbnf:incoming-tags-changed',scheduleRender);
  window.HBNFLiveTagTracker={build:BUILD,projectionModel};
  function init(){
    ensurePanel();
    observeScorecards();
    scheduleRender();
    window.setInterval(observeScorecards,2000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
