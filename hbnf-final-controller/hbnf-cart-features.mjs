/* HBNF coordinated feature surface — source-only staging. No automatic mutation. */
const MATRIX_API = "https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-matrix-control";
const OPAL_CHECK = "https://console.gl-inet.com/cgi-bin/luci/hbnf-updater?action=check";
const OPAL_RESULT = "https://console.gl-inet.com/cgi-bin/luci/hbnf-updater?action=result";
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
const SAVED_LOOKS_KEY = "hbnf_cart_saved_looks_v1";
const LEGACY_SAVED_LOOK_KEY = "hbnf_cart_saved_look_v2";
const LIVE_CACHE_KEY = "hbnf_cart_live_cache_v1";
const MAX_SAVED_LOOKS = 12;
let liveRefreshInFlight = false;
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function setFeatureStatus(message, bad=false) {
  const node = $("featureStatus");
  if (!node) return;
  node.textContent = message;
  node.className = bad ? "status bad" : "status";
}

function matrixLocal() {
  return location.hostname === "192.168.77.10";
}

async function fetchJson(url, options, label, retries=0, timeoutMs=4500) {
  let lastError = null;
  for (let attempt=0; attempt<=retries; attempt++) {
    let timer = null;
    try {
      const timeout = new Promise((resolve,reject)=>{
        timer = setTimeout(()=>reject(new Error(label+" timed out")), timeoutMs);
      });
      const response = await Promise.race([fetch(url, options || {}), timeout]);
      if (timer) clearTimeout(timer);
      const json = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(json.error || (label+" HTTP "+response.status));
      return json;
    } catch (error) {
      if (timer) clearTimeout(timer);
      lastError = error;
      if (attempt < retries) await sleep(180 * (attempt + 1));
    }
  }
  throw lastError || new Error(label+" failed");
}

async function matrixApi(action, payload, readOnly=false) {
  return fetchJson(MATRIX_API, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(Object.assign({action:action}, payload || {})),
    cache:"no-store"
  }, "Matrix backend", readOnly ? 1 : 0, 6000);
}

async function wledState(payload) {
  if (!matrixLocal()) throw new Error("Local Matrix controls activate only from 192.168.77.10/hbnf.");
  return fetchJson("/json/state", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload),
    cache:"no-store"
  }, "Matrix local API", 1, 3500);
}

async function readWledState() {
  if (!matrixLocal()) throw new Error("Matrix local state is available only on HBNF-Cart.");
  return fetchJson("/json/state",{method:"GET",cache:"no-store"},"Matrix state",1,3500);
}

function hexRgb(hex) {
  const s = String(hex || "").replace("#","");
  if (!/^[0-9a-f]{6}$/i.test(s)) return [255,255,255];
  return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)];
}

function sameRgb(a,b) {
  return Array.isArray(a) && Array.isArray(b) &&
    Number(a[0])===Number(b[0]) && Number(a[1])===Number(b[1]) && Number(a[2])===Number(b[2]);
}

function populateLooks() {
  const select = $("featureLook");
  if (!select || select.options.length) return;
  LOOKS.forEach(pair=>{
    const o=document.createElement("option");
    o.value=String(pair[0]); o.textContent=pair[1];
    select.appendChild(o);
  });
}

async function loadPalettes() {
  const select = $("featurePalette");
  if (!select || !matrixLocal()) return;
  const names = await fetchJson("/json/pal",{method:"GET",cache:"no-store"},"Palette list",1,3500);
  if (!Array.isArray(names)) throw new Error("Palette list unavailable.");
  while (select.options.length > 1) select.remove(1);
  names.forEach((name,index)=>{
    if (!name || name === "RSVD" || name === "-") return;
    const o=document.createElement("option");
    o.value=String(index); o.textContent=String(name);
    select.appendChild(o);
  });
}

function snapshotRestorePayload(state) {
  const payload = {};
  if (!state || typeof state !== "object") return payload;
  if (typeof state.on === "boolean") payload.on = state.on;
  if (Number.isFinite(Number(state.bri))) payload.bri = Number(state.bri);
  if (Number.isFinite(Number(state.ps)) && Number(state.ps) >= 0) payload.ps = Number(state.ps);
  if (Array.isArray(state.seg) && state.seg[0]) {
    const s=state.seg[0], restore={id:0};
    if (Number.isFinite(Number(s.pal))) restore.pal=Number(s.pal);
    if (Array.isArray(s.col)) restore.col=s.col;
    payload.seg=[restore];
  }
  return payload;
}

