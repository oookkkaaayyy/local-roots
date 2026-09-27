import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const API_VERSION = "hbnf-watch-api-v1";
const RELEASE = "phase2-forward-staging-20260926-r2";
const WATCH_TOKEN_SHAS = new Set([
  "b8443047fc85ec9d46c94113b0841c7ac6ea45d0746f33ebae806207b78dd8af",
  "8cd8e976c62bdb62f849e95a84763a08587a4b0bcc2b72da0baaad94985faad7",
]);
const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "https://phcpbvuqibyarpfrftgx.supabase.co";
const CART_URL = `${PROJECT_URL}/functions/v1/hbnf-cart-control`;
const SCORE_URL = `${PROJECT_URL}/functions/v1/hbnf-watch-score-staging`;

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-hbnf-watch-token,x-hbnf-device",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function validWatchToken(value) {
  return typeof value === "string" && value.length > 0 && WATCH_TOKEN_SHAS.has(await sha256Hex(value));
}
function capabilities() {
  return {
    apiVersion: API_VERSION,
    release: RELEASE,
    staging: true,
    compatibility: {
      watchClientContract: 1,
      cartContract: "canonical-device-session-proxy",
      scoringContract: "watch-score-staging-v3-proxy",
      phase2Ready: true,
      futureProviderSwapWithoutWatchClientRewrite: true,
      cartIntentAutoRevision: true,
      cartIntentMaxStaleRetry: 1,
    },
    domains: {
      cart: {
        available: true,
        provider: "hbnf-cart-control",
        requiresPairedDeviceToken: true,
        actions: ["status", "command", "intent"],
        commandEnvelope: ["commandId", "expectedRevision", "type", "payload"],
        intentEnvelope: ["commandId", "type", "payload"],
      },
      score: { available: true, provider: "hbnf-watch-score-staging", productionWrites: false },
      game: { available: false, provider: "phase2-game-bridge", reason: "phase2_not_promoted" },
      uv: { available: false, provider: "phase2-uv-provider", reason: "phase2_not_promoted" },
      overlay: { available: false, provider: "future-canonical-overlay-provider", reason: "canonical_overlay_contract_not_finalized" },
    },
  };
}
async function readJsonSafe(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
async function probe(url, body, headers = {}) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(7000),
    });
    return { reachable: true, status: r.status, body: await readJsonSafe(r) };
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
}
function extractRevision(snapshot) {
  const raw = snapshot?.desired?.revision ?? snapshot?.desired?.state?.revision;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function validIntent(body) {
  return typeof body.commandId === "string" && body.commandId.trim().length > 0 &&
    typeof body.type === "string" && body.type.trim().length > 0 &&
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload);
}
async function cartRequest(deviceToken, upstreamBody) {
  try {
    const r = await fetch(CART_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hbnf-device": deviceToken },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(12000),
    });
    return { reachable: true, status: r.status, data: await readJsonSafe(r) };
  } catch (error) {
    return { reachable: false, status: 503, data: { error: "CART_PROVIDER_UNREACHABLE", detail: error instanceof Error ? error.message : String(error) } };
  }
}
function cartProxyResponse(result, extra = {}) {
  return json({
    ok: result.status >= 200 && result.status < 300,
    apiVersion: API_VERSION,
    domain: "cart",
    provider: "hbnf-cart-control",
    upstreamStatus: result.status,
    ...extra,
    data: result.data,
  }, result.status);
}
async function selfTest() {
  const checks = [];
  const add = (name, pass, details = undefined) => checks.push({ name, pass: Boolean(pass), ...(details === undefined ? {} : { details }) });
  const caps = capabilities();
  add("api_contract_v1", caps.apiVersion === API_VERSION && caps.compatibility.watchClientContract === 1);
  add("cart_requires_device_pairing", caps.domains.cart.requiresPairedDeviceToken === true);
  add("phase2_domains_fail_closed", caps.domains.game.available === false && caps.domains.uv.available === false);
  add("score_is_staging_only", caps.domains.score.available === true && caps.domains.score.productionWrites === false);
  add("cart_intent_auto_revision_contract", caps.compatibility.cartIntentAutoRevision === true && caps.domains.cart.actions.includes("intent"));
  add("revision_parser_contract", extractRevision({ desired: { revision: 32 } }) === 32 && extractRevision({ desired: { state: { revision: 7 } } }) === 7);
  const cartProbe = await probe(CART_URL, { action: "status" });
  add("cart_upstream_reachable_and_rejects_unpaired", cartProbe.reachable && cartProbe.status === 401, { status: cartProbe.status });
  const scoreProbe = await probe(SCORE_URL, { action: "state" });
  add("score_upstream_reachable_and_rejects_missing_watch_token", scoreProbe.reachable && scoreProbe.status === 401, { status: scoreProbe.status });
  return { ok: checks.every((x) => x.pass), apiVersion: API_VERSION, release: RELEASE, checks };
}
async function proxyCart(body, req) {
  const deviceToken = String(body.deviceToken ?? req.headers.get("x-hbnf-device") ?? "").trim();
  if (!deviceToken) return json({ ok: false, apiVersion: API_VERSION, domain: "cart", error: "PAIRING_REQUIRED", requiresPairedDeviceToken: true }, 428);

  const action = String(body.action ?? "status").toLowerCase();
  if (action === "status") return cartProxyResponse(await cartRequest(deviceToken, { action: "status" }));

  if (action === "command") {
    const expectedRevision = body.expectedRevision;
    if (!validIntent(body) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return json({ ok: false, apiVersion: API_VERSION, domain: "cart", error: "INVALID_COMMAND_ENVELOPE" }, 400);
    }
    return cartProxyResponse(await cartRequest(deviceToken, {
      action: "command",
      commandId: body.commandId.trim(),
      expectedRevision,
      type: body.type.trim(),
      payload: body.payload,
    }), { revisionStrategy: "client" });
  }

  if (action === "intent") {
    if (!validIntent(body)) return json({ ok: false, apiVersion: API_VERSION, domain: "cart", error: "INVALID_INTENT_ENVELOPE" }, 400);

    const status1 = await cartRequest(deviceToken, { action: "status" });
    if (status1.status < 200 || status1.status >= 300) return cartProxyResponse(status1, { revisionStrategy: "server-current", attempts: 0 });
    const revision1 = extractRevision(status1.data);
    if (revision1 === null) return json({ ok: false, apiVersion: API_VERSION, domain: "cart", error: "REVISION_UNAVAILABLE" }, 503);

    const command = {
      action: "command",
      commandId: body.commandId.trim(),
      expectedRevision: revision1,
      type: body.type.trim(),
      payload: body.payload,
    };
    const first = await cartRequest(deviceToken, command);
    if (first.status !== 409 || first.data?.error !== "stale_revision") {
      return cartProxyResponse(first, { revisionStrategy: "server-current", attempts: 1, attemptedRevision: revision1 });
    }

    const status2 = await cartRequest(deviceToken, { action: "status" });
    if (status2.status < 200 || status2.status >= 300) return cartProxyResponse(status2, { revisionStrategy: "server-current", attempts: 1 });
    const revision2 = extractRevision(status2.data);
    if (revision2 === null) return json({ ok: false, apiVersion: API_VERSION, domain: "cart", error: "REVISION_UNAVAILABLE_AFTER_STALE" }, 503);

    const second = await cartRequest(deviceToken, { ...command, expectedRevision: revision2 });
    return cartProxyResponse(second, {
      revisionStrategy: "server-current",
      attempts: 2,
      staleRetry: true,
      attemptedRevisions: [revision1, revision2],
    });
  }

  return json({ ok: false, apiVersion: API_VERSION, domain: "cart", error: "UNKNOWN_CART_ACTION" }, 400);
}
async function proxyScore(body, token) {
  const forward = { ...body };
  delete forward.domain;
  delete forward.apiVersion;
  delete forward.deviceToken;
  delete forward.token;
  try {
    const r = await fetch(SCORE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hbnf-watch-token": token },
      body: JSON.stringify(forward),
      signal: AbortSignal.timeout(12000),
    });
    const data = await readJsonSafe(r);
    return json({ ok: r.ok, apiVersion: API_VERSION, domain: "score", provider: "hbnf-watch-score-staging", upstreamStatus: r.status, data }, r.status);
  } catch (error) {
    return json({ ok: false, apiVersion: API_VERSION, domain: "score", error: "SCORE_PROVIDER_UNREACHABLE", detail: error instanceof Error ? error.message : String(error) }, 503);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  const url = new URL(req.url);
  if (req.method === "GET") {
    const action = String(url.searchParams.get("action") ?? "meta").toLowerCase();
    if (action === "self_test") return json(await selfTest());
    return json({ ok: true, ...capabilities() });
  }
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "INVALID_JSON" }, 400);
  const token = String(body.token ?? req.headers.get("x-hbnf-watch-token") ?? "");
  if (!(await validWatchToken(token))) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const domain = String(body.domain ?? "system").toLowerCase();
  if (domain === "system") {
    const action = String(body.action ?? "capabilities").toLowerCase();
    if (action !== "capabilities") return json({ ok: false, apiVersion: API_VERSION, domain, error: "UNKNOWN_SYSTEM_ACTION" }, 400);
    return json({ ok: true, ...capabilities() });
  }
  if (domain === "cart") return await proxyCart(body, req);
  if (domain === "score") return await proxyScore(body, token);
  if (["game", "uv", "overlay"].includes(domain)) {
    const caps = capabilities();
    return json({ ok: false, apiVersion: API_VERSION, domain, error: "PROVIDER_NOT_AVAILABLE", capability: caps.domains[domain] }, 503);
  }
  return json({ ok: false, apiVersion: API_VERSION, error: "UNKNOWN_DOMAIN" }, 400);
});
