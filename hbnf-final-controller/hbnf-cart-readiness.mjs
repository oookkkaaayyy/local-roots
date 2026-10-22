export function truthConnectedText(value) {
  const text = String(value == null ? "" : value).trim();
  if (/\b(?:DISCONNECTED|NOT\s+CONNECTED|NOT\s+READY|UNAVAILABLE|OFFLINE|DEGRADED|FAIL(?:ED)?|ERROR)\b/i.test(text)) return false;
  return /\b(?:CONNECTED|READY)\b/i.test(text);
}

export function readinessStatus(checks) {
  const values = Array.isArray(checks) ? checks.map(String) : [];
  if (!values.length) return "NOT READY";
  if (values.some(value => /\b(?:FAIL|BLOCKED)\b/i.test(value))) return "NOT READY";
  const required = ["Matrix API", "Matrix device", "AUX device", "Score feed"];
  if (required.some(name => !values.some(value => value.startsWith(name + " ")))) return "NOT READY";
  if (values.some(value => /\b(?:CHECK|UNAVAILABLE|DEGRADED|OFFLINE|UNKNOWN|NOT\s+EXPOSED|NO\s+ACTIVE|NO\s+SCORE|STALE|UNCONFIRMED|UNVERIFIED)\b/i.test(value))) return "DEGRADED";
  if (required.some(name => !values.some(value => value.startsWith(name + " PASS") || (name === "Score feed" && value.startsWith("Score feed ACTIVE"))))) return "DEGRADED";
  return "READY";
}

export function deviceReadinessChecks(snapshot, nowMs = Date.now(), maxAgeMs = 90000) {
  const desiredRevision = Number(snapshot && snapshot.desired && snapshot.desired.revision);
  const observed = Array.isArray(snapshot && snapshot.observed) ? snapshot.observed : [];
  const devices = (snapshot && snapshot.devices) || {};
  return ["matrix", "aux"].map(id => {
    const label = id === "matrix" ? "Matrix" : "AUX";
    const device = devices[id];
    const report = observed.find(item => item && item.device_id === id);
    if (!Number.isSafeInteger(desiredRevision) || !device || !report) return `${label} device UNCONFIRMED · status missing`;
    if (device.confirmed !== true || Number(device.confirmedRevision) !== desiredRevision ||
        Number(report.desired_revision) !== desiredRevision || !report.reported || report.reported.confirmed !== true ||
        !["online", "off"].includes(String(report.status))) {
      return `${label} device UNCONFIRMED · readback not confirmed for current revision`;
    }
    const observedAt = Date.parse(report.observed_at || "");
    const age = nowMs - observedAt;
    if (!Number.isFinite(observedAt) || age < 0 || age > maxAgeMs) return `${label} device STALE · readback is not current`;
    if (id === "aux" && report.reported.ddp !== true) return "AUX device DEGRADED · Matrix DDP receiver is not confirmed";
    return `${label} device PASS · readback confirmed`;
  });
}

export function scoreFeedStatus(response) {
  const live = response && response.live;
  if (!live || typeof live !== "object") return "Score feed (this iPad → cloud) FAIL · response missing";
  if (live.active !== true) return "Score feed (this iPad → cloud) NO ACTIVE ROUND · source freshness not exposed";
  const rows = Array.isArray(live.entries) ? live.entries.length : 0;
  if (!rows) return "Score feed (this iPad → cloud) NO SCORE ROWS · source freshness not exposed";
  return `Score feed (this iPad → cloud) ACTIVE · ${String(live.label || "round")} · ${rows} rows · source freshness not exposed`;
}

export function localLinkStatusText(snapshot, attemptStatus) {
  if (snapshot && snapshot.local === true) return "Reachable";
  if (attemptStatus === "unavailable") return "Not reachable";
  if (attemptStatus === "checking") return "Checking…";
  return "Not checked";
}

