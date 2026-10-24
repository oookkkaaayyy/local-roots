/* HBNF_CART_FINAL_V5_SEMANTIC_FRAME_LOCK */
import { compileSemanticPlan } from "./hbnf-cart-semantic.mjs?v=20261016-course-ready-ux-v1";
import { fetchWithDeadline, parsePairFragment, HBNF_API_TIMEOUT_MS, HBNF_VISUAL_TIMEOUT_MS } from "./hbnf-cart-net.mjs?v=20261016-course-ready-ux-v1";
import { LocalOwnerControl } from "./hbnf-cart-local.mjs?v=20261015-local-owner-v3";
import { deviceEvidenceLabel, deviceReadinessChecks, guestDefaultEnableNeeded, localLinkStatusText } from "./hbnf-cart-readiness.mjs?v=20261024-cart-field-desk-r3";

const SUPABASE_URL = "https://phcpbvuqibyarpfrftgx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC";
const endpoint = `${SUPABASE_URL}/functions/v1/hbnf-cart-control`;
const visualStatusEndpoint = `${SUPABASE_URL}/functions/v1/hbnf-cart-visual-status`;
const OPAL_LOCAL_PWA = location.hostname === "192.168.77.1" && location.pathname.indexOf("/mission-control-local/owner-pwa/") === 0;
const DEVICE_STORAGE_KEY = "hbnf_cart_device_v1";
const DEVICE_EXPIRY_KEY = "hbnf_cart_device_expiry_v1";
const DEVICE_EXPIRY_TOKEN_KEY = "hbnf_cart_device_expiry_token_v1";
const GUEST_DEFAULT_MIGRATION_KEY = "hbnf_guest_default_enabled_v110";
const DEVICE_COOKIE = "hbnf_cart_device";
const DEVICE_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;
const OPAL_LOCAL_COMMANDS = new Set(["OFF", "ON", "SCENE", "VIBE", "VIBE_AUTO", "PALETTE", "OVERLAY_START", "OVERLAY_CLEAR"]);
const OPAL_LOCAL_TUNE_FIELDS = new Set(["matrixBrightness", "auxBrightness", "motion", "audioResponse"]);

let revision = 0;
let pendingPairToken = null;
let pendingPairExpiryEpoch = 0;
let currentPairLink = "";
let tuneDirty = false;
let tuneDirtyFields = new Set();
let tuneInFlight = false;
let tuneDispatchPromise = null;
let tuneTimer = null;
let hydrating = false;
let canonicalCapabilities = {};
const localOwnerControl = new LocalOwnerControl({ opalDirect: OPAL_LOCAL_PWA });
let localControlActive = false;
let localPathStatus = OPAL_LOCAL_PWA ? "checking" : "not_checked";
let lastLocalEnrollAt = 0;
let lastCloudPairValidationAt = 0;
let guestDefaultMigrationInFlight = false;

const $ = id => document.getElementById(String(id).replace(/^#/, ""));
const statusNode = $("#status");
const authPanel = $("#authPanel");
const pairAcceptPanel = $("#pairAcceptPanel");
const managePairPanel = $("#managePairPanel");
const pairAcceptStatus = $("#pairAcceptStatus");
const pairCreateStatus = $("#pairCreateStatus");
const pairLinkNode = $("#pairLink");
const sharePair = $("#sharePair");
const copyPair = $("#copyPair");
const matrixHealth = $("#matrixTruth");
const auxHealth = $("#auxTruth");
const backendHealth = $("#backendTruth");
const cartLanHealth = $("#cartLanTruth");
const controlPathLabel = $("#controlPathLabel");
if (controlPathLabel) controlPathLabel.textContent = OPAL_LOCAL_PWA ? "iPad → Cart controls" : "Cloud control API";
let pendingRevision = null;
const activeCommandKeys = new Set();
const syncHealth = null;
const rendererHealth = null;

function renderLocalLinkStatus(snapshot) {
  if (!cartLanHealth) return;
  cartLanHealth.textContent = localLinkStatusText(snapshot, localPathStatus);
  cartLanHealth.className = (snapshot && snapshot.local === true) || localPathStatus === "reachable"
    ? "ok"
    : "degraded";
}

function valueOr(value, fallback) {
  return (value === undefined || value === null) ? fallback : value;
}

function pathValue(obj, path, fallback) {
  let current = obj;
  for (let i = 0; i < path.length; i++) {
    if (current === undefined || current === null) return fallback;
    current = current[path[i]];
  }
  return valueOr(current, fallback);
}

function newCommandId() {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.prototype.map.call(bytes, b => ("0" + b.toString(16)).slice(-2)).join("");
    return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
  } catch (error) {
    return "hbnf-"+Date.now()+"-"+Math.floor(Math.random()*1000000000);
  }
}

function copyTextLegacy(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta=document.createElement("textarea");
    ta.value=text;
    ta.setAttribute("readonly","");
    ta.style.position="fixed";
    ta.style.opacity="0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    try {
      const ok=document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) resolve();
      else reject(new Error("Copy failed"));
    } catch (error) {
      document.body.removeChild(ta);
      reject(error);
    }
  });
}

