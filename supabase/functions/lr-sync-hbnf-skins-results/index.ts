import { createClient } from "npm:@supabase/supabase-js@2";
import { skinsTopResults } from "../lr-sync-hbnf/skins-results.ts";

type Json = Record<string, any>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

function localDateISO() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const dateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const HBNF_PROVENANCE_URL = "https://hbnightflyers.com/";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "server_configuration" }, 500);

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const syncToken = req.headers.get("x-local-roots-sync-secret") ?? "";
  const verified = await service.rpc("lr_verify_hbnf_sync_secret", { p_token: syncToken });
  if (verified.error || verified.data !== true) return json({ error: "unauthorized" }, 401);

  const sourceRead = await service.from("lr_sources").select("id,key,enabled").eq("key", "hbnf_internal_schedule").maybeSingle();
  if (sourceRead.error || !sourceRead.data || !sourceRead.data.enabled) return json({ error: "source_disabled_or_missing" }, 409);
  const sourceId = sourceRead.data.id as string;

  const config = await service.rpc("lr_hbnf_adapter_config");
  const cfg = Array.isArray(config.data) ? config.data[0] : config.data;
  if (config.error || !cfg?.hbnf_url || !cfg?.publishable_key) return json({ error: "adapter_configuration" }, 500);

  let state: Json;
  try {
    const response = await fetch(`${cfg.hbnf_url}/rest/v1/league_state?id=eq.1&select=state_json`, {
      headers: { apikey: cfg.publishable_key, Authorization: `Bearer ${cfg.publishable_key}` },
    });
    if (!response.ok) throw new Error(`HBNF API ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows[0]?.state_json) throw new Error("HBNF league_state row missing");
    state = typeof rows[0].state_json === "string" ? JSON.parse(rows[0].state_json) : rows[0].state_json;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: "fetch_failed", detail: message.slice(0, 500) }, 502);
  }

  try {
    const today = localDateISO();
    const skinsWeeks: Json = state?.skins?.weeks && typeof state.skins.weeks === "object" ? state.skins.weeks : {};
    const now = new Date().toISOString();
    let historicalWeeks = 0;
    let rankedWeeks = 0;
    let resultRows = 0;
    let missingEventMappings = 0;
    let unchangedEmptyWeeks = 0;

    for (const [date, rawWeek] of Object.entries(skinsWeeks)) {
      if (!dateKey(date) || date >= today || !rawWeek || typeof rawWeek !== "object") continue;
      historicalWeeks += 1;
      const top = skinsTopResults(rawWeek as Json);
      if (!top.length) { unchangedEmptyWeeks += 1; continue; }

      const externalId = `hbnf:skins:${date}`;
      const provenance = await service.from("lr_event_sources").select("event_id").eq("source_id", sourceId).eq("external_id", externalId).maybeSingle();
      if (provenance.error) throw new Error(`provenance read failed: ${provenance.error.message}`);
      if (!provenance.data?.event_id) { missingEventMappings += 1; continue; }
      const eventId = provenance.data.event_id as string;

      const cleared = await service.from("lr_results").delete().eq("event_id", eventId).eq("source_id", sourceId).eq("division_code", "SKINS");
      if (cleared.error) throw new Error(`result cleanup failed: ${cleared.error.message}`);

      const rows = top.map((result) => ({
        event_id: eventId,
        division_code: "SKINS",
        place: result.place,
        player_name: result.name,
        points: result.skins,
        source_url: HBNF_PROVENANCE_URL,
        source_id: sourceId,
        is_public_selected_division: true,
        last_verified_at: now,
      }));
      const inserted = await service.from("lr_results").insert(rows);
      if (inserted.error) throw new Error(`result insert failed: ${inserted.error.message}`);
      rankedWeeks += 1;
      resultRows += rows.length;
    }

    return json({
      ok: true,
      parser_version: "hbnf-skins-results-v1",
      historical_weeks: historicalWeeks,
      ranked_weeks: rankedWeeks,
      results_rows: resultRows,
      missing_event_mappings: missingEventMappings,
      unchanged_empty_weeks: unchangedEmptyWeeks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("lr-sync-hbnf-skins-results", message);
    return json({ error: "sync_failed", detail: message.slice(0, 1000) }, 500);
  }
});
