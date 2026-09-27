import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("HBNF_CART_ALLOWED_ORIGIN") ?? "https://hbnightflyers.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hbnf-device",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const required = (value: unknown, max = 128) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const devices = ["matrix", "aux"] as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) return response({ error: "server_config_missing" }, 500);
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let authorized = false;
  let operatorAuthorized = false;
  const authorization = req.headers.get("Authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    const auth = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: user, error: userError } = await auth.auth.getUser();
    if (!userError && user.user) {
      const { data: allowed, error: adminError } = await service.rpc("hbnf_cart_operator_is_allowed", { p_user_id: user.user.id });
      operatorAuthorized = !adminError && allowed === true;
      authorized = operatorAuthorized;
    }
  }

  if (!authorized) {
    const deviceToken = req.headers.get("x-hbnf-device") ?? "";
    if (deviceToken) {
      const digest = await sha256Hex(deviceToken);
      const { data: valid, error: deviceError } = await service.rpc("hbnf_cart_device_session_valid", { p_session_hash: digest });
      authorized = !deviceError && valid === true;
    }
  }

  // Preserve the earlier cookie path as a backward-compatible fallback.
  if (!authorized) {
    const cookie = req.headers.get("Cookie") ?? "";
    const match = cookie.match(/(?:^|;\s*)hbnf_cart_device=([^;]+)/);
    if (match?.[1]) {
      const deviceToken = decodeURIComponent(match[1]);
      const digest = await sha256Hex(deviceToken);
      const { data: valid, error: deviceError } = await service.rpc("hbnf_cart_device_session_valid", { p_session_hash: digest });
      authorized = !deviceError && valid === true;
    }
  }

  if (!authorized) return response({ error: "unauthorized" }, 401);

  let request: Record<string, unknown>;
  try { request = await req.json(); } catch { return response({ error: "invalid_json" }, 400); }
  const action = String(request.action ?? "");

  if (action === "pair_device") {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const deviceToken = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    const tokenHash = await sha256Hex(deviceToken);
    const label = required(request.label, 80) ? String(request.label).trim() : "HBNF paired device";
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const { data: created, error: pairError } = await service.rpc("hbnf_cart_create_device_session", {
      p_session_hash: tokenHash,
      p_label: label,
      p_expires_at: expiresAt,
    });
    if (pairError || created !== true) return response({ error: "pairing_create_failed" }, 500);
    return response({ deviceToken, expiresAt });
  }

  if (action === "status") {
    const { data: snapshot, error: statusError } = await service.rpc("hbnf_cart_get_status", { p_cart_id: "hbnf-cart" });
    if (statusError || !snapshot) return response({ error: "state_read_failed" }, 500);
    return response(snapshot);
  }
  if (action !== "command" || !required(request.commandId, 80) || !required(request.type, 48) || !Number.isSafeInteger(request.expectedRevision) || Number(request.expectedRevision) < 0 || !request.payload || typeof request.payload !== "object") {
    return response({ error: "invalid_command" }, 400);
  }
  const { data: context, error: readError } = await service.rpc("hbnf_cart_get_context", { p_cart_id: "hbnf-cart" });
  const row = context?.desired as { revision: number; state: Record<string, unknown> } | null;
  const fence = context?.fence as { epoch: number; release_id: string; active: boolean } | null;
  if (readError || !row || !fence?.active) return response({ error: "cart_not_ready" }, 503);
  if (request.expectedRevision !== row.revision) return response({ error: "stale_revision", currentRevision: row.revision }, 409);
  const next = reduce(row.state, String(request.type), request.payload as Record<string, unknown>, request.commandId as string, row.revision);
  if (!next) return response({ error: "command_rejected" }, 400);
  const { data: committed, error: commitError } = await service.rpc("hbnf_cart_commit_command_bridge", {
    p_cart_id: "hbnf-cart", p_command_id: request.commandId, p_command_type: request.type,
    p_expected_revision: row.revision, p_next_state: next,
  }).single();
  if (commitError) return response({ error: commitError.code === "40001" ? "stale_revision" : "command_commit_failed" }, commitError.code === "40001" ? 409 : 500);
  const revision = Number((committed as Record<string, unknown>).result_revision);
  const reconcileResponse = await fetch(`${url}/functions/v1/hbnf-cart-reconcile`, {
    method: "POST", headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ cartId: "hbnf-cart", revision, releaseId: fence.release_id, fenceEpoch: fence.epoch }),
  });
  return response({ revision, duplicate: Boolean((committed as Record<string, unknown>).duplicate), reconciliation: reconcileResponse.ok ? await reconcileResponse.json() : { status: "pending", httpStatus: reconcileResponse.status } }, 202);
});

