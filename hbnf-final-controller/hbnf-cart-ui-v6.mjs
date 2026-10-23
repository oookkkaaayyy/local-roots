const $=id=>document.getElementById(id);
function syncSceneButtons(value){
  document.querySelectorAll(".scene-button").forEach(b=>b.classList.toggle("active",b.dataset.scene===value));
}
function sceneButtons(){
  const select=$("scene"),host=$("sceneButtons");
  if(!select||!host||host.dataset.ready==="1")return;
  host.dataset.ready="1";
  const labels=[
    ["course-flow","Steady","A consistent pace; looks change every 45–90 seconds."],
    ["field-mix","Upbeat","Faster changes; each look lasts 40–80 seconds."],
    ["hbnf-signature","HBNF signature","Signature looks; each lasts 50–100 seconds."],
    ["quiet-cosmos","Calm","Slower changes; each look lasts 60–120 seconds."]
  ];
  for(const [value,label,description] of labels){
    const b=document.createElement("button");
    b.type="button";b.className="scene-button";b.dataset.scene=value;
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
