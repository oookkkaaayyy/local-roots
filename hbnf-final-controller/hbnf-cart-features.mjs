/* HBNF coordinated feature surface — source-only staging. No automatic mutation. */
import { createManualScoreboardPayload } from "./hbnf-cart-semantic.mjs";

const OPAL_CHECK = "https://console.gl-inet.com/cgi-bin/luci/hbnf-updater?action=check";
const OPAL_RESULT = "https://console.gl-inet.com/cgi-bin/luci/hbnf-updater?action=result";
const OPAL_INSTALLER = "https://console.gl-inet.com/cgi-bin/luci/hbnf-installer";
const EXPECTED_MATRIX_MAC = "704bca5b345c";
const ACCEPTED_BASE_SHA256 = "0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61";
const SHOWS = [
  ["course-flow","Balanced (Course Flow)"],
  ["field-mix","Upbeat (Field Mix)"],
  ["hbnf-signature","Signature (HBNF Signature)"],
  ["quiet-cosmos","Ambient (Quiet Cosmos)"]
];
const SAVED_LOOKS_KEY = "hbnf_cart_saved_looks_v1";
const LEGACY_SAVED_LOOK_KEY = "hbnf_cart_saved_look_v2";
const LIVE_CACHE_KEY = "hbnf_cart_live_cache_v1";
const LIVE_CACHE_MAX_MS = 12 * 60 * 60 * 1000;
const MAX_SAVED_LOOKS = 12;
let liveRefreshInFlight = false;
let liveRefreshManualRequested = false;
let paletteOptionsReady = false;
let paletteLoadInFlight = false;
let paletteRetryTimer = null;
let paletteRetryAttempt = 0;
const PALETTE_RETRY_DELAYS_MS = [1000, 3000, 8000];
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function setFeatureStatus(message, bad=false) {
  const node = $("featureStatus");
  if (!node) return;
  node.textContent = message;
  node.className = bad ? "status bad" : "status";
}

function setLiveRefreshStatus(message, bad=false) {
  const node = $("liveRefreshStatus");
  if (!node) return;
  node.hidden = !message;
  node.textContent = message;
  node.className = bad ? "status bad" : "status";
}

function matrixLocal() {
  return location.hostname === "192.168.77.10" ||
    (location.hostname === "192.168.77.1" && location.pathname.indexOf("/mission-control-local/owner-pwa/") === 0);
}

function isLocalOwnerPwa() {
  return location.hostname === "192.168.77.1" && location.pathname.indexOf("/mission-control-local/owner-pwa/") === 0;
}