async function applyLook() {
  const preset = Number($("featureLook").value);
  const color = hexRgb($("featureColor").value);
  const paletteValue = $("featurePalette") ? $("featurePalette").value : "";
  const seg = {id:0,col:[color,[0,0,0],[0,0,0]]};
  if (paletteValue !== "") seg.pal = Number(paletteValue);

  setFeatureStatus("Applying and verifying look…");
  const before = await readWledState();
  try {
    await wledState({on:true,ps:preset,v:true});
    await wledState({seg:[seg],v:true});
    await sleep(120);
    const after = await readWledState();
    const active = Array.isArray(after.seg) && after.seg[0] ? after.seg[0] : {};
    if (paletteValue !== "" && Number(active.pal) !== Number(paletteValue)) {
      throw new Error("Palette readback did not match.");
    }
    if (Array.isArray(active.col) && active.col[0] && !sameRgb(active.col[0],color)) {
      throw new Error("Color readback did not match.");
    }
    setFeatureStatus("Look verified on Matrix.");
  } catch (error) {
    const rollback=snapshotRestorePayload(before);
    try { await wledState(rollback); } catch (_) {}
    throw new Error("Look was not verified; previous Matrix state was restored. "+(error.message || String(error)));
  }
}

function readSavedLooks() {
  try {
    const raw=localStorage.getItem(SAVED_LOOKS_KEY);
    const list=raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) return list.slice(0,MAX_SAVED_LOOKS);
  } catch (_) {}
  try {
    const legacy=localStorage.getItem(LEGACY_SAVED_LOOK_KEY);
    if (legacy) {
      const look=JSON.parse(legacy);
      look.name=look.name || "Saved look";
      localStorage.setItem(SAVED_LOOKS_KEY,JSON.stringify([look]));
      localStorage.removeItem(LEGACY_SAVED_LOOK_KEY);
      return [look];
    }
  } catch (_) {}
  return [];
}

function writeSavedLooks(list) {
  localStorage.setItem(SAVED_LOOKS_KEY,JSON.stringify(list.slice(0,MAX_SAVED_LOOKS)));
}

function renderSavedLooks(selectedName) {
  const select=$("featureSavedLooks");
  if (!select) return;
  const list=readSavedLooks();
  while (select.options.length) select.remove(0);
  if (!list.length) {
    const empty=document.createElement("option");
    empty.value=""; empty.textContent="None saved";
    select.appendChild(empty);
    return;
  }
  list.forEach((look,index)=>{
    const option=document.createElement("option");
    option.value=String(index);
    option.textContent=look.name || ("Saved look "+(index+1));
    select.appendChild(option);
    if (selectedName && option.textContent===selectedName) select.value=String(index);
  });
}

async function saveLook() {
  const list=readSavedLooks();
  const nameInput=$("featureLookName");
  const selected=$("featureLook");
  const selectedLabel=selected && selected.options[selected.selectedIndex] ? selected.options[selected.selectedIndex].textContent : "Look";
  const name=String(nameInput && nameInput.value ? nameInput.value : selectedLabel).trim().slice(0,24) || "Saved look";
  const look = {
    name:name,
    preset:Number($("featureLook").value),
    color:$("featureColor").value,
    palette:$("featurePalette") ? $("featurePalette").value : "",
    motion:Number(($("motion") && $("motion").value) || 60),
    audioResponse:Number(($("audioResponse") && $("audioResponse").value) || 75),
    savedAt:new Date().toISOString()
  };
  const existing=list.findIndex(item=>String(item.name || "").toLowerCase()===name.toLowerCase());
  if (existing>=0) list[existing]=look;
  else {
    if (list.length>=MAX_SAVED_LOOKS) throw new Error("Saved-look limit reached ("+MAX_SAVED_LOOKS+"). Delete one first.");
    list.push(look);
  }
  writeSavedLooks(list);
  renderSavedLooks(name);
  if (nameInput) nameInput.value=name;
  setFeatureStatus("Saved look stored on this device.");
}

