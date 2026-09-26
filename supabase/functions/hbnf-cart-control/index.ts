import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("HBNF_CART_ALLOWED_ORIGIN") ?? "https://hbnightflyers.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  const authorization = req.headers.get("Authorization") ?? "";
  if (!url || !anon || !serviceKey || !authorization.startsWith("Bearer ")) return response({ error: "unauthorized" }, 401);
  const auth = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: user, error: userError } = await auth.auth.getUser();
  if (userError || !user.user) return response({ error: "unauthorized" }, 401);
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: admin, error: adminError } = await service.schema("hbnf_internal").from("cart_operator_allowlist").select("user_id").eq("user_id", user.user.id).eq("active", true).maybeSingle();
  if (adminError || !admin) return response({ error: "forbidden" }, 403);

  let request: Record<string, unknown>;
  try { request = await req.json(); } catch { return response({ error: "invalid_json" }, 400); }
  const action = String(request.action ?? "");
  if (action === "status") {
    const [{ data: desired, error: desiredError }, { data: observed, error: observedError }] = await Promise.all([
      service.schema("hbnf_internal").from("cart_desired_state").select("cart_id,revision,state,updated_at").eq("cart_id", "hbnf-cart").maybeSingle(),
      service.schema("hbnf_internal").from("cart_device_observed").select("device_id,online,status,desired_revision,fence_epoch,release_id,boot_id,reported,observed_at").eq("cart_id", "hbnf-cart"),
    ]);
    if (desiredError || observedError) return response({ error: "state_read_failed" }, 500);
    return response({ desired, observed: observed ?? [] });
  }
  if (action !== "command" || !required(request.commandId, 80) || !required(request.type, 48) || !Number.isSafeInteger(request.expectedRevision) || Number(request.expectedRevision) < 0 || !request.payload || typeof request.payload !== "object") {
    return response({ error: "invalid_command" }, 400);
  }
  const [{ data: row, error: readError }, { data: fence, error: fenceError }] = await Promise.all([
    service.schema("hbnf_internal").from("cart_desired_state").select("revision,state").eq("cart_id", "hbnf-cart").maybeSingle(),
    service.schema("hbnf_internal").from("cart_actuator_fence").select("epoch,release_id,active").eq("cart_id", "hbnf-cart").maybeSingle(),
  ]);
  if (readError || fenceError || !row || !fence?.active) return response({ error: "cart_not_ready" }, 503);
  if (request.expectedRevision !== row.revision) return response({ error: "stale_revision", currentRevision: row.revision }, 409);
  const next = reduce(row.state, String(request.type), request.payload as Record<string, unknown>, request.commandId as string, row.revision);
  if (!next) return response({ error: "command_rejected" }, 400);
  const { data: committed, error: commitError } = await service.schema("hbnf_internal").rpc("hbnf_cart_commit_command", {
    p_cart_id: "hbnf-cart", p_command_id: request.commandId, p_command_type: request.type,
    p_expected_revision: row.revision, p_next_state: next,
  }).single();
  if (commitError) return response({ error: commitError.code === "40001" ? "stale_revision" : "command_commit_failed" }, commitError.code === "40001" ? 409 : 500);
  const revision = Number((committed as Record<string, unknown>).result_revision);
  // Transactional desired-state commit is authoritative. Reconciliation is always full-state and fenced.
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
