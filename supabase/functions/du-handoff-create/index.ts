import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-du-device-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function resolveAdminUserId(service: ReturnType<typeof createClient>, req: Request) {
  const now = new Date();
  const deviceToken = String(req.headers.get("x-du-device-token") || "").trim();
  if (deviceToken.length >= 32 && deviceToken.length <= 256) {
    const tokenHash = await sha256Hex(deviceToken);
    const { data: device } = await service.from("du_admin_device_tokens")
      .select("id,user_id,expires_at")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .gt("expires_at", now.toISOString())
      .maybeSingle();
    if (device) {
      const { data: admin } = await service.from("lr_admin_users")
        .select("user_id").eq("user_id", device.user_id).eq("active", true).maybeSingle();
      if (admin) {
        await service.from("du_admin_device_tokens").update({
          last_used_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        }).eq("id", device.id);
        return device.user_id as string;
      }
    }
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const { data: userData, error: userError } = await service.auth.getUser(authHeader.slice(7));
  if (userError || !userData.user) return null;
  const { data: admin } = await service.from("lr_admin_users")
    .select("user_id").eq("user_id", userId).eq("active", true).maybeSingle();
  return admin ? userId : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_config_missing" }, 500);

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const userId = await resolveAdminUserId(service, req);
  if (!userId) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const jobId = String(body.job_id || "").trim();
  if (!jobId) return json({ error: "job_id_required" }, 400);

  const { data: job, error: jobError } = await service.from("jobs")
    .select("id,job_number,workflow_status")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError || !job) return json({ error: "job_not_found" }, 404);

  const { count: photoCount, error: photoError } = await service.from("job_photos")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id);
  if (photoError) return json({ error: "source_lookup_failed" }, 500);
  if (!photoCount) return json({ error: "no_source_photos" }, 400);

  const rawToken = randomToken();
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  await service.from("du_chatgpt_handoffs")
    .delete()
    .eq("job_id", job.id)
    .eq("created_by", userId);

  const { error: insertError } = await service.from("du_chatgpt_handoffs").insert({
    token_hash: tokenHash,
    job_id: job.id,
    created_by: userId,
    expires_at: expiresAt,
  });
  if (insertError) return json({ error: "handoff_create_failed", detail: insertError.message }, 500);

  const earlyStates = ["draft", "intake_complete", "handoff_preparing", "notification_sent"];
  if (earlyStates.includes(String(job.workflow_status || ""))) {
    await service.from("jobs").update({
      workflow_status: "chatgpt_ready",
      handoff_ready_at: new Date().toISOString(),
      handoff_last_error: null,
    }).eq("id", job.id).in("workflow_status", earlyStates);
  }

  const handoffUrl = `${url}/functions/v1/du-handoff?token=${encodeURIComponent(rawToken)}`;
  return json({
    job_number: job.job_number,
    handoff_url: handoffUrl,
    expires_at: expiresAt,
    source_photo_count: photoCount,
  });
});
