import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { isMetadataOnlyCommand, reduceCartCommand, reconcileTargetsForCommand, requiresOwnerAuthorization, runGuestCommand } from "./guest-command.ts";
import { chooseLive, projectSkinsForMatrix } from "./live.ts";
import { laDate, readSkinsScoreState, writeSkinsWinner, writeSkinsTiebreaker, writeSkinsAceWinner } from "./skins_scoring.ts";
import { phase2VibeReady } from "./runtime-vibe.ts";
import { handleMatrixRelay } from "./matrix-relay.ts";
declare const EdgeRuntime:{waitUntil(p:Promise<unknown>):void};

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("HBNF_CART_ALLOWED_ORIGIN") ?? "https://hbnightflyers.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hbnf-device",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
// Supabase routes the function-name prefix; Deno receives only this suffix path.
const matrixLivePath = "/rest/v1/league_state";
function matrixLiveCors(req:Request){
  const origin=req.headers.get("Origin")??"";
  const allowed=new Set([Deno.env.get("HBNF_CART_ALLOWED_ORIGIN")??"https://hbnightflyers.com","http://192.168.77.10"]);
  const headers:Record<string,string>={"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"apikey, authorization, accept","Access-Control-Max-Age":"300","Cache-Control":"no-store","Vary":"Origin"};
  if(allowed.has(origin))headers["Access-Control-Allow-Origin"]=origin;
  return headers;
}
const matrixLiveResponse=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...matrixLiveCors(req),"Content-Type":"application/json; charset=utf-8"}});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const required = (value: unknown, max = 128) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const devices = ["matrix", "aux"] as const;

