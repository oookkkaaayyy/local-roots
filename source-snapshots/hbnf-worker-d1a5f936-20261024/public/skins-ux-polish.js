/* HB Night Flyers — Skins mobile UX polish · Build 9.8.26_1 */
(function(){
  'use strict';
  const BUILD='9.8.26_1';
  const STYLE_ID='hbnfSkinsUxPolishStyles';
  let refreshQueued=false;

  function q(sel,root){return (root||document).querySelector(sel)}
  function qa(sel,root){return Array.from((root||document).querySelectorAll(sel))}
  function clean(v){return String(v==null?'':v).trim()}
  function getWeekSafe(){try{return typeof getWeek==='function'?getWeek():null}catch(_e){return null}}

  function injectStyles(){
    if(q('#'+STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
#scorecards .ux-organizer-bar{position:sticky;top:8px;z-index:45;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:0 0 12px;padding:10px 11px;border:1px solid rgba(168,219,115,.18);border-radius:18px;background:rgba(10,15,14,.94);box-shadow:0 16px 44px rgba(0,0,0,.34);backdrop-filter:blur(18px)}
#scorecards .ux-progress{min-width:0;display:flex;align-items:center;gap:10px}#scorecards .ux-progress-ring{width:38px;height:38px;display:grid;place-items:center;border-radius:999px;background:conic-gradient(#90d66d var(--ux-progress,0%),rgba(255,255,255,.07) 0);position:relative;flex:0 0 auto}#scorecards .ux-progress-ring:after{content:'';position:absolute;inset:4px;border-radius:999px;background:#0b1110}#scorecards .ux-progress-ring span{position:relative;z-index:1;font-size:.7rem;font-weight:900;color:#d9ffb5}#scorecards .ux-progress-copy{min-width:0;display:flex;flex-direction:column;gap:2px}#scorecards .ux-progress-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f4f7ef;font-size:.9rem}#scorecards .ux-progress-copy span{color:rgba(244,247,239,.54);font-size:.74rem}
#scorecards .ux-actions{display:flex;gap:7px;align-items:center}#scorecards .ux-actions button{min-height:42px;padding:0 11px;border-radius:12px;border:1px solid rgba(168,219,115,.18);background:rgba(255,255,255,.025);color:#f4f7ef;font-weight:850}#scorecards .ux-actions button.primary{border-color:rgba(168,219,115,.36);background:linear-gradient(180deg,rgba(125,205,98,.20),rgba(125,205,98,.07));color:#e4ffca}#scorecards .ux-actions button span{display:none}
#scorecards .ux-scorecard-panel{padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}#scorecards .ux-scorecard-panel>.round-title{padding:2px 2px 10px!important;margin:0!important;font-size:1.08rem!important}#scorecards .ux-scorecard-panel .scorecard-wrap{border-radius:18px!important;border-color:rgba(168,219,115,.16)!important;background:#060b09!important;box-shadow:0 18px 48px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.03)!important;scrollbar-color:rgba(125,205,98,.34) transparent}
#scorecards .scorecard-table thead th{position:sticky!important;top:0!important;z-index:8!important;background:#17201e!important;box-shadow:0 1px 0 rgba(168,219,115,.17)!important}#scorecards .scorecard-table thead th.sticky-col{z-index:12!important;background:#1a2522!important}#scorecards .scorecard-table .sticky-col{cursor:pointer}#scorecards .scorecard-table .sticky-col.ux-name-expanded{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;min-width:190px!important;width:190px!important;max-width:190px!important;line-height:1.25!important}
#scorecards .scorecard-table th.ux-current-hole,#scorecards .scorecard-table td.ux-current-hole{background:linear-gradient(180deg,rgba(125,205,98,.20),rgba(125,205,98,.07))!important;box-shadow:inset 2px 0 0 rgba(168,219,115,.42),inset -2px 0 0 rgba(168,219,115,.42)!important}#scorecards .scorecard-table th.ux-current-hole{color:#e3ffc7!important}
#scorecards .skin-check,#scorecards .tb-checkbox{width:32px!important;height:32px!important;border-radius:9px!important}#scorecards .scorecard-table td,#scorecards .scorecard-table th{min-height:48px!important}#scorecards .scorecard-card{margin-bottom:14px!important}#scorecards .scorecard-card h4{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;margin:0 0 8px!important;padding:0 2px!important;color:#f4f7ef!important}
#scorecards .panel:first-child .inline-tools [data-open-round-tags],#scorecards .panel:first-child .inline-tools [data-open-tag-projection]{display:none!important}
#hbnfTagProjectionModal .tag-projection-sheet{width:min(760px,calc(100vw - 18px))!important;max-height:calc(100dvh - 18px)!important;padding:14px!important;border:1px solid rgba(168,219,115,.22)!important;border-radius:24px!important;background:linear-gradient(180deg,#101a16,#07100d)!important;box-shadow:0 30px 90px rgba(0,0,0,.62)!important}
#hbnfTagProjectionModal .tag-projection-modal-head{padding:2px 2px 12px!important;border-bottom:1px solid rgba(168,219,115,.12)!important;margin-bottom:12px!important}
#hbnfTagProjectionModal .tag-projection-modal-head h3{font-size:1.22rem!important;letter-spacing:-.02em!important;color:#f4f7ef!important}
#hbnfTagProjectionModal .tag-projection-modal-head p{margin-top:4px!important;color:rgba(244,247,239,.58)!important;font-size:.86rem!important}
#hbnfTagProjectionModal .tag-projection-modal-close{width:44px!important;height:44px!important;border-radius:14px!important;background:rgba(255,255,255,.035)!important;border-color:rgba(168,219,115,.18)!important}
#hbnfLiveTagTracker{padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}
#hbnfLiveTagTracker .live-tag-toolbar,#hbnfLiveTagTracker .tag-tracker-toolbar{gap:8px!important;padding:0 0 10px!important}
#hbnfLiveTagTracker button,#hbnfLiveTagTracker select{min-height:44px!important;border-radius:13px!important;border-color:rgba(168,219,115,.18)!important;background:rgba(255,255,255,.03)!important;color:#f4f7ef!important}
#hbnfLiveTagTracker .live-tag-status,#hbnfLiveTagTracker .tag-tracker-status{border:1px solid rgba(168,219,115,.16)!important;border-radius:18px!important;background:rgba(125,205,98,.055)!important;padding:12px 14px!important}
#hbnfLiveTagTracker .live-tag-chip,#hbnfLiveTagTracker .tag-chip{border-radius:15px!important;border-color:rgba(168,219,115,.15)!important;background:rgba(255,255,255,.025)!important;min-height:88px!important}
#hbnfLiveTagTracker .live-tag-table-wrap,#hbnfLiveTagTracker .tag-tracker-table-wrap{border:1px solid rgba(168,219,115,.14)!important;border-radius:18px!important;background:#060b09!important;overflow-x:auto!important;overflow-y:hidden!important;-webkit-overflow-scrolling:touch}
#hbnfLiveTagTracker table{border-collapse:separate!important;border-spacing:0!important}
#hbnfLiveTagTracker thead th{background:#17201e!important;color:rgba(244,247,239,.68)!important}
#hbnfLiveTagTracker tbody td{border-color:rgba(168,219,115,.10)!important}
@media(max-width:760px){#scorecards .ux-organizer-bar{top:6px;margin-left:-2px;margin-right:-2px;padding:9px;border-radius:16px;grid-template-columns:minmax(0,1fr) auto}#scorecards .ux-progress-ring{width:34px;height:34px}#scorecards .ux-actions{gap:5px}#scorecards .ux-actions button{width:42px;min-width:42px;padding:0;font-size:1rem}#scorecards .ux-actions button span{display:none}#scorecards .ux-scorecard-panel{margin-left:-10px!important;margin-right:-10px!important}#scorecards .ux-scorecard-panel>.round-title{padding-left:12px!important;padding-right:12px!important}#scorecards .ux-scorecard-panel .scorecard-wrap{border-left:0!important;border-right:0!important;border-radius:0!important}#scorecards .scorecard-table .sticky-col{box-shadow:8px 0 18px rgba(0,0,0,.28)!important}#scorecards .scorecard-table th,#scorecards .scorecard-table td{padding-top:9px!important;padding-bottom:9px!important}}
@media(min-width:761px){#scorecards .ux-actions button{min-width:104px}#scorecards .ux-actions button span{display:inline}}
`;
    document.head.appendChild(style);
  }

  function scoringProgress(){
    const week=getWeekSafe();if(!week)return{hole:1,label:'Front 9 · Hole 1',detail:'No winners entered',percent:0,phase:'front'};
    const entered=[];
    ['front','back'].forEach(part=>((week[part]&&week[part].cards)||[]).forEach(card=>Object.keys((card&&card.winners)||{}).forEach(key=>{const n=Number(key);if(n>=1&&n<=18&&card.winners[key])entered.push(n)})));
    const max=entered.length?Math.max(...entered):0;
    let hole=max?Math.min(18,max+1):1;
    if(max>=9&&max<10)hole=10;
    if(max>=18)hole=18;
    const phase=hole<=9?'front':'back',label=(phase==='front'?'Front 9':'Back 9')+' · '+(max>=18?'Complete':'Hole '+hole),detail=max?('Results entered through hole '+max):'Ready to score';
    return{hole,label,detail,percent:Math.round((Math.max(max,0)/18)*100),phase};
  }

  function ensureToolbar(){
    const scorecards=q('#scorecards');if(!scorecards)return null;
    let bar=q('.ux-organizer-bar',scorecards);
    if(!bar){
      bar=document.createElement('div');bar.className='ux-organizer-bar';bar.innerHTML=`<div class="ux-progress"><div class="ux-progress-ring"><span data-ux-progress-number>0%</span></div><div class="ux-progress-copy"><strong data-ux-progress-label>Ready to score</strong><span data-ux-progress-detail></span></div></div><div class="ux-actions"><button type="button" data-undo-backup aria-label="Undo" title="Undo latest change">↶<span> Undo</span></button><button type="button" data-ux-jump-hole aria-label="Jump to current hole" title="Jump to current hole">◎<span> Current hole</span></button></div>`;
      scorecards.insertBefore(bar,scorecards.firstChild);
    }
    return bar;
  }

  function decoratePanels(){
    qa('#scorecards .panel').forEach(panel=>{if(q('.scorecard-wrap',panel))panel.classList.add('ux-scorecard-panel')});
  }

  function findHoleHeader(table,hole){
    return qa('thead th',table).find(th=>new RegExp('(?:HOLE\\s*)?'+hole+'(?:\\D|$)','i').test(clean(th.textContent))&&!/SKINS|PAYOUT|NET|PLAYER|TEAM|TIE/i.test(clean(th.textContent)));
  }

  function markCurrentHole(hole){
    qa('#scorecards .scorecard-table').forEach(table=>{
      qa('.ux-current-hole',table).forEach(el=>el.classList.remove('ux-current-hole'));
      const th=findHoleHeader(table,hole);if(!th)return;const index=Array.from(th.parentNode.children).indexOf(th);th.classList.add('ux-current-hole');qa('tbody tr',table).forEach(tr=>{const cell=tr.children[index];if(cell)cell.classList.add('ux-current-hole')});
    });
  }

  function updateProgress(){
    const bar=ensureToolbar();if(!bar)return;const p=scoringProgress(),ring=q('.ux-progress-ring',bar);ring.style.setProperty('--ux-progress',p.percent+'%');q('[data-ux-progress-number]',bar).textContent=p.percent+'%';q('[data-ux-progress-label]',bar).textContent=p.label;q('[data-ux-progress-detail]',bar).textContent=p.detail;bar.dataset.currentHole=String(p.hole);markCurrentHole(p.hole);
  }

  function jumpToCurrentHole(){
    const bar=ensureToolbar(),hole=Number(bar&&bar.dataset.currentHole)||1,wrap=hole<=9?q('#frontScorecard'):q('#backScorecard'),table=q('.scorecard-table',wrap),th=table&&findHoleHeader(table,hole);if(!wrap||!th)return;
    const sticky=q('.sticky-col',table),offset=(sticky&&sticky.getBoundingClientRect().width)||110,target=Math.max(0,th.offsetLeft-offset-10);wrap.scrollTo({left:target,behavior:'smooth'});(function(panel){if(panel)panel.scrollIntoView({behavior:'smooth',block:'start'})})(wrap.closest('.ux-scorecard-panel'));
  }

  function addNameTitles(){
    qa('#scorecards .scorecard-table tbody .sticky-col').forEach(cell=>{const label=clean(cell.textContent);if(label&&!cell.title)cell.title=label});
  }

  function refresh(){
    injectStyles();ensureToolbar();decoratePanels();addNameTitles();updateProgress();
  }

  function scheduleRefresh(){if(refreshQueued)return;refreshQueued=true;requestAnimationFrame(()=>{refreshQueued=false;refresh()})}

  document.addEventListener('click',event=>{
    const t=event.target&&event.target.closest?event.target.closest('[data-ux-round-tags],[data-ux-projection],[data-ux-jump-hole],#scorecards .scorecard-table tbody .sticky-col'):null;if(!t)return;
    if(t.hasAttribute('data-ux-round-tags')){event.preventDefault();if(window.HBNFRoundTags)window.HBNFRoundTags.open();return}
    if(t.hasAttribute('data-ux-projection')){event.preventDefault();const source=q('#scorecards .panel:first-child [data-open-tag-projection]');if(source)source.click();return}
    if(t.hasAttribute('data-ux-jump-hole')){event.preventDefault();jumpToCurrentHole();return}
    if(t.matches('#scorecards .scorecard-table tbody .sticky-col')){t.classList.toggle('ux-name-expanded');return}
  });

  document.addEventListener('change',event=>{if(event.target&&event.target.matches('#scorecards input,#scorecards select,#scorecards textarea')){scheduleRefresh();document.dispatchEvent(new CustomEvent('hbnf:score-state-changed'))}});
  document.addEventListener('click',event=>{if(event.target&&event.target.closest&&event.target.closest('#scorecards .skin-check,#scorecards .tb-checkbox')){setTimeout(()=>{scheduleRefresh();document.dispatchEvent(new CustomEvent('hbnf:score-state-changed'))},0)}});
  document.addEventListener('hbnf:incoming-tags-changed',scheduleRefresh);

  const observer=new MutationObserver(scheduleRefresh);
  function init(){refresh();observer.observe(q('#scorecards')||document.body,{childList:true,subtree:true});setInterval(scheduleRefresh,2500);window.HBNFSkinsUX={build:BUILD,refresh:scheduleRefresh,jumpToCurrentHole}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
