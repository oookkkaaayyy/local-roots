import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "du-intake";
const CACHE_TTL_MS = 60_000;

type HealthBody = {
  ok: boolean;
  checks?: Record<string, boolean>;
  checked_at?: string;
  error?: string;
};

let cachedHealth: { expiresAt: number; body: HealthBody; status: number } | null = null;
let inFlightHealth: Promise<{ body: HealthBody; status: number }> | null = null;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

async function runHealthChecks(): Promise<{ body: HealthBody; status: number }> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { body: { ok: false, error: "server_configuration" }, status: 500 };
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const jobs = await service.from("jobs").select("id", { count: "exact", head: true });
  const storage = await service.storage.from(BUCKET).list("", { limit: 1 });
  const intakeOptions = await fetch(`${SUPABASE_URL}/functions/v1/submit-intake`, { method: "OPTIONS" });

  const adminUnauthorized = await fetch(`${SUPABASE_URL}/functions/v1/du-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "dashboard" }),
  });
  const handoffCreateUnauthorized = await fetch(`${SUPABASE_URL}/functions/v1/du-handoff-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: "health-check" }),
  });
  const legacyAdmin = await fetch(`${SUPABASE_URL}/functions/v1/admin-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "health" }),
  });
  const legacyBundle = await fetch(`${SUPABASE_URL}/functions/v1/chatgpt-bundle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_number: "HEALTH-CHECK" }),
  });
  const legacyBundleV2 = await fetch(`${SUPABASE_URL}/functions/v1/chatgpt-bundle-v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_number: "HEALTH-CHECK" }),
  });

  const checks = {
    database: !jobs.error,
    storage: !storage.error,
    intake_route: intakeOptions.ok,
    current_admin_auth_guard: adminUnauthorized.status === 401,
    current_handoff_auth_guard: handoffCreateUnauthorized.status === 401,
    legacy_admin_retired: legacyAdmin.status === 410,
    legacy_bundle_retired: legacyBundle.status === 410,
    legacy_bundle_v2_retired: legacyBundleV2.status === 410,
  };
  const ok = Object.values(checks).every(Boolean);
  return {
    body: { ok, checks, checked_at: new Date().toISOString() },
    status: ok ? 200 : 503,
  };
}

async function getHealth() {
  const now = Date.now();
  if (cachedHealth && cachedHealth.expiresAt > now) {
    return { body: cachedHealth.body, status: cachedHealth.status };
  }

  if (!inFlightHealth) {
    inFlightHealth = runHealthChecks()
      .then((result) => {
        cachedHealth = { ...result, expiresAt: Date.now() + CACHE_TTL_MS };
        return result;
      })
      .finally(() => {
        inFlightHealth = null;
      });
  }

  return await inFlightHealth;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const result = await getHealth();
    return json(result.body, result.status);
  } catch (error) {
    console.error("du-health", error instanceof Error ? error.message : String(error));
    return json({ ok: false, error: "health_check_failed" }, 500);
  }
});
