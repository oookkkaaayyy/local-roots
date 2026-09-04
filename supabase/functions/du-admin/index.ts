import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const workflowStates = new Set([
  "draft", "intake_complete", "handoff_preparing", "chatgpt_ready",
  "notification_sent", "stage_a_started", "awaiting_art_approval",
  "art_approved", "production_ready", "complete", "handoff_failed",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  if (!url || !serviceKey || !authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const token = authHeader.slice(7);
  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);
  const { data: admin } = await service.from("lr_admin_users")
    .select("user_id,display_name,role,active")
    .eq("user_id", userData.user.id).eq("active", true).maybeSingle();
  if (!admin) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "dashboard");

  if (action === "dashboard") {
    const { data: jobs, error } = await service.from("jobs").select([
      "id", "job_number", "client_name", "phone", "email", "subject_name", "subject_type",
      "disc_brand", "disc_model", "disc_details", "notes", "created_at", "updated_at",
      "workflow_status", "handoff_ready_at", "handoff_last_error", "handoff_retry_count",
      "drive_folder_id", "notification_sent_at", "stage_a_started_at", "art_approved_at",
      "production_ready_at", "completed_at", "latest_draft_path", "final_stencil_path",
      "finished_disc_path",
    ].join(",")).order("created_at", { ascending: false }).limit(300);
    if (error) return json({ error: "dashboard_failed", detail: error.message }, 400);
    const ids = (jobs || []).map((job) => job.id);
    const { data: photos, error: photoError } = ids.length
      ? await service.from("job_photos").select("job_id").in("job_id", ids)
      : { data: [], error: null };
    if (photoError) return json({ error: "dashboard_failed", detail: photoError.message }, 400);
    const counts = new Map<string, number>();
    for (const photo of photos || []) counts.set(photo.job_id, (counts.get(photo.job_id) || 0) + 1);
    return json({ admin, jobs: (jobs || []).map((job) => ({ ...job, source_photo_count: counts.get(job.id) || 0 })) });
  }

  if (action === "job") {
    const jobNumber = String(body.job_number || "").trim().toUpperCase();
    const jobId = String(body.job_id || "").trim();
    let query = service.from("jobs").select("*").limit(1);
    query = jobId ? query.eq("id", jobId) : query.eq("job_number", jobNumber);
    const { data: rows, error } = await query;
    const job = rows?.[0];
    if (error || !job) return json({ error: "job_not_found" }, 404);
    const { data: photos, error: photoError } = await service.from("job_photos").select("*")
      .eq("job_id", job.id).order("sort_order");
    if (photoError) return json({ error: "job_failed", detail: photoError.message }, 400);
    const hydrated = await Promise.all((photos || []).map(async (photo) => {
      const { data } = await service.storage.from(photo.storage_bucket || "du-intake")
        .createSignedUrl(photo.storage_path, 3600);
      return { ...photo, signed_url: data?.signedUrl || null };
    }));
    const { data: options } = await service.from("draft_options").select("*")
      .eq("job_id", job.id).order("option_code");
    const { data: checklist } = await service.from("production_checklist").select("*")
      .eq("job_id", job.id).maybeSingle();
    return json({ job, photos: hydrated, options: options || [], checklist });
  }

  if (action === "set_workflow") {
    const jobId = String(body.job_id || "").trim();
    const workflowStatus = String(body.workflow_status || "").trim();
    if (!jobId || !workflowStates.has(workflowStatus)) return json({ error: "invalid_workflow_update" }, 400);
    const patch: Record<string, unknown> = { workflow_status: workflowStatus };
    if (workflowStatus === "handoff_failed") {
      patch.handoff_last_error = String(body.handoff_last_error || "Handoff failed").slice(0, 2000);
      const { data: existing } = await service.from("jobs").select("handoff_retry_count").eq("id", jobId).single();
      patch.handoff_retry_count = Number(existing?.handoff_retry_count || 0) + 1;
    } else if (body.clear_handoff_error) patch.handoff_last_error = null;
    const { data, error } = await service.from("jobs").update(patch).eq("id", jobId)
      .select("id,job_number,workflow_status,updated_at").single();
    if (error) return json({ error: "workflow_update_failed", detail: error.message }, 400);
    return json({ ok: true, job: data });
  }

  return json({ error: "unknown_action" }, 400);
});
