/* HBNF coordinated feature surface — source-only staging. No automatic mutation. */
import { createManualScoreboardPayload } from "./hbnf-cart-semantic.mjs";
import { formatAcePotDisplay } from "./hbnf-cart-live-display.mjs";
import { courseInternetCloudLabel, courseScoreLabel, deviceReadinessChecks, hbnfEndpointReachabilityText, matrixRelayLabel, readinessStatus, scoreFeedStatus, scoreFreshnessLabel, scoringCloudStatusText } from "./hbnf-cart-readiness.mjs?v=20261024-cart-control-home-r4";

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
const UV_CAPS_STORAGE_KEY = "hbnf_cart_uv_caps_v1";
const LIVE_CACHE_MAX_MS = 12 * 60 * 60 * 1000;
const HBNF_ENDPOINT_IMAGE_URL = "https://hbnightflyers.com/hbnf-cart-icon-180.png";
const HBNF_ENDPOINT_PROBE_INTERVAL_MS = 60000;
const HBNF_ENDPOINT_PROBE_TIMEOUT_MS = 4000;
const MAX_SAVED_LOOKS = 12;
let liveRefreshInFlight = false;
let liveRefreshPending = false;
let liveRefreshPendingSilent = true;
let hbnfEndpointProbeInFlight = false;
let hbnfEndpointProbeLastStartedAt = 0;
let courseInternetState = "not_checked";
let courseCloudState = "not_checked";
let paletteOptionsReady = false;
let uvDefaultFollowAttempted = false;
let uvFollowActive = false;
let uvRequestInFlight = false;
let uvFollowCapsPending = false;
let uvReadiness = "checking";
let uvCapsStorageAvailable = true;
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function setFeatureStatus(message, bad=false) {
  const node = $("featureStatus");
  if (!node) return;
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
  if (!select) return;
  if (!matrixLocal()) {
    renderPaletteStatus("Connect to the Cart network to load palette choices.");
    return;
  }
  const names = await fetchJson(matrixApiUrl("/json/pal"),{method:"GET",cache:"no-store"},"Palette list",1,3500);
  if (!Array.isArray(names)) throw new Error("Palette list unavailable.");
  while (select.options.length) select.remove(0);
  const current=document.createElement("option");
  current.value=""; current.textContent="Keep current";
  select.appendChild(current);
  const solid=document.createElement("option");
  solid.value="solid"; solid.textContent="Solid color";
  select.appendChild(solid);
  let added=0;
  names.forEach((name,index)=>{
    if (!name || name === "RSVD" || name === "-") return;
    const o=document.createElement("option");
    o.value="wled-"+String(index); o.textContent=String(name);
    select.appendChild(o);
    added++;
  });
  paletteOptionsReady=true;
  renderPaletteStatus(added ? "Palette choices loaded from Matrix." : "No Matrix palettes are available.");
  syncOverlayAvailability();
}