function selectedSavedLook() {
  const select=$("featureSavedLooks");
  const list=readSavedLooks();
  const index=select ? Number(select.value) : -1;
  if (!Number.isInteger(index) || index<0 || index>=list.length) return null;
  return {look:list[index],index:index,list:list};
}

async function applySavedLook() {
  const selected=selectedSavedLook();
  if (!selected) throw new Error("Choose a saved look first.");
  const look=selected.look;
  $("featureLook").value=String(look.preset);
  $("featureColor").value=look.color || "#ffffff";
  if ($("featurePalette")) $("featurePalette").value=look.palette || "";
  if ($("featureLookName")) $("featureLookName").value=look.name || "";
  if ($("motion")) { $("motion").value=String(look.motion); $("motion").dispatchEvent(new Event("change",{bubbles:true})); }
  if ($("audioResponse")) { $("audioResponse").value=String(look.audioResponse); $("audioResponse").dispatchEvent(new Event("change",{bubbles:true})); }
  await applyLook();
  setFeatureStatus("Saved look verified and applied.");
}

async function deleteSavedLook() {
  const selected=selectedSavedLook();
  if (!selected) throw new Error("Choose a saved look first.");
  const removed=selected.list.splice(selected.index,1)[0];
  writeSavedLooks(selected.list);
  renderSavedLooks("");
  setFeatureStatus("Deleted saved look: "+String(removed.name || "Saved look"));
}

async function sendText() {
  const text = String($("featureText").value || "").trim();
  if (!text) throw new Error("Type a message first.");
  setFeatureStatus("Sending text…");
  await matrixApi("text",{text:text,color:$("featureColor").value || "#FFFFFF"},false);
  $("featureText").value="";
  setFeatureStatus("Text command accepted.");
}

function renderLive(live, cached=false, cachedAt="") {
  const node=$("featureLive");
  if (!node) return;
  if (!live || !live.active) {
    node.textContent = (cached ? "Cached: " : "")+"No active Skins or Glow round."+(cachedAt ? " · "+cachedAt : "");
    return;
  }
  const entries = Array.isArray(live.entries) ? live.entries.slice(0,8).join(" · ") : "";
  node.textContent = (cached ? "CACHED · " : "")+
    String(live.event || "").toUpperCase()+" · "+String(live.label || "")+
    " · ACE POT $"+Number(live.acePot||0).toFixed(0)+(entries ? " · "+entries : "")+
    (cachedAt ? " · "+cachedAt : "");
}

function saveLiveCache(live) {
  try {
    localStorage.setItem(LIVE_CACHE_KEY,JSON.stringify({savedAt:new Date().toISOString(),live:live}));
  } catch (_) {}
}

