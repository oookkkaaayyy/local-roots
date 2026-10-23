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
    body{max-width:900px;padding:16px 16px calc(24px + env(safe-area-inset-bottom));background:#071b24;color:#edf7f8}
    .hero-v6{align-items:center;gap:12px}.hero-v6 h1{font-size:1.7rem;letter-spacing:-.02em}.eyebrow{color:#80d7c6;letter-spacing:.14em}
    #ownerNavigation{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;position:sticky;top:0;z-index:5;padding:8px 0;background:#071b24}
    #ownerNavigation button{min-height:48px;border-radius:14px;background:#102c37;border:1px solid #29515d;font-weight:800}
    .owner-view-heading{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    #ownerNavigation button[aria-current="page"]{background:#1b4a51;border-color:#70d5bb;color:#fff}
    .owner-view{display:grid;gap:12px}.owner-view[hidden]{display:none!important}
    .owner-view .panel{border-color:#28505a;border-radius:18px;background:linear-gradient(145deg,#102832,#0b2029);padding:16px}
    .owner-view h2{letter-spacing:-.01em}.owner-view button,.owner-view select,.owner-view input:not([type=range]),.owner-view textarea{min-height:46px;border-radius:13px}
    .owner-view button{font-weight:750}.owner-view button:disabled{opacity:.58;cursor:wait}
    #status{order:3;margin:0;min-height:24px;color:#bfeee2;font-weight:650}
    #truthBadge{border-radius:999px;padding:8px 12px;white-space:normal}
    #scoresPanel .score-entry{margin-top:12px}.owner-score-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .owner-score-actions button{min-height:52px;background:#16434d;border-color:#3a7880}
    .owner-view .course-status-grid{gap:8px}.owner-view .course-status-cell,.owner-view .truth-cell{border-radius:12px}
    .owner-view .danger{background:#472832;border-color:#a5505a}
    @media(max-width:540px){body{padding-left:12px;padding-right:12px}.owner-view .guest-invite{align-items:flex-start}.owner-score-actions{grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(css);

  const nav = document.createElement("nav");
  nav.id = "ownerNavigation";
  nav.setAttribute("aria-label", "Cart controls");
  nav.innerHTML = '<button type="button" data-owner-view="show" aria-current="page">Show</button><button type="button" data-owner-view="scores">Scores</button><button type="button" data-owner-view="system">System</button>';
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
