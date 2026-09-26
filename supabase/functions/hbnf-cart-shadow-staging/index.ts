import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const cors = {
  "Access-Control-Allow-Origin": "https://hbnightflyers.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const DEVICES = ["matrix", "aux"] as const;
const FIELDS = ["cartRevision", "fenceEpoch", "release", "deviceId", "enabled", "brightness", "brightnessProfileRevision", "programMode", "sceneId", "paletteId", "vibe", "speedBias", "sequenceCursor", "audio", "overlay", "applyCompleteProjection"] as const;
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => JSON.stringify(k) + ":" + canonical(x)).join(",") + "}";
  return JSON.stringify(v);
};
const projection = (v: unknown, deviceId: string, revision: number) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const p = v as Record<string, unknown>;
  if (p.deviceId !== deviceId || p.cartRevision !== revision || p.applyCompleteProjection !== true ||
      typeof p.enabled !== "boolean" || !Number.isInteger(p.brightness) || (p.brightness as number) < 0 || (p.brightness as number) > 255) return null;
  if (FIELDS.some(k => !(k in p))) return null;
  return Object.fromEntries(FIELDS.map(k => [k, p[k]]));
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization") ?? "";
  if (!url || !anon || !serviceKey || !authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const auth = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await auth.auth.getUser();
  if (authError || !authData.user) return json({ error: "unauthorized" }, 401);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: operator, error: operatorError } = await db.schema("hbnf_cart_shadow").from("operators").select("user_id").eq("user_id", authData.user.id).eq("active", true).maybeSingle();
  if (operatorError || !operator) return json({ error: "staging_operator_required" }, 403);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 12_000) return json({ error: "payload_too_large" }, 413);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (typeof body.runId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.runId) ||
      typeof body.fixtureId !== "string" || body.fixtureId.length < 1 || body.fixtureId.length > 120 ||
      !Number.isSafeInteger(body.cartRevision) || Number(body.cartRevision) < 0 ||
      !Array.isArray(body.devices) || body.devices.length !== 2) return json({ error: "invalid_shadow_fixture" }, 400);
  const inputs = body.devices as Array<Record<string, unknown>>;
  const seen = new Set<string>();
  const rows = [];
  for (const input of inputs) {
    const deviceId = String(input?.deviceId ?? "");
    if (!DEVICES.includes(deviceId as typeof DEVICES[number]) || seen.has(deviceId)) return json({ error: "invalid_device_set" }, 400);
    seen.add(deviceId);
    const expected = projection(input.expected, deviceId, Number(body.cartRevision));
    const actual = projection(input.actual, deviceId, Number(body.cartRevision));
    if (!expected || !actual) return json({ error: "invalid_projection" }, 400);
    const mismatches = FIELDS.filter(k => canonical(expected[k]) !== canonical(actual[k]));
    rows.push({ device_id: deviceId, expected_projection: expected, actual_projection: actual, parity: mismatches.length === 0, mismatches });
  }
  if (seen.size !== 2) return json({ error: "incomplete_device_set" }, 400);
  const mismatchCount = rows.reduce((n, row) => n + row.mismatches.length, 0);
  const { error: runError } = await db.schema("hbnf_cart_shadow").from("runs").insert({
    run_id: body.runId, fixture_id: body.fixtureId, actor_id: authData.user.id,
    cart_revision: Number(body.cartRevision), parity: mismatchCount === 0, mismatch_count: mismatchCount,
  });
  if (runError) return json({ error: "shadow_run_write_failed" }, 500);
  const { error: observationError } = await db.schema("hbnf_cart_shadow").from("observations").insert(rows.map(row => ({ run_id: body.runId, ...row })));
  if (observationError) return json({ error: "shadow_observation_write_failed" }, 500);
  return json({ mode: "shadow_only", actuatorsReachable: false, runId: body.runId, parity: mismatchCount === 0, mismatchCount, devices: rows.map(({ device_id, parity, mismatches }) => ({ deviceId: device_id, parity, mismatches })) });
});