function reduce(state: Record<string, unknown>, type: string, payload: Record<string, unknown>, commandId: string, revision: number) {
  const next = structuredClone(state) as Record<string, unknown>;
  const devicesState = structuredClone((state.devices ?? {}) as Record<string, Record<string, unknown>>);
  switch (type) {
    case "OFF": next.power = "off"; break;
    case "ON": next.power = "on"; break;
    case "NEXT": next.sequenceCursor = Number(next.sequenceCursor ?? 0) + 1; next.programMode = "auto"; break;
    case "AUTO": next.programMode = "auto"; break;
    case "LOCK": next.programMode = "lock"; break;
    case "SCENE": if (!required(payload.sceneId, 80) || ["brightness", "power", "deviceProfiles"].some(k => JSON.stringify(payload).toLowerCase().includes(k.toLowerCase()))) return null; next.sceneId = payload.sceneId; next.programMode = "lock"; break;
    case "PALETTE": if (!required(payload.paletteId, 80)) return null; next.paletteId = payload.paletteId; break;
    case "TUNE": {
      let changed = false;
      const tune = structuredClone((state.tuning ?? {}) as Record<string, unknown>);

      if (payload.sceneId !== undefined) {
        if (!required(payload.sceneId, 80) || !["course-flow","field-mix","hbnf-signature","quiet-cosmos"].includes(String(payload.sceneId))) return null;
        next.sceneId = String(payload.sceneId);
        changed = true;
      }
      if (payload.paletteId !== undefined) {
        if (!required(payload.paletteId, 80)) return null;
        next.paletteId = String(payload.paletteId);
        changed = true;
      }
      if (payload.vibe !== undefined) {
        if (!["mellow","moderate","energetic","peak"].includes(String(payload.vibe))) return null;
        next.vibe = String(payload.vibe);
        next.vibeMode = "manual";
        changed = true;
      }
      if (payload.speedBias !== undefined) {
        if (!Number.isFinite(payload.speedBias)) return null;
        next.manualSpeedBias = Math.max(0.5, Math.min(2, Number(payload.speedBias)));
        next.tempoMode = "manual";
        changed = true;
      }
      if (payload.tempoMode !== undefined) {
        if (!["music","manual"].includes(String(payload.tempoMode))) return null;
        next.tempoMode = String(payload.tempoMode);
        changed = true;
      }
      if (payload.matrixBrightness !== undefined) {
        if (!Number.isFinite(payload.matrixBrightness)) return null;
        const profile = devicesState.matrix;
        const value = clamp(Number(payload.matrixBrightness), 0, 255);
        if (Number(profile.brightness) !== value) profile.profileRevision = Number(profile.profileRevision ?? 0) + 1;
        profile.brightness = value;
        profile.brightnessLocked = true;
        changed = true;
      }
      if (payload.auxBrightness !== undefined) {
        if (!Number.isFinite(payload.auxBrightness)) return null;
        const profile = devicesState.aux;
        const value = clamp(Number(payload.auxBrightness), 0, 255);
        if (Number(profile.brightness) !== value) profile.profileRevision = Number(profile.profileRevision ?? 0) + 1;
        profile.brightness = value;
        profile.brightnessLocked = true;
        changed = true;
      }
      if (payload.micSensitivity !== undefined) {
        if (!Number.isFinite(payload.micSensitivity)) return null;
        tune.micSensitivity = clamp(Number(payload.micSensitivity), 64, 255);
        changed = true;
      }
      if (payload.audioProfile !== undefined) {
        if (!["scene","bass","mid","balanced","treble","full","impact"].includes(String(payload.audioProfile))) return null;
        tune.audioProfile = String(payload.audioProfile);
        changed = true;
      }
      if (payload.audioStyle !== undefined) {
        if (!["scene","clean","punch","ring","spark","chroma","hybrid"].includes(String(payload.audioStyle))) return null;
        tune.audioStyle = String(payload.audioStyle);
        changed = true;
      }
      if (!changed) return null;
      next.tuning = tune;
      break;
    }
    case "VIBE": if (!["mellow", "moderate", "energetic", "peak"].includes(String(payload.vibe))) return null; next.vibe = payload.vibe; next.vibeMode = "manual"; break;
    case "VIBE_AUTO": next.vibeMode = "music"; break;
    case "TEMPO_AUTO": next.tempoMode = "music"; break;
    case "SPEED": if (!Number.isFinite(payload.speedBias)) return null; next.manualSpeedBias = clamp(Number(payload.speedBias), 0.5, 2); next.tempoMode = "manual"; break;
    case "BRIGHTNESS": {
      const id = payload.deviceId;
      if (!devices.includes(id as typeof devices[number]) || !Number.isFinite(payload.brightness)) return null;
      const profile = devicesState[String(id)]; profile.brightness = clamp(Number(payload.brightness), 0, 255); profile.brightnessLocked = true; profile.profileRevision = Number(profile.profileRevision ?? 0) + 1;
      break;
    }
    default: return null;
  }
  next.devices = devicesState; next.revision = revision + 1; next.lastCommandId = commandId;
  return next;
}
function clamp(value: number, min: number, max: number) { return Math.round(Math.min(max, Math.max(min, value))); }

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
}
