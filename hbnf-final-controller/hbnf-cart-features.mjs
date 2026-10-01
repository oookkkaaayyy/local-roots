/* HBNF coordinated feature surface — source-only staging. No automatic mutation. */
const MATRIX_API = "https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-matrix-control";
const OPAL_CHECK = "https://console.gl-inet.com/cgi-bin/luci/hbnf-updater?action=check";
const OPAL_INSTALLER = "https://console.gl-inet.com/cgi-bin/luci/hbnf-installer";
const LOOKS = [
  [61,"Complex Kaleido"],[62,"Big Kaleido"],[63,"Parametric Water"],[64,"RGB Blobs"],
  [65,"Polar Waves"],[66,"Zoom 2"],[67,"Kaleido 4"],[68,"Kaleido 6"],
  [69,"Water"],[70,"RGB Blobs 4"],[71,"Kaleido 5"],[72,"Spiralus 2"],
  [73,"Hot Blob"],[74,"Kaleido 3"],[75,"Waves"],[76,"Chasing Spirals"],
  [77,"Rotating Blob"],[78,"Center Field"],[79,"Distance"],[80,"Lava"],
  [81,"Kaleido 2"],[82,"Yves"],[83,"Scale Demo"],[84,"Zoom"],
  [85,"Complex Kaleido 2"],[86,"RGB Blobs 3"],[87,"SM5"],[88,"Module Experiment"]
];
const SAVED_LOOK_KEY = "hbnf_cart_saved_look_v1";
const $ = id => document.getElementById(id);

function setFeatureStatus(message, bad=false) {
  const node = $("featureStatus");
  if (!node) return;
  node.textContent = message;
  node.className = bad ? "status bad" : "status";
}

function matrixLocal() {
  return location.hostname === "192.168.77.10";
}

async function matrixApi(action, payload={}) {
  const r = await fetch(MATRIX_API, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,...payload}),
    cache:"no-store"
  });
  const j = await r.json().catch(()=>({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || ("HTTP " + r.status));
  return j;
}

async function wledState(payload) {
  if (!matrixLocal()) throw new Error("Local Matrix controls activate only from 192.168.77.10/hbnf.");
  const r = await fetch("/json/state", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload),
    cache:"no-store"
  });
  if (!r.ok) throw new Error("Matrix local API HTTP " + r.status);
  return r.json().catch(()=>({}));
}

function hexRgb(hex) {
  const s = String(hex || "").replace("#","");
  if (!/^[0-9a-f]{6}$/i.test(s)) return [255,255,255];
  return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)];
}

function populateLooks() {
  const select = $("featureLook");
  if (!select || select.options.length) return;
  LOOKS.forEach(([value,label])=>{
    const o=document.createElement("option");
    o.value=String(value); o.textContent=label;
    select.appendChild(o);
  });
}

async function applyLook() {
  const preset = Number($("featureLook").value);
  const color = hexRgb($("featureColor").value);
  setFeatureStatus("Applying look…");
  await wledState({on:true,ps:preset,seg:[{id:0,col:[color,[0,0,0],[0,0,0]]}]});
  setFeatureStatus("Look applied.");
}

async function saveLook() {
  const look = {
    preset:Number($("featureLook").value),
    color:$("featureColor").value,
    motion:Number(($("motion") && $("motion").value) || 60),
    audioResponse:Number(($("audioResponse") && $("audioResponse").value) || 75)
  };
  localStorage.setItem(SAVED_LOOK_KEY, JSON.stringify(look));
  setFeatureStatus("Saved look stored on this device.");
}

async function applySavedLook() {
  const raw = localStorage.getItem(SAVED_LOOK_KEY);
  if (!raw) throw new Error("No saved look on this device.");
  const look = JSON.parse(raw);
  $("featureLook").value=String(look.preset);
  $("featureColor").value=look.color || "#ffffff";
  if ($("motion")) { $("motion").value=String(look.motion); $("motion").dispatchEvent(new Event("change",{bubbles:true})); }
  if ($("audioResponse")) { $("audioResponse").value=String(look.audioResponse); $("audioResponse").dispatchEvent(new Event("change",{bubbles:true})); }
  await applyLook();
  setFeatureStatus("Saved look applied.");
}

async function sendText() {
  const text = String($("featureText").value || "").trim();
  if (!text) throw new Error("Type a message first.");
  setFeatureStatus("Sending text…");
  await matrixApi("text",{text,color:$("featureColor").value || "#FFFFFF"});
  $("featureText").value="";
  setFeatureStatus("Text sent.");
}

function renderLive(live) {
  const node=$("featureLive");
  if (!node) return;
  if (!live || !live.active) {
    node.textContent = "No active Skins or Glow round.";
    return;
  }
  const entries = Array.isArray(live.entries) ? live.entries.slice(0,8).join(" · ") : "";
  node.textContent = live.event.toUpperCase()+" · "+live.label+" · ACE POT $"+Number(live.acePot||0).toFixed(0)+(entries ? " · "+entries : "");
}

async function refreshLive() {
  setFeatureStatus("Refreshing live round…");
  const out = await matrixApi("live_status");
  renderLive(out.live);
  setFeatureStatus("Live round refreshed.");
}

async function showScoreboard() {
  setFeatureStatus("Sending scoreboard…");
  await matrixApi("scoreboard");
  setFeatureStatus("Scoreboard sent.");
}

async function showAcePot() {
  setFeatureStatus("Sending ace pot…");
  await matrixApi("ace_pot");
  setFeatureStatus("Ace pot sent.");
}

function renderOta(j) {
  const status=$("featureOtaStatus"), install=$("featureOtaInstall");
  if (!status || !install) return;
  if (j && j.ok === true) {
    if (j.installable === true) {
      status.textContent = "Update available: "+j.release_id;
      install.hidden=false;
    } else if (j.already_accepted === true) {
      status.textContent = "Current signed release accepted: "+j.release_id;
      install.hidden=true;
    } else {
      status.textContent = "Signed release checked: "+(j.release_id || "unknown");
      install.hidden=true;
    }
  } else {
    status.textContent = "Signed update check unavailable.";
    install.hidden=true;
  }
}

async function checkOta() {
  const status=$("featureOtaStatus");
  if (!matrixLocal()) {
    status.textContent="OTA check activates from the local Matrix dashboard on HBNF-Cart.";
    return;
  }
  status.textContent="Checking signed release…";
  const r=await fetch(OPAL_CHECK,{method:"GET",cache:"no-store",credentials:"omit"});
  const j=await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(j.error || ("OTA HTTP "+r.status));
  renderOta(j);
}

function bind(id,fn) {
  const n=$(id); if (!n) return;
  n.addEventListener("click",()=>Promise.resolve(fn()).catch(e=>setFeatureStatus(e.message || String(e),true)));
}

populateLooks();
bind("featureApplyLook",applyLook);
bind("featureSaveLook",saveLook);
bind("featureApplySaved",applySavedLook);
bind("featureSendText",sendText);
bind("featureRefreshLive",refreshLive);
bind("featureScoreboard",showScoreboard);
bind("featureAcePot",showAcePot);
bind("featureOtaCheck",checkOta);
bind("featureOtaInstall",()=>{ location.href=OPAL_INSTALLER; });
if ($("featureText")) $("featureText").addEventListener("keydown",e=>{ if(e.key==="Enter") $("featureSendText").click(); });
if (!matrixLocal()) setFeatureStatus("Core cart controls remain active. Local look/color/OTA controls enable when this UI is served from 192.168.77.10.");