function renderPaletteStatus(message) {
  const node=$("paletteActionStatus");
  if (node) node.textContent=message;
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
    renderPaletteStatus("Palette control is not available; no change was sent.");
    throw new Error("Coordinated palette backend is not ready; no visual change was sent.");
  }
  const paletteId=paletteIdFromControls();
  if (!paletteId) {
    renderPaletteStatus("Choose a palette before applying.");
    throw new Error("Choose a palette before applying.");
  }
  let before;
  try {
    before=await bridge.refresh({hydrate:false});
  } catch (error) {
    renderPaletteStatus("Current palette could not be read; no change was sent.");
    setFeatureStatus("Current palette could not be read; no change was sent.",true);
    throw error;
  }
  const prior=desiredState(before);
  if (!prior || typeof prior.paletteId!=="string" || !prior.paletteId) {
    renderPaletteStatus("Current palette could not be confirmed; no change was sent.");
    throw new Error("Current palette could not be confirmed; no palette change was sent.");
  }
  if (String(prior.paletteId)===paletteId) {
    renderPaletteStatus("Selected palette is already active in Cart state. Physical output is not verified.");
    setFeatureStatus("Selected palette is already active in Cart state. Physical output is not verified.");
    return;
  }

  renderPaletteStatus("Applying palette…");
  setFeatureStatus("Applying palette…");
  try {
    await bridge.command("PALETTE",{paletteId:paletteId});
    const after=await bridge.refresh({hydrate:false});
    const current=desiredState(after);
    if (!current || String(current.paletteId)!==paletteId) throw new Error("Canonical palette readback did not match.");
    renderPaletteStatus("Palette acknowledged and read back. Physical output is not verified.");
    setFeatureStatus("Palette acknowledged and read back. Physical output is not verified.");
  } catch (error) {
    let restored=false;
    try {
      await bridge.command("PALETTE",{paletteId:paletteCommandId(prior.paletteId)});
      const restoredSnapshot=await bridge.refresh({hydrate:false});
      const restoredState=desiredState(restoredSnapshot);
      restored=!!restoredState && String(restoredState.paletteId)===String(prior.paletteId);
    } catch (_) {}
    const restoreStatus=restored ? "Previous palette restored and read back." : "Previous palette restoration is unverified.";
    renderPaletteStatus("Selected palette was not confirmed. "+restoreStatus);
    setFeatureStatus("Palette was not confirmed. "+restoreStatus,true);
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
  if (!text) {
    renderTextActionStatus("Enter a message before sending.");
    throw new Error("Type a message first.");
  }
  renderTextActionStatus("Sending text command…");
  setFeatureStatus("Sending text…");
  try {
    const bridge=canonicalOverlayBridge();
    const data={text:text,color:$("featureColor").value || "#FFFFFF"};
    if (canonicalCapabilities().nativeTextFontIndexV1===true) data.fontIndex=Number($("featureFontIndex").value || 4);
    const result=await bridge.overlay("text",data);
    if (result && result.accepted===false) throw new Error(result.error || "Cart did not accept the text command.");
    if (result && result.acknowledged===false) {
      renderTextActionStatus("Text command accepted; device acknowledgment is still pending. Physical display is not verified.");
      setFeatureStatus("Text command accepted; device acknowledgment is still pending. Physical display is not verified.");
      throw new Error("Text command was accepted, but device acknowledgment is still pending.");
    }
    $("featureText").value="";
    renderTextActionStatus(result && result.acknowledged===true ? "Text command acknowledged by Cart devices. Physical display is not verified." : "Text command accepted by Cart. Device acknowledgment is not exposed; physical display is not verified.");
    setFeatureStatus(result && result.acknowledged===true ? "Text command acknowledged by Cart devices. Physical display is not verified." : "Text command accepted by Cart. Device acknowledgment is not exposed; physical display is not verified.");
  } catch (error) {
    if (!/device acknowledgment is still pending/i.test(String(error && error.message))) {
      renderTextActionStatus("Text command not confirmed. Physical display is not verified.");
      setFeatureStatus("Text command not confirmed. Physical display is not verified.",true);
    }
    throw error;
  }
}

function liveSourceRevisionText(updatedAt) {
  const revision=typeof updatedAt==="string" ? updatedAt.trim() : "";
  if (!revision || !Number.isFinite(Date.parse(revision))) return "Source row revision unverified.";
  return "Source row updated_at "+revision+" (whole league_state row).";
}

function compareLiveSourceRevision(sourceRevision, appliedRevision) {
  const sourceTime=typeof sourceRevision==="string" ? Date.parse(sourceRevision) : NaN;
  const appliedTime=typeof appliedRevision==="string" ? Date.parse(appliedRevision) : NaN;
  if (!Number.isFinite(sourceTime) || !Number.isFinite(appliedTime)) return "unknown";
  // Preserve sub-millisecond timestamp precision: Date.parse truncates the
  // microseconds commonly present in Postgres updated_at values.
  if (sourceRevision===appliedRevision) return "aligned";
  return appliedTime<sourceTime ? "stale" : "unknown";
}

async function matrixLiveSourceRevisionStatus(sourceRevision) {
  const status=$("matrixOutputTruth");
  if (!matrixLocal()) {
    if (status) status.textContent=matrixRelayLabel("unknown",false);
    return "Matrix source-revision readback unavailable outside the Cart LAN; physical display is unverified.";
  }
  try {
    const readback=await fetchJson(matrixApiUrl("/json/si"),{method:"GET",cache:"no-store"},"Matrix live status",0,2500);
    const h=readback&&readback.state&&readback.state.HBNF;
    if (!h || h.liveActive !== true) {
      if (status) status.textContent=matrixRelayLabel("unknown",false);
      return "Matrix live snapshot inactive or stale; its 120-second lease is not current. Physical display is unverified.";
    }
    const applied=h&&h.liveSourceRevision;
    const state=compareLiveSourceRevision(sourceRevision,applied);
    if (status) status.textContent=matrixRelayLabel(state,true);
    if (state==="aligned") return "Matrix locally accepted the same source row revision. Physical display is unverified.";
    if (state==="stale") return "Matrix locally reports an older source row revision. Physical display is unverified.";
    return "Matrix source-revision readback is unknown. Physical display is unverified.";
  } catch (_) {
    if (status) status.textContent=matrixRelayLabel("unknown",false);
    return "Matrix source-revision readback is unavailable. Physical display is unverified.";
  }
}

