(function(){
"use strict";
window.addEventListener("DOMContentLoaded",function(){
const g=id=>document.getElementById(id),p=g("consumerPalette"),list=g("layerList"),stage=g("canvasSection");
if(!p||!list||!stage||g("du-color-trigger"))return;
// Keep model IDs untouched; remove technical descriptors from the plastic picker
// in Consumer, and restore full labels when returning to Technical Studio.
const plasticSelect=g("profileSelect");
function syncPlasticLabels(){
 if(!plasticSelect)return;
 const consumer=document.body.classList.contains("client-mode");
 Array.from(plasticSelect.options).forEach(option=>{
  if(!option.dataset.duFullLabel)option.dataset.duFullLabel=option.textContent;
  const full=option.dataset.duFullLabel;
  option.textContent=consumer?full.split(" — ")[0]:full;
 });
}
syncPlasticLabels();
// Photo color correction lives in the review-before-apply swatch in index.html.
// Keep a second consumer correction panel out of sync with that flow from
// reappearing here: the older buttons applied directly to the accepted model.
// Group the starter-disc and color-list cards in one compact desktop sidebar.
// On mobile, display:contents lets these cards surround the main disc editor.
const right=document.createElement("div");right.id="du-side";
stage.parentNode.insertBefore(right,stage.nextSibling);
right.append(g("consumerDisc"),g("consumerLayers"));
const shade=document.createElement("div");shade.id="du-shade";document.body.appendChild(shade);
const head=document.createElement("div");head.id="du-palette-head";
head.innerHTML='<strong id="du-palette-title">Choose color</strong><button id="du-palette-close" type="button">Close ✕</button>';
p.prepend(head);
const add=document.createElement("button");add.id="du-color-trigger";add.type="button";
add.className="primary";add.textContent="+ Add dye color";
add.setAttribute("aria-controls","consumerPalette");add.setAttribute("aria-expanded","false");
stage.querySelector(".consumer-preview-head").insertBefore(add,g("consumerViewSlot"));
const lighting=document.createElement("details");lighting.id="du-lighting";
const lightingSummary=document.createElement("summary");lightingSummary.textContent="Lighting";
lighting.append(lightingSummary,g("consumerViewSlot"));
stage.querySelector(".consumer-preview-head").append(lighting);
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
  const a=Array.from(p.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[role="button"][tabindex="0"]')).filter(x=>x.getClientRects().length);
  if(a.length){if(e.shiftKey&&document.activeElement===a[0]){e.preventDefault();a[a.length-1].focus()}else if(!e.shiftKey&&document.activeElement===a[a.length-1]){e.preventDefault();a[0].focus()}}
 }
});
p.addEventListener("click",e=>{
 const sw=e.target.closest(".swatch");if(!sw||!document.body.classList.contains("client-mode"))return;
 const name=sw.querySelector(".swatch-name")?.textContent?.trim();
 const dye=dyes.find(d=>d[0]===activeGroup&&d[1]===name);
 if(!dye)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 if(mode==="replace"&&selected>=0){
  mutate(()=>{
   const l=layers[selected];l.name=dye[1];l.hex=dye[2].toUpperCase();
   l.method=/uv blast|quick.coat|worm dip/i.test(l.name)?"worm-dip":activeMethod();
  },"Dye color changed");
 }else addDye(dye[1],dye[2],dye[3]===true);
 close();
},true);
function input(id,value){const el=g(id);el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}
quick.querySelectorAll("[data-shape]").forEach(b=>b.onclick=()=>input("shape",b.dataset.shape));
quick.querySelectorAll("[data-width]").forEach(b=>b.onclick=()=>input("stripeWidth",b.dataset.width));
g("du-copy").onclick=()=>g("duplicateLayer").click();g("du-flip").onclick=()=>g("flipSide").click();
let draggingFrom=null;
function reorderColors(from,to){
 if(from===to||from<0||to<0||from>=layers.length||to>=layers.length)return;
 mutate(()=>{
  const selectedColor=layers[selected],moving=layers.splice(from,1)[0];
  layers.splice(to,0,moving);
  selected=selectedColor?layers.indexOf(selectedColor):-1;
 },"Color order changed");
}
function clearDropTargets(){list.querySelectorAll(".du-drag-target").forEach(row=>row.classList.remove("du-drag-target"))}
function addReorderGrip(row,index){
 if(row.querySelector(".du-layer-grip"))return;
 const grip=document.createElement("span");grip.className="du-layer-grip";
 grip.textContent="⠿";grip.draggable=true;grip.setAttribute("aria-hidden","true");
 grip.title="Drag to change color order (mouse or trackpad)";
 row.classList.add("du-has-grip");
 row.prepend(grip);
 row.addEventListener("dragstart",e=>{
  if(!e.target.closest(".du-layer-grip")){e.preventDefault();return}
  draggingFrom=index;
  if(e.dataTransfer){e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain","du-color")}
 });
 row.addEventListener("dragover",e=>{
  if(draggingFrom===null||draggingFrom===index)return;
  e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect="move";
  clearDropTargets();row.classList.add("du-drag-target");
 });
 row.addEventListener("drop",e=>{
  if(draggingFrom===null)return;
  e.preventDefault();const from=draggingFrom;draggingFrom=null;
  clearDropTargets();reorderColors(from,index);
 });
 row.addEventListener("dragend",()=>{draggingFrom=null;clearDropTargets()});
}
let pending=false;
function refresh(){
 pending=false;const l=selected>=0?layers[selected]:null;
 if(tip)tip.textContent=layers.length?"Drag the selected line to move • drag its ends to rotate":"Tap + Add dye color to begin.";
 const inConsumer=document.body.classList.contains("client-mode");
 quick.classList.toggle("du-active",!!l&&inConsumer);
 // Keep edit actions directly beneath their selected color, not above the entire list.
 const activeRow=inConsumer?list.querySelector(".layer.selected"):null;
 if(activeRow){if(quick.parentNode!==activeRow)activeRow.appendChild(quick)}
 else if(quick.parentNode!==g("consumerLayers"))g("consumerLayers").insertBefore(quick,g("consumerDyesSlot"));
 if(l){
  g("du-color-name").textContent="Editing: "+l.name;
  quick.querySelectorAll("[data-shape]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.shape===l.shape)));
  g("du-widths").classList.toggle("du-show",l.shape==="stripe");
  g("du-flip").classList.toggle("du-show",l.shape==="edge");
 }
 list.querySelectorAll(".layer").forEach((row,visualIndex)=>{
  if(inConsumer&&layers.length>1)addReorderGrip(row,layers.length-1-visualIndex);
  row.tabIndex=0;row.setAttribute("role","button");
  if(!row.dataset.duKeyboard){row.dataset.duKeyboard="1";row.addEventListener("keydown",e=>{if(e.target===row&&(e.key==="Enter"||e.key===" ")){e.preventDefault();row.click()}})}
  const name=row.querySelector(".layer-name")?.textContent?.trim()||"color";
  const labels=["Move up","Move down","Delete"];
  const visibleLabels=["↑ Move up","↓ Move down","Delete"];
  row.querySelectorAll(".layer-actions button").forEach((b,i)=>{
   b.textContent=visibleLabels[i];b.setAttribute("aria-label",labels[i]+" "+name);b.title=labels[i]
  });
 });
}
function schedule(){if(!pending){pending=true;requestAnimationFrame(refresh)}}
new MutationObserver(schedule).observe(list,{childList:true});
// Original catalog uses clickable divs. Supply keyboard access to every swatch.
const swatches=g("swatchGrid");
function accessibleSwatches(){
 if(!swatches)return;
 swatches.querySelectorAll(".swatch").forEach(sw=>{
  if(sw.dataset.duAccessible)return;
  sw.dataset.duAccessible="true";sw.tabIndex=0;
  sw.setAttribute("role","button");
  const name=sw.querySelector(".swatch-name")?.textContent?.trim()||"dye";
  sw.setAttribute("aria-label","Select "+name);
  sw.addEventListener("keydown",e=>{
   if(e.target===sw&&(e.key==="Enter"||e.key===" ")){e.preventDefault();sw.click()}
  });
 });
}
if(swatches){
 new MutationObserver(accessibleSwatches).observe(swatches,{childList:true});
 accessibleSwatches();
}
new MutationObserver(()=>{if(document.body.classList.contains("calibration-mode")&&document.body.classList.contains("du-palette-open"))close();syncPlasticLabels();schedule()}).observe(document.body,{attributes:true,attributeFilter:["class"]});
g("dyesDetails").open=true;
schedule();
},{once:true});
})();
