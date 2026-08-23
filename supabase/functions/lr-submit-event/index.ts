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

function text(value: unknown, max: number) {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s ? s.slice(0, max) : undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "service_unavailable" }, 503);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // Honeypot field. Bots commonly populate it; humans never see it.
  if (text(input.website, 200)) return json({ ok: true });

  const name = text(input.name, 200);
  const startDate = text(input.start_date, 20);
  const county = text(input.county, 80);
  if (!name || !startDate || !county) {
    return json({ error: "missing_required_fields", fields: ["name", "start_date", "county"] }, 400);
  }

  const email = text(input.submitter_email, 320);
  if (email && (!email.includes("@") || email.startsWith("@") || email.endsWith("@"))) {
    return json({ error: "invalid_email" }, 400);
  }

  const payload = {
    name,
    start_date: startDate,
    end_date: text(input.end_date, 20),
    county,
    city: text(input.city, 120),
    venue_name: text(input.venue_name, 200),
    course_name: text(input.course_name, 200),
    event_type: text(input.event_type, 40) ?? "other",
    format: text(input.format, 160),
    rounds_text: text(input.rounds_text, 160),
    sanctioned: typeof input.sanctioned === "boolean" ? input.sanctioned : undefined,
    tier: text(input.tier, 80),
    registration_url: text(input.registration_url, 1000),
    results_url: text(input.results_url, 1000),
    source_url: text(input.source_url, 1000),
    club_host: text(input.club_host, 200),
    td_names: Array.isArray(input.td_names) ? input.td_names.map((v) => text(v, 160)).filter(Boolean).slice(0, 20) : [],
    submitter_name: text(input.submitter_name, 160),
    submitter_email: email,
    notes: text(input.notes, 4000),
  };

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("lr_ingest_event_submission", {
    p_submission: payload,
  });

  if (error) {
    console.error("lr-submit-event", error.code, error.message);
    return json({ error: "submission_rejected" }, 400);
  }

  return json({ ok: true, submission_id: data }, 201);
});
