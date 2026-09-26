import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const devices = ["matrix", "aux"] as const;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bearer = req.headers.get("Authorization") ?? "";
  if (!url || !key || bearer !== `Bearer ${key}`) return reply({ error: "unauthorized" }, 401);
  let body: Record<string, unknown>; try { body = await req.json(); } catch { return reply({ error: "invalid_json" }, 400); }
  if (body.cartId !== "hbnf-cart" || !Number.isSafeInteger(body.revision) || !Number.isSafeInteger(body.fenceEpoch) || typeof body.releaseId !== "string") return reply({ error: "invalid_request" }, 400);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: cart, error: cartError }, { data: fence, error: fenceError }] = await Promise.all([
    db.schema("hbnf_internal").from("cart_desired_state").select("revision,state").eq("cart_id", body.cartId).maybeSingle(),
    db.schema("hbnf_internal").from("cart_actuator_fence").select("epoch,release_id,active").eq("cart_id", body.cartId).maybeSingle(),
  ]);
  if (cartError || fenceError || !cart || !fence?.active || cart.revision !== body.revision || fence.epoch !== body.fenceEpoch || fence.release_id !== body.releaseId) return reply({ error: "stale_fence_or_state" }, 409);
  const state = cart.state as Record<string, unknown>, profiles = state.devices as Record<string, Record<string, unknown>>;
  const base = url.replace(/\/$/, "");
  const matrixUrl = base + "/functions/v1/hbnf-matrix-adapter";
  const auxUrl = base + "/functions/v1/hbnf-aux-adapter";
  const matrixToken = key, auxToken = key;
  const projections = devices.map((deviceId) => ({
    cartId: body.cartId, deviceId, cartRevision: cart.revision, fenceEpoch: fence.epoch, release: fence.release_id,
    enabled: state.power === "on" && profiles[deviceId].enabled !== false,
    brightness: profiles[deviceId].brightness,
    brightnessProfileRevision: profiles[deviceId].profileRevision,
    programMode: state.programMode, sceneId: state.sceneId, paletteId: state.paletteId,
    vibe: state.vibe, tempoMode: state.tempoMode ?? "music", speedBias: state.effectiveMusicTempoBias ?? state.manualSpeedBias ?? 1,
    sequenceCursor: state.sequenceCursor, overlay: activeOverlay(state.overlays as Record<string, unknown>[] ?? []),
    applyCompleteProjection: true,
  }));
  const endpoints: Record<string, { url: string; token: string }> = { matrix: { url: matrixUrl, token: matrixToken }, aux: { url: auxUrl, token: auxToken } };
  const results = await Promise.all(projections.map(async (projection) => {
    const endpoint = endpoints[projection.deviceId];
    try {
      const applied = await fetch(endpoint.url, { method: "POST", headers: { Authorization: `Bearer ${endpoint.token}`, "Content-Type": "application/json" }, body: JSON.stringify(projection), signal: AbortSignal.timeout(6000) });
      const ack = await applied.json() as Record<string, unknown>;
      if (!applied.ok || ack.confirmed !== true || ack.deviceId !== projection.deviceId || ack.cartRevision !== projection.cartRevision || ack.fenceEpoch !== projection.fenceEpoch || ack.brightness !== projection.brightness || ack.enabled !== projection.enabled) throw new Error("invalid_or_mismatched_ack");
      const { data: fenceNow } = await db.schema("hbnf_internal").from("cart_actuator_fence").select("epoch,release_id,active").eq("cart_id", body.cartId).maybeSingle();
      const { data: cartNow } = await db.schema("hbnf_internal").from("cart_desired_state").select("revision").eq("cart_id", body.cartId).maybeSingle();
      if (!fenceNow?.active || fenceNow.epoch !== fence.epoch || fenceNow.release_id !== fence.release_id || cartNow?.revision !== projection.cartRevision) throw new Error("state_or_fence_advanced");
      const { error } = await db.schema("hbnf_internal").from("cart_device_observed").upsert({
        cart_id: body.cartId, device_id: projection.deviceId, online: true, status: projection.enabled ? "online" : "off",
        desired_revision: projection.cartRevision, fence_epoch: projection.fenceEpoch, release_id: projection.release,
        boot_id: ack.bootId ?? null, reported: ack, observed_at: new Date().toISOString(),
      });
      if (error) throw new Error("observed_state_write_failed");
      return { deviceId: projection.deviceId, status: projection.enabled ? "applied" : "off" };
    } catch (error) {
      const { error: writeError } = await db.schema("hbnf_internal").from("cart_device_observed").upsert({
        cart_id: body.cartId, device_id: projection.deviceId, online: false, status: "failed",
        desired_revision: projection.cartRevision, fence_epoch: projection.fenceEpoch, release_id: projection.release,
        reported: { error: String((error as Error)?.message ?? error) }, observed_at: new Date().toISOString(),
      });
      return { deviceId: projection.deviceId, status: writeError ? "failed_unrecorded" : "failed" };
    }
  }));
  return reply({ cartRevision: cart.revision, fenceEpoch: fence.epoch, status: results.every((x) => x.status === "applied" || x.status === "off") ? "applied" : "degraded", results });
});

function activeOverlay(items: Record<string, unknown>[]) {
  return [...(items ?? [])].filter((x) => Number(x.expiresAt) > Date.now()).sort((a, b) => Number(b.priority) - Number(a.priority))[0] ?? null;
}