function validDeviceToken(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function readDeviceCookie() {
  for (const part of (document.cookie || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i < 0 || part.slice(0, i) !== DEVICE_COOKIE) continue;
    try { return decodeURIComponent(part.slice(i + 1)); } catch { return part.slice(i + 1); }
  }
  return "";
}

function writeDeviceCookie(token) {
  if (!validDeviceToken(token)) return;
  document.cookie = `${DEVICE_COOKIE}=${encodeURIComponent(token)}; Max-Age=${DEVICE_COOKIE_MAX_AGE}; Path=/; Secure; SameSite=Strict`;
}

function clearDeviceCredential() {
  const oldToken = deviceToken();
  if (oldToken) localOwnerControl.revoke(oldToken).catch(() => {});
  localStorage.removeItem(DEVICE_STORAGE_KEY);
  localStorage.removeItem(DEVICE_EXPIRY_KEY);
  localStorage.removeItem(DEVICE_EXPIRY_TOKEN_KEY);
  document.cookie = `${DEVICE_COOKIE}=; Max-Age=0; Path=/; Secure; SameSite=Strict`;
}

function syncDeviceCredential() {
  const local = localStorage.getItem(DEVICE_STORAGE_KEY) || "";
  const cookie = readDeviceCookie();
  if (validDeviceToken(local)) {
    if (cookie !== local) writeDeviceCookie(local);
    return local;
  }
  if (validDeviceToken(cookie)) {
    localStorage.setItem(DEVICE_STORAGE_KEY, cookie);
    return cookie;
  }
  return "";
}

function deviceToken() {
  return syncDeviceCredential();
}

function devicePairExpiryEpoch(token = deviceToken()) {
  if (!validDeviceToken(token) || localStorage.getItem(DEVICE_EXPIRY_TOKEN_KEY) !== token) return 0;
  const expiry = Number(localStorage.getItem(DEVICE_EXPIRY_KEY));
  return Number.isSafeInteger(expiry) && expiry > Math.floor(Date.now() / 1000) ? expiry : 0;
}

function parsePairExpiry(hash) {
  const match = String(hash || "").match(/(?:^#|[&#])expires=([^&]+)/i);
  if (!match) return 0;
  try {
    const parsed = Date.parse(decodeURIComponent(match[1]));
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
  } catch (_) { return 0; }
}

function setAuthorizedUi() {
  if (authPanel) authPanel.hidden = true;
  if (managePairPanel) managePairPanel.hidden = !validDeviceToken(deviceToken());
  if (pairAcceptPanel && !pendingPairToken) pairAcceptPanel.hidden = true;
}

async function authHeaders() {
  const token=deviceToken();
  const headers={
    "Content-Type": "application/json",
    apikey: SUPABASE_PUBLISHABLE_KEY,
  };
  if (validDeviceToken(token)) headers["x-hbnf-device"]=token;
  return {
    headers,
    mode: "guest",
  };
}

async function callCloud(body) {
  const { headers, mode } = await authHeaders();
  let response;
  try {
    response = await fetchWithDeadline(fetch, endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    }, HBNF_API_TIMEOUT_MS, "Cart control");
    if (backendHealth) backendHealth.textContent = "Reachable";
  } catch (error) {
    if (backendHealth) backendHealth.textContent = "Unavailable";
    throw error;
  }
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(json.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = json;
    throw error;
  }

  setAuthorizedUi();
  return json;
}

function hydrateLocalControls(state) {
  if (!state) return;
  hydrating = true;
  try {
    if (state.sceneId && $("scene")) $("scene").value = state.sceneId;
    updateVibeSelection(state);
    const tuning = valueOr(state.tuning, {});
    if (Number.isFinite(Number(tuning.audioResponse))) setRange("audioResponse", "audioResponseValue", Number(tuning.audioResponse));
    if (Number.isFinite(Number(tuning.motion))) setRange("motion", "motionValue", Number(tuning.motion));
    setRange("matrixBrightness", "matrixValue", Number(pathValue(state, ["devices","matrix","brightness"], NaN)));
    setRange("auxBrightness", "auxValue", Number(pathValue(state, ["devices","aux","brightness"], NaN)));
  } finally {
    hydrating = false;
  }
}

async function call(body) {
  if (OPAL_LOCAL_PWA && body.action === "status") {
    localPathStatus = "checking";
    try {
      const local = await localOwnerControl.connect("", 0);
      localControlActive = true;
      localPathStatus = local && local.local === true ? "reachable" : "not_checked";
      if (backendHealth) backendHealth.textContent = "Connected";
      return local;
    } catch (error) {
      localControlActive = false;
      localPathStatus = "unavailable";
      if (backendHealth) backendHealth.textContent = "Unavailable";
      throw error;
    }
  }
  if (OPAL_LOCAL_PWA && body.action === "command") {
    const localType = OPAL_LOCAL_COMMANDS.has(body.type);
    const localTune = body.type === "TUNE" && Array.isArray(body.changedFields) && body.changedFields.length > 0 && body.changedFields.every(key => OPAL_LOCAL_TUNE_FIELDS.has(key));
    if (localType || localTune) {
      if (!localOwnerControl.supports(body.type, body.payload, body.changedFields)) throw new Error("Local Matrix connection is not ready; no cloud fallback was sent for this control.");
      localControlActive = true;
      if (backendHealth) backendHealth.textContent = "Connected";
      return localOwnerControl.command("", body.type, body.payload, body.changedFields);
    }
  }
  const cloudBody = Object.assign({}, body);
  delete cloudBody.changedFields;
  const token = deviceToken();
  if (validDeviceToken(token) && (body.action === "status" || body.action === "command")) {
    if (body.action === "status") localPathStatus = "checking";
    try {
      if (body.action === "status") {
        const local = await localOwnerControl.connect(token, devicePairExpiryEpoch(token));
        localControlActive = true;
        localPathStatus = local && local.local === true ? "reachable" : "not_checked";
        return local;
      }
      if (localControlActive && localOwnerControl.supports(body.type, body.payload)) {
        return localOwnerControl.command(token, body.type, body.payload);
      }
    } catch (localError) {
      if (body.action === "status") localPathStatus = "unavailable";
      if (body.action === "command" && localControlActive && localOwnerControl.supports(body.type, body.payload)) {
        throw localError;
      }
      localControlActive = false;
    }
  }

  try {
    const result = await callCloud(cloudBody);
    if (body.action === "status" && validDeviceToken(token) && Date.now() - lastLocalEnrollAt > 300000) {
      lastLocalEnrollAt = Date.now();
      localOwnerControl.connect(token, devicePairExpiryEpoch(token)).then(() => { localControlActive = true; }).catch(() => {});
    }
    return result;
  } catch (error) {
    if (body.action === "status" && error.status === 401 && validDeviceToken(token)) {
      localOwnerControl.revoke(token).catch(() => {});
      localControlActive = false;
      localStorage.removeItem(DEVICE_STORAGE_KEY);
      document.cookie = `${DEVICE_COOKIE}=; Max-Age=0; Path=/; Secure; SameSite=Strict`;
    }
    throw error;
  }
}

function revalidateLocalPairOnline() {
  const token = deviceToken();
  if (!localControlActive || !validDeviceToken(token) || !navigator.onLine || Date.now() - lastCloudPairValidationAt < 300000) return;
  lastCloudPairValidationAt = Date.now();
  callCloud({ action: "status" }).catch(error => {
    if (error.status === 401 && deviceToken() === token) {
      clearDeviceCredential();
      localControlActive = false;
      setAuthorizedUi();
      statusNode.textContent = "Pair this device again to continue.";
    }
  });
}

async function visualStatus() {
  const { headers, mode } = await authHeaders();
  const response = await fetchWithDeadline(fetch, visualStatusEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "status" }),
    cache: "no-store",
  }, HBNF_VISUAL_TIMEOUT_MS, "Hardware status");
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function shortDeviceFailure(device) {
  const reported = device && device.reported ? device.reported : null;
  const error = String(reported && reported.error || "");
  if (error === "invalid_or_mismatched_foundation_ack") return "Matrix command not confirmed";
  if (error) return error.replace(/_/g, " ").slice(0, 64);
  if (device && device.status === "failed") return "device reported failure";
  return "";
}

