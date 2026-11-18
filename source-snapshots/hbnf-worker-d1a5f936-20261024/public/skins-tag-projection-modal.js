/* HB Night Flyers — Bag Tag Projection Modal · Build 9.8.26_1
 * Hotfix: prevent the projection observer from triggering itself continuously.
 */
(function(){
  'use strict';

  const MODAL_ID='hbnfTagProjectionModal';
  const STYLE_ID='hbnfTagProjectionModalStyles';
  const OPEN_ATTR='data-open-tag-projection';
  let refreshQueued=false;

  function q(selector,root){return (root||document).querySelector(selector)}

  function ensureStyles(){
    if(q('#'+STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
#${MODAL_ID}{position:fixed;inset:0;z-index:11000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.76);backdrop-filter:blur(8px)}
#${MODAL_ID}.open{display:flex}
#${MODAL_ID} .tag-projection-sheet{width:min(1100px,100%);max-height:92vh;overflow:auto;border:1px solid rgba(216,255,136,.34);border-radius:24px;background:linear-gradient(180deg,#122218,#07110b);box-shadow:0 28px 100px rgba(0,0,0,.65),var(--shadow);padding:16px}
#${MODAL_ID} .tag-projection-modal-head{position:sticky;top:-16px;z-index:20;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 0 12px;background:linear-gradient(180deg,#122218 78%,rgba(18,34,24,0))}
#${MODAL_ID} .tag-projection-modal-head h3{margin:0;color:var(--bright)}
#${MODAL_ID} .tag-projection-modal-head p{margin:.3rem 0 0;color:var(--muted)}
#${MODAL_ID} .tag-projection-close{min-width:44px}
#${MODAL_ID} #hbnfLiveTagTracker{margin:0!important;box-shadow:none!important}
#scorecards .tag-projection-launch{border-color:rgba(183,233,131,.45)!important;background:linear-gradient(180deg,rgba(131,201,93,.20),rgba(131,201,93,.07))!important}
@media(max-width:700px){#${MODAL_ID}{padding:0;align-items:flex-end}#${MODAL_ID} .tag-projection-sheet{width:100%;max-height:94vh;border-radius:22px 22px 0 0;padding:12px}#${MODAL_ID} .tag-projection-modal-head{top:-12px;padding-top:12px}}
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
    modal.setAttribute('aria-label','Live bag tag projection');
    modal.innerHTML=`<div class="tag-projection-sheet"><div class="tag-projection-modal-head"><div><h3>Live Bag Tag Projection</h3><p>Projected tag handoff order while the selected round is in progress.</p></div><button class="btn tag-projection-close" type="button" data-close-tag-projection aria-label="Close">✕</button></div><div data-tag-projection-slot></div></div>`;
    modal.addEventListener('click',event=>{if(event.target===modal)closeModal()});
    document.body.appendChild(modal);
    return modal;
  }

  function moveTracker(){
    const modal=ensureModal();
    const tracker=q('#hbnfLiveTagTracker');
    const slot=q('[data-tag-projection-slot]',modal);
    if(tracker&&slot&&tracker.parentNode!==slot)slot.appendChild(tracker);
  }

  function ensureButton(){
    const tools=q('#scorecards .panel:first-child .inline-tools');
    if(!tools)return;

    let button=q('['+OPEN_ATTR+']',tools);
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='btn tag-projection-launch';
      button.setAttribute(OPEN_ATTR,'1');
      const edit=q('[data-open-incoming-tags]',tools);
      if(edit&&edit.nextSibling)tools.insertBefore(button,edit.nextSibling);
      else tools.insertBefore(button,tools.firstChild);
    }

    const label='Bag Tag Projection';
    const title='Open the live hole-by-hole bag tag projection';
    if(button.textContent!==label)button.textContent=label;
    if(button.title!==title)button.title=title;
  }

  function refresh(){
    ensureButton();
    moveTracker();
  }

  function scheduleRefresh(){
    if(refreshQueued)return;
    refreshQueued=true;
    requestAnimationFrame(()=>{
      refreshQueued=false;
      refresh();
    });
  }

  function openModal(){
    refresh();
    ensureModal().classList.add('open');
    document.body.style.overflow='hidden';
  }

  function closeModal(){
    const modal=q('#'+MODAL_ID);
    if(modal)modal.classList.remove('open');
    document.body.style.overflow='';
  }

  document.addEventListener('click',event=>{
    if(event.target&&event.target.closest&&event.target.closest('['+OPEN_ATTR+']')){
      event.preventDefault();
      openModal();
      return;
    }
    if(event.target&&event.target.closest&&event.target.closest('[data-close-tag-projection]')){
      event.preventDefault();
      closeModal();
    }
  });

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&q('#'+MODAL_ID+'.open'))closeModal();
  });

  document.addEventListener('hbnf:incoming-tags-changed',scheduleRefresh);

  const observer=new MutationObserver(scheduleRefresh);

  function init(){
    ensureModal();
    refresh();
    observer.observe(document.body,{childList:true,subtree:true});
    window.setInterval(scheduleRefresh,2000);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
