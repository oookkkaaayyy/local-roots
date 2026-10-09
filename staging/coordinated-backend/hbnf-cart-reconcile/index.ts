import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { canCarryForwardObservation, classifyFoundationInvocation } from "./foundation-result.ts";

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
  const requestedTargets = Array.isArray(body.targetDevices)
    ? body.targetDevices.filter((x): x is typeof DEVICES[number] => DEVICES.includes(x as typeof DEVICES[number]))
    : [...DEVICES];
  const targetDevices = [...new Set(requestedTargets)];
  // Foundation architecture: Matrix owns the AUX render/brightness via DDP.
  // Any AUX-targeted semantic change must therefore wake the Matrix adapter.
  const effectiveTargets = new Set(targetDevices);
  if (effectiveTargets.has("aux")) effectiveTargets.add("matrix");
  const projections = DEVICES.map((deviceId) => ({
    cartId: body.cartId, deviceId, cartRevision: cart.revision, fenceEpoch: fence.epoch, release: fence.release_id,
    enabled: state.power === "on" && profiles[deviceId].enabled !== false,
    brightness: profiles[deviceId].brightness,
    auxBrightness: profiles.aux.brightness,
    brightnessProfileRevision: profiles[deviceId].profileRevision,
    programMode: state.programMode, sceneId: state.sceneId, paletteId: state.paletteId,
    vibe: state.vibe, tempoMode: "manual", speedBias: state.manualSpeedBias ?? 1,
    sequenceCursor: state.sequenceCursor,
    tuning: {
      micSensitivity: state.tuning?.micSensitivity ?? 255,
      audioProfile: state.tuning?.audioProfile ?? "scene",
      audioStyle: state.tuning?.audioStyle ?? "scene",
      responseBoost: state.tuning?.responseBoost ?? 1,
      variation: state.tuning?.variation ?? 85,
      energy: state.tuning?.energy ?? 65,
      audioResponse: state.tuning?.audioResponse ?? 75,
      motion: state.tuning?.motion ?? 60,
    },
    commandType: typeof body.commandType === "string" ? body.commandType : null,
    fastBrightness: body.fastBrightness === true,
    audio: {
      bass: state.music?.bass ?? 0, mids: state.music?.mids ?? 0, treble: state.music?.treble ?? 0,
      bassIntensity: state.music?.bassAccent ?? 0, midsIntensity: state.music?.midsAccent ?? 0, trebleIntensity: state.music?.trebleAccent ?? 0,
      onset: state.music?.onset ?? 0, accentsOnly: true,
    },
    overlay: [...(state.overlays ?? [])].filter((x: Record<string, unknown>) => Number(x.expiresAt) > Date.now()).sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.priority) - Number(a.priority))[0] ?? null,
    applyCompleteProjection: true,
  }));

  const applyProjection = async (projection: (typeof projections)[number]) => {
    try {
      if (projection.deviceId !== "matrix") throw new Error("foundation_aux_is_matrix_owned");
      const functionName = "hbnf-matrix-adapter-foundation";
      const { data: ack, error: invokeError } = await db.functions.invoke(functionName, { body: projection });
      const outcome = await classifyFoundationInvocation(invokeError, ack, projection);
      if (!outcome.ok) throw new Error(outcome.failureCode);

      const { data: contextNow, error: contextNowError } = await db.rpc("hbnf_cart_get_context", { p_cart_id: body.cartId });
      const fenceNow = contextNow?.fence as { epoch: number; release_id: string; active: boolean } | null;
      const cartNow = contextNow?.desired as { revision: number } | null;
      if (contextNowError || !fenceNow?.active || fenceNow.epoch !== fence.epoch || fenceNow.release_id !== fence.release_id || cartNow?.revision !== projection.cartRevision) throw new Error("state_or_fence_advanced");

      const { error: writeError } = await db.rpc("hbnf_cart_upsert_observed", {
        p_cart_id: body.cartId, p_device_id: projection.deviceId, p_online: true, p_status: "submitted",
        p_desired_revision: projection.cartRevision, p_fence_epoch: projection.fenceEpoch, p_release_id: projection.release,
        p_boot_id: ack.bootId ?? null, p_reported: ack, p_observed_at: new Date().toISOString(),
      });
      if (writeError) throw new Error("observed_state_write_failed");
      return { deviceId: projection.deviceId, status: outcome.status };
    } catch (error) {
      const { error: writeError } = await db.rpc("hbnf_cart_upsert_observed", {
        p_cart_id: body.cartId, p_device_id: projection.deviceId, p_online: false, p_status: "failed",
        p_desired_revision: projection.cartRevision, p_fence_epoch: projection.fenceEpoch, p_release_id: projection.release,
        p_boot_id: null, p_reported: { error: String((error as Error)?.message ?? error) }, p_observed_at: new Date().toISOString(),
      });
      return { deviceId: projection.deviceId, status: writeError ? "failed_unrecorded" : "failed" };
    }
  };

  const carryForward = async (deviceId: typeof DEVICES[number]) => {
    const { data: prior, error: priorError } = await db.rpc("hbnf_cart_get_observed", { p_cart_id: body.cartId, p_device_id: deviceId });
    if (priorError || !canCarryForwardObservation(prior, cart.revision, fence.epoch, fence.release_id)) {
      return { deviceId, status: "carry_unavailable" };
    }
    const { error: writeError } = await db.rpc("hbnf_cart_upsert_observed", {
      p_cart_id: body.cartId, p_device_id: deviceId, p_online: prior.online === true, p_status: prior.status,
      p_desired_revision: cart.revision, p_fence_epoch: fence.epoch, p_release_id: fence.release_id,
      p_boot_id: prior.boot_id ?? null, p_reported: prior.reported ?? {}, p_observed_at: new Date().toISOString(),
    });
    return { deviceId, status: writeError ? "carry_failed" : "carried" };
  };

  const targets = projections.filter((p) => p.deviceId === "matrix" && effectiveTargets.has("matrix"));
  const results: {deviceId:string,status:string}[] = [];

  if (targets.length) {
    const matrixResult = await applyProjection(targets[0]);
    results.push(matrixResult);

    // AUX is no longer a separately commanded cloud device. Matrix owns the
    // 22-pixel Companion render and DDP transport. Record the requested AUX
    // state at this revision without falsely claiming physical confirmation.
    const matrixProjection = targets[0];
    const { error: auxProxyError } = await db.rpc("hbnf_cart_upsert_observed", {
      p_cart_id: body.cartId, p_device_id: "aux", p_online: false,
      p_status: "submitted",
      p_desired_revision: cart.revision, p_fence_epoch: fence.epoch, p_release_id: fence.release_id,
      p_boot_id: null,
      p_reported: {
        confirmed: false,
        semanticConfirmation: false,
        requestedEnabled: matrixProjection.enabled,
        transport: "matrix-native-ddp",
        driver: "matrix-ddp-proxy",
        cartRevision: cart.revision,
        brightness: matrixProjection.auxBrightness,
        matrixTransportStatus: matrixResult.status
      },
      p_observed_at: new Date().toISOString(),
    });
    results.push({deviceId:"aux",status:auxProxyError?"proxy_failed":"submitted"});
  } else {
    results.push(...await Promise.all(DEVICES.map((deviceId) => carryForward(deviceId))));
  }

  const good = new Set(["applied","off","carried","submitted"]);
  const status = results.every((x) => x.status === "off")
    ? "off"
    : results.every((x) => good.has(x.status)) ? "submitted" : "degraded";
  return reply({
    cartRevision: cart.revision,
    fenceEpoch: fence.epoch,
    targetDevices,
    effectiveTargets:[...effectiveTargets],
    architecture:"foundation-matrix-owned-aux-ddp",
    status,
    results
  });
});