function renderLive(live, cached=false, updatedAt=null) {
  const node=$("featureLive");
  if (!node) return;
  const revisionText=liveSourceRevisionText(updatedAt);
  if (!live || !live.active) {
    node.textContent = (cached ? "Cached · " : "")+"No active Skins or Glow round · "+revisionText;
    return;
  }
  const entries = Array.isArray(live.entries) ? live.entries.slice(0,8).join(" · ") : "";
  node.textContent = (cached ? "Using saved results · " : "")+
    String(live.event || "").toUpperCase()+" · "+String(live.label || "")+
    " · "+formatAcePotDisplay(live)+(entries ? " · "+entries : "")+" · "+revisionText;
}

function renderScorePathStatus(message) {
  const node=$("scorePathStatus");
  if (node) node.textContent=message;
}

function updateScoreNetworkTruth(response, requestFailed=false, cacheAgeMs=null) {
  const cloud=$("scoreCloudTruth"), freshness=$("scoreFreshnessTruth");
  const course=$("courseScoresTruth");
  if (cloud) cloud.textContent=scoringCloudStatusText(response,requestFailed);
  if (freshness) freshness.textContent=scoreFreshnessLabel();
  if (course) course.textContent=courseScoreLabel(response,requestFailed,cacheAgeMs);
  courseCloudState=requestFailed ? "unavailable" : (response && response.live && typeof response.live==="object" ? "reachable" : "not_checked");
  renderCourseInternetCloud();
}

function renderCourseInternetCloud() {
  const node=$("internetTruth");
  if (node) node.textContent=courseInternetCloudLabel(courseInternetState,courseCloudState);
}

function probeHbnfEndpoint() {
  const node=$("internetTruth");
  if (!node || hbnfEndpointProbeInFlight) return;
  const now=Date.now();
  if (now-hbnfEndpointProbeLastStartedAt<HBNF_ENDPOINT_PROBE_INTERVAL_MS) return;
  hbnfEndpointProbeLastStartedAt=now;
  hbnfEndpointProbeInFlight=true;
  courseInternetState="checking";
  node.textContent=hbnfEndpointReachabilityText(courseInternetState);
  renderCourseInternetCloud();
  let image;
  let timer=null;
  let settled=false;
  const finish=function(reachable) {
    if (settled) return;
    settled=true;
    if (timer!==null) clearTimeout(timer);
    if (image) { image.onload=null; image.onerror=null; }
    hbnfEndpointProbeInFlight=false;
    courseInternetState=reachable ? "reachable" : "unverified";
    node.textContent=hbnfEndpointReachabilityText(courseInternetState);
    renderCourseInternetCloud();
  };
  try {
    image=new Image();
    image.onload=function(){ finish(image.naturalWidth>0 && image.naturalHeight>0); };
    image.onerror=function(){ finish(false); };
    timer=setTimeout(function(){ finish(false); },HBNF_ENDPOINT_PROBE_TIMEOUT_MS);
    image.src=HBNF_ENDPOINT_IMAGE_URL+"?probe="+String(now);
  } catch (_) {
    finish(false);
  }
}

function renderScoreActionStatus(message) {
  const node=$("scoreActionStatus");
  if (node) node.textContent=message;
}

function renderTextActionStatus(message) {
  const node=$("textActionStatus");
  if (node) node.textContent=message;
}