function observedAgeLabel(value) {
  const at = Date.parse(value || "");
  if (!Number.isFinite(at)) return "no prior report";
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (seconds < 90) return `last report ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 90) return `last report ${minutes}m ago`;
  return `last report ${Math.floor(minutes / 60)}h ago`;
}

function renderVisualHealth(snapshot, canonicalSnapshot) {
  const badge = $("#truthBadge");
  renderLocalLinkStatus(canonicalSnapshot);
  if (!snapshot) {
    if (badge) { badge.textContent = "Controls unavailable"; badge.className = "truth-badge warn"; }
    return;
  }
  const matrix = snapshot.devices ? snapshot.devices.matrix : null;
  const aux = snapshot.devices ? snapshot.devices.aux : null;
  const observed = canonicalSnapshot && Array.isArray(canonicalSnapshot.observed) ? canonicalSnapshot.observed : [];
  const desiredRevision = Number(canonicalSnapshot && canonicalSnapshot.desired && canonicalSnapshot.desired.revision);
  const reportFor = id => observed.find(x => x.device_id === id) || {};
  const matrixReport = reportFor("matrix"), auxReport = reportFor("aux");
  const readiness = deviceReadinessChecks(canonicalSnapshot);
  const matrixCheck = readiness.find(value => value.indexOf("Matrix device ") === 0) || "Matrix device UNCONFIRMED";
  const auxCheck = readiness.find(value => value.indexOf("AUX device ") === 0) || "AUX device UNCONFIRMED";
  const matrixOk = !!(matrix && matrix.confirmed === true && Number(matrix.confirmedRevision) === desiredRevision && matrixCheck.indexOf("PASS") >= 0);
  const auxOk = !!(aux && aux.confirmed === true && Number(aux.confirmedRevision) === desiredRevision && auxCheck.indexOf("PASS") >= 0);
  if (matrixHealth) {
    matrixHealth.textContent = deviceEvidenceLabel(canonicalSnapshot, "matrix");
    matrixHealth.className = matrixOk ? "ok" : (shortDeviceFailure(matrixReport) ? "bad" : "degraded");
  }
  if (auxHealth) {
    auxHealth.textContent = deviceEvidenceLabel(canonicalSnapshot, "aux");
    auxHealth.className = auxOk ? "ok" : (shortDeviceFailure(auxReport) ? "bad" : "degraded");
  }
  if (badge) {
    if (snapshot.local === true && aux && aux.ddp !== true) { badge.textContent = "Check underglow"; badge.className = "truth-badge warn"; return; }
    if (matrixOk && auxOk) { badge.textContent = snapshot.local === true ? "Cart, Matrix & underglow responding" : "Matrix & underglow responding"; badge.className = "truth-badge good"; }
    else if (shortDeviceFailure(matrixReport) || shortDeviceFailure(auxReport)) { badge.textContent = "Cart needs attention"; badge.className = "truth-badge bad"; }
    else if (matrixCheck.indexOf("STALE") >= 0 || auxCheck.indexOf("STALE") >= 0) { badge.textContent = "Matrix/underglow update is old"; badge.className = "truth-badge warn"; }
    else if (matrixCheck.indexOf("UNCONFIRMED") >= 0 || auxCheck.indexOf("UNCONFIRMED") >= 0) { badge.textContent = "Matrix/underglow not confirmed"; badge.className = "truth-badge warn"; }
    else { badge.textContent = "Checking Matrix & underglow"; badge.className = "truth-badge warn"; }
  }
}

function updateVibeSelection(_state) {
  const vibe = String(_state && _state.selectedVibe || "");
  const ready = canonicalCapabilities.phase2VibeRuntimeV1 === true || canonicalCapabilities.opalDirectOwnerPwaV1 === true;
  const autoReady = ready && canonicalCapabilities.autoVibeControlV1 === true;
  const options = $("#vibeOptions"), availability = $("#vibeAvailability");
  if (options) options.hidden = !ready;
  if (availability) availability.hidden = ready;
  document.querySelectorAll(".vibe-option").forEach(button => {
    button.disabled = !ready;
    button.setAttribute("aria-pressed", button.dataset.vibe === vibe ? "true" : "false");
  });
  const autoButton = $("#vibeAuto");
  if (autoButton) {
    autoButton.hidden = !autoReady;
    autoButton.disabled = !autoReady;
    autoButton.setAttribute("aria-pressed", vibe === "auto" ? "true" : "false");
  }
}

function setRange(id, outputId, value, formatter = v => String(v)) {
  if (!Number.isFinite(Number(value))) return;
  $(id).value = String(value);
  $(outputId).value = formatter(Number(value));
}

function hydrateControls(state) {
  hydrating = true;
  try {
    renderGuestMode(state);
    if (state.sceneId) $("#scene").value = state.sceneId;

    const tuning = valueOr(state.tuning, {});
    updateVibeSelection(state);
    const energy = Number(valueOr(tuning.energy, valueOr({ mellow: 15, moderate: 40, energetic: 68, peak: 90 }[state.vibe], 65)));
    const audioResponse = Number(valueOr(tuning.audioResponse, Math.round(((Number(valueOr(tuning.responseBoost, 1)) - 1) / 0.005))));
    const motion = Number(valueOr(tuning.motion, Math.round((Number(valueOr(state.manualSpeedBias, 1.4)) - 0.5) / 0.015)));
    const variation = Number(valueOr(tuning.variation, 85));

    setRange("energy", "energyValue", Math.max(0, Math.min(100, energy)));
    setRange("audioResponse", "audioResponseValue", Math.max(0, Math.min(100, audioResponse)));
    setRange("motion", "motionValue", Math.max(0, Math.min(100, motion)));
    setRange("variation", "variationValue", Math.max(0, Math.min(100, variation)));
    setRange("matrixBrightness", "matrixValue", Number(pathValue(state, ["devices","matrix","brightness"], 8)));
    setRange("auxBrightness", "auxValue", Number(pathValue(state, ["devices","aux","brightness"], 64)));
    setRange("micSensitivity", "micSensitivityValue", Number(valueOr(tuning.micSensitivity, 255)));
    $("#audioProfile").value = valueOr(tuning.audioProfile, "scene");
    $("#audioStyle").value = valueOr(tuning.audioStyle, "scene");
  } finally {
    hydrating = false;
  }
}

function guestMigrationApplied() {
  try { return localStorage.getItem(GUEST_DEFAULT_MIGRATION_KEY) === "done"; }
  catch (_) { return false; }
}

function guestMigrationMark(value) {
  try {
    if (value) localStorage.setItem(GUEST_DEFAULT_MIGRATION_KEY, value);
    else localStorage.removeItem(GUEST_DEFAULT_MIGRATION_KEY);
  } catch (_) {}
}

function renderGuestMode(state) {
  const enabled = !!(state && state.guestMode === true);
  const status = $("guestModeStatus");
  const open = $("guestModeOpen");
  const close = $("guestModeClose");
  if (status) status.textContent = enabled
    ? "Guest controls are open. The guest page is ready to share."
    : "Guest controls are opening by default when this iPad is paired.";
  if (open) { open.hidden = enabled; open.disabled = !validDeviceToken(deviceToken()); }
  if (close) { close.hidden = !enabled; close.disabled = !validDeviceToken(deviceToken()); }
  if (!enabled && guestDefaultEnableNeeded(state, guestMigrationApplied()) && validDeviceToken(deviceToken()) && !guestDefaultMigrationInFlight) {
    guestDefaultMigrationInFlight = true;
    guestMigrationMark("pending");
    if (status) status.textContent = "Opening guest controls…";
    setTimeout(function() {
      command("GUEST_MODE", { enabled: true }).then(function() {
        guestMigrationMark("done");
      }).catch(function() {
        guestMigrationMark("");
        if (status) status.textContent = "Guest controls could not open. Tap Open guest controls to retry.";
        if (open) open.hidden = false;
      }).finally(function() { guestDefaultMigrationInFlight = false; });
    }, 0);
  } else if (!enabled && guestMigrationApplied() && status) {
    status.textContent = "Guest controls are closed. Open them when you want to share the guest page.";
  } else if (!enabled && !validDeviceToken(deviceToken()) && status) {
    status.textContent = "Pair this iPad to open guest controls. The guest page link is always available.";
  }
}

async function setGuestMode(enabled) {
  guestDefaultMigrationInFlight = true;
  guestMigrationMark("done");
  const status = $("guestModeStatus");
  if (status) status.textContent = enabled ? "Opening guest controls…" : "Closing guest controls…";
  try {
    await command("GUEST_MODE", { enabled: enabled });
    guestMigrationMark("done");
  } catch (_) {
    if (status) status.textContent = "Guest access change was not confirmed. Check Cart status and try again.";
  } finally {
    guestDefaultMigrationInFlight = false;
  }
}

async function refresh({ hydrate = true } = {}) {
  let out;
  try {
    out = await call({ action: "status" });
  } catch (error) {
    if (backendHealth) backendHealth.textContent = "Unavailable";
    renderLocalLinkStatus(null);
    if (matrixHealth) matrixHealth.textContent = "Not confirmed";
    if (auxHealth) auxHealth.textContent = "Not confirmed";
    const guestStatus = $("guestModeStatus");
    if (guestStatus) guestStatus.textContent = "Guest access status is unavailable. Reconnect to the Cart to check it.";
    const badge = $("#truthBadge");
    if (badge) {
      badge.textContent = "Controls unavailable";
      badge.className = "truth-badge warn";
    }
    throw error;
  }
  canonicalCapabilities = out && out.capabilities ? out.capabilities : {};
  try { window.dispatchEvent(new CustomEvent("hbnf-canonical-capabilities",{detail:canonicalCapabilities})); } catch (_) {}

  if (out && out.local === true) {
    revalidateLocalPairOnline();
    if (out.desired) {
      revision = out.desired.revision;
      if (hydrate && !tuneInFlight && !tuneDirty) hydrateLocalControls(out.desired.state);
    }
    setAuthorizedUi();
    renderVisualHealth(out, out);
    const localChecks = deviceReadinessChecks(out);
    statusNode.textContent = localChecks.every(value => value.indexOf("PASS") >= 0)
      ? "Cart is reachable. Matrix and underglow responded; check the display to confirm what’s showing."
      : "Cart is reachable, but Matrix or underglow has not confirmed its status.";
    return out;
  }

  if (out.desired) {
    revision = out.desired.revision;
    if (hydrate && !tuneInFlight && !tuneDirty) hydrateControls(out.desired.state);
  }

  if (out.desired) {
    const observed = Array.isArray(out.observed) ? out.observed : [];
    const fullyApplied = observed.length >= 2 && observed.every(x => Number(x.desired_revision) === Number(out.desired.revision) && ["online","off"].includes(String(x.status)) && x.reported && x.reported.confirmed === true);
    const matrixObs = observed.find(x => x.device_id === "matrix");
    const auxObs = observed.find(x => x.device_id === "aux");
    const matrixBri = pathValue(matrixObs, ["reported","appliedProjection","brightness"], pathValue(matrixObs, ["reported","brightness"], "—"));
    const auxBri = pathValue(auxObs, ["reported","appliedProjection","brightness"], pathValue(auxObs, ["reported","brightness"], "—"));
    const failed = observed.some(x => Number(x.desired_revision) === Number(revision) && (x.status === "failed" || (x.reported && x.reported.confirmed === false && x.reported.error)));
    const submitted = observed.some(x => Number(x.desired_revision) === Number(revision) && x.status === "submitted");
    if (fullyApplied || failed) pendingRevision = null;
    statusNode.textContent = fullyApplied
      ? "Matrix and underglow confirmed the change. Check the display to verify the result."
      : failed
        ? "The Cart could not apply that change. Check Cart status before retrying."
        : submitted
          ? "Change sent. Waiting for the Cart…"
        : pendingRevision === revision
          ? "Change sent. Waiting for the Cart…"
        : "Waiting for the Cart to confirm. Check Cart status if it takes too long.";
  } else {
    statusNode.textContent = "The Cart is not ready. No change was sent.";
  }

  visualStatus().then(value => renderVisualHealth(value, out)).catch(() => renderVisualHealth(null, out));
  return out;
}

function readTunePayload() {
  const plan = compileSemanticPlan({
    energy: Number($("#energy").value),
    audioResponse: Number($("#audioResponse").value),
    motion: Number($("#motion").value),
    variation: Number($("#variation").value),
  });
  return {
    sceneId: $("#scene").value,
    vibe: plan.cartTune.vibe,
    speedBias: plan.cartTune.speedBias,
    tempoMode: "manual",
    matrixBrightness: Number($("#matrixBrightness").value),
    auxBrightness: Number($("#auxBrightness").value),
    micSensitivity: Number($("#micSensitivity").value),
    responseBoost: plan.cartTune.responseBoost,
    audioProfile: $("#audioProfile").value,
    audioStyle: $("#audioStyle").value,
    variation: plan.cartTune.variation,
    energy: plan.cartTune.energy,
    audioResponse: plan.cartTune.audioResponse,
    motion: plan.cartTune.motion,
  };
}

function queueTune(delay = 0, field = "") {
  if (hydrating) return;
  tuneDirty = true;
  if (field) tuneDirtyFields.add(field);
  clearTimeout(tuneTimer);
  tuneTimer = setTimeout(() => {
    tuneTimer = null;
    flushTune().catch(showError);
  }, delay);
}

async function flushTune(options = {}) {
  clearTimeout(tuneTimer);
  tuneTimer = null;
  if (tuneInFlight) {
    if (tuneDispatchPromise) await tuneDispatchPromise;
    if (options.waitForApplied === false || tuneInFlight) return;
  }
  if (!tuneDirty) return;

  tuneInFlight = true;
  const dispatch = (async () => {
    while (tuneDirty) {
      tuneDirty = false;
      const payload = readTunePayload();
      const changedFields = Array.from(tuneDirtyFields);
      tuneDirtyFields = new Set();

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await call({
            action: "command",
            commandId: newCommandId(),
            type: "TUNE",
            payload,
            changedFields: OPAL_LOCAL_PWA ? changedFields : undefined,
            expectedRevision: revision,
          });
          revision = result.revision;
          pendingRevision = revision;
          statusNode.textContent = "Change sent. Waiting for the Cart…";
          break;
        } catch (error) {
          if (error.status === 409 && error.data && error.data.error === "stale_revision" && attempt === 0) {
            const latest = await refresh({ hydrate: false });
            revision = latest.desired ? valueOr(latest.desired.revision, revision) : revision;
            continue;
          }
          throw error;
        }
      }
    }
  })();
  tuneDispatchPromise = dispatch;
  try {
    await dispatch;
  } finally {
    tuneInFlight = false;
    tuneDispatchPromise = null;
  }

  if (options.waitForApplied === false) return;
  for (let i = 0; i < 12; i++) {
    const snap = await refresh({ hydrate: false });
    const observed = Array.isArray(snap.observed) ? snap.observed : [];
    const applied = snap.desired && observed.length >= 2 && observed.every(x => Number(x.desired_revision) === Number(snap.desired.revision) && ["online","off"].includes(String(x.status)) && x.reported && x.reported.confirmed === true);
    if (applied) {
      pendingRevision = null;
      if (snap.local === true) hydrateLocalControls(snap.desired.state);
      else hydrateControls(snap.desired.state);
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  await refresh({ hydrate: true });
}

async function command(type, payload = {}) {
  const startedAt = performance.now();
  const sourceButton = payload && payload._sourceButton;
  const safePayload = Object.assign({}, payload);
  delete safePayload._sourceButton;
  const originalDisabled = sourceButton ? sourceButton.disabled : false;
  const duplicatePayload = Object.assign({}, safePayload);
  if (type === "OVERLAY_START") delete duplicatePayload.overlayId;
  const commandKey = JSON.stringify([type, duplicatePayload]);
  if (activeCommandKeys.has(commandKey)) return { accepted: false, duplicate: true };
  activeCommandKeys.add(commandKey);
  if (sourceButton) {
    sourceButton.disabled = true;
    sourceButton.setAttribute("aria-busy", "true");
  }
  statusNode.textContent = "Sending Cart command…";
  let tuneFlushMs = 0;
  let submitMs = 0;
  let deviceAckWaitMs = 0;
  try {
  const tuneStartedAt = performance.now();
  await flushTune({ waitForApplied: false });
  tuneFlushMs = performance.now() - tuneStartedAt;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const submitStartedAt = performance.now();
      const result = await call({
        action: "command",
        commandId: newCommandId(),
        type,
        payload: Object.assign({}, safePayload, payload && payload.overlayId ? { overlayId: payload.overlayId } : {}),
        expectedRevision: revision,
      });
      submitMs += performance.now() - submitStartedAt;
      if (result && result.accepted === false) throw new Error(result.error || "Cart did not accept the command.");
      revision = result.revision;
      pendingRevision = revision;
      statusNode.textContent = "Change sent. Checking the Cart…";
      const deadline = Date.now() + 6000;
      const ackStartedAt = performance.now();
      let latest = null;
      let acknowledged = false;
      do {
        latest = await refresh({ hydrate: false });
        const observed = Array.isArray(latest.observed) ? latest.observed : [];
        const reports = observed.filter(x => Number(x.desired_revision) === Number(revision));
        const failed = reports.some(x => x.status === "failed" || (x.reported && x.reported.confirmed === false && x.reported.error));
        acknowledged = reports.length >= 2 && reports.every(x => ["online","off"].includes(String(x.status)) && x.reported && x.reported.confirmed === true);
        if (failed) throw new Error("Cart accepted the command, but a device reported failure.");
        if (acknowledged) break;
        if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 750));
      } while (Date.now() < deadline);
      deviceAckWaitMs = performance.now() - ackStartedAt;
      const outcome = { accepted: true, acknowledged };
      window.HBNFCanonicalLastCommandTiming = {
        source: OPAL_LOCAL_PWA ? "opal-local" : (localControlActive ? "paired-local" : "cloud"),
        tuneFlushMs: tuneFlushMs,
        submitMs: submitMs,
        deviceAckWaitMs: deviceAckWaitMs,
        totalMs: performance.now() - startedAt,
        acknowledged: acknowledged,
      };
      return outcome;
    } catch (error) {
      if (error.status === 409 && error.data && error.data.error === "stale_revision" && attempt === 0) {
        await refresh({ hydrate: false });
        continue;
      }
      throw error;
    }
  }
  } finally {
    activeCommandKeys.delete(commandKey);
    if (sourceButton) {
      sourceButton.disabled = originalDisabled;
      sourceButton.removeAttribute("aria-busy");
    }
  }
}

window.HBNFCanonical = {
  command: command,
  refresh: refresh,
  flushTune: flushTune,
  getRevision: function(){ return revision; },
  getLastCommandTiming: function(){ return window.HBNFCanonicalLastCommandTiming || null; },
  getCapabilities: function(){ return canonicalCapabilities; },
  read: function(action, payload) {
    return call(Object.assign({action:action}, payload || {}));
  },
  overlay: function(kind, data, ttlMs) {
    const duration = Number.isFinite(Number(ttlMs)) ? Math.max(1000, Math.min(30000, Math.round(Number(ttlMs)))) : (kind === "scoreboard" ? 22000 : 8000);
    return command("OVERLAY_START", {
      overlayId: newCommandId(),
      kind: kind,
      priority: 60,
      ttlMs: duration,
      data: data || {}
    });
  }
};

function detectPairFragment() {
  pendingPairToken = parsePairFragment(location.hash);
  pendingPairExpiryEpoch = parsePairExpiry(location.hash);
  if (!pairAcceptPanel) return;
  pairAcceptPanel.hidden = !pendingPairToken;
  if (pendingPairToken && pairAcceptStatus) pairAcceptStatus.textContent = "Link ready. Tap Pair this device once.";
}

$("#acceptPair").addEventListener("click", async () => {
  if (!pendingPairToken) return;
  localStorage.setItem(DEVICE_STORAGE_KEY, pendingPairToken);
  if (pendingPairExpiryEpoch > Math.floor(Date.now() / 1000)) {
    localStorage.setItem(DEVICE_EXPIRY_KEY, String(pendingPairExpiryEpoch));
    localStorage.setItem(DEVICE_EXPIRY_TOKEN_KEY, pendingPairToken);
  } else {
    localStorage.removeItem(DEVICE_EXPIRY_KEY);
    localStorage.removeItem(DEVICE_EXPIRY_TOKEN_KEY);
  }
  writeDeviceCookie(pendingPairToken);
  pendingPairToken = null;
  pendingPairExpiryEpoch = 0;
  history.replaceState(null, "", location.pathname + location.search);
  pairAcceptPanel.hidden = true;
  pairAcceptStatus.textContent = "";
  try {
    await refresh();
    statusNode.textContent += "\nThis device is paired for about six months.";
  } catch (error) {
    clearDeviceCredential();
    showError(error);
  }
});

$("#createPair").addEventListener("click", async () => {
  pairCreateStatus.textContent = "Creating private link…";
  pairLinkNode.hidden = true;
  sharePair.hidden = true;
  copyPair.hidden = true;
  try {
    const out = await call({ action: "pair_device", label: "HBNF iPhone/iPad" });
    currentPairLink = `${location.origin}${location.pathname}#pair=${encodeURIComponent(out.deviceToken)}&expires=${encodeURIComponent(out.expiresAt)}`;
    pairLinkNode.value = currentPairLink;
    pairLinkNode.hidden = false;
    sharePair.hidden = !("share" in navigator);
    copyPair.hidden = false;
    pairCreateStatus.textContent = `Link ready. Expires ${new Date(out.expiresAt).toLocaleDateString()}.`;
  } catch (error) {
    pairCreateStatus.textContent = "Couldn't create the link. Check the connection and try again.";
  }
});