function readLiveCache() {
  try {
    const raw=localStorage.getItem(LIVE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}

async function refreshLive() {
  if (liveRefreshInFlight) return;
  liveRefreshInFlight=true;
  setFeatureStatus("Refreshing live round…");
  try {
    const out = await matrixApi("live_status",{},true);
    const now=new Date();
    renderLive(out.live,false,now.toLocaleTimeString());
    saveLiveCache(out.live);
    setFeatureStatus("Live round refreshed.");
  } catch (error) {
    const cached=readLiveCache();
    if (cached && cached.live) {
      const when=cached.savedAt ? new Date(cached.savedAt).toLocaleString() : "";
      renderLive(cached.live,true,when);
      setFeatureStatus("WAN live refresh failed; showing last cached round.",true);
      return;
    }
    throw error;
  } finally {
    liveRefreshInFlight=false;
  }
}

async function showScoreboard() {
  setFeatureStatus("Sending scoreboard…");
  await matrixApi("scoreboard",{},false);
  setFeatureStatus("Scoreboard command accepted.");
}

async function showAcePot() {
  setFeatureStatus("Sending ace pot…");
  await matrixApi("ace_pot",{},false);
  setFeatureStatus("Ace pot command accepted.");
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

async function getOtaStatus() {
  if (!matrixLocal()) throw new Error("OTA check activates from the local Matrix dashboard on HBNF-Cart.");
  return fetchJson(OPAL_CHECK,{method:"GET",cache:"no-store",credentials:"omit"},"Signed update check",1,5500);
}

async function checkOta() {
  const status=$("featureOtaStatus");
  status.textContent="Checking signed release…";
  const j=await getOtaStatus();
  renderOta(j);
}

function renderOtaResult(job) {
  const status=$("featureOtaStatus");
  if (!status) return;
  const state=String(job && job.state ? job.state : "idle");
  const release=job && job.release_id ? " · "+job.release_id : "";
  if (state === "complete") {
    status.textContent="Install complete"+release+(job.health_result ? " · health recorded" : "");
  } else if (state === "failed") {
    status.textContent="Install failed"+release+" · "+String(job.error || "unknown error");
  } else if (state === "starting" || state === "downloading" || state === "installing" || state === "verifying" || state === "health-check") {
    status.textContent="Install "+state.replace("-"," ")+release;
  } else {
    status.textContent="No active install job"+release;
  }
}

async function refreshOtaResult() {
  if (!matrixLocal()) throw new Error("Install result is available from the local Matrix dashboard on HBNF-Cart.");
  const job=await fetchJson(OPAL_RESULT,{method:"GET",cache:"no-store",credentials:"omit"},"Install result",1,4500);
  renderOtaResult(job);
  return job;
}

function truthConnected(id) {
  const node=$(id);
  return !!(node && /CONNECTED|READY/i.test(String(node.textContent || "")));
}

async function runPreflight() {
  const out=$("featurePreflightResult");
  if (!out) return;
  const checks=[];
  out.textContent="Running local readiness checks…";
  if (!matrixLocal()) {
    out.textContent="BLOCKED · Open this dashboard from 192.168.77.10/hbnf while connected to HBNF-Cart.";
    return;
  }

  try {
    const info=await fetchJson("/json/info",{method:"GET",cache:"no-store"},"Matrix identity",1,3500);
    checks.push("Matrix API PASS"+(info && info.ver ? " · WLED "+info.ver : ""));
  } catch (e) { checks.push("Matrix API FAIL"); }

  checks.push("Matrix truth "+(truthConnected("matrixTruth") ? "PASS" : "CHECK"));
  checks.push("AUX truth "+(truthConnected("auxTruth") ? "PASS" : "CHECK"));

  try {
    const ota=await getOtaStatus();
    checks.push("Signed OTA "+(ota && ota.ok === true ? "PASS" : "FAIL"));
  } catch (e) { checks.push("Signed OTA FAIL"); }

  try {
    await matrixApi("live_status",{},true);
    checks.push("Live-data path PASS");
  } catch (e) {
    checks.push("Live-data path WAN/CHECK");
  }

  const hardFail=checks.some(x=>/API FAIL|OTA FAIL/.test(x));
  out.textContent=(hardFail ? "NOT READY · " : "READY/CHECK · ")+checks.join(" · ");
}

function bind(id,fn) {
  const n=$(id); if (!n) return;
  n.addEventListener("click",()=>Promise.resolve(fn()).catch(e=>setFeatureStatus(e.message || String(e),true)));
}

populateLooks();
renderSavedLooks("");
loadPalettes().catch(e=>setFeatureStatus(e.message || String(e),true));
bind("featureApplyLook",applyLook);
bind("featureSaveLook",saveLook);
bind("featureApplySaved",applySavedLook);
bind("featureDeleteSaved",deleteSavedLook);
bind("featureSendText",sendText);
bind("featureRefreshLive",refreshLive);
bind("featureScoreboard",showScoreboard);
bind("featureAcePot",showAcePot);
bind("featureOtaCheck",checkOta);
bind("featureOtaInstall",()=>{ location.href=OPAL_INSTALLER; });
bind("featureOtaResult",refreshOtaResult);
bind("featurePreflight",runPreflight);
if ($("featureText")) $("featureText").addEventListener("keydown",e=>{ if(e.key==="Enter") $("featureSendText").click(); });
if (!matrixLocal()) setFeatureStatus("Core cart controls remain active. Local look/color/palette/OTA controls enable when this UI is served from 192.168.77.10.");

window.addEventListener("pageshow",function(){
  if (matrixLocal()) refreshOtaResult().catch(function(){});
});
document.addEventListener("visibilitychange",function(){
  if (!document.hidden && matrixLocal()) refreshOtaResult().catch(function(){});
});

setTimeout(function(){ refreshLive().catch(function(){}); },1200);
setInterval(function(){
  if (!document.hidden && !liveRefreshInFlight) refreshLive().catch(function(){});
},30000);