function saveLiveCache(live, updatedAt) {
  try {
    const revision=typeof updatedAt==="string" ? updatedAt.trim() : "";
    localStorage.setItem(LIVE_CACHE_KEY,JSON.stringify({savedAt:new Date().toISOString(),updated_at:revision || null,live:live}));
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

function updateDisplayedLiveSnapshot(response) {
  const live=response && response.live;
  const updatedAt=response && response.updated_at;
  renderLive(live,false,updatedAt);
  saveLiveCache(live,updatedAt);
  return liveSourceRevisionText(updatedAt);
}

async function refreshLive(silent) {
  probeHbnfEndpoint();
  if (liveRefreshInFlight) {
    liveRefreshPending=true;
    if (!silent) {
      liveRefreshPendingSilent=false;
      setFeatureStatus("Refresh queued…");
      renderScoreActionStatus("A score refresh is already running. One more refresh is queued.");
    }
    return;
  }
  liveRefreshInFlight=true;
  if (!silent) {
    setFeatureStatus("Refreshing live round…");
    renderScoreActionStatus("Refreshing live scores from this iPad’s connection…");
  }
  try {
    const out = await canonicalRead("live_status",{});
    updateScoreNetworkTruth(out);
    const revisionText=updateDisplayedLiveSnapshot(out);
    const matrixRevisionStatus=await matrixLiveSourceRevisionStatus(out&&out.updated_at);
    renderScorePathStatus("This iPad → cloud: live response received. "+revisionText+" "+matrixRevisionStatus+" Cart → cloud relay: not reported. Matrix live-standings receipt: not reported.");
    if (!silent) {
      setFeatureStatus("Live round refreshed.");
      renderScoreActionStatus("Live score response received. "+revisionText+" Physical display is not confirmed.");
    }
  } catch (error) {
    const cached=readLiveCache();
    if (cached && cached.live) {
      updateScoreNetworkTruth(null,true,Date.now()-Date.parse(cached.savedAt || ""));
      const revisionText=liveSourceRevisionText(cached.updated_at);
      renderLive(cached.live,true,cached.updated_at);
      renderScorePathStatus("This iPad → cloud: unavailable. Showing locally cached scores. "+revisionText+" Cart → cloud relay: not reported. Matrix live-standings receipt: not reported.");
      if (!silent) {
        setFeatureStatus("Couldn’t refresh scores. Showing the last saved scores.",true);
        renderScoreActionStatus("Live score request failed. Cached scores are shown and labeled.");
      }
      return;
    }
    updateScoreNetworkTruth(null,true);
    renderScorePathStatus("This iPad → cloud: unavailable; live score read not confirmed. Source freshness is not exposed, so freshness is unverified. Cart → cloud relay: not reported. Matrix live-standings receipt: not reported.");
    if (!silent) {
      setFeatureStatus("Couldn’t refresh live scores.",true);
      renderScoreActionStatus("Live score request failed; current scores are not confirmed.");
    }
    throw error;
  } finally {
    liveRefreshInFlight=false;
    flushPendingLiveRefresh();
  }
}

async function showScoreboard() {
  setFeatureStatus("Loading live standings…");
  renderScoreActionStatus("Requesting current standings…");
  let readSucceeded=false;
  let commandStarted=false;
  let sourceRevision="Source row revision unverified.";
  try {
    const out=await canonicalRead("live_status",{});
    updateScoreNetworkTruth(out);
    readSucceeded=true;
    sourceRevision=updateDisplayedLiveSnapshot(out);
    const live=out && out.live;
    if (!live || !live.active || !Array.isArray(live.entries) || !live.entries.length) throw new Error("No active Skins or Glow scores are available.");
    const bridge=canonicalOverlayBridge();
    const ttl=Math.max(8000,Math.min(30000,6000+Math.ceil(live.entries.length/2)*5000));
    commandStarted=true;
    const commandResult=await bridge.overlay("scoreboard",{label:String(live.label || "SCORES"),entries:live.entries.slice(0,12)},ttl);
    if (commandResult && commandResult.accepted===false) throw new Error(commandResult.error || "Cart did not accept the standings command.");
    const matrixRevisionStatus=await matrixLiveSourceRevisionStatus(out&&out.updated_at);
    renderScorePathStatus("This iPad → cloud: active standings received. "+sourceRevision+" "+matrixRevisionStatus+" Cart → cloud relay: not reported. Matrix live-standings receipt: not reported.");
    if (commandResult && commandResult.acknowledged===false) {
      const pendingMessage="Standings command accepted; device acknowledgment is still pending. Physical display is not verified.";
      setFeatureStatus(pendingMessage);
      renderScoreActionStatus(pendingMessage+" "+sourceRevision);
      return;
    }
    const commandMessage=commandResult && commandResult.acknowledged===true
      ? "Matrix standings command acknowledged by Cart devices. Physical display is not verified."
      : "Matrix standings command accepted; device acknowledgment is not exposed. Physical display is not verified.";
    setFeatureStatus(commandMessage);
    renderScoreActionStatus(commandMessage+" "+sourceRevision);
  } catch (error) {
    if (!readSucceeded) updateScoreNetworkTruth(null,true);
    renderScorePathStatus(readSucceeded
      ? (commandStarted
        ? "This iPad → cloud: active standings read succeeded. "+sourceRevision+" Matrix command: not confirmed; physical display is not verified. Cart → cloud relay: not reported. Matrix live-standings receipt: not reported."
        : "This iPad → cloud: response received. "+sourceRevision+" No active standings or available Matrix command was confirmed; no display is claimed. Cart → cloud relay: not reported. Matrix live-standings receipt: not reported.")
      : "This iPad → cloud: score read unavailable. "+sourceRevision+" Matrix command was not sent. Cart → cloud relay: not reported. Matrix live-standings receipt: not reported.");
    const actionMessage=commandStarted ? "Standings command was not confirmed." : (readSucceeded ? "No standings command was sent." : "Live score read failed; no standings command was sent.");
    setFeatureStatus(actionMessage,true);
    renderScoreActionStatus(actionMessage);
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
    if (status) status.textContent="Showing scores on the Cart…";
    setFeatureStatus("Showing the scores entered here.");
    await bridge.overlay("scoreboard",payload,22000);
    if (status) status.textContent="Scores shown on the Cart only. Nothing was saved.";
    setFeatureStatus("Scores shown on the Cart only. Nothing was saved.");
  } catch (error) {
    if (status) status.textContent="Scores could not be shown. Check the connection and try again.";
    throw error;
  }
}

async function showAcePot() {
  setFeatureStatus("Preparing ace pot…");
  let out;
  let usedCachedSnapshot=false;
  try {
    out=await canonicalRead("live_status",{});
    updateScoreNetworkTruth(out);
    updateDisplayedLiveSnapshot(out);
  } catch (error) {
    updateScoreNetworkTruth(null,true);
    const cached=readLiveCache();
    if (!cached || !cached.live) {
      renderScorePathStatus("This iPad → cloud: unavailable; no cached live score snapshot is available. No ace-pot command was sent.");
      renderScoreActionStatus("Live score request failed and no cached scores are available. No ace-pot command was sent.");
      throw error;
    }
    out={live:cached.live,updated_at:cached.updated_at};
    usedCachedSnapshot=true;
    renderLive(cached.live,true,cached.updated_at);
  }
  const live=out && out.live;
  if (!live || live.active !== true) throw new Error("No active live round is available; no ace-pot overlay was sent.");
  const label=formatAcePotDisplay(live);
  if (label.endsWith("UNAVAILABLE")) throw new Error("The live scoring response did not supply a valid ace value; no value was inferred.");
  const bridge=canonicalOverlayBridge();
  const displayedLabel=usedCachedSnapshot ? "CACHED "+label : label;
  await bridge.overlay("text",{text:displayedLabel,color:"#FFFFFF"},7000);
  const revisionText=liveSourceRevisionText(out && out.updated_at);
  const matrixRevisionStatus=await matrixLiveSourceRevisionStatus(out && out.updated_at);
  if (usedCachedSnapshot) {
    renderScorePathStatus("This iPad → cloud: unavailable; using locally cached scores. "+revisionText+" "+matrixRevisionStatus+" Cached ace-pot text command acknowledged; value may be out of date.");
    renderScoreActionStatus("Cached ace-pot command acknowledged. "+revisionText+" The value may be out of date; physical display is not verified.");
    setFeatureStatus("Cached ace pot sent to the Cart. The value may be out of date.");
  } else {
    renderScorePathStatus("This iPad → cloud: ace-pot source response received. "+revisionText+" "+matrixRevisionStatus+" Matrix text command acknowledged.");
    renderScoreActionStatus("Ace-pot command acknowledged. "+revisionText+" Physical display is not verified.");
    setFeatureStatus("Ace pot sent to the Cart.");
  }
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
    status.textContent="BLOCKED · signed release identity verification failed.";
    return;
  }
  if (j.installable === true) {
    if (String(j.based_on_firmware_sha256 || "").toLowerCase()!==ACCEPTED_BASE_SHA256) {
      status.textContent="BLOCKED · update is not based on the accepted Audio V1.1 firmware.";
      return;
    }
    status.textContent = "Update available: "+j.release_id+" · verified base";
    install.hidden=false;
  } else if (j.already_accepted === true) {
    status.textContent = "Current signed release accepted: "+j.release_id;
  } else {
    status.textContent = "Signed release checked: "+(j.release_id || "unknown");
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
    const info=await fetchJson(matrixApiUrl("/json/info"),{method:"GET",cache:"no-store"},"Matrix identity",1,3500);
    const mac=normalizedMac(info && info.mac);
    if (mac!==EXPECTED_MATRIX_MAC) checks.push("Matrix identity FAIL");
    else checks.push("Matrix API PASS"+(info && info.ver ? " · WLED "+info.ver : ""));
  } catch (e) { checks.push("Matrix API FAIL"); }

  try {
    const snapshot=await canonicalRead("status",{});
    checks.push(snapshot && snapshot.local === true ? "iPad → Cart controls PASS · local device status returned" : "iPad → Cart controls UNKNOWN · local status not confirmed");
    checks.push(...deviceReadinessChecks(snapshot));
  } catch (e) {
    checks.push("iPad → Cart controls UNKNOWN · local status unavailable");
    checks.push("Matrix device UNCONFIRMED · status unavailable","AUX device UNCONFIRMED · status unavailable");
  }

  try {
    const liveResponse=await canonicalRead("live_status",{});
    updateScoreNetworkTruth(liveResponse);
    checks.push(scoreFeedStatus(liveResponse));
  } catch (e) {
    updateScoreNetworkTruth(null,true);
    checks.push("Score feed (this iPad → cloud) CHECK · request failed");
  }

  checks.push("Cart → cloud relay NOT EXPOSED · no runtime status signal");
  checks.push("Matrix live standings NOT EXPOSED · relay delivery receipt unavailable");

  out.textContent=readinessStatus(checks)+" · "+checks.join(" · ");
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
      live.textContent="Cart score display controls aren’t available yet.";
    }
  }
  return overlayReady && paletteReady;
}