export function courseScoreLabel(response, requestFailed = false, cacheAgeMs = null, nowMs = Date.now()) {
  if (requestFailed || !response || typeof response !== "object" || !response.live || typeof response.live !== "object") {
    if (!Number.isFinite(cacheAgeMs)) return "Unavailable";
    return cacheAgeMs > 10 * 60 * 1000 ? "Saved copy · old" : "Saved copy · recent";
  }
  if (response.live.active !== true) return "No active round";
  const sourceTime = Date.parse(response.updated_at || response.live.updated_at || "");
  if (!Number.isFinite(sourceTime)) return "Loaded · age unverified";
  const age = nowMs - sourceTime;
  if (age < 0) return "Loaded · age unverified";
  return age <= 10 * 60 * 1000 ? "Current" : "Old · refresh needed";
}

export function courseInternetCloudLabel(internetState, cloudState) {
  if (internetState === "reachable" && cloudState === "reachable") return "Internet and cloud available";
  if (cloudState === "reachable") return "Cloud available · internet check not confirmed";
  if (internetState === "reachable" && cloudState === "unavailable") return "Internet available · cloud unavailable";
  if (internetState === "checking" || cloudState === "checking") return "Checking…";
  if (internetState === "reachable") return "Internet available · cloud not checked";
  return "Not confirmed";
}

export function matrixRelayLabel(revisionState, reachable = true) {
  if (!reachable || !["aligned", "stale"].includes(revisionState)) return "Unconfirmed";
  return revisionState === "aligned" ? "Confirmed · display not visually checked" : "Older · display not visually checked";
}

export function guestDefaultEnableNeeded(state, migrationApplied) {
  return !migrationApplied && !!state && state.guestMode !== true;
}

export function scoringCloudStatusText(response, requestFailed = false) {
  if (requestFailed) return "Not confirmed · this iPad’s score-cloud request failed";
  if (!response || typeof response !== "object") return "Not checked";
  if (!response.live || typeof response.live !== "object") return "Response received · score data missing";
  return "Reachable from this iPad · score endpoint responded";
}

export function hbnfEndpointReachabilityText(state) {
  if (state === "unverified") return "Unconfirmed";
  if (state === "checking") return "Checking…";
  if (state === "reachable") return "Available";
  return "Not checked";
}

export function scoreFreshnessLabel() {
  return "Update age not available";
}

export function deviceEvidenceLabel(snapshot, id, nowMs = Date.now(), maxAgeMs = 90000) {
  const isMatrix = id === "matrix";
  const physical = isMatrix ? "display not visually confirmed" : "light not physically confirmed";
  const missing = `No current report · command ack unconfirmed · ${physical}`;
  const desiredRevision = Number(snapshot && snapshot.desired && snapshot.desired.revision);
  const devices = snapshot && snapshot.devices || {};
  const observed = Array.isArray(snapshot && snapshot.observed) ? snapshot.observed : [];
  const device = devices[id];
  const report = observed.find(item => item && item.device_id === id);
  if (!Number.isSafeInteger(desiredRevision) || !device || !report) return missing;
  if (!["online", "off"].includes(String(report.status))) {
    if (report.status === "failed" || (report.reported && report.reported.error)) return `Device reports failure · ${physical}`;
    return missing;
  }
  const observedAt = Date.parse(report.observed_at || "");
  const age = nowMs - observedAt;
  if (!Number.isFinite(observedAt) || age < 0 || age > maxAgeMs) return `Status stale · command ack not current · ${physical}`;
  if (report.online === false) return `Offline · command ack not current · ${physical}`;
  const acknowledged = device.confirmed === true && Number(device.confirmedRevision) === desiredRevision &&
    Number(report.desired_revision) === desiredRevision && report.reported && report.reported.confirmed === true;
  const state = report.status === "off" ? "Reachable · reports off" : "Reachable";
  const ack = acknowledged ? "command ack current" : "command ack unconfirmed";
  const sync = !isMatrix ? ` · DDP ${report.reported && report.reported.ddp === true ? "confirmed" : "unconfirmed"}` : "";
  return `${state} · ${ack}${sync} · ${physical}`;
}
