const validLevel = (value) => Number.isInteger(value) && value >= 0 && value <= 255;

export async function proxyUvAction(action, request, {
  operatorAuthorized = false,
  pairedDeviceAuthorized = false,
  endpoint,
  serviceKey,
  anonKey,
  fetchImpl = fetch,
} = {}) {
  if (!operatorAuthorized && !pairedDeviceAuthorized) {
    return { status: 403, body: { error: "owner_authorization_required" } };
  }
  if (action === "uv_status") {
    try {
      const upstream = await fetchImpl(endpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: anonKey, "Cache-Control": "no-store" },
      });
      if (!upstream.ok) return { status: 503, body: { error: "uv_status_unavailable" } };
      const status = await upstream.json().catch(() => ({}));
      return { status: 200, body: {
        ok: true,
        action: "uv_status",
        enabled: status.enabled === true,
        uvControlEnabled: status.uvControlEnabled === true,
        rhythmSignalReady: false,
      } };
    } catch {
      return { status: 503, body: { error: "uv_status_unavailable" } };
    }
  }
  if (action !== "uv_policy") return { status: 400, body: { error: "unknown_uv_action" } };

  const mode = String(request?.mode ?? "").toUpperCase();
  const levels = request?.brightnessBySegment;
  // Follow Matrix is implemented locally by the AUX WLED effect. The proxy
  // forwards only the owner-selected per-channel caps; it never accepts an
  // audio envelope from the browser.
  if (!["OFF", "MANUAL", "FOLLOW_MATRIX"].includes(mode) || !levels || typeof levels !== "object" ||
      !validLevel(levels.main) || !validLevel(levels.short)) {
    return { status: 400, body: { error: "invalid_uv_request", mutationIssued: false } };
  }
  try {
    const upstream = await fetchImpl(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: anonKey, "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ action: "uv_policy", mode, brightnessBySegment: { main: levels.main, short: levels.short } }),
    });
    const body = await upstream.json().catch(() => ({ error: "invalid_aux_response", mutationIssued: "unknown" }));
    return { status: upstream.status, body };
  } catch {
    return { status: 503, body: { error: "uv_request_result_unknown", mutationIssued: "unknown" } };
  }
}
