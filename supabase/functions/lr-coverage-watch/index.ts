import { createClient } from "npm:@supabase/supabase-js@2";

// Coverage monitor. Fetches ONLY organizer-owned / club / government pages listed in lr_coverage_watch
// (one GET per page, once a day). It never touches UDisc, Disc Golf Scene or PDGA (editorial single-page reads only).
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const BLOCKED = /(^|\.)(udisc\.com|discgolfscene\.com|pdga\.com|dgpt\.com)$/i;

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function normalize(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 400_000);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "server_configuration" }, 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = await db.rpc("lr_verify_coverage_sync_secret", { p_token: req.headers.get("x-local-roots-sync-secret") ?? "" });
  if (ok.error || ok.data !== true) return json({ error: "unauthorized" }, 401);

  const targets = await db.rpc("lr_coverage_watch_targets");
  if (targets.error) return json({ error: "targets_failed" }, 500);
  const results: Record<string, string> = {};
  for (const t of (targets.data ?? []) as { url: string }[]) {
    let status: number | null = null, hash: string | null = null;
    try {
      const host = new URL(t.url).hostname;
      if (BLOCKED.test(host)) { results[t.url] = "skipped_editorial_only"; continue; }
      const r = await fetch(t.url, { headers: { "User-Agent": "LocalRootsCoverageWatch/1.0 (once-daily, organizer pages only)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
      status = r.status;
      if (r.ok) hash = await sha256(normalize(await r.text()));
    } catch (e) { console.error("coverage fetch", t.url, e instanceof Error ? e.message : String(e)); }
    const rec = await db.rpc("lr_record_coverage_check", { p_url: t.url, p_status: status, p_hash: hash });
    results[t.url] = rec.error ? "record_failed" : String(rec.data);
    await new Promise((res) => setTimeout(res, 1500));
  }
  const gaps = await db.rpc("lr_enqueue_completeness_gaps", { p_horizon_days: 60 });
  const dups = await db.rpc("lr_enqueue_duplicate_alerts");
  const fields = await db.rpc("lr_enqueue_event_field_reviews", { p_horizon_days: 60 });
  return json({ ok: true, results, completeness: gaps.data ?? null, duplicates: dups.data ?? null, field_reviews: fields.data ?? null });
});
