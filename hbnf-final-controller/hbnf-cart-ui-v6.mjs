const $=id=>document.getElementById(id);
function syncSceneButtons(value){
  document.querySelectorAll(".scene-button").forEach(b=>b.classList.toggle("active",b.dataset.scene===value));
}
function sceneButtons(){
  const select=$("scene"),host=$("sceneButtons");
  if(!select||!host||host.dataset.ready==="1")return;
  host.dataset.ready="1";
  const labels={
    "course-flow":"Course Flow",
    "field-mix":"Field Mix",
    "hbnf-signature":"HBNF Signature",
    "quiet-cosmos":"Quiet Cosmos"
  };
  for(const [value,label] of Object.entries(labels)){
    const b=document.createElement("button");
    b.type="button";b.className="scene-button";b.dataset.scene=value;b.textContent=label;
    b.addEventListener("click",()=>{
      if(select.value!==value){
        select.value=value;
        select.dispatchEvent(new Event("change",{bubbles:true}));
      }
      syncSceneButtons(value);
    });
    host.appendChild(b);
  }
  syncSceneButtons(select.value);
  select.addEventListener("change",()=>syncSceneButtons(select.value));
}
sceneButtons();
