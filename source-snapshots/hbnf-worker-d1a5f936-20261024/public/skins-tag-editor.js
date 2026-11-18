/*
 * HB Night Flyers — Incoming Bag Tag Editor
 * Build: 7.28.26_1
 *
 * Adds a scorecard pop-out for correcting the selected week's incoming
 * (pre-round) bag tags. Corrections save immediately, sync with the shared
 * league state, and are locked when the week is finalized.
 */
(function(){
  'use strict';

  const BUILD='7.28.26_1';
  const MODAL_ID='hbnfIncomingTagModal';
  const STYLE_ID='hbnfIncomingTagEditorStyles';
  const BUTTON_ATTR='data-open-incoming-tags';
  const original={
    bagTagMapBeforeDate:typeof window.bagTagMapBeforeDate==='function'?window.bagTagMapBeforeDate:null,
    computeBagTags:typeof window.computeBagTags==='function'?window.computeBagTags:null,
    selectedWeekTagMap:typeof window.selectedWeekTagMap==='function'?window.selectedWeekTagMap:null,
    weekUnifiedLeaderboardHtml:typeof window.weekUnifiedLeaderboardHtml==='function'?window.weekUnifiedLeaderboardHtml:null
  };

  function q(selector,root){return (root||document).querySelector(selector)}
  function qa(selector,root){return Array.from((root||document).querySelectorAll(selector))}
  function text(value){return String(value==null?'':value)}
  function clean(value){
    try{if(typeof window.btCleanName==='function')return window.btCleanName(value)}catch(_e){}
    return text(value).trim();
  }
  function escapeHtml(value){
    try{if(typeof window.esc==='function')return window.esc(value)}catch(_e){}
    return text(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function context(){try{return typeof ctx!=='undefined'?ctx:(window.ctx||null)}catch(_e){return window.ctx||null}}
  function weekKey(){
    try{const c=context();return text(c&&c.state&&c.state.activeWeek)}catch(_e){return''}
  }
  function currentWeek(){
    try{if(typeof window.getWeek==='function')return window.getWeek()}catch(_e){}
    return null;
  }
  function rootState(){
    try{if(typeof window.tagRootState==='function')return window.tagRootState()}catch(_e){}
    const c=context();return (c&&c.rootState)||{};
  }
  function skinsState(root){
    root=root||rootState();
    const c=context();return (root&&root.skins)||(c&&c.state)||{};
  }
  function weekForDate(root,date){
    const state=skinsState(root);
    return state&&state.weeks&&state.weeks[date]||null;
  }
  function weekOverrides(root,date){
    const week=weekForDate(root,date);
    const raw=week&&week.incomingTagOverrides;
    return raw&&typeof raw==='object'?raw:{};
  }
  function setMapTag(map,name,value){
    const wanted=clean(name),key=wanted.toLowerCase();
    if(!wanted)return;
    const existing=Object.keys(map||{}).find(item=>clean(item).toLowerCase()===key);
    if(existing&&existing!==wanted)delete map[existing];
    const tag=Number(value)||0;
    if(tag>0)map[wanted]=tag;
    else if(existing)delete map[existing];
  }
  function applyOverrides(map,overrides){
    const out=Object.assign({},map||{});
    Object.entries(overrides||{}).forEach(([name,value])=>setMapTag(out,name,value));
    return out;
  }
  function baseCurrentFromConfig(root){
    try{
      const cfg=window.normalizeBagTagsConfig(root||rootState());
      return window.cloneCurrentTagsFromCfg(cfg);
    }catch(err){
      console.error('Incoming tag editor could not read base tags',err);
      return {};
    }
  }
  function sortedEvents(root){
    try{return window.allBagTagEventsForRoot(root||rootState())||[]}catch(err){console.error(err);return[]}
  }
  function blockersFor(root){
    try{
      const cfg=window.normalizeBagTagsConfig(root||rootState());
      return cfg&&cfg.manualEventBlockers&&typeof cfg.manualEventBlockers==='object'?cfg.manualEventBlockers:{};
    }catch(_e){return{}}
  }
  function eventBlocked(event,blockers){
    try{return blockers[window.bagTagEventKey(event)]===window.bagTagEventSignature(event)}catch(_e){return false}
  }
  function applyIncomingOverrideOnce(current,root,event,seenDates){
    const date=text(event&&event.date);
    const isSkins=text(event&&event.type).indexOf('skins-')===0;
    if(!isSkins||!date||seenDates.has(date))return current;
    seenDates.add(date);
    return applyOverrides(current,weekOverrides(root,date));
  }

  function patchedBagTagMapBeforeDate(root,date){
    root=root||rootState();
    let current=baseCurrentFromConfig(root);
    const blockers=blockersFor(root),seenDates=new Set();
    sortedEvents(root).filter(event=>text(event&&event.date)<text(date)).forEach(event=>{
      current=applyIncomingOverrideOnce(current,root,event,seenDates);
      if(eventBlocked(event,blockers))return;
      try{window.redistributeTags(current,event)}catch(err){console.error('Incoming tag history replay failed',err)}
    });
    return current;
  }

  function patchedComputeBagTags(root){
    root=root||rootState();
    const cfg=window.normalizeBagTagsConfig(root),blockers=blockersFor(root);
    let current=window.cloneCurrentTagsFromCfg(cfg);
    const events=sortedEvents(root);
    let applied=[];
    try{applied=window.tagEventsToApply(events).filter(event=>!eventBlocked(event,blockers))}catch(err){console.error(err)}
    const seenDates=new Set();
    applied.forEach(event=>{
      current=applyIncomingOverrideOnce(current,root,event,seenDates);
      try{window.redistributeTags(current,event)}catch(err){console.error('Incoming tag projection failed',err)}
    });
    root.bagTags=cfg;
    try{window.btSaveLocalConfig(cfg)}catch(_e){}
    return{current,events,cfg,latestEvent:applied.length?applied[applied.length-1]:null,appliedEvents:applied};
  }

  function patchedSelectedWeekTagMap(root,date){
    root=root||rootState();
    const cfg=window.normalizeBagTagsConfig(root),blockers=blockersFor(root);
    let current=patchedBagTagMapBeforeDate(root,date);
    let events=[];
    try{events=window.btSkinsEvents(skinsState(root)).filter(event=>text(event&&event.date)===text(date))}catch(err){console.error(err)}
    const blocked=events.some(event=>eventBlocked(event,blockers));
    if(blocked)return patchedComputeBagTags(root).current||current;
    events.forEach(event=>{try{window.redistributeTags(current,event)}catch(err){console.error(err)}});
    return current;
  }

  function patchedWeekLeaderboardHtml(week,date){
    try{
      const data=window.getWeekPlayerSummaries(week);
      const incoming=patchedBagTagMapBeforeDate(rootState(),date);
      const live=patchedSelectedWeekTagMap(rootState(),date);
      const rows=data.rows.sort((a,b)=>(Number(b.skins||0)-Number(a.skins||0))||
        ((window.tagNumForName(incoming,a.name)||9999)-(window.tagNumForName(incoming,b.name)||9999))||
        clean(a.name).localeCompare(clean(b.name)));
      if(!rows.length)return'<p class="empty">No participants for this week.</p>';
      return`<div class="week-unified-leaderboard"><h4>Weekly Leaderboard</h4><p class="helper">This week only. Ties use the incoming tag order shown on the Scorecards page.</p><div class="responsive-table-wrap weekly-leaderboard-scroll"><table class="weekly-leaderboard-table"><colgroup><col class="wl-rank"><col class="wl-player"><col class="wl-skins"><col class="wl-tag"></colgroup><thead><tr><th>Rank</th><th>Player</th><th>Skins</th><th>Tag</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td>${window.rankLabel(index,rows)}</td><td class="weekly-player-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</td><td class="money">${Number(row.skins||0)}</td><td>${window.tagLabelFromMap(live,row.name)}</td></tr>`).join('')}</tbody></table></div></div>`;
    }catch(err){
      console.error('Incoming tag weekly leaderboard patch failed',err);
      return original.weekUnifiedLeaderboardHtml?original.weekUnifiedLeaderboardHtml(week,date):'';
    }
  }

  window.bagTagMapBeforeDate=patchedBagTagMapBeforeDate;
  window.computeBagTags=patchedComputeBagTags;
  window.selectedWeekTagMap=patchedSelectedWeekTagMap;
  window.weekUnifiedLeaderboardHtml=patchedWeekLeaderboardHtml;
  window.HBNFIncomingTagMap=patchedBagTagMapBeforeDate;

  function participantNames(week){
    const out=[],seen=new Set();
    function add(value){const name=clean(value),key=name.toLowerCase();if(name&&!seen.has(key)){seen.add(key);out.push(name)}}
    try{
      ((week&&week.front&&week.front.cards)||[]).forEach(card=>window.frontRows(card).forEach(row=>add(row.name)));
      ((week&&week.back&&week.back.cards)||[]).forEach(card=>window.backRows(card).forEach(row=>(row.players&&row.players.length?row.players:[row.name]).forEach(add)));
    }catch(err){console.error('Incoming tag participant list failed',err)}
    return out;
  }
  function findNameByTag(map,tag,exceptName){
    const except=clean(exceptName).toLowerCase();
    const entry=Object.entries(map||{}).find(([name,value])=>clean(name).toLowerCase()!==except&&Number(value)===Number(tag));
    return entry?entry[0]:'';
  }
  function ensureStyles(){
    if(q('#'+STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
[${BUTTON_ATTR}]{display:inline-flex;align-items:center;gap:7px}
#${MODAL_ID}{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.72);backdrop-filter:blur(8px)}
#${MODAL_ID}.open{display:flex}
#${MODAL_ID} .incoming-tag-sheet{width:min(720px,100%);max-height:min(88vh,850px);overflow:auto;border:1px solid rgba(216,255,136,.32);border-radius:22px;background:linear-gradient(180deg,#132719,#07120a);box-shadow:0 24px 90px rgba(0,0,0,.62),var(--shadow);padding:18px}
#${MODAL_ID} .incoming-tag-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;position:sticky;top:-18px;z-index:2;padding:18px 0 12px;background:linear-gradient(180deg,#132719 75%,rgba(19,39,25,0))}
#${MODAL_ID} .incoming-tag-head h3{margin:0;color:var(--bright)}
#${MODAL_ID} .incoming-tag-close{min-width:44px}
#${MODAL_ID} .incoming-tag-status{min-height:1.5em;color:var(--bright);font-weight:700;margin:6px 0 10px}
#${MODAL_ID} .incoming-tag-grid{display:grid;gap:8px}
#${MODAL_ID} .incoming-tag-row{display:grid;grid-template-columns:minmax(0,1fr) 112px;gap:10px;align-items:center;padding:10px 11px;border:1px solid rgba(57,255,20,.13);border-radius:14px;background:rgba(255,255,255,.025)}
#${MODAL_ID} .incoming-tag-name{font-weight:800;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${MODAL_ID} .incoming-tag-row input{width:100%;text-align:center;font-weight:900;font-size:1.05rem}
#${MODAL_ID} .incoming-tag-source{display:block;color:var(--muted);font-size:.78rem;font-weight:500;margin-top:2px}
#${MODAL_ID} .incoming-tag-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
#${MODAL_ID} .incoming-tag-lock{padding:12px;border:1px solid rgba(255,206,86,.35);border-radius:14px;background:rgba(255,206,86,.07);color:var(--warn)}
#hbnfLiveTagTracker .incoming-tag-tracker-button{margin-left:auto}
@media(max-width:620px){#${MODAL_ID}{padding:0;align-items:flex-end}#${MODAL_ID} .incoming-tag-sheet{width:100%;max-height:92vh;border-radius:22px 22px 0 0;padding:15px}#${MODAL_ID} .incoming-tag-head{top:-15px;padding-top:15px}#${MODAL_ID} .incoming-tag-row{grid-template-columns:minmax(0,1fr) 96px}}
`;
    document.head.appendChild(style);
  }
  function ensureModal(){
    ensureStyles();
    let modal=q('#'+MODAL_ID);
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id=MODAL_ID;
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-label','Edit incoming bag tags');
    modal.addEventListener('click',event=>{if(event.target===modal)closeModal()});
    document.body.appendChild(modal);
    return modal;
  }
  function renderModal(message){
    const modal=ensureModal(),week=currentWeek(),date=weekKey();
    if(!week){modal.innerHTML='<div class="incoming-tag-sheet"><p>No selected week.</p></div>';return}
    const locked=!!week.finalized,names=participantNames(week),incoming=patchedBagTagMapBeforeDate(rootState(),date),overrides=weekOverrides(rootState(),date);
    const rows=names.map(name=>{
      const tag=window.tagNumForName(incoming,name)||'';
      const overridden=Object.keys(overrides).some(key=>clean(key).toLowerCase()===name.toLowerCase());
      return`<label class="incoming-tag-row"><span class="incoming-tag-name">${escapeHtml(name)}<span class="incoming-tag-source">${overridden?'Manually set for this round':'Calculated incoming tag'}</span></span><input data-incoming-tag-name="${escapeHtml(name)}" type="number" min="1" step="1" inputmode="numeric" value="${tag}" ${locked?'disabled':''} aria-label="Incoming tag for ${escapeHtml(name)}"></label>`;
    }).join('');
    modal.innerHTML=`<div class="incoming-tag-sheet"><div class="incoming-tag-head"><div><h3>Current Tags Before This Round</h3><p class="helper">${escapeHtml(date)} · Changes save immediately and update the live projection.</p></div><button class="btn incoming-tag-close" type="button" data-close-incoming-tags aria-label="Close">✕</button></div>${locked?'<div class="incoming-tag-lock"><strong>Tags are locked.</strong> Reopen the week before changing incoming tags.</div>':`<div class="incoming-tag-status" aria-live="polite">${escapeHtml(message||'Enter the physical tag number each player has now.')}</div><div class="incoming-tag-grid">${rows||'<p class="empty">Add players in Setup before assigning tags.</p>'}</div><div class="incoming-tag-actions"><button class="btn warn" type="button" data-reset-incoming-tags ${Object.keys(overrides).length?'':'disabled'}>Reset this round’s corrections</button><span class="pill">Build ${BUILD}</span></div>`}</div>`;
  }
  function openModal(){renderModal();ensureModal().classList.add('open');document.body.style.overflow='hidden';setTimeout(()=>{const input=q('[data-incoming-tag-name]',ensureModal());if(input)input.focus()},0)}
  function closeModal(){const modal=q('#'+MODAL_ID);if(modal)modal.classList.remove('open');document.body.style.overflow=''}
  function persist(message){
    try{
      const c=context();
      if(c&&c.rootState)c.rootState.skins=c.state;
      if(typeof window.saveLocal==='function')window.saveLocal();
      if(c&&typeof c.pushRoot==='function')c.pushRoot();
    }catch(err){console.error('Incoming tag save failed',err)}
    document.dispatchEvent(new CustomEvent('hbnf:incoming-tags-changed',{detail:{date:weekKey()}}));
    renderModal(message||'Saved.');
  }
  function saveInput(input){
    const week=currentWeek();
    if(!week||week.finalized){renderModal('Reopen the week before changing tags.');return}
    const name=clean(input.getAttribute('data-incoming-tag-name'));
    const tag=Number(input.value)||0;
    if(!name||tag<1){renderModal('Enter a tag number of 1 or higher.');return}
    const root=rootState(),date=weekKey(),incoming=patchedBagTagMapBeforeDate(root,date),oldTag=window.tagNumForName(incoming,name)||0,owner=findNameByTag(incoming,tag,name);
    if(owner){
      const action=oldTag>0?`swap #${tag} and #${oldTag}`:`move #${tag} from ${owner}`;
      if(!window.confirm(`#${tag} is currently assigned to ${owner}. ${action.charAt(0).toUpperCase()+action.slice(1)}?`)){renderModal('No change made.');return}
    }
    week.incomingTagOverrides=week.incomingTagOverrides&&typeof week.incomingTagOverrides==='object'?week.incomingTagOverrides:{};
    week.incomingTagOverrides[name]=tag;
    if(owner)week.incomingTagOverrides[owner]=oldTag>0?oldTag:0;
    week.incomingTagOverridesUpdatedAt=new Date().toISOString();
    persist(owner?`Saved: ${name} #${tag}; ${owner} ${oldTag>0?'#'+oldTag:'now has no tag'}.`:`Saved: ${name} is #${tag}.`);
  }
  function resetOverrides(){
    const week=currentWeek();
    if(!week||week.finalized)return;
    if(!window.confirm('Remove all incoming-tag corrections for this selected round?'))return;
    delete week.incomingTagOverrides;
    delete week.incomingTagOverridesUpdatedAt;
    persist('Corrections removed; calculated incoming tags restored.');
  }
  function ensureButtons(){
    const week=currentWeek(),locked=!!(week&&week.finalized);
    const scoreTools=q('#scorecards .panel:first-child .inline-tools');
    if(scoreTools&&!q('['+BUTTON_ATTR+']',scoreTools)){
      const button=document.createElement('button');button.className='btn';button.type='button';button.setAttribute(BUTTON_ATTR,'1');scoreTools.insertBefore(button,scoreTools.firstChild);
    }
    qa('['+BUTTON_ATTR+']').forEach(button=>{const label=locked?'Current Tags Locked':'Edit Current Tags',title=locked?'Reopen the week to edit incoming tags':'Enter the physical tag numbers players have before the round';if(button.disabled!==locked)button.disabled=locked;if(button.textContent!==label)button.textContent=label;if(button.title!==title)button.title=title});
    const tracker=q('#hbnfLiveTagTracker .live-tag-head');
    if(tracker&&!q('['+BUTTON_ATTR+']',tracker)){
      const button=document.createElement('button');button.className='btn incoming-tag-tracker-button';button.type='button';button.setAttribute(BUTTON_ATTR,'1');tracker.appendChild(button);
      button.disabled=locked;button.textContent=locked?'Current Tags Locked':'Edit Current Tags';
    }
  }
  document.addEventListener('click',event=>{
    const open=event.target&&event.target.closest&&event.target.closest('['+BUTTON_ATTR+']');
    if(open){event.preventDefault();if(!open.disabled)openModal();return}
    if(event.target&&event.target.closest&&event.target.closest('[data-close-incoming-tags]')){closeModal();return}
    if(event.target&&event.target.closest&&event.target.closest('[data-reset-incoming-tags]')){resetOverrides();return}
  });
  document.addEventListener('change',event=>{const input=event.target&&event.target.closest&&event.target.closest('[data-incoming-tag-name]');if(input)saveInput(input)});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&q('#'+MODAL_ID+'.open'))closeModal();
    if(event.key==='Enter'&&event.target&&event.target.matches('[data-incoming-tag-name]')){event.preventDefault();event.target.blur()}
  });
  document.addEventListener('hbnf:incoming-tags-changed',()=>{ensureButtons();try{if(typeof window.renderStandings==='function')window.renderStandings()}catch(_e){}});
  const observer=new MutationObserver(()=>ensureButtons());
  function init(){ensureModal();ensureButtons();try{if(typeof window.renderStandings==='function')window.renderStandings()}catch(_e){}observer.observe(document.body,{childList:true,subtree:true});window.setInterval(ensureButtons,1800)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
