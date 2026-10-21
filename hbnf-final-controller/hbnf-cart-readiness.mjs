export function truthConnectedText(value) {
  const text = String(value ?? "").trim();
  if (/\b(?:DISCONNECTED|NOT\s+CONNECTED|NOT\s+READY|UNAVAILABLE|OFFLINE|DEGRADED|FAIL(?:ED)?|ERROR)\b/i.test(text)) return false;
  return /\b(?:CONNECTED|READY)\b/i.test(text);
}

export function readinessStatus(checks) {
  const values = Array.isArray(checks) ? checks.map(String) : [];
  if (values.some(value => /\b(?:FAIL|BLOCKED)\b/i.test(value))) return "NOT READY";
  if (values.some(value => /\b(?:CHECK|UNAVAILABLE|DEGRADED|OFFLINE|UNKNOWN|NOT\s+EXPOSED|NO\s+ACTIVE|NO\s+SCORE)\b/i.test(value))) return "DEGRADED";
  return "READY";
}

export function scoreFeedStatus(response) {
  const live = response?.live;
  if (!live || typeof live !== "object") return "Score feed FAIL · response missing";
  if (live.active !== true) return "Score feed NO ACTIVE ROUND · source freshness not exposed";
  const rows = Array.isArray(live.entries) ? live.entries.length : 0;
  if (!rows) return "Score feed NO SCORE ROWS · source freshness not exposed";
  return `Score feed ACTIVE · ${String(live.label || "round")} · ${rows} rows · source freshness not exposed`;
}
