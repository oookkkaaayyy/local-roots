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

const COUNTIES = ["Ventura", "Los Angeles", "Orange", "Riverside", "San Bernardino", "San Diego"];

function pacificToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
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
    .select("user_id")
    .eq("user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (adminError || !admin) return json({ error: "forbidden" }, 403);

  const [{ data: readiness, error: readinessError }, { data: events, error: eventsError }] = await Promise.all([
    service.rpc("lr_launch_readiness"),
    service.from("lr_events").select("county,start_date,end_date").eq("published", true),
  ]);
  if (readinessError || eventsError) {
    console.error("lr-launch-readiness", readinessError?.code ?? eventsError?.code, readinessError?.message ?? eventsError?.message);
    return json({ error: "readiness_failed" }, 500);
  }

  const today = pacificToday();
  const countyCoverage = COUNTIES.map((county) => {
    const countyEvents = (events ?? []).filter((event) => event.county === county);
    const future = countyEvents.filter((event) => String(event.end_date) >= today);
    const dates = future.map((event) => String(event.start_date)).sort();
    return {
      county,
      published_total: countyEvents.length,
      current_future: future.length,
      next_event: dates[0] ?? null,
      latest_future: dates.at(-1) ?? null,
    };
  });

  return json({ ...readiness, county_coverage: countyCoverage });
});
