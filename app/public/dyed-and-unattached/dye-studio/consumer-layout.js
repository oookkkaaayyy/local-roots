/* Reuse original editor controls across Consumer Designer and Technical Studio. */
(function () {
"use strict";
const destinations=[
 ["#profileSelect","consumerProfileSlot"],
 ["#baseColor","consumerBaseSlot"],
 ["#baseHex","consumerBaseSlot"],
 ["#whiteDisc","consumerBaseSlot"],
 ["#glowDisc","consumerBaseSlot"],
 [".preset-row","consumerPresetSlot"],
 [".condition-switch","consumerViewSlot"],
 ["#dyesDetails","consumerDyesSlot"],
 ["#editDetails","consumerEditorSlot"],
 [".catalog-head","consumerCatalogHeadSlot"],
 [".tabs","consumerTabsSlot"],
 ["#swatchGrid","consumerSwatchesSlot"],
 ["#undoBtn","projectActions"],
 ["#redoBtn","projectActions"]
];
let moves=null;
function init(){
 if(moves)return;
 const entries=destinations.map(([selector,slotId])=>{
   const node=document.querySelector(selector),slot=document.getElementById(slotId);
   if(!node||!slot||!node.parentNode)throw new Error("Missing Studio control "+selector+" -> "+slotId);
   return {node,slot,marker:document.createComment("original "+selector)};
 });
 entries.forEach(({node,marker})=>node.parentNode.insertBefore(marker,node));
 moves=entries;
}
function setView(mode){
 if(!moves)init();
 for(const {node,slot,marker} of moves){
   if(mode==="client")slot.appendChild(node);
   else marker.parentNode.insertBefore(node,marker);
 }
}
window.DUConsumerLayout={init,setView};
})();