function bind(id,fn) {
  const n=$(id); if (!n) return;
  n.addEventListener("click",()=>{
    if (n.disabled || n.getAttribute("aria-busy")==="true") return;
    const priorDisabled=n.disabled;
    n.disabled=true;
    n.setAttribute("aria-busy","true");
    const statusNode=$(id==="featureSendText"?"textActionStatus":(id.indexOf("Score")>=0||id.indexOf("Ace")>=0||id.indexOf("Live")>=0?"scoreActionStatus":(id.indexOf("Palette")>=0?"paletteActionStatus":"featureStatus")));
    if (statusNode) statusNode.textContent="Sending…";
    Promise.resolve().then(fn).catch(()=>setFeatureStatus("Couldn’t complete that action. Check the connection and try again.",true)).finally(()=>{
      n.disabled=priorDisabled;
      n.removeAttribute("aria-busy");
    });
  });
}

function readUvCaps(storage) {
  try {
    const raw = storage.getItem(UV_CAPS_STORAGE_KEY);
    if (!raw) return { main: 64, short: 64, storageAvailable: true };
    const saved = JSON.parse(raw);
    const valid = value => Number.isInteger(value) && value >= 0 && value <= 255;
    return {
      main: valid(saved && saved.main) ? saved.main : 64,
      short: valid(saved && saved.short) ? saved.short : 64,
      storageAvailable: true,
    };
  } catch (_) {
    return { main: 64, short: 64, storageAvailable: false };
  }
}

