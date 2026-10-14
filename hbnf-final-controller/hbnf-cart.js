/* HBNF_CART_FINAL_V5_SEMANTIC_FRAME_LOCK */
import { compileSemanticPlan } from "./hbnf-cart-semantic.mjs?v=20261009-cart2-vibe-r2";
import { fetchWithDeadline, parsePairFragment, HBNF_API_TIMEOUT_MS, HBNF_VISUAL_TIMEOUT_MS } from "./hbnf-cart-net.mjs?v=20261009-cart2-vibe-r2";

const SUPABASE_URL = "https://phcpbvuqibyarpfrftgx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC";
const endpoint = `${SUPABASE_URL}/functions/v1/hbnf-cart-control`;
const visualStatusEndpoint = `${SUPABASE_URL}/functions/v1/hbnf-cart-visual-status`;
const DEVICE_STORAGE_KEY = "hbnf_cart_device_v1";
const DEVICE_COOKIE = "hbnf_cart_device";
const DEVICE_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

let revision = 0;
let pendingPairToken = null;
let currentPairLink = "";
let tuneDirty = false;
let tuneInFlight = false;
let tuneTimer = null;
let hydrating = false;
let canonicalCapabilities = {};

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
const guestModeToggle = $("#guestMode");
const guestModeStatus = $("#guestModeStatus");
const vibeModeLabel = $("#vibeModeLabel");
let pendingRevision = null;
const syncHealth = null;
const rendererHealth = null;

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
  localStorage.removeItem(DEVICE_STORAGE_KEY);
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