function matrixApiUrl(path) {
  return location.hostname === "192.168.77.1" ? "http://192.168.77.10" + path : path;
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

function canonicalBridge() {
  const bridge=window.HBNFCanonical;
  if (!bridge || typeof bridge.command!=="function" || typeof bridge.refresh!=="function") {
    throw new Error("Canonical cart control is not ready.");
  }
  return bridge;
}

function canonicalRead(action, payload) {
  const bridge=canonicalBridge();
  if (typeof bridge.read!=="function") throw new Error("Canonical cart read path is not ready.");
  return bridge.read(action,payload || {});
}

function canonicalCapabilities() {
  const bridge=window.HBNFCanonical;
  return bridge && typeof bridge.getCapabilities==="function" ? (bridge.getCapabilities() || {}) : {};
}

function canonicalOverlayBridge() {
  const bridge=window.HBNFCanonical;
  const caps=canonicalCapabilities();
  if (!bridge || typeof bridge.overlay!=="function" || caps.canonicalOverlayIntentV1!==true) {
    throw new Error("Canonical overlay backend is not ready; no legacy direct command was sent.");
  }
  return bridge;
}

function normalizedMac(value) {
  return String(value || "").toLowerCase().replace(/:/g,"").replace(/-/g,"").replace(/\./g,"");
}

function cleanHex(hex) {
  const s = String(hex || "").replace("#","").toUpperCase();
  return /^[0-9A-F]{6}$/.test(s) ? s : "FFFFFF";
}

function populateLooks() {
  const select = $("featureLook");
  if (!select || select.options.length) return;
  SHOWS.forEach(pair=>{
    const o=document.createElement("option");
    o.value=String(pair[0]); o.textContent=pair[1];
    select.appendChild(o);
  });
}

async function loadPalettes() {
  const select = $("featurePalette");
  if (!select || paletteLoadInFlight || paletteOptionsReady) return;
  if (!matrixLocal()) {
    renderPaletteStatus("Connect to Cart Wi-Fi to load colors.");
    return;
  }
  paletteLoadInFlight = true;
  try {
    const names = await fetchJson(matrixApiUrl("/json/pal"),{method:"GET",cache:"no-store"},"Palette list",1,3500);
    if (!Array.isArray(names)) throw new Error("Palette list unavailable.");
    while (select.options.length) select.remove(0);
    const current=document.createElement("option");
    current.value=""; current.textContent="Keep current";
    select.appendChild(current);
    const solid=document.createElement("option");
    solid.value="solid"; solid.textContent="Solid color";
    select.appendChild(solid);
    names.forEach((name,index)=>{
      if (!name || name === "RSVD" || name === "-") return;
      const o=document.createElement("option");
      o.value="wled-"+String(index); o.textContent=String(name);
      select.appendChild(o);
    });
    paletteOptionsReady=true;
    paletteRetryAttempt=0;
    if (paletteRetryTimer!==null) {
      clearTimeout(paletteRetryTimer);
      paletteRetryTimer=null;
    }
    renderPaletteStatus("Colors loaded.");
    syncOverlayAvailability();
  } finally {
    paletteLoadInFlight = false;
  }
}

function desiredState(snapshot) {
  return snapshot && snapshot.desired && snapshot.desired.state ? snapshot.desired.state : null;
}

function paletteIdFromControls() {
  const mode=$("featurePalette") ? $("featurePalette").value : "";
  if (!mode) return "";
  if (mode==="solid") return "solid-"+cleanHex($("featureColor").value);
  if (/^wled-\d+$/.test(mode)) return mode;
  throw new Error("Unsupported palette selection.");
}

function paletteControlFromId(paletteId) {
  const id=String(paletteId || "");
  if (/^solid-[0-9A-Fa-f]{6}$/.test(id)) {
    if ($("featureColor")) $("featureColor").value="#"+id.slice(6);
    return "solid";
  }
  if (/^wled-\d+$/.test(id)) return id;
  return "";
}

function paletteCommandId(paletteId) {
  const id=String(paletteId || "");
  return id==="legacy" ? "hbnf-balanced" : id;
}

function renderPaletteStatus(message) {
  const node=$("paletteActionStatus");
  if (node) node.textContent=message;
}

async function rollbackCanonicalLook(bridge, before) {
  const state=desiredState(before);
  if (!state) return;
  try {
    if (state.sceneId) await bridge.command("SCENE",{sceneId:String(state.sceneId)});
    if (state.paletteId) await bridge.command("PALETTE",{paletteId:paletteCommandId(state.paletteId)});
  } catch (_) {}
}

async function applyLook() {
  const bridge=canonicalBridge();
  const caps=canonicalCapabilities();
  if (caps.canonicalPaletteIntentV1!==true) throw new Error("Coordinated palette backend is not ready; no visual change was sent.");
  const sceneId=String($("featureLook").value || "");
  const paletteId=paletteIdFromControls();
  if (!sceneId) throw new Error("Choose a show first.");

  setFeatureStatus("Applying look…");
  const before=await bridge.refresh({hydrate:false});
  try {
    await bridge.command("SCENE",{sceneId:sceneId});
    if (paletteId) await bridge.command("PALETTE",{paletteId:paletteId});
    const after=await bridge.refresh({hydrate:false});
    const state=desiredState(after);
    if (!state || String(state.sceneId)!==sceneId) throw new Error("Canonical scene readback did not match.");
    if (paletteId && String(state.paletteId)!==paletteId) throw new Error("Canonical palette readback did not match.");
    if ($("scene")) $("scene").value=sceneId;
    setFeatureStatus("Look applied.");
  } catch (error) {
    await rollbackCanonicalLook(bridge,before);
    throw new Error("Look was not fully verified; canonical prior state was restored where possible. "+(error.message || String(error)));
  }
}

async function applyPalette() {
  const bridge=canonicalBridge();
  if (canonicalCapabilities().canonicalPaletteIntentV1!==true) {
    renderPaletteStatus("Palette controls aren’t ready. No change was sent.");
    throw new Error("Palette controls aren’t ready. No change was sent.");
  }
  const paletteId=paletteIdFromControls();
  if (!paletteId) {
    renderPaletteStatus("Choose a palette first.");
    throw new Error("Choose a palette before applying.");
  }
  let before;
  try {
    before=await bridge.refresh({hydrate:false});
  } catch (error) {
    renderPaletteStatus("Couldn’t read the current palette. No change was sent.");
    setFeatureStatus("Couldn’t read the current palette. No change was sent.",true);
    throw error;
  }
  const prior=desiredState(before);
  if (!prior) {
    renderPaletteStatus("Current settings aren’t available. No change was sent.");
    throw new Error("Cart settings could not be read; no palette change was sent.");
  }
  const priorPaletteId=typeof prior.paletteId==="string" ? prior.paletteId : "";
  if (priorPaletteId && priorPaletteId===paletteId) {
    renderPaletteStatus("Colors already match. The lights weren’t checked.");
    setFeatureStatus("Colors already match. The lights weren’t checked.");
    return;
  }
  renderPaletteStatus("Applying palette…");
  setFeatureStatus("Applying palette…");
  try {
    await bridge.command("PALETTE",{paletteId});
    const after=await bridge.refresh({hydrate:false});
    const current=desiredState(after);
    if (!current || String(current.paletteId)!==paletteId) throw new Error("Cart settings did not confirm the selected palette.");
    renderPaletteStatus("Colors updated. The lights weren’t checked.");
    setFeatureStatus("Colors updated. The lights weren’t checked.");
  } catch (error) {
    let restored=false;
    if (priorPaletteId) {
      try {
        await bridge.command("PALETTE",{paletteId:paletteCommandId(priorPaletteId)});
        const restoredSnapshot=await bridge.refresh({hydrate:false});
        const restoredState=desiredState(restoredSnapshot);
        restored=!!restoredState && String(restoredState.paletteId)===priorPaletteId;
      } catch (_) {}
    }
    const restoreStatus=restored
      ? "Previous colors are restored."
      : priorPaletteId
        ? "Couldn’t confirm the previous palette was restored."
        : "Couldn’t confirm the selected palette. Previous colors were unknown, so they weren’t restored.";
    renderPaletteStatus("Palette wasn’t confirmed. "+restoreStatus);
    setFeatureStatus("Palette wasn’t confirmed. "+restoreStatus,true);
    throw new Error("Palette was not confirmed. "+restoreStatus+" "+(error.message || String(error)));
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
      if (!look.sceneId) look.sceneId="course-flow";
      if (!look.paletteId && look.palette) look.paletteId=/^\d+$/.test(String(look.palette)) ? "wled-"+String(look.palette) : "";
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
    sceneId:String($("featureLook").value || ""),
    color:$("featureColor").value,
    paletteId:paletteIdFromControls(),
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
  setFeatureStatus("Saved on this device.");
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
  $("featureLook").value=String(look.sceneId || "course-flow");
  $("featureColor").value=look.color || "#ffffff";
  if ($("featurePalette")) $("featurePalette").value=paletteControlFromId(look.paletteId || "");
  if ($("featureLookName")) $("featureLookName").value=look.name || "";
  if ($("motion")) { $("motion").value=String(look.motion); $("motion").dispatchEvent(new Event("change",{bubbles:true})); }
  if ($("audioResponse")) { $("audioResponse").value=String(look.audioResponse); $("audioResponse").dispatchEvent(new Event("change",{bubbles:true})); }
  await applyLook();
  setFeatureStatus("Saved look applied.");
}

async function deleteSavedLook() {
  const selected=selectedSavedLook();
  if (!selected) throw new Error("Choose a saved look first.");
  const removed=selected.list.splice(selected.index,1)[0];
  writeSavedLooks(selected.list);
  renderSavedLooks("");
  setFeatureStatus("Deleted "+String(removed.name || "saved look")+".");
}

async function sendText() {
  const text = String($("featureText").value || "").trim();
  if (!text) throw new Error("Type a message first.");
  const actionStatus=$("textActionStatus");
  if (actionStatus) { actionStatus.hidden=false; actionStatus.className="apply-note"; actionStatus.textContent="Sending message…"; }
  setFeatureStatus("Sending text…");
  try {
    const bridge=canonicalOverlayBridge();
    const data={text:text,color:$("featureColor").value || "#FFFFFF"};
    if (canonicalCapabilities().nativeTextFontIndexV1===true) data.fontIndex=Number($("featureFontIndex").value || 4);
    await bridge.overlay("text",data);
    $("featureText").value="";
    if (actionStatus) actionStatus.textContent="Message request sent.";
    setFeatureStatus("Message request sent.");
  } catch (error) {
    if (actionStatus) { actionStatus.textContent="Couldn’t send the message. Check the connection and try again."; actionStatus.className="apply-note bad"; }
    throw error;
  }
}

function renderLive(live, cached=false, cachedAt="") {
  const node=$("featureLive");
  if (!node) return;
  if (!live || !live.active) {
    node.textContent = (cached ? "Saved results: " : "")+"No live round is active."+(cachedAt ? " · "+cachedAt : "");
    return;
  }
  const entries = Array.isArray(live.entries) ? live.entries.slice(0,8).join(" · ") : "";
  node.textContent = (cached ? "Using saved results · " : "")+
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
    const value=JSON.parse(raw);
    const saved=value && value.savedAt ? new Date(value.savedAt).getTime() : 0;
    if (!saved || Date.now()-saved>LIVE_CACHE_MAX_MS) return null;
    return value;
  } catch (_) { return null; }
}

async function refreshLive(silent) {
  if (liveRefreshInFlight) {
    if (!silent) {
      liveRefreshManualRequested=true;
      setLiveRefreshStatus("Refreshing scores…");
    }
    return;
  }
  liveRefreshInFlight=true;
  if (!silent) setLiveRefreshStatus("Refreshing scores…");
  try {
    const out = await canonicalRead("live_status",{});
    const now=new Date();
    renderLive(out.live,false,now.toLocaleTimeString());
    saveLiveCache(out.live);
    if (!silent || liveRefreshManualRequested) setLiveRefreshStatus("Scores checked just now. Last score update time is unknown.");
  } catch (error) {
    const cached=readLiveCache();
    if (cached && cached.live) {
      const when=cached.savedAt ? new Date(cached.savedAt).toLocaleString() : "";
      renderLive(cached.live,true,when);
      if (!silent || liveRefreshManualRequested) setLiveRefreshStatus("Couldn’t refresh. Showing saved results; last score update time is unknown.",true);
      return;
    }
    if (!silent || liveRefreshManualRequested) setLiveRefreshStatus("Couldn’t refresh scores. Check the connection and try again.",true);
    throw error;
  } finally {
    liveRefreshInFlight=false;
    liveRefreshManualRequested=false;
  }
}

async function showScoreboard() {
  const status=$("scoreActionStatus");
  const report=(message,bad=false)=>{
    if (!status) return;
    status.hidden=false;
    status.textContent=message;
    status.className=bad ? "status bad" : "status";
  };
  report("Checking for an active round…");
  let out;
  try { out=await canonicalRead("live_status",{}); }
  catch (error) {
    report("Couldn’t check for an active round. Check your internet connection and try again. No scores were sent.",true);
    throw error;
  }
  const live=out && out.live;
  if (!live || !live.active) {
    report("No active round was found. Last score update time is unknown; check the scoring page.",true);
    return;
  }
  if (!Array.isArray(live.entries) || !live.entries.length) {
    report("No scores were found. Last score update time is unknown; enter scores, then try again.",true);
    return;
  }
  const ttl=Math.max(8000,Math.min(30000,6000+Math.ceil(live.entries.length/2)*5000));
  try {
    const bridge=canonicalOverlayBridge();
    report("Sending scores to Matrix…");
    await bridge.overlay("scoreboard",{label:String(live.label || "SCORES"),entries:live.entries.slice(0,12)},ttl);
    report("Scores sent from the latest check. Last score update time is unknown; check Matrix.");
  } catch (error) {
    report("Couldn’t send scores to Matrix. Check the connection and try again.",true);
    throw error;
  }
}

async function showManualScoreboard() {
  const status=$("manualScoreboardStatus");
  try {
    if (!isLocalOwnerPwa()) throw new Error("Manual offline display is available only from the local Opal Owner PWA.");
    const bridge=canonicalOverlayBridge();
    const payload=createManualScoreboardPayload(
      $("manualScoreboardLabel") ? $("manualScoreboardLabel").value : "",
      $("manualScoreboardEntries") ? $("manualScoreboardEntries").value : ""
    );
    if (status) status.textContent="Showing scores on Matrix…";
    setFeatureStatus("Showing the scores entered here.");
    await bridge.overlay("scoreboard",payload,22000);
    if (status) status.textContent="Shown on Matrix only. Nothing was saved.";
    setFeatureStatus("Shown on Matrix only. Nothing was saved.");
  } catch (error) {
    if (status) status.textContent="Scores could not be shown. Check the connection and try again.";
    throw error;
  }
}

async function showAcePot() {
  setFeatureStatus("Preparing ace pot…");
  const out=await canonicalRead("live_status",{});
  const live=out && out.live;
  if (!live || live.active !== true) throw new Error("No active live round is available; no ace-pot overlay was sent.");
  if (live.acePot === undefined || live.acePot === null || !Number.isFinite(Number(live.acePot))) throw new Error("The live scoring response did not supply an ace-pot amount; no value was inferred.");
  const amount=Number(live.acePot);
  const bridge=canonicalOverlayBridge();
  await bridge.overlay("text",{text:"ACE POT $"+amount.toFixed(0),color:"#FFFFFF"},7000);
  setFeatureStatus("Ace pot sent to Matrix.");
}

function renderOta(j) {
  const status=$("featureOtaStatus"), install=$("featureOtaInstall");
  if (!status || !install) return;
  install.hidden=true;
  if (!j || j.ok !== true) {
    status.textContent = "Signed update check unavailable.";
    return;
  }
  const macOk=normalizedMac(j.matrix_mac)===EXPECTED_MATRIX_MAC;
  const artifactOk=j.artifact_verified===true;
  if (!macOk || !artifactOk) {
    status.textContent="Update blocked: the signed release could not be verified.";
    return;
  }
  if (j.installable === true) {
    if (String(j.based_on_firmware_sha256 || "").toLowerCase()!==ACCEPTED_BASE_SHA256) {
      status.textContent="Update blocked: it doesn’t use the accepted Audio V1.1 base.";
      return;
    }
    status.textContent = "Update available: "+j.release_id+" · base verified";
    install.hidden=false;
  } else if (j.already_accepted === true) {
    status.textContent = "Current signed update accepted: "+j.release_id;
  } else {
    status.textContent = "Signed update checked: "+(j.release_id || "unknown");
  }
}

async function getOtaStatus() {
  if (!matrixLocal()) throw new Error("OTA check activates from the local Matrix dashboard on HBNF-Cart.");
  return fetchJson(OPAL_CHECK,{method:"GET",cache:"no-store",credentials:"omit"},"Signed update check",1,5500);
}

async function checkOta() {
  const status=$("featureOtaStatus");
  status.textContent="Checking signed update…";
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
  out.textContent="Checking local readiness…";
  if (!matrixLocal()) {
    out.textContent="Open this dashboard at 192.168.77.10/hbnf while connected to Cart Wi-Fi.";
    return;
  }

  try {
    const info=await fetchJson(matrixApiUrl("/json/info"),{method:"GET",cache:"no-store"},"Matrix identity",1,3500);
    const mac=normalizedMac(info && info.mac);
    if (mac!==EXPECTED_MATRIX_MAC) checks.push("Matrix identity FAIL");
    else checks.push("Matrix API PASS"+(info && info.ver ? " · WLED "+info.ver : ""));
  } catch (e) { checks.push("Matrix API FAIL"); }

  checks.push("Matrix truth "+(truthConnected("matrixTruth") ? "PASS" : "CHECK"));
  checks.push("AUX truth "+(truthConnected("auxTruth") ? "PASS" : "CHECK"));

  try {
    const ota=await getOtaStatus();
    const macOk=normalizedMac(ota.matrix_mac)===EXPECTED_MATRIX_MAC;
    const sigOk=ota.ok===true && ota.artifact_verified===true;
    const baseOk=ota.installable!==true || String(ota.based_on_firmware_sha256 || "").toLowerCase()===ACCEPTED_BASE_SHA256;
    checks.push("Signed OTA "+(sigOk && macOk && baseOk ? "PASS" : "FAIL"));
  } catch (e) { checks.push("Signed OTA FAIL"); }

  try {
    await canonicalRead("live_status",{});
    checks.push("Live-data path PASS");
  } catch (e) {
    checks.push("Live-data path WAN/CHECK");
  }

  const hardFail=checks.some(x=>/API FAIL|identity FAIL|OTA FAIL/.test(x));
  out.textContent=(hardFail ? "Not ready · " : "Checks complete · ")+checks.join(" · ");
}

function syncOverlayAvailability() {
  const caps=canonicalCapabilities();
  const overlayReady=!!(window.HBNFCanonical && typeof window.HBNFCanonical.overlay==="function" && caps.canonicalOverlayIntentV1===true);
  const fontIndexReady=caps.nativeTextFontIndexV1===true;
  const fontIndex=$("featureFontIndex");
  if (fontIndex) fontIndex.disabled=!fontIndexReady;
  const paletteReady=caps.canonicalPaletteIntentV1===true;
  const manualPanel=$("manualOfflineScorePanel");
  const manualLabel=$("manualScoreboardLabel");
  const manualRows=$("manualScoreboardEntries");
  const manualButton=$("featureManualScoreboard");
  const localOwner=isLocalOwnerPwa();
  if (manualPanel) manualPanel.hidden=!localOwner;
  if (manualLabel) manualLabel.disabled=!localOwner || !overlayReady;
  if (manualRows) manualRows.disabled=!localOwner || !overlayReady;
  if (manualButton) manualButton.disabled=!localOwner || !overlayReady;
  ["featureSendText","featureScoreboard","featureAcePot"].forEach(function(id){
    const node=$(id);
    if (node) node.disabled=!overlayReady;
  });
  const apply=$("featureApplyLook");
  if (apply) apply.disabled=!paletteReady;
  const applyPaletteButton=$("featureApplyPalette");
  if (applyPaletteButton) applyPaletteButton.disabled=!paletteReady || !paletteOptionsReady;
  if (!overlayReady) {
    const live=$("featureLive");
    if (live && live.textContent==="Live scores haven’t loaded yet.") {
      live.textContent="Score display isn’t available yet.";
    }
  }
  return overlayReady && paletteReady;
}

function bind(id,fn) {
  const n=$(id); if (!n) return;
  n.addEventListener("click",()=>Promise.resolve(fn()).catch(()=>setFeatureStatus("Couldn’t complete that action. Check the connection and try again.",true)));
}

populateLooks();
renderSavedLooks("");
syncOverlayAvailability();
loadPalettes().catch(()=>{
  paletteOptionsReady=false;
  renderPaletteStatus("Couldn’t load colors. Check the connection and try again.");
  syncOverlayAvailability();
  setFeatureStatus("Couldn’t load colors. Check the Cart connection and try again.",true);
  schedulePaletteRetry();
});
function schedulePaletteRetry() {
  if (paletteOptionsReady || paletteRetryTimer!==null || !matrixLocal() || document.hidden || paletteRetryAttempt>=PALETTE_RETRY_DELAYS_MS.length) return;
  const delay=PALETTE_RETRY_DELAYS_MS[paletteRetryAttempt++];
  paletteRetryTimer=setTimeout(function(){
    paletteRetryTimer=null;
    if (!document.hidden) retryPaletteLoad();
  },delay);
}
function retryPaletteLoad() {
  if (!paletteOptionsReady && matrixLocal()) loadPalettes().catch(()=>{
    paletteOptionsReady=false;
    renderPaletteStatus("Couldn’t load colors. Check the connection and try again.");
    syncOverlayAvailability();
    schedulePaletteRetry();
  });
}
window.addEventListener("online",retryPaletteLoad);
window.addEventListener("pageshow",retryPaletteLoad);
document.addEventListener("visibilitychange",function(){ if (!document.hidden) retryPaletteLoad(); });
bind("featureApplyLook",applyLook);
bind("featureApplyPalette",applyPalette);
bind("featureSaveLook",saveLook);
bind("featureApplySaved",applySavedLook);
bind("featureDeleteSaved",deleteSavedLook);
bind("featureSendText",sendText);
bind("featureRefreshLive",refreshLive);
bind("featureScoreboard",showScoreboard);
bind("featureManualScoreboard",showManualScoreboard);
bind("featureAcePot",showAcePot);
bind("featureOtaCheck",checkOta);
bind("featureOtaInstall",()=>{ location.href=OPAL_INSTALLER; });
bind("featureOtaResult",refreshOtaResult);
bind("featurePreflight",runPreflight);
if ($("featureText")) $("featureText").addEventListener("keydown",e=>{ if(e.key==="Enter") $("featureSendText").click(); });
if (!matrixLocal()) setFeatureStatus("Some advanced controls are only available on Cart Wi-Fi.");

window.addEventListener("pageshow",function(){
  if (matrixLocal()) refreshOtaResult().catch(function(){});
});
document.addEventListener("visibilitychange",function(){
  if (!document.hidden && matrixLocal()) refreshOtaResult().catch(function(){});
});

setTimeout(function(){ refreshLive(true).catch(function(){}); },1200);
setInterval(function(){
  if (!document.hidden && !liveRefreshInFlight) refreshLive(true).catch(function(){});
},30000);

window.addEventListener("hbnf-canonical-capabilities",function(){ syncOverlayAvailability(); });