function writeUvCaps(storage, main, short) {
  const valid = value => Number.isInteger(value) && value >= 0 && value <= 255;
  if (!valid(main) || !valid(short)) return false;
  try {
    storage.setItem(UV_CAPS_STORAGE_KEY, JSON.stringify({ main, short }));
    return true;
  } catch (_) {
    return false;
  }
}

function uvLevelSavedMessage() {
  return uvCapsStorageAvailable
    ? "Brightness levels are saved on this iPad."
    : "Brightness levels are set for this screen, but this browser could not save them.";
}

function uvStateChanged(persist = true) {
  const main = $("uvMainBrightness"), short = $("uvShortBrightness");
  if ($("uvMainValue") && main) $("uvMainValue").value = String(main.value);
  if ($("uvShortValue") && short) $("uvShortValue").value = String(short.value);
  if ($("uvSharedValue") && main && short) {
    const mainLevel = Number(main.value), shortLevel = Number(short.value);
    const mixed = mainLevel !== shortLevel;
    $("uvSharedValue").value = mixed ? "Mixed" : String(mainLevel);
    if ($("uvSharedBrightness")) $("uvSharedBrightness").value = String(mixed ? Math.round((mainLevel + shortLevel) / 2) : mainLevel);
  }
  if (persist && main && short) {
    try {
      uvCapsStorageAvailable = writeUvCaps(window.localStorage, Number(main.value), Number(short.value));
    } catch (_) {
      uvCapsStorageAvailable = false;
    }
  }
  const status = $("uvActionStatus");
  if (status && !uvRequestInFlight) {
    if (uvReadiness === "ready") status.textContent = `${uvLevelSavedMessage()} Use Apply to send manual levels.`;
    else if (uvReadiness === "unavailable") status.textContent = `Cart status is unavailable. ${uvLevelSavedMessage()} No command was sent.`;
    else if (uvReadiness === "unsafe") status.textContent = `UV commands are locked until safety checks pass. ${uvLevelSavedMessage()} No command was sent.`;
  }
}

