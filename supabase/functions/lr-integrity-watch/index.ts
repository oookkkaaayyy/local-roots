import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "server_configuration" }, 500);

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = req.headers.get("x-local-roots-sync-secret") ?? "";
  const verified = await service.rpc("lr_verify_integrity_sync_secret", { p_token: token });
  if (verified.error || verified.data !== true) return json({ error: "unauthorized" }, 401);

  const readiness = await service.rpc("lr_launch_readiness");
  if (readiness.error || !readiness.data) {
    console.error("lr-integrity-watch readiness", readiness.error?.message);
    return json({ error: "readiness_failed" }, 500);
  }

  let stagingStatus: number | null = null;
  let stagingOk = false;
  try {
    const response = await fetch("https://local-roots.pages.dev/", {
      headers: { "User-Agent": "LocalRootsIntegrityWatch/1.0" },
      redirect: "follow",
    });
    stagingStatus = response.status;
    const body = await response.text();
    stagingOk = response.status === 200
      && body.includes('<div id="root"></div>')
      && body.includes('<title>Local Roots Disc Golf Events</title>');
  } catch (error) {
    console.error("lr-integrity-watch staging", error instanceof Error ? error.message : String(error));
  }

  const state = readiness.data as Record<string, unknown>;
  const recorded = await service.rpc("lr_record_integrity_snapshot", {
    p_public_events: Number(state.public_event_count ?? 0),
    p_published_without_provenance: Number(state.published_without_provenance ?? 0),
    p_sanctioned_without_basis: Number(state.sanctioned_without_basis ?? 0),
    p_staging_http_status: stagingStatus,
    p_staging_ok: stagingOk,
  });
  if (recorded.error) {
    console.error("lr-integrity-watch record", recorded.error.message);
    return json({ error: "record_failed" }, 500);
  }

  return json({ ok: true, staging_http_status: stagingStatus, staging_ok: stagingOk, integrity: recorded.data });
});
