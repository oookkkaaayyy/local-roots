import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_REQUEST_BYTES = 4 * 1024;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readBoundedJson(req: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new Error("request_too_large");
  }

  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new Error("request_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_json");
  }
  return parsed as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_config_missing" }, 500);

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJson(req);
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large") {
      return json({ error: "request_too_large" }, 413);
    }
    return json({ error: "invalid_json" }, 400);
  }

  const code = String(body.code || "").toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, "");
  if (!/^[2-9A-HJ-NP-Z]{10}$/.test(code)) return json({ error: "invalid_pair_code" }, 400);

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const codeHash = await sha256Hex(code);
  const now = new Date().toISOString();

  const { data: pair, error: pairError } = await service.from("du_device_pair_codes")
    .select("id,user_id,email,expires_at")
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (pairError) return json({ error: "pair_lookup_failed" }, 500);
  if (!pair) return json({ error: "invalid_or_expired_pair_code" }, 400);

  const { data: admin, error: adminError } = await service.from("lr_admin_users")
    .select("user_id")
    .eq("user_id", pair.user_id)
    .eq("active", true)
    .maybeSingle();
  if (adminError) return json({ error: "pair_admin_check_failed" }, 500);
  if (!admin) return json({ error: "pair_not_authorized" }, 403);

  const { data: consumed, error: consumeError } = await service.from("du_device_pair_codes")
    .update({ used_at: now })
    .eq("id", pair.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (consumeError) return json({ error: "pair_consume_failed" }, 500);
  if (!consumed) return json({ error: "pair_already_used" }, 409);

  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: pair.email,
  });
  if (linkError || !link) {
    console.error("D&U pair generateLink failed", linkError);
    return json({ error: "pair_session_failed" }, 500);
  }

  const properties = link.properties as { hashed_token?: string } | undefined;
  const tokenHash = String(properties?.hashed_token || "");
  if (!tokenHash) return json({ error: "pair_session_failed" }, 500);

  return json({ token_hash: tokenHash, verification_type: "magiclink" });
});