function restoreUvCaps() {
  let caps;
  try { caps = readUvCaps(window.localStorage); }
  catch (_) { caps = { main: 64, short: 64, storageAvailable: false }; }
  const main = $("uvMainBrightness"), short = $("uvShortBrightness");
  if (main) main.value = String(caps.main);
  if (short) short.value = String(caps.short);
  uvCapsStorageAvailable = caps.storageAvailable;
}

function setUvControlsReady(ready) {
  // The safety/status gate protects commands, not local slider state. Leave the
  // brightness controls editable when the Cart link is unknown so the selected
  // manual levels survive a Matrix/WAN interruption; lock them only in-flight.
  ["uvApply", "uvOff"].forEach(id => { if ($(id)) $(id).disabled = !ready || uvRequestInFlight; });
  ["uvMainBrightness", "uvShortBrightness", "uvSharedBrightness"].forEach(id => { if ($(id)) $(id).disabled = uvRequestInFlight; });
}

async function checkUvReadiness(updateStatus = true) {
  const status = $("uvActionStatus");
  if (!status) return;
  setUvControlsReady(false);
  try {
    const result = await canonicalRead("uv_status");
    if (result && result.uvControlEnabled === true) {
      uvReadiness = "ready";
      setUvControlsReady(true);
      if (!uvDefaultFollowAttempted) {
        uvDefaultFollowAttempted = true;
        status.textContent = "Starting automatic Matrix/AUX rhythm following…";
        await sendUv("FOLLOW_MATRIX");
        return;
      }
      if (updateStatus) status.textContent = uvFollowActive
        ? "Automatic follow is configured. Fresh Matrix audio is required for light; the device has not confirmed output. The two caps are independent."
        : "UV safety checks passed. Automatic follow could not be confirmed; check the Cart before retrying.";
    } else {
      uvReadiness = "unsafe";
      uvFollowActive = false;
      uvDefaultFollowAttempted = false;
      if (updateStatus) status.textContent = `UV commands are locked until safety checks pass. ${uvLevelSavedMessage()} No command was sent.`;
    }
  } catch (_) {
    uvReadiness = "unavailable";
    if (updateStatus) status.textContent = `Cart status is unavailable. ${uvLevelSavedMessage()} No command was sent.`;
  }
}