sharePair.addEventListener("click", async () => {
  if (!currentPairLink) return;
  try {
    await navigator.share({
      title: "Pair HBNF Cart",
      text: "Open this private link on the device to pair HBNF Cart.",
      url: currentPairLink,
    });
  } catch (error) {
    if (!error || error.name !== "AbortError") pairCreateStatus.textContent = "Couldn't share the link. Try copying it instead.";
  }
});

copyPair.addEventListener("click", async () => {
  if (!currentPairLink) return;
  try {
    await copyTextLegacy(currentPairLink);
    pairCreateStatus.textContent = "Pairing link copied.";
  } catch (_) {
    pairCreateStatus.textContent = "Couldn’t copy the link. Select it and copy it manually.";
  }
});

document.querySelectorAll("[data-command]").forEach(button => {
  button.addEventListener("click", () => {
    statusNode.textContent = "Sending Cart command…";
    command(button.dataset.command, { _sourceButton: button }).catch(showError);
  });
});

if ($("guestModeOpen")) $("guestModeOpen").addEventListener("click", () => setGuestMode(true));
if ($("guestModeClose")) $("guestModeClose").addEventListener("click", () => setGuestMode(false));

document.querySelectorAll(".vibe-option").forEach(button => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    command("VIBE", { vibe: button.dataset.vibe, _sourceButton: button }).catch(showError);
  });
});
$("#vibeAuto").addEventListener("click", () => {
  if (!$("#vibeAuto").disabled) command("VIBE_AUTO", { _sourceButton: $("vibeAuto") }).catch(showError);
});