Deno.serve(async (req: Request) => {
  if (req.headers.has("x-hbnf-relay-id")) return await handleMatrixRelay(req);
  const requestUrl=new URL(req.url),matrixLiveRead=requestUrl.pathname===matrixLivePath;
  if(matrixLiveRead&&req.method==="OPTIONS")return new Response("ok",{status:204,headers:matrixLiveCors(req)});
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST"&&!(matrixLiveRead&&req.method==="GET")) return response({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) return response({ error: "server_config_missing" }, 500);
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if(matrixLiveRead&&req.method==="GET"){
    if(requestUrl.searchParams.get("select")!=="state_json,updated_at"||requestUrl.searchParams.get("id")!=="eq.1"||[...requestUrl.searchParams.keys()].some(key=>key!=="select"&&key!=="id"))return matrixLiveResponse(req,{error:"invalid_live_projection_query"},400);
    if(req.headers.get("apikey")!==anon||req.headers.get("Authorization")!==`Bearer ${anon}`)return matrixLiveResponse(req,{error:"unauthorized"},401);
    const {data:league,error:liveError}=await service.from("league_state").select("skins:state_json->skins,updated_at").eq("id",1).single();
    if(liveError||!league)return matrixLiveResponse(req,{error:"live_state_read_failed"},500);
    const projected=projectSkinsForMatrix(league.skins,laDate());
    if(!projected)return matrixLiveResponse(req,{error:"skins_projection_missing"},503);
    const body=JSON.stringify([{state_json:projected,updated_at:league.updated_at}]);
    if(new TextEncoder().encode(body).byteLength>524288)return matrixLiveResponse(req,{error:"skins_projection_too_large"},413);
    return new Response(body,{headers:{...matrixLiveCors(req),"Content-Type":"application/json; charset=utf-8"}});
  }

  let request: Record<string, unknown>;
  try { request = await req.json(); } catch { return response({ error: "invalid_json" }, 400); }
  const action = String(request.action ?? "");
  const protectedAction = requiresOwnerAuthorization(action, request.type);

  let authorized = !protectedAction;
  let operatorAuthorized = false;
  let pairedDeviceAuthorized = false;
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
      pairedDeviceAuthorized = authorized;
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
      pairedDeviceAuthorized = authorized;
    }
  }

  if (!authorized) return response({ error: "unauthorized" }, 401);

  if (["skins_score_state","skins_score_set","skins_tiebreaker_set","skins_ace_set"].includes(action)) {
    if (!operatorAuthorized && !pairedDeviceAuthorized) return response({ error: "owner_authorization_required" }, 403);
    const roundDate = required(request.round_date, 10) ? String(request.round_date).trim() : laDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(roundDate)) return response({ error: "invalid_round_date" }, 400);
    try {
      if (action === "skins_score_state") return response({ ok: true, ...(await readSkinsScoreState(service, roundDate)) });
      const sectionName = String(request.section ?? "");
      if (action === "skins_ace_set") {
        if (typeof request.winner_name !== "string" || typeof request.expected_winner_name !== "string") {
          return response({ error: "winner_name_and_expected_winner_name_required" }, 400);
        }
        const update = await writeSkinsAceWinner(service, {
          roundDate,
          sectionName,
          winnerName: request.winner_name,
          expectedWinnerName: request.expected_winner_name,
        });
        return response({ ok: true, action, ...update });
      }
      if (typeof request.winner_id !== "string" || typeof request.expected_winner_id !== "string") {
        return response({ error: "winner_id_and_expected_winner_id_required" }, 400);
      }
      const common = {
        roundDate,
        sectionName,
        cardId: String(request.card_id ?? ""),
        winnerId: request.winner_id,
        expectedWinnerId: request.expected_winner_id,
      };
      const update = action === "skins_tiebreaker_set"
        ? await writeSkinsTiebreaker(service, common)
        : await writeSkinsWinner(service, { ...common, hole: request.hole });
      return response({ ok: true, action, ...update });
    } catch (error) {
      return response({ error: error instanceof Error ? error.message : "skins_score_update_failed" }, 409);
    }
  }


  if (action === "create_install_handoff") {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const installToken = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    const pairHash = await sha256Hex(installToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: created, error: handoffError } = await service.rpc("hbnf_cart_create_install_handoff", {
      p_pair_hash: pairHash,
      p_label: "HBNF Home Screen install",
      p_expires_at: expiresAt,
    });
    if (handoffError || created !== true) return response({ error: "install_handoff_create_failed" }, 500);
    return response({ installToken, expiresAt });
  }

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

  if (action === "live_status") {
    const { data: league, error: liveError } = await service.from("league_state").select("state_json").eq("id", 1).single();
    if (liveError) return response({ error: "live_state_read_failed" }, 500);
    return response({ live: chooseLive(league?.state_json ?? {}) });
  }

  if (action === "status") {
    const { data: snapshot, error: statusError } = await service.rpc("hbnf_cart_get_status", { p_cart_id: "hbnf-cart" });
    if (statusError || !snapshot) return response({ error: "state_read_failed" }, 500);
    const desired = snapshot.desired as { state?: Record<string, unknown> } | null;
    const state = desired?.state ? { ...desired.state, guestMode: desired.state.guestMode === true } : desired?.state;
    return response({ ...snapshot, desired: desired ? { ...desired, state } : desired, capabilities: { coordinatedRelease: "2026-10-01", canonicalPaletteIntentV1: true, canonicalOverlayIntentV1: true, pairedDeviceAuth: true, tuneV1: true, guestV1: true, phase2VibeRuntimeV1: phase2VibeReady(Deno.env.get("HBNF_PHASE2_VIBE_RUNTIME_READY")) } });
  }
  if (action === "guest_command") {
    const guestResult = await runGuestCommand(request, {
      readContext: () => service.rpc("hbnf_cart_get_context", { p_cart_id: "hbnf-cart" }),
      commit: ({ commandId, type, expectedRevision, nextState }) => service.rpc("hbnf_cart_commit_command_bridge", {
        p_cart_id: "hbnf-cart", p_command_id: commandId, p_command_type: type,
        p_expected_revision: expectedRevision, p_next_state: nextState,
      }).single(),
      reconcile: async ({ revision, fence, type }) => {
        const reconcileResponse = await fetch(`${url}/functions/v1/hbnf-cart-reconcile`, {
          method: "POST", headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ cartId: "hbnf-cart", revision, releaseId: fence.release_id, fenceEpoch: fence.epoch, commandType: type, targetDevices: [...devices], fastBrightness: false }),
        });
        return { ok: reconcileResponse.ok, status: reconcileResponse.status, body: await reconcileResponse.json().catch(() => ({})) };
      },
    });
    return response(guestResult.body, guestResult.status);
  }
  if (action !== "command" || !required(request.commandId, 80) || !required(request.type, 48) || !Number.isSafeInteger(request.expectedRevision) || Number(request.expectedRevision) < 0 || !request.payload || typeof request.payload !== "object") {
    return response({ error: "invalid_command" }, 400);
  }
  if (request.type === "GUEST_MODE" && !operatorAuthorized && !pairedDeviceAuthorized) return response({ error: "owner_authorization_required" }, 403);
  const { data: context, error: readError } = await service.rpc("hbnf_cart_get_context", { p_cart_id: "hbnf-cart" });
  const row = context?.desired as { revision: number; state: Record<string, unknown> } | null;
  const fence = context?.fence as { epoch: number; release_id: string; active: boolean } | null;
  if (readError || !row || !fence?.active) return response({ error: "cart_not_ready" }, 503);
  if (request.expectedRevision !== row.revision) return response({ error: "stale_revision", currentRevision: row.revision }, 409);
  const next = reduceCartCommand(row.state, String(request.type), request.payload as Record<string, unknown>, request.commandId as string, row.revision);
  if (!next) return response({ error: "command_rejected" }, 400);

  const tuneDelta = (() => {
    if (String(request.type) !== "TUNE") return { targetDevices: [...devices], brightnessOnly: false };
    const before = structuredClone(row.state) as Record<string, any>;
    const after = structuredClone(next) as Record<string, any>;
    const beforeDevices = before.devices ?? {}, afterDevices = after.devices ?? {};
    delete before.devices; delete after.devices;
    for (const key of ["revision","lastCommandId","commandReceipts"]) { delete before[key]; delete after[key]; }
    const sharedChanged = JSON.stringify(before) !== JSON.stringify(after);
    if (sharedChanged) return { targetDevices: [...devices], brightnessOnly: false };
    const changed: typeof devices[number][] = [];
    for (const id of devices) {
      if (JSON.stringify(beforeDevices[id] ?? {}) !== JSON.stringify(afterDevices[id] ?? {})) changed.push(id);
    }
    return { targetDevices: changed, brightnessOnly: changed.length > 0 };
  })();
  // A Guest Mode change advances canonical metadata but carries forward the
  // current observations through reconcile with no actuator targets.
  const targetDevices = reconcileTargetsForCommand(String(request.type), tuneDelta.targetDevices);
  const brightnessOnly = isMetadataOnlyCommand(String(request.type)) ? false : tuneDelta.brightnessOnly;
  const { data: committed, error: commitError } = await service.rpc("hbnf_cart_commit_command_bridge", {
    p_cart_id: "hbnf-cart", p_command_id: request.commandId, p_command_type: request.type,
    p_expected_revision: row.revision, p_next_state: next,
  }).single();
  if (commitError) return response({ error: commitError.code === "40001" ? "stale_revision" : "command_commit_failed" }, commitError.code === "40001" ? 409 : 500);
  const revision = Number((committed as Record<string, unknown>).result_revision);
  const reconcileRequest = () => fetch(`${url}/functions/v1/hbnf-cart-reconcile`, {
    method: "POST", headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ cartId: "hbnf-cart", revision, releaseId: fence.release_id, fenceEpoch: fence.epoch, commandType: String(request.type), targetDevices, fastBrightness: brightnessOnly }),
  });
  if (String(request.type) === "TUNE") {
    EdgeRuntime.waitUntil(reconcileRequest().then(async r => {
      if (!r.ok) console.error("TUNE reconcile failed", r.status, await r.text().catch(()=> ""));
    }).catch(e => console.error("TUNE reconcile exception", e)));
    return response({ revision, duplicate: Boolean((committed as Record<string, unknown>).duplicate), reconciliation: { status: "queued" } }, 202);
  }
  const reconcileResponse = await reconcileRequest();
  return response({ revision, duplicate: Boolean((committed as Record<string, unknown>).duplicate), reconciliation: reconcileResponse.ok ? await reconcileResponse.json() : { status: "pending", httpStatus: reconcileResponse.status } }, 202);
});

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
}
