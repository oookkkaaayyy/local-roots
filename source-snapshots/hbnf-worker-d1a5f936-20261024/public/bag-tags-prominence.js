/* HB Night Flyers — Prominent Bag Tags on Standings · Build 7.28.26_1 */
(function(){
  'use strict';
  const STYLE_ID='hbnfProminentBagTagsStyles';
  let scheduled=false;
  function q(selector,root){return (root||document).querySelector(selector)}
  function ensureStyles(){
    if(q('#'+STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
.hbnf-prominent-bag-tags{border-color:rgba(216,255,136,.42)!important;box-shadow:0 0 24px rgba(57,255,20,.2),0 0 54px rgba(57,255,20,.09)!important;background:linear-gradient(180deg,rgba(24,49,29,.98),rgba(8,22,12,.98))!important}
.hbnf-prominent-bag-tags>.hbnf-bag-tags-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.hbnf-prominent-bag-tags>.hbnf-bag-tags-heading h2,.hbnf-prominent-bag-tags>.hbnf-bag-tags-heading h3{margin:0;color:var(--bright)}
.hbnf-prominent-bag-tags .hbnf-bag-tags-helper{margin:.15rem 0 .75rem;color:var(--muted)}
.hbnf-prominent-bag-tags [data-save-bag-tags]{border-color:var(--bright);background:linear-gradient(180deg,#24422a,#0d1b11)}
@media(max-width:700px){.hbnf-prominent-bag-tags{scroll-margin-top:105px}.hbnf-prominent-bag-tags .responsive-table-wrap{max-height:62vh;overflow:auto}}
`;
    document.head.appendChild(style);
  }
  function addHeading(panel,title){
    if(q(':scope > .hbnf-bag-tags-heading',panel))return;
    const heading=document.createElement('div');
    heading.className='hbnf-bag-tags-heading';
    heading.innerHTML=`<div><h2>${title}</h2><p class="hbnf-bag-tags-helper">Shared across Skins and Glow. Correct tag numbers directly in this table.</p></div><span class="pill">Quick Access</span>`;
    panel.insertBefore(heading,panel.firstChild);
  }
  function promoteSkins(){
    const root=q('#standings'),tag=q('#bagTagsPanel');
    if(!root||!tag)return;
    const panel=tag.closest('.panel');
    if(!panel)return;
    panel.classList.add('hbnf-prominent-bag-tags');
    const existingTitle=q(':scope > h3.round-title',panel);
    if(existingTitle){
      const heading=document.createElement('div');
      heading.className='hbnf-bag-tags-heading';
      existingTitle.parentNode.insertBefore(heading,existingTitle);
      heading.appendChild(existingTitle);
      const helper=document.createElement('p');helper.className='hbnf-bag-tags-helper';helper.textContent='Shared across Skins and Glow. Correct tag numbers directly in this table.';heading.appendChild(helper);
    }else addHeading(panel,'Bag Tags');
    const first=root.querySelector(':scope > .panel');
    if(first&&first.nextElementSibling!==panel)root.insertBefore(panel,first.nextSibling);
  }
  function promoteGlow(){
    const root=q('#standingsPage'),tag=q('#bagTagsPanel');
    if(!root||!tag)return;
    const panel=tag.closest('.panel');
    if(!panel)return;
    const preceding=panel.previousElementSibling;
    if(preceding&&preceding.classList.contains('panel')&&/Bag Tags/i.test(preceding.textContent||''))preceding.remove();
    panel.classList.add('hbnf-prominent-bag-tags');
    addHeading(panel,'Bag Tags');
    const first=root.querySelector(':scope > .panel');
    if(first&&first.nextElementSibling!==panel)root.insertBefore(panel,first.nextSibling);
  }
  function promote(){scheduled=false;ensureStyles();promoteSkins();promoteGlow()}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(promote)}
  document.addEventListener('click',event=>{if(event.target&&event.target.closest&&event.target.closest('[data-page],[data-page-jump],.nav-btn'))setTimeout(schedule,0)});
  const observer=new MutationObserver(schedule);
  function init(){promote();observer.observe(document.body,{childList:true,subtree:true});window.setInterval(schedule,2500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