for (const id of ["scene", "audioProfile", "audioStyle"]) {
  $(id).addEventListener("change", () => {
    if (OPAL_LOCAL_PWA && id === "scene") command("SCENE", { sceneId: $(id).value, _sourceButton: $(id) }).catch(showError);
    else queueTune(0, id);
  });
}

for (const [inputId, outputId] of [
  ["matrixBrightness", "matrixValue"],
  ["auxBrightness", "auxValue"],
  ["micSensitivity", "micSensitivityValue"],
]) {
  $(inputId).addEventListener("input", event => {
    $(outputId).value = event.target.value;
  });
  $(inputId).addEventListener("change", () => queueTune(0, inputId));
}

for (const id of ["energy", "audioResponse", "motion", "variation"]) {
  const output = $(`${id}Value`);
  $(id).addEventListener("input", event => { output.value = event.target.value; });
  $(id).addEventListener("change", () => queueTune(0, id));
}

$("#refresh").addEventListener("click", () => refresh().catch(showRefreshError));

function showRefreshError(error) {
  statusNode.textContent = OPAL_LOCAL_PWA
    ? "Cart controls are unavailable. Check the connection and try again."
    : "The Cart could not connect. No change was sent.";
}

function showError(error) {
  statusNode.textContent = pendingRevision !== null
    ? "Change sent. Waiting for the Cart to update."
    : "The Cart could not complete that change. Check the connection and try again.";
}

detectPairFragment();
setAuthorizedUi();
statusNode.textContent = "Connecting…";
refresh().catch(showRefreshError);

window.addEventListener("online", () => {
  if (!document.hidden && !tuneInFlight && !tuneDirty) refresh().catch(showRefreshError);
});
window.addEventListener("offline", () => {
  statusNode.textContent = OPAL_LOCAL_PWA
    ? "You’re offline. Controls on the Cart are still available."
    : "You are offline. No change was sent.";
});

setInterval(() => {
  if (!document.hidden && !tuneInFlight && !tuneDirty) refresh().catch(showRefreshError);
}, 6000);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    localOwnerControl.disconnectTransport();
    localControlActive = false;
    return;
  }
  if (!tuneInFlight && !tuneDirty) refresh().catch(showRefreshError);
});
window.addEventListener("pagehide", () => {
  localOwnerControl.disconnectTransport();
  localControlActive = false;
});
