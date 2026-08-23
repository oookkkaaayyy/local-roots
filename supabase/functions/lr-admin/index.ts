import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization") ?? "";
  if (!url || !anonKey || !serviceKey || !authorization.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: admin, error: adminError } = await service
    .from("lr_admin_users")
    .select("user_id, display_name, role, active")
    .eq("user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (adminError || !admin) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = String(body.action ?? "dashboard");

  if (action === "dashboard") {
    const [submissions, reviews, sources, runs, events] = await Promise.all([
      service.from("lr_event_submissions").select("id,name,start_date,end_date,county,city,course_name,event_type,sanctioned,tier,registration_url,source_url,club_host,td_names,submitter_name,submitter_email,notes,validation_status,validation_errors,scope_status,status,candidate_id,matched_event_id,created_at").eq("status","pending").order("created_at",{ascending:true}).limit(100),
      service.from("lr_review_queue").select("id,issue_type,severity,event_id,source_candidate_id,summary,details,status,created_at").in("status",["open","in_review"]).order("severity",{ascending:false}).order("created_at",{ascending:true}).limit(150),
      service.from("lr_sources").select("id,key,name,source_type,enabled,refresh_schedule,expected_min_records,expected_max_records,updated_at").order("name"),
      service.from("lr_source_runs").select("id,source_id,started_at,finished_at,fetch_status,parse_status,validation_status,health_status,records_seen,records_valid,records_new,records_changed,records_rejected,records_missing,error_code,error_message,metrics,parser_version").order("started_at",{ascending:false}).limit(100),
      service.from("lr_events").select("id,slug,name,start_date,end_date,county,city,course_name,event_type,sanctioned,tier,status,published,last_verified_at,last_changed_at").order("start_date",{ascending:true}).limit(300),
    ]);
    const firstError = submissions.error ?? reviews.error ?? sources.error ?? runs.error ?? events.error;
    if (firstError) {
      console.error("lr-admin dashboard", firstError.message);
      return json({ error: "dashboard_failed" }, 500);
    }
    return json({
      admin,
      submissions: submissions.data ?? [],
      reviews: reviews.data ?? [],
      sources: sources.data ?? [],
      runs: runs.data ?? [],
      events: events.data ?? [],
    });
  }

  if (action === "decide_submission") {
    const submissionId = String(body.submission_id ?? "");
    const decision = String(body.decision ?? "");
    const targetEventId = body.target_event_id ? String(body.target_event_id) : null;
    const resolutionNote = body.resolution_note ? String(body.resolution_note).slice(0, 2000) : null;
    if (!submissionId || !["approve_new","merge","reject"].includes(decision)) {
      return json({ error: "invalid_decision" }, 400);
    }
    const { data, error } = await service.rpc("lr_decide_event_submission", {
      p_submission_id: submissionId,
      p_action: decision,
      p_target_event_id: targetEventId,
      p_admin_user_id: userData.user.id,
      p_resolution_note: resolutionNote,
    });
    if (error) {
      console.error("lr-admin decide_submission", error.code, error.message);
      return json({ error: "decision_failed", detail: error.message }, 400);
    }
    return json({ ok: true, event_id: data });
  }

  if (action === "set_override") {
    const eventId = String(body.event_id ?? "");
    const fieldName = String(body.field_name ?? "");
    const reason = String(body.reason ?? "").trim().slice(0, 2000);
    if (!eventId || !fieldName || !reason || !("value" in body)) return json({ error: "invalid_override" }, 400);
    const { data, error } = await service.rpc("lr_set_manual_override", {
      p_event_id: eventId,
      p_field_name: fieldName,
      p_override_value: body.value,
      p_reason: reason,
      p_created_by: userData.user.id,
    });
    if (error) return json({ error: "override_failed", detail: error.message }, 400);
    return json({ ok: true, override_id: data });
  }

  if (action === "release_override") {
    const eventId = String(body.event_id ?? "");
    const fieldName = String(body.field_name ?? "");
    if (!eventId || !fieldName) return json({ error: "invalid_override" }, 400);
    const { data, error } = await service.rpc("lr_release_manual_override", {
      p_event_id: eventId,
      p_field_name: fieldName,
    });
    if (error) return json({ error: "release_failed", detail: error.message }, 400);
    return json({ ok: true, released: data });
  }

  if (action === "resolve_review") {
    const reviewId = String(body.review_id ?? "");
    const outcome = String(body.outcome ?? "");
    const resolution = String(body.resolution ?? "").trim().slice(0, 2000);
    if (!reviewId || !["resolved","rejected"].includes(outcome) || !resolution) {
      return json({ error: "invalid_review_resolution" }, 400);
    }
    const { data: review, error: readError } = await service
      .from("lr_review_queue")
      .select("id,issue_type,status")
      .eq("id", reviewId)
      .maybeSingle();
    if (readError || !review) return json({ error: "review_not_found" }, 404);
    if (review.issue_type === "organizer_submission") {
      return json({ error: "use_submission_decision" }, 400);
    }
    if (!["open","in_review"].includes(review.status)) {
      return json({ error: "review_already_closed" }, 400);
    }
    const { error } = await service
      .from("lr_review_queue")
      .update({ status: outcome, resolved_at: new Date().toISOString(), resolution })
      .eq("id", reviewId)
      .in("status", ["open","in_review"]);
    if (error) return json({ error: "review_resolution_failed", detail: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "event_detail") {
    const eventId = String(body.event_id ?? "");
    if (!eventId) return json({ error: "event_id_required" }, 400);
    const [event, provenance, overrides, changes, results] = await Promise.all([
      service.from("lr_events").select("*").eq("id",eventId).maybeSingle(),
      service.from("lr_event_sources").select("id,source_id,external_id,source_url,source_role,is_sanction_basis,first_seen_at,last_seen_at,last_fetched_at,confidence").eq("event_id",eventId).order("last_seen_at",{ascending:false}),
      service.from("lr_manual_overrides").select("id,field_name,original_value,override_value,reason,active,created_at,released_at,created_by").eq("event_id",eventId).order("created_at",{ascending:false}),
      service.from("lr_event_change_log").select("id,source_id,source_candidate_id,field_name,old_value,new_value,change_type,created_at").eq("event_id",eventId).order("created_at",{ascending:false}).limit(100),
      service.from("lr_results").select("id,division_code,place,player_name,total_score,to_par,source_url,is_public_selected_division,last_verified_at").eq("event_id",eventId).order("division_code").order("place"),
    ]);
    const firstError = event.error ?? provenance.error ?? overrides.error ?? changes.error ?? results.error;
    if (firstError) return json({ error: "event_detail_failed" }, 500);
    return json({ event: event.data, provenance: provenance.data ?? [], overrides: overrides.data ?? [], changes: changes.data ?? [], results: results.data ?? [] });
  }

  if (action === "create_event") {
    const submission = typeof body.submission === "object" && body.submission ? body.submission : null;
    if (!submission) return json({ error: "submission_required" }, 400);
    const ingested = await service.rpc("lr_ingest_event_submission", { p_submission: submission });
    if (ingested.error || !ingested.data) return json({ error: "create_failed", detail: ingested.error?.message }, 400);
    const decided = await service.rpc("lr_decide_event_submission", {
      p_submission_id: ingested.data,
      p_action: "approve_new",
      p_target_event_id: null,
      p_admin_user_id: userData.user.id,
      p_resolution_note: "Created manually by Local Roots administrator",
    });
    if (decided.error) return json({ error: "create_failed", detail: decided.error.message }, 400);
    return json({ ok: true, submission_id: ingested.data, event_id: decided.data });
  }

  return json({ error: "unknown_action" }, 400);
});