function setAuthorizedUi() {
  if (authPanel) authPanel.hidden = true;
  if (managePairPanel) managePairPanel.hidden = !validDeviceToken(deviceToken());
  if (pairAcceptPanel && !pendingPairToken) pairAcceptPanel.hidden = true;
  if (guestModeToggle) guestModeToggle.disabled = !validDeviceToken(deviceToken());
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

async function call(body) {
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
  if (!snapshot) {
    if (badge) { badge.textContent = "Device status unavailable"; badge.className = "truth-badge warn"; }
    return;
  }
  const matrix = snapshot.devices ? snapshot.devices.matrix : null;
  const aux = snapshot.devices ? snapshot.devices.aux : null;
  const observed = canonicalSnapshot && Array.isArray(canonicalSnapshot.observed) ? canonicalSnapshot.observed : [];
  const desiredRevision = Number(canonicalSnapshot && canonicalSnapshot.desired && canonicalSnapshot.desired.revision);
  const reportFor = id => observed.find(x => x.device_id === id) || {};
  const matrixReport = reportFor("matrix"), auxReport = reportFor("aux");
  const matrixOk = !!(matrix && matrix.confirmed === true && Number(matrix.confirmedRevision) === desiredRevision);
  const auxOk = !!(aux && aux.confirmed === true && Number(aux.confirmedRevision) === desiredRevision);
  const labelFor = (report, isConfirmed) => {
    if (isConfirmed) return `CONFIRMED · r${desiredRevision}`;
    const failure = shortDeviceFailure(report);
    if (failure) return `FAILED · ${failure}`;
    const reportedRevision = report && report.reported ? report.reported.cartRevision : null;
    const seen = Number(reportedRevision !== null && reportedRevision !== undefined
      ? reportedRevision
      : (report ? report.desired_revision : undefined));
    if (Number.isFinite(desiredRevision) && Number.isFinite(seen)) return `NOT CONFIRMED · r${seen} / r${desiredRevision} · ${observedAgeLabel(report.observed_at)}`;
    if ((report && report.status === "off") || (report && report.online === false)) return `OFFLINE · ${observedAgeLabel(report.observed_at)}`;
    return `NO RECENT ACK · ${observedAgeLabel(report.observed_at)}`;
  };
  if (matrixHealth) {
    matrixHealth.textContent = labelFor(matrixReport, matrixOk);
    matrixHealth.className = matrixOk ? "ok" : (shortDeviceFailure(matrixReport) ? "bad" : "degraded");
  }
  if (auxHealth) {
    auxHealth.textContent = labelFor(auxReport, auxOk);
    auxHealth.className = auxOk ? "ok" : (shortDeviceFailure(auxReport) ? "bad" : "degraded");
  }
  if (badge) {
    if (matrixOk && auxOk) { badge.textContent = "COMMANDS ACKNOWLEDGED"; badge.className = "truth-badge good"; }
    else if (shortDeviceFailure(matrixReport) || shortDeviceFailure(auxReport)) { badge.textContent = "Device command failed"; badge.className = "truth-badge bad"; }
    else { badge.textContent = "AWAITING DEVICE ACK"; badge.className = "truth-badge warn"; }
  }
}

function updateVibeSelection(_state) {
  const vibe = String(_state && _state.selectedVibe || "");
  const ready = canonicalCapabilities.phase2VibeRuntimeV1 === true;
  document.querySelectorAll(".vibe-option").forEach(button => {
    button.disabled = !ready;
    button.setAttribute("aria-pressed", button.dataset.vibe === vibe ? "true" : "false");
  });
  const autoButton = $("#vibeAuto");
  if (autoButton) {
    autoButton.disabled = !ready;
    autoButton.setAttribute("aria-pressed", vibe === "auto" ? "true" : "false");
  }
  if (vibeModeLabel) vibeModeLabel.textContent = ready ? (vibe ? `Desired · ${vibe.toUpperCase()}` : "Ready") : "Runtime not qualified";
  const availability = $("#vibeAvailability");
  if (availability) availability.textContent = ready
    ? "Vibe selection is available. Device application remains subject to the revision-bound status below."
    : "Vibes stay unavailable until the matching firmware and frozen runtime gates are accepted.";
}

function setRange(id, outputId, value, formatter = v => String(v)) {
  if (!Number.isFinite(Number(value))) return;
  $(id).value = String(value);
  $(outputId).value = formatter(Number(value));
}

function hydrateControls(state) {
  hydrating = true;
  try {
    if (state.sceneId) $("#scene").value = state.sceneId;
    if (guestModeToggle) guestModeToggle.checked = state.guestMode === true;
    if (guestModeStatus) guestModeStatus.textContent = state.guestMode === true
      ? "Guest Mode is open. Owner commands remain authoritative."
      : "Guest Mode is off unless the owner opens it.";

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

async function refresh({ hydrate = true } = {}) {
  let out;
  try {
    out = await call({ action: "status" });
  } catch (error) {
    if (backendHealth) backendHealth.textContent = "Unavailable";
    if (matrixHealth) matrixHealth.textContent = "Not confirmed";
    if (auxHealth) auxHealth.textContent = "Not confirmed";
    const badge = $("#truthBadge");
    if (badge) {
      badge.textContent = "Cart service unavailable";
      badge.className = "truth-badge warn";
    }
    throw error;
  }
  canonicalCapabilities = out && out.capabilities ? out.capabilities : {};
  try { window.dispatchEvent(new CustomEvent("hbnf-canonical-capabilities",{detail:canonicalCapabilities})); } catch (_) {}

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
      ? `Commands acknowledged · revision ${revision} · Matrix ${matrixBri} · AUX command ${auxBri}`
      : failed
        ? `Command failed at revision ${revision} · Matrix ${matrixBri} · AUX command ${auxBri}. See System Info.`
        : submitted
          ? `Command submitted · revision ${revision} · device application and physical AUX illumination are not confirmed · Matrix ${matrixBri} · AUX command ${auxBri}.`
        : pendingRevision === revision
          ? `Command accepted · revision ${revision} pending device confirmation · Matrix ${matrixBri} · Underglow ${auxBri}.`
          : `Device command not acknowledged · revision ${revision} is not confirmed on both devices · Matrix ${matrixBri} · AUX command ${auxBri}. See System Info.`;
  } else {
    statusNode.textContent = "Cart is not initialized; no control was sent.";
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

function queueTune(delay = 0) {
  if (hydrating) return;
  tuneDirty = true;
  clearTimeout(tuneTimer);
  tuneTimer = setTimeout(() => {
    tuneTimer = null;
    flushTune().catch(showError);
  }, delay);
}

async function flushTune() {
  clearTimeout(tuneTimer);
  tuneTimer = null;
  if (tuneInFlight) return;
  if (!tuneDirty) return;

  tuneInFlight = true;
  try {
    while (tuneDirty) {
      tuneDirty = false;
      const payload = readTunePayload();

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await call({
            action: "command",
            commandId: newCommandId(),
            type: "TUNE",
            payload,
            expectedRevision: revision,
          });
          revision = result.revision;
          pendingRevision = revision;
          statusNode.textContent = `Tuning accepted · revision ${revision} pending device confirmation.`;
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
  } finally {
    tuneInFlight = false;
  }

  for (let i = 0; i < 12; i++) {
    const snap = await refresh({ hydrate: false });
    const observed = Array.isArray(snap.observed) ? snap.observed : [];
    const applied = snap.desired && observed.length >= 2 && observed.every(x => Number(x.desired_revision) === Number(snap.desired.revision) && ["online","off"].includes(String(x.status)) && x.reported && x.reported.confirmed === true);
    if (applied) {
      pendingRevision = null;
      hydrateControls(snap.desired.state);
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  await refresh({ hydrate: true });
}

async function command(type, payload = {}) {
  await flushTune();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await call({
        action: "command",
        commandId: newCommandId(),
        type,
        payload: payload,
        expectedRevision: revision,
      });
      revision = result.revision;
      pendingRevision = revision;
      statusNode.textContent = `Command accepted · revision ${revision} pending device confirmation (checking for up to 6 seconds).`;
      const deadline = Date.now() + 6000;
      let latest = null;
      do {
        latest = await refresh({ hydrate: false });
        const observed = Array.isArray(latest.observed) ? latest.observed : [];
        const reports = observed.filter(x => Number(x.desired_revision) === Number(revision));
        const failed = reports.some(x => x.status === "failed" || (x.reported && x.reported.confirmed === false && x.reported.error));
        const confirmed = reports.length >= 2 && reports.every(x => ["online","off"].includes(String(x.status)) && x.reported && x.reported.confirmed === true);
        if (failed || confirmed) break;
        if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 750));
      } while (Date.now() < deadline);
      await refresh({ hydrate: false });
      return;
    } catch (error) {
      if (error.status === 409 && error.data && error.data.error === "stale_revision" && attempt === 0) {
        await refresh({ hydrate: false });
        continue;
      }
      throw error;
    }
  }
}

window.HBNFCanonical = {
  command: command,
  refresh: refresh,
  flushTune: flushTune,
  getRevision: function(){ return revision; },
  getCapabilities: function(){ return canonicalCapabilities; },
  read: function(action, payload) {
    return call(Object.assign({action:action}, payload || {}));
  },
  overlay: function(kind, data, ttlMs) {
    const maxDuration = kind === "scoreboard" ? 120000 : 30000;
    const duration = Number.isFinite(Number(ttlMs)) ? Math.max(1000, Math.min(maxDuration, Math.round(Number(ttlMs)))) : (kind === "scoreboard" ? 22000 : 8000);
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
  if (!pairAcceptPanel) return;
  pairAcceptPanel.hidden = !pendingPairToken;
  if (pendingPairToken && pairAcceptStatus) pairAcceptStatus.textContent = "Pairing link recognized. Tap Pair this device once.";
}

$("#acceptPair").addEventListener("click", async () => {
  if (!pendingPairToken) return;
  localStorage.setItem(DEVICE_STORAGE_KEY, pendingPairToken);
  writeDeviceCookie(pendingPairToken);
  pendingPairToken = null;
  history.replaceState(null, "", location.pathname + location.search);
  pairAcceptPanel.hidden = true;
  pairAcceptStatus.textContent = "";
  try {
    await refresh();
    statusNode.textContent += "\nThis device is paired for approximately 180 days.";
  } catch (error) {
    clearDeviceCredential();
    showError(error);
  }
});

$("#createPair").addEventListener("click", async () => {
  pairCreateStatus.textContent = "Creating private pairing link…";
  pairLinkNode.hidden = true;
  sharePair.hidden = true;
  copyPair.hidden = true;
  try {
    const out = await call({ action: "pair_device", label: "HBNF iPhone/iPad" });
    currentPairLink = `${location.origin}${location.pathname}#pair=${encodeURIComponent(out.deviceToken)}`;
    pairLinkNode.value = currentPairLink;
    pairLinkNode.hidden = false;
    sharePair.hidden = !("share" in navigator);
    copyPair.hidden = false;
    pairCreateStatus.textContent = `Link created. Device access expires ${new Date(out.expiresAt).toLocaleDateString()}.`;
  } catch (error) {
    pairCreateStatus.textContent = `Could not create pairing link: ${error.message}`;
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
    if (!error || error.name !== "AbortError") pairCreateStatus.textContent = `Share failed: ${error && error.message ? error.message : "unknown error"}`;
  }
});

copyPair.addEventListener("click", async () => {
  if (!currentPairLink) return;
  await copyTextLegacy(currentPairLink);
  pairCreateStatus.textContent = "Pairing link copied.";
});

document.querySelectorAll("[data-command]").forEach(button => {
  button.addEventListener("click", () => command(button.dataset.command).catch(showError));
});

if (guestModeToggle) {
  guestModeToggle.addEventListener("change", async () => {
    const enabled = guestModeToggle.checked;
    guestModeToggle.disabled = true;
    if (guestModeStatus) guestModeStatus.textContent = enabled ? "Opening Guest Mode…" : "Closing Guest Mode…";
    try {
      await command("GUEST_MODE", { enabled });
    } catch (error) {
      guestModeToggle.checked = !enabled;
      if (guestModeStatus) guestModeStatus.textContent = "Guest Mode change was not accepted.";
      showError(error);
    } finally {
      guestModeToggle.disabled = !validDeviceToken(deviceToken());
    }
  });
}

document.querySelectorAll(".vibe-option").forEach(button => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    command("VIBE", { vibe: button.dataset.vibe }).catch(showError);
  });
});
$("#vibeAuto").addEventListener("click", () => {
  if (!$("#vibeAuto").disabled) command("VIBE_AUTO").catch(showError);
});

for (const id of ["scene", "audioProfile", "audioStyle"]) {
  $(id).addEventListener("change", () => queueTune(0));
}

for (const [inputId, outputId] of [
  ["matrixBrightness", "matrixValue"],
  ["auxBrightness", "auxValue"],
  ["micSensitivity", "micSensitivityValue"],
]) {
  $(inputId).addEventListener("input", event => {
    $(outputId).value = event.target.value;
  });
  $(inputId).addEventListener("change", () => queueTune(0));
}

for (const id of ["energy", "audioResponse", "motion", "variation"]) {
  const output = $(`${id}Value`);
  $(id).addEventListener("input", event => { output.value = event.target.value; });
  $(id).addEventListener("change", () => queueTune(0));
}

$("#refresh").addEventListener("click", () => refresh().catch(showRefreshError));

function showRefreshError(error) {
  statusNode.textContent = `Cart service unavailable · this status check sent no control or scoring command. ${error.message}`;
}

function showError(error) {
  statusNode.textContent = pendingRevision !== null
    ? `Cart change accepted · revision ${pendingRevision}; device confirmation unavailable. ${error.message}`
    : `No change confirmed: ${error.message}`;
}

detectPairFragment();
setAuthorizedUi();
statusNode.textContent = "Connecting…";
refresh().catch(showRefreshError);

window.addEventListener("online", () => {
  if (!document.hidden && !tuneInFlight && !tuneDirty) refresh().catch(showRefreshError);
});
window.addEventListener("offline", () => {
  statusNode.textContent = "OFFLINE · no change sent. Current cart show continues locally; reconnect to control or score.";
});

setInterval(() => {
  if (!document.hidden && !tuneInFlight && !tuneDirty) refresh().catch(showRefreshError);
}, 6000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !tuneInFlight && !tuneDirty) refresh().catch(showRefreshError);
});
