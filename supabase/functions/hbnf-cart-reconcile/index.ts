import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const DEVICES = ["matrix", "aux"] as const;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || (req.headers.get("Authorization") ?? "") !== `Bearer ${key}`) return reply({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "invalid_json" }, 400); }
  if (body.cartId !== "hbnf-cart" || !Number.isSafeInteger(body.revision) || !Number.isSafeInteger(body.fenceEpoch) || typeof body.releaseId !== "string") return reply({ error: "invalid_request" }, 400);

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: context, error: contextError } = await db.rpc("hbnf_cart_get_context", { p_cart_id: body.cartId });
  const cart = context?.desired as { revision: number; state: Record<string, unknown> } | null;
  const fence = context?.fence as { epoch: number; release_id: string; active: boolean } | null;
  if (contextError || !cart || !fence?.active || cart.revision !== body.revision || fence.epoch !== body.fenceEpoch || fence.release_id !== body.releaseId) return reply({ error: "stale_fence_or_state" }, 409);

  const state = cart.state as Record<string, any>, profiles = state.devices as Record<string, Record<string, any>>;
  const projections = DEVICES.map((deviceId) => ({
    cartId: body.cartId, deviceId, cartRevision: cart.revision, fenceEpoch: fence.epoch, release: fence.release_id,
    enabled: state.power === "on" && profiles[deviceId].enabled !== false,
    brightness: profiles[deviceId].brightness,
    brightnessProfileRevision: profiles[deviceId].profileRevision,
    programMode: state.programMode, sceneId: state.sceneId, paletteId: state.paletteId,
    vibe: state.vibe, tempoMode: state.tempoMode ?? "music", speedBias: state.effectiveMusicTempoBias ?? state.manualSpeedBias ?? 1,
    sequenceCursor: state.sequenceCursor,
    audio: {
      bass: state.music?.bass ?? 0, mids: state.music?.mids ?? 0, treble: state.music?.treble ?? 0,
      bassIntensity: state.music?.bassAccent ?? 0, midsIntensity: state.music?.midsAccent ?? 0, trebleIntensity: state.music?.trebleAccent ?? 0,
      onset: state.music?.onset ?? 0, accentsOnly: true,
    },
    overlay: [...(state.overlays ?? [])].filter((x: Record<string, unknown>) => Number(x.expiresAt) > Date.now()).sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.priority) - Number(a.priority))[0] ?? null,
    applyCompleteProjection: true,
  }));

  const results = await Promise.all(projections.map(async (projection) => {
    try {
      const functionName = projection.deviceId === "matrix" ? "hbnf-matrix-adapter" : "hbnf-aux-adapter";
      const { data: ack, error: invokeError } = await db.functions.invoke(functionName, { body: projection });
      if (invokeError || !ack || ack.confirmed !== true || ack.deviceId !== projection.deviceId || ack.cartRevision !== projection.cartRevision || ack.fenceEpoch !== projection.fenceEpoch || ack.brightness !== projection.brightness || ack.enabled !== projection.enabled) throw new Error("invalid_or_mismatched_ack");

      const { data: contextNow, error: contextNowError } = await db.rpc("hbnf_cart_get_context", { p_cart_id: body.cartId });
      const fenceNow = contextNow?.fence as { epoch: number; release_id: string; active: boolean } | null;
      const cartNow = contextNow?.desired as { revision: number } | null;
      if (contextNowError || !fenceNow?.active || fenceNow.epoch !== fence.epoch || fenceNow.release_id !== fence.release_id || cartNow?.revision !== projection.cartRevision) throw new Error("state_or_fence_advanced");

      const { error: writeError } = await db.rpc("hbnf_cart_upsert_observed", {
        p_cart_id: body.cartId, p_device_id: projection.deviceId, p_online: true, p_status: projection.enabled ? "online" : "off",
        p_desired_revision: projection.cartRevision, p_fence_epoch: projection.fenceEpoch, p_release_id: projection.release,
        p_boot_id: ack.bootId ?? null, p_reported: ack, p_observed_at: new Date().toISOString(),
      });
      if (writeError) throw new Error("observed_state_write_failed");
      return { deviceId: projection.deviceId, status: projection.enabled ? "applied" : "off" };
    } catch (error) {
      const { error: writeError } = await db.rpc("hbnf_cart_upsert_observed", {
        p_cart_id: body.cartId, p_device_id: projection.deviceId, p_online: false, p_status: "failed",
        p_desired_revision: projection.cartRevision, p_fence_epoch: projection.fenceEpoch, p_release_id: projection.release,
        p_boot_id: null, p_reported: { error: String((error as Error)?.message ?? error) }, p_observed_at: new Date().toISOString(),
      });
      return { deviceId: projection.deviceId, status: writeError ? "failed_unrecorded" : "failed" };
    }
  }));

  return reply({ cartRevision: cart.revision, fenceEpoch: fence.epoch, status: results.every((x) => x.status === "applied" || x.status === "off") ? "applied" : "degraded", results });
});