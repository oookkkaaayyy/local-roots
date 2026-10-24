const $=id=>document.getElementById(id);
function syncSceneButtons(value){
  document.querySelectorAll(".scene-button").forEach(b=>{
    const selected=b.dataset.scene===value;
    b.classList.toggle("active",selected);
    b.setAttribute("aria-pressed",String(selected));
  });
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
    b.type="button";b.className="scene-button";b.dataset.scene=value;b.setAttribute("aria-pressed","false");
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
/* Reorganize the existing Owner PWA controls into Show, Scores and System views.
 * This changes presentation only; all original control IDs and handlers stay intact. */
const main = document.querySelector("body > main");
const header = main && main.querySelector(".hero-v6");
if (main && header && !document.getElementById("ownerNavigation")) {
  const css = document.createElement("style");
  css.textContent = `
    /* Layout rules only; visual design lives in hbnf-cart-ui-v6.css. */
    #ownerNavigation{position:sticky;top:0;z-index:5}
    .owner-view{display:grid;gap:14px;align-items:start}.owner-view[hidden]{display:none!important}
    .owner-view-heading{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    #scoresPanel .score-entry{margin-top:12px}
    .owner-score-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    @media(max-width:699px){.hero-v6>#status{grid-column:1/-1}}
  `;
  document.head.appendChild(css);

  const nav = document.createElement("nav");
  nav.id = "ownerNavigation";
  nav.setAttribute("aria-label", "Cart controls");
  nav.innerHTML = '<button type="button" data-owner-view="show" aria-controls="ownerViewShow" aria-current="page">Show</button><button type="button" data-owner-view="scores" aria-controls="ownerViewScores">Scores</button><button type="button" data-owner-view="system" aria-controls="ownerViewSystem">System</button>';
  header.after(nav);

  const views = {};
  ["show", "scores", "system"].forEach((name) => {
    const section = document.createElement("section");
    section.id = "ownerView" + name[0].toUpperCase() + name.slice(1);
    section.className = "owner-view";
    section.setAttribute("aria-label", name[0].toUpperCase() + name.slice(1));
    const heading = document.createElement("h2");
    heading.className = "owner-view-heading";
    heading.textContent = name[0].toUpperCase() + name.slice(1);
    section.appendChild(heading);
    section.hidden = name !== "show";
    views[name] = section;
  });
  nav.after(views.show);
  views.show.after(views.scores);
  views.scores.after(views.system);
  const status = main.querySelector("#status");
  if (status) header.appendChild(status);
  const move = (selector, view) => {
    const element = main.querySelector(selector);
    if (element) views[view].appendChild(element);
    return element;
  };
  move("#lightsPanel", "show");
  const showStyle = move("#showStylePanel", "show");
  const sceneButtonsHost = main.querySelector("#sceneButtons");
  const nativeScene = main.querySelector(".scene-native-wrap");
  const pauseButton = main.querySelector('[data-command="LOCK"]');
  const showStyleOptions = main.querySelector("#showStyleOptions");
  const showStylePause = main.querySelector("#showStylePause");
  if (showStyle && sceneButtonsHost && showStyleOptions) showStyleOptions.appendChild(sceneButtonsHost);
  if (showStyle && nativeScene && showStyleOptions) showStyleOptions.appendChild(nativeScene);
  if (showStyle && pauseButton && showStylePause) showStylePause.appendChild(pauseButton);
  const oldSceneGrid = main.querySelector(".cart-commands .control-grid");
  if (oldSceneGrid) oldSceneGrid.remove();
  const oldSubControls = main.querySelector(".cart-commands .sub-controls");
  if (oldSubControls) oldSubControls.remove();
  const showHelp = document.createElement("p");
  showHelp.className = "apply-note";
  showHelp.textContent = "Next changes the look. Auto chooses a look for you.";
  const sequenceRow = main.querySelector(".cart-commands .row");
  if (sequenceRow) sequenceRow.after(showHelp);
  move(".cart-commands", "show");
  move("#textPanel", "show");
  move(".quick-tuning", "system");
  move("#scoresPanel", "scores");
  move(".course-status-panel", "system");
  move(".guest-quick-panel", "system");
  move(".truth-panel", "system");
  move("#pairAcceptPanel", "system");
  move("#authPanel", "system");
  move("#managePairPanel", "system");
  const quick = main.querySelector(".primary-actions");
  if (quick) {
    const actions = document.createElement("div");
    actions.className = "owner-score-actions";
    actions.setAttribute("aria-label", "Score actions");
    ["#featureRefreshLive", "#featureScoreboard"].forEach((selector) => {
      const button = quick.querySelector(selector);
      if (button) actions.appendChild(button);
    });
    views.scores.prepend(actions);
    quick.remove();
  }
  const oldScoresLink = main.querySelector(".quick-links");
  if (oldScoresLink) oldScoresLink.remove();
  Array.from(main.children).forEach((element) => {
    if (element !== header && element !== nav && !Object.values(views).includes(element) && !element.hidden) {
      views.system.appendChild(element);
    }
  });
  nav.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-owner-view]");
    if (!button) return;
    const name = button.getAttribute("data-owner-view");
    Object.keys(views).forEach((key) => { views[key].hidden = key !== name; });
    nav.querySelectorAll("button[data-owner-view]").forEach((item) => {
      if (item === button) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
  });
}