async function sendUv(mode) {
  const status = $("uvActionStatus");
  const main = $("uvMainBrightness"), short = $("uvShortBrightness");
  if (!status || !main || !short) return;
  if (uvRequestInFlight) {
    if (mode === "FOLLOW_MATRIX" && (uvFollowActive || uvDefaultFollowAttempted)) uvFollowCapsPending = true;
    return false;
  }
  uvRequestInFlight = true;
  if (mode !== "FOLLOW_MATRIX") {
    uvFollowActive = false;
    uvFollowCapsPending = false;
  }
  setUvControlsReady(false);
  status.textContent = mode === "OFF" ? "Requesting UV off…" : mode === "FOLLOW_MATRIX" ? "Requesting automatic Matrix/AUX rhythm follow…" : "Sending detached manual levels…";
  let accepted = false;
  try {
    const result = await canonicalRead("uv_policy", {
      mode,
      brightnessBySegment: { main: Number(main.value), short: Number(short.value) },
    });
    if (result && result.ok === true && result.acknowledgement && result.acknowledgement.acceptedByBroker === true) {
      accepted = true;
      if (mode === "FOLLOW_MATRIX") uvFollowActive = true;
      status.textContent = mode === "FOLLOW_MATRIX"
        ? "AUX accepted automatic follow. Stale or missing Matrix audio keeps output dark; physical output is not confirmed."
        : "AUX broker accepted the request; device output is not confirmed.";
    } else {
      if (mode === "FOLLOW_MATRIX") uvFollowActive = false;
      status.textContent = "UV request was not confirmed. Check the Cart connection before retrying.";
    }
  } catch (error) {
    const detail = error && error.data && error.data.error;
    if (mode === "FOLLOW_MATRIX") uvFollowActive = false;
    if (error && error.status === 409) {
      status.textContent = String(detail || "UV safety checks are incomplete.") + " No UV command was sent.";
    } else {
      status.textContent = "UV result is unknown. Check the Cart before trying again.";
    }
  } finally {
    uvRequestInFlight = false;
    await checkUvReadiness(false);
    if (uvFollowCapsPending && uvFollowActive) {
      uvFollowCapsPending = false;
      void sendUv("FOLLOW_MATRIX");
    } else if (!uvFollowActive) {
      uvFollowCapsPending = false;
    }
  }
  return accepted;
}

["uvMainBrightness", "uvShortBrightness"].forEach(id => {
  if ($(id)) $(id).addEventListener("input", uvStateChanged);
  if ($(id)) $(id).addEventListener("change", () => {
    if (uvFollowActive) void sendUv("FOLLOW_MATRIX");
  });
});
if ($("uvSharedBrightness")) {
  $("uvSharedBrightness").addEventListener("input", () => {
    const value = $("uvSharedBrightness").value;
    ["uvMainBrightness", "uvShortBrightness"].forEach(id => { if ($(id)) $(id).value = value; });
    if ($("uvSharedValue")) $("uvSharedValue").value = value;
    uvStateChanged();
  });
  $("uvSharedBrightness").addEventListener("change", () => {
    if (uvFollowActive) void sendUv("FOLLOW_MATRIX");
  });
}
restoreUvCaps();
if ($("uvApply")) $("uvApply").addEventListener("click", () => sendUv("MANUAL"));
if ($("uvOff")) $("uvOff").addEventListener("click", () => sendUv("OFF"));
uvStateChanged(false);
checkUvReadiness();

populateLooks();
renderSavedLooks("");
syncOverlayAvailability();
loadPalettes().catch(()=>{
  paletteOptionsReady=false;
  renderPaletteStatus("Palette choices are unavailable. Check the Cart connection and try again.");
  syncOverlayAvailability();
  setFeatureStatus("Couldn’t load colors. Check the connection and try again.",true);
});
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
if (!matrixLocal()) setFeatureStatus("Some advanced controls are available only on the Cart.");

function resumeLiveRefresh() {
  if (document.hidden) return;
  if (liveRefreshInFlight) {
    liveRefreshPending=true;
    return;
  }
  liveRefreshPending=false;
  liveRefreshPendingSilent=true;
  refreshLive(true).catch(function(){});
}

function flushPendingLiveRefresh() {
  if (!liveRefreshPending || document.hidden || liveRefreshInFlight) return;
  const silent=liveRefreshPendingSilent;
  liveRefreshPending=false;
  liveRefreshPendingSilent=true;
  refreshLive(silent).catch(function(){});
}

window.addEventListener("online",resumeLiveRefresh);
window.addEventListener("pageshow",function(){
  if (matrixLocal()) refreshOtaResult().catch(function(){});
  resumeLiveRefresh();
});
document.addEventListener("visibilitychange",function(){
  if (document.hidden) return;
  if (matrixLocal()) refreshOtaResult().catch(function(){});
  resumeLiveRefresh();
});

setTimeout(function(){ refreshLive(true).catch(function(){}); },1200);
setInterval(function(){
  if (!document.hidden && !liveRefreshInFlight) refreshLive(true).catch(function(){});
},30000);

window.addEventListener("hbnf-canonical-capabilities",function(){ syncOverlayAvailability(); });
