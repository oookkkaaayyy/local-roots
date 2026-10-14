const $=id=>document.getElementById(id);
function syncSceneButtons(value){
  document.querySelectorAll(".scene-button").forEach(b=>b.classList.toggle("active",b.dataset.scene===value));
}
function sceneButtons(){
  const select=$("scene"),host=$("sceneButtons");
  if(!select||!host||host.dataset.ready==="1")return;
  host.dataset.ready="1";
  const labels=[
    ["course-flow","Balanced (Course Flow)","45–90 seconds between variants; broad speed range."],
    ["field-mix","Upbeat (Field Mix)","Faster speed range; 40–80 second holds."],
    ["hbnf-signature","Signature (HBNF Signature)","Mid-to-fast speed range; 50–100 second holds."],
    ["quiet-cosmos","Ambient (Quiet Cosmos)","Slower speed range; 60–120 second holds."]
  ];
  for(const [value,label,description] of labels){
    const b=document.createElement("button");
    b.type="button";b.className="scene-button";b.dataset.scene=value;
    b.disabled=window.__HBNF_TUNE_READY!==true;
    const name=document.createElement("strong");name.className="scene-name";name.textContent=label;
    const detail=document.createElement("span");detail.className="scene-description";detail.textContent=description;
    b.append(name,detail);
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
window.addEventListener("hbnf-tune-state-ready",event=>{
  const ready=!!(event&&event.detail&&event.detail.ready===true);
  document.querySelectorAll(".scene-button").forEach(button=>{button.disabled=!ready;});
});
