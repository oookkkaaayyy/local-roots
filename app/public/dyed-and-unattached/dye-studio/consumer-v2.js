(function(){
"use strict";
window.addEventListener("DOMContentLoaded",function(){
const g=id=>document.getElementById(id),p=g("consumerPalette"),list=g("layerList"),stage=g("canvasSection");
if(!p||!list||!stage||g("du-color-trigger"))return;
const shade=document.createElement("div");shade.id="du-shade";document.body.appendChild(shade);
const head=document.createElement("div");head.id="du-palette-head";
head.innerHTML='<strong id="du-palette-title">Choose color</strong><button id="du-palette-close" type="button">Close ✕</button>';
p.prepend(head);
const add=document.createElement("button");add.id="du-color-trigger";add.type="button";
add.className="primary";add.textContent="+ Add dye color";
add.setAttribute("aria-controls","consumerPalette");add.setAttribute("aria-expanded","false");
stage.querySelector(".consumer-preview-head").insertBefore(add,g("consumerViewSlot"));
const quick=document.createElement("div");quick.id="du-quick";
quick.innerHTML='<strong id="du-color-name">Selected color</strong>'+
'<div class="du-quick-row" role="group" aria-label="Color region"><button data-shape="edge">One side</button><button data-shape="stripe">Band</button><button data-shape="full">Entire disc</button></div>'+
'<div id="du-widths" class="du-quick-row" role="group" aria-label="Band width"><button data-width="20">Narrow</button><button data-width="45">Medium</button><button data-width="85">Wide</button></div>'+
'<div class="du-quick-row"><button id="du-replace">Change color</button><button id="du-copy">Duplicate</button><button id="du-flip">Flip side</button></div>'+
'<p>Drag a line on the disc to move its color. Drag its end handles to rotate. Use the arrows below the selected color to change its order.</p>';
g("consumerLayers").insertBefore(quick,g("consumerDyesSlot"));
g("emptyLayers").textContent="No colors yet. Tap Add dye color above the disc.";
const tip=stage.querySelector(".canvas-tip");if(tip)tip.textContent="Drag line to move • drag ends to rotate";
let mode="add",focusReturn=null;
function open(kind){
 if(!document.body.classList.contains("client-mode"))return;
 mode=kind==="replace"&&selected>=0?"replace":"add";
 focusReturn=document.activeElement;
 g("du-palette-title").textContent=mode==="replace"?"Change selected color":"Choose a dye color";
 document.body.classList.add("du-palette-open");add.setAttribute("aria-expanded","true");
 p.setAttribute("role","dialog");p.setAttribute("aria-modal","true");
 g("du-palette-close").focus();
}
function close(){
 document.body.classList.remove("du-palette-open");add.setAttribute("aria-expanded","false");
 p.removeAttribute("role");p.removeAttribute("aria-modal");
 if(focusReturn&&focusReturn.isConnected)focusReturn.focus();else add.focus();
}
add.onclick=()=>open("add");g("du-replace").onclick=()=>open("replace");
g("du-palette-close").onclick=close;shade.onclick=close;
document.addEventListener("keydown",e=>{
 if(e.key==="Escape"&&document.body.classList.contains("du-palette-open")){e.preventDefault();close()}
 if(e.key==="Tab"&&document.body.classList.contains("du-palette-open")){
  const a=Array.from(p.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled])")).filter(x=>x.getClientRects().length);
  if(a.length){if(e.shiftKey&&document.activeElement===a[0]){e.preventDefault();a[a.length-1].focus()}else if(!e.shiftKey&&document.activeElement===a[a.length-1]){e.preventDefault();a[0].focus()}}
 }
});
p.addEventListener("click",e=>{
 const sw=e.target.closest(".swatch");if(!sw||!document.body.classList.contains("client-mode"))return;
 if(mode==="replace"){
  e.preventDefault();e.stopImmediatePropagation();
  const name=sw.querySelector(".swatch-name")?.textContent?.trim();
  const dye=dyes.find(d=>d[0]===activeGroup&&d[1]===name);
  if(dye&&selected>=0)mutate(()=>{
   const l=layers[selected];l.name=dye[1];l.hex=dye[2].toUpperCase();
   l.method=/uv blast|quick.coat|worm dip/i.test(l.name)?"worm-dip":activeMethod();
  },"Dye color changed");
 }
 close();
},true);
function input(id,value){const el=g(id);el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}
quick.querySelectorAll("[data-shape]").forEach(b=>b.onclick=()=>input("shape",b.dataset.shape));
quick.querySelectorAll("[data-width]").forEach(b=>b.onclick=()=>input("stripeWidth",b.dataset.width));
g("du-copy").onclick=()=>g("duplicateLayer").click();g("du-flip").onclick=()=>g("flipSide").click();
let pending=false;
function refresh(){
 pending=false;const l=selected>=0?layers[selected]:null;
 quick.classList.toggle("du-active",!!l&&document.body.classList.contains("client-mode"));
 if(l){
  g("du-color-name").textContent="Editing: "+l.name;
  quick.querySelectorAll("[data-shape]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.shape===l.shape)));
  g("du-widths").classList.toggle("du-show",l.shape==="stripe");
  g("du-flip").classList.toggle("du-show",l.shape==="edge");
 }
 list.querySelectorAll(".layer").forEach(row=>{
  row.tabIndex=0;row.setAttribute("role","button");
  if(!row.dataset.duKeyboard){row.dataset.duKeyboard="1";row.addEventListener("keydown",e=>{if(e.target===row&&(e.key==="Enter"||e.key===" ")){e.preventDefault();row.click()}})}
  const name=row.querySelector(".layer-name")?.textContent?.trim()||"color";
  const labels=["Move up","Move down","Delete"];
  row.querySelectorAll(".layer-actions button").forEach((b,i)=>{b.setAttribute("aria-label",labels[i]+" "+name);b.title=labels[i]});
 });
}
function schedule(){if(!pending){pending=true;requestAnimationFrame(refresh)}}
new MutationObserver(schedule).observe(list,{childList:true});
new MutationObserver(()=>{if(document.body.classList.contains("calibration-mode")&&document.body.classList.contains("du-palette-open"))close();schedule()}).observe(document.body,{attributes:true,attributeFilter:["class"]});
g("dyesDetails").open=true;
schedule();
},{once:true});
})();
