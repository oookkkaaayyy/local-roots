import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, any>;
type RecordOrigin = "league_state" | "club_schedule_rule";

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
const eventSourceUrl = (_mode: string, _date: string) => HBNF_PROVENANCE_URL;

// Explicit first-party 2026 club schedule rule: Glow Doubles runs on the
// second-to-last Saturday of each month through October 2026 at 6:30 PM.
// August is already represented by observed HBNF state, so only the remaining
// known future dates are materialized here when HBNF state has not yet created
// a week row. The external ID is identical to the later observed row, allowing
// league_state to supersede this derived provenance without creating a duplicate.
const KNOWN_2026_GLOW_SCHEDULE = [
  { date: "2026-09-19", startLocal: "18:30" },
  { date: "2026-10-24", startLocal: "18:30" },
] as const;

function summaryPayload(mode: string, date: string, week: Json, origin: RecordOrigin) {
  const cards = week && typeof week.cards === "object" && week.cards ? Object.values(week.cards) : [];
  const players = Array.isArray(week?.players) ? week.players : [];
  const base: Json = {
    mode,
    date,
    origin,
    observed_in_league_state: origin === "league_state",
    card_count: cards.length,
    finalized_cards: cards.filter((card: any) => card?.finalized === true).length,
    participant_entries: players.filter((player: any) => player?.removed !== true).length,
  };
  if (origin === "club_schedule_rule") {
    base.recurrence_rule = "second-to-last Saturday monthly through October 2026";
    base.scheduled_start_local = "18:30";
    base.schedule_scope = "2026 summer/fall Glow Doubles";
  }
  return base;
}

function glowTopResults(week: Json) {
  const cards = week && typeof week.cards === "object" && week.cards ? Object.values(week.cards) : [];
  const finalized = week?.finalized === true || cards.some((card: any) => card?.finalized === true);
  if (!finalized || !Array.isArray(week?.players)) return [] as { place: number; name: string; total: number }[];
  const rows = week.players.flatMap((player: any) => {
    if (player?.removed === true || typeof player?.name !== "string" || !Array.isArray(player?.scores)) return [];
    const scores = player.scores.map((score: any) => Number(score));
    if (scores.length < 18 || scores.some((score: number) => !Number.isFinite(score))) return [];
    return [{ name: player.name.trim(), total: scores.reduce((sum: number, score: number) => sum + score, 0) }];
  }).filter((row: any) => row.name);
  rows.sort((a: any, b: any) => a.total - b.total || a.name.localeCompare(b.name));
  let rank = 0;
  let last: number | null = null;
  return rows.map((row: any) => {
    if (last === null || row.total !== last) rank += 1;
    last = row.total;
    return { place: rank, name: row.name, total: row.total };
  }).filter((row: any) => row.place <= 3);
}

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

  let body: Json = {};
  try { body = await req.json(); } catch {}
  const trigger = body.trigger === "cron" ? "cron" : "manual";

  const sourceRead = await service.from("lr_sources").select("id,key,enabled").eq("key", "hbnf_internal_schedule").maybeSingle();
  if (sourceRead.error || !sourceRead.data || !sourceRead.data.enabled) return json({ error: "source_disabled_or_missing" }, 409);
  const sourceId = sourceRead.data.id as string;

  const runInsert = await service.from("lr_source_runs").insert({
    source_id: sourceId,
    fetch_status: "running",
    parse_status: "pending",
    validation_status: "pending",
    health_status: "running",
    scheduler_status: trigger === "cron" ? "ok" : "skipped",
    parser_version: "hbnf-direct-v4",
    metrics: { trigger, first_party: true },
  }).select("id").single();
  if (runInsert.error || !runInsert.data) return json({ error: "run_create_failed", detail: runInsert.error?.message }, 500);
  const runId = runInsert.data.id as string;

  const failRun = async (stage: "fetch" | "parse", message: string) => {
    await service.from("lr_source_runs").update({
      fetch_status: stage === "fetch" ? "failed" : "ok",
      parse_status: stage === "fetch" ? "skipped" : "failed",
      error_code: `hbnf_${stage}_failed`,
      error_message: message.slice(0, 2000),
    }).eq("id", runId);
    await service.rpc("lr_finalize_source_run", { p_run_id: runId });
  };

  const config = await service.rpc("lr_hbnf_adapter_config");
  const cfg = Array.isArray(config.data) ? config.data[0] : config.data;
  if (config.error || !cfg?.hbnf_url || !cfg?.publishable_key) {
    await failRun("fetch", "HBNF adapter configuration unavailable");
    return json({ error: "adapter_configuration" }, 500);
  }

  let state: Json;
  try {
    const response = await fetch(`${cfg.hbnf_url}/rest/v1/league_state?id=eq.1&select=state_json`, {
      headers: { apikey: cfg.publishable_key, Authorization: `Bearer ${cfg.publishable_key}` },
    });
    if (!response.ok) throw new Error(`HBNF API ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows[0]?.state_json) throw new Error("HBNF league_state row missing");
    state = typeof rows[0].state_json === "string" ? JSON.parse(rows[0].state_json) : rows[0].state_json;
    await service.from("lr_source_runs").update({ fetch_status: "ok", parse_status: "running" }).eq("id", runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failRun("fetch", message);
    return json({ error: "fetch_failed", detail: message }, 502);
  }

  try {
    const today = localDateISO();
    const skinsWeeks: Json = state?.skins?.weeks && typeof state.skins.weeks === "object" ? state.skins.weeks : {};
    const glowWeeks: Json = state?.glow?.weeks && typeof state.glow.weeks === "object" ? state.glow.weeks : {};
    const records: {
      mode: "skins" | "glow";
      date: string;
      week: Json;
      payload: Json;
      externalId: string;
      sourceUrl: string;
      origin: RecordOrigin;
      confidence: number;
    }[] = [];

    for (const [date, week] of Object.entries(skinsWeeks)) {
      if (!dateKey(date) || !week || typeof week !== "object") continue;
      const url = eventSourceUrl("skins", date);
      records.push({
        mode: "skins",
        date,
        week: week as Json,
        externalId: `hbnf:skins:${date}`,
        sourceUrl: url,
        origin: "league_state",
        confidence: 0.99,
        payload: {
          name: "HB Night Flyers Skins",
          start_date: date,
          end_date: date,
          county: "Orange",
          city: "Huntington Beach",
          course_name: "Huntington Beach Disc Golf Course",
          rounds_text: "18 holes",
          event_type: "league",
          format: "Front 9 singles / Back 9 doubles",
          sanctioned: false,
          status: date < today ? "completed" : "upcoming",
          club_host: "HB Night Flyers",
          source_url: url,
        },
      });
    }

    for (const [date, week] of Object.entries(glowWeeks)) {
      if (!dateKey(date) || !week || typeof week !== "object") continue;
      const url = eventSourceUrl("glow", date);
      records.push({
        mode: "glow",
        date,
        week: week as Json,
        externalId: `hbnf:glow:${date}`,
        sourceUrl: url,
        origin: "league_state",
        confidence: 0.99,
        payload: {
          name: "HB Night Flyers Glow Doubles",
          start_date: date,
          end_date: date,
          county: "Orange",
          city: "Huntington Beach",
          course_name: "Huntington Beach Disc Golf Course",
          rounds_text: "18 holes",
          event_type: "doubles",
          format: "Random doubles",
          sanctioned: false,
          status: date < today ? "completed" : "upcoming",
          club_host: "HB Night Flyers",
          source_url: url,
        },
      });
    }

    let derivedGlowScheduleRecords = 0;
    for (const scheduled of KNOWN_2026_GLOW_SCHEDULE) {
      if (Object.hasOwn(glowWeeks, scheduled.date)) continue;
      const date = scheduled.date;
      const url = eventSourceUrl("glow", date);
      records.push({
        mode: "glow",
        date,
        week: { schedule_derived: true, scheduled_start_local: scheduled.startLocal },
        externalId: `hbnf:glow:${date}`,
        sourceUrl: url,
        origin: "club_schedule_rule",
        confidence: 0.97,
        payload: {
          name: "HB Night Flyers Glow Doubles",
          start_date: date,
          end_date: date,
          county: "Orange",
          city: "Huntington Beach",
          course_name: "Huntington Beach Disc Golf Course",
          rounds_text: "18 holes",
          event_type: "doubles",
          format: "Random doubles",
          sanctioned: false,
          status: date < today ? "completed" : "upcoming",
          club_host: "HB Night Flyers",
          source_url: url,
        },
      });
      derivedGlowScheduleRecords += 1;
    }

    records.sort((a, b) => a.date.localeCompare(b.date) || a.mode.localeCompare(b.mode));

    const existing = await service.from("lr_event_sources").select("event_id,external_id").eq("source_id", sourceId).not("external_id", "is", null);
    if (existing.error) throw new Error(existing.error.message);
    const seen = new Set(records.map((record) => record.externalId));
    const missing = (existing.data ?? []).filter((row: any) => row.external_id && !seen.has(row.external_id));

    let valid = 0;
    let rejected = 0;
    let created = 0;
    let matched = 0;
    let reviewRequired = 0;
    let resultsRows = 0;
    const now = new Date().toISOString();

    for (const record of records) {
      const candidateInsert = await service.from("lr_source_candidates").insert({
        source_run_id: runId,
        source_id: sourceId,
        external_id: record.externalId,
        source_url: record.sourceUrl,
        normalized_payload: record.payload,
      }).select("id").single();
      if (candidateInsert.error || !candidateInsert.data) { rejected += 1; continue; }
      const candidateId = candidateInsert.data.id as string;

      const processed = await service.rpc("lr_process_candidate", { p_candidate_id: candidateId });
      const candidate: any = processed.data;
      if (processed.error || !candidate || candidate.validation_status !== "valid" || candidate.scope_status === "out_of_scope") { rejected += 1; continue; }
      valid += 1;
      if (candidate.promotion_status === "review_required") { reviewRequired += 1; continue; }

      let eventId: string | null = candidate.match_event_id ?? null;
      if (eventId) {
        matched += 1;
        const applied = await service.rpc("lr_apply_authoritative_candidate", { p_candidate_id: candidateId });
        if (applied.error) throw new Error(`authoritative apply failed: ${applied.error.message}`);
        eventId = applied.data ?? eventId;
      } else {
        const inserted = await service.from("lr_events").insert({
          slug: `hbnf-${record.mode}-${record.date}`,
          name: record.payload.name,
          start_date: record.date,
          end_date: record.date,
          county: "Orange",
          city: "Huntington Beach",
          course_name: "Huntington Beach Disc Golf Course",
          rounds_text: "18 holes",
          event_type: record.payload.event_type,
          format: record.payload.format,
          sanctioned: false,
          status: record.payload.status,
          club_host: "HB Night Flyers",
          published: false,
          confidence: record.confidence,
          last_verified_at: now,
        }).select("id").single();
        if (inserted.error || !inserted.data) throw new Error(`event insert failed: ${inserted.error?.message}`);
        eventId = inserted.data.id as string;
        created += 1;
      }

      const provenanceRead = await service.from("lr_event_sources").select("id").eq("source_id", sourceId).eq("external_id", record.externalId).maybeSingle();
      const provenance = {
        event_id: eventId,
        source_id: sourceId,
        external_id: record.externalId,
        source_url: record.sourceUrl,
        source_role: "organizer_confirmed",
        is_sanction_basis: false,
        source_payload: summaryPayload(record.mode, record.date, record.week, record.origin),
        confidence: record.confidence,
        last_seen_at: now,
        last_fetched_at: now,
      };
      if (provenanceRead.data?.id) {
        const updated = await service.from("lr_event_sources").update(provenance).eq("id", provenanceRead.data.id);
        if (updated.error) throw new Error(`provenance update failed: ${updated.error.message}`);
      } else {
        const inserted = await service.from("lr_event_sources").insert({ ...provenance, first_seen_at: now });
        if (inserted.error) throw new Error(`provenance insert failed: ${inserted.error.message}`);
      }

      const eventUpdate = await service.from("lr_events").update({
        published: true,
        last_verified_at: now,
        confidence: record.confidence,
      }).eq("id", eventId);
      if (eventUpdate.error) throw new Error(`event publish failed: ${eventUpdate.error.message}`);

      await service.from("lr_source_candidates").update({
        match_event_id: eventId,
        match_confidence: candidate.match_confidence ?? (candidate.match_event_id ? 1 : 0),
        match_method: candidate.match_method ?? "new",
        promotion_status: "promoted",
      }).eq("id", candidateId);

      if (record.mode === "glow") {
        const top = glowTopResults(record.week);
        if (top.length) {
          const cleared = await service.from("lr_results").delete().eq("event_id", eventId).eq("source_id", sourceId).eq("division_code", "OPEN");
          if (cleared.error) throw new Error(`result cleanup failed: ${cleared.error.message}`);
          const resultRows = top.map((result) => ({
            event_id: eventId,
            division_code: "OPEN",
            place: result.place,
            player_name: result.name,
            total_score: result.total,
            source_url: record.sourceUrl,
            source_id: sourceId,
            is_public_selected_division: true,
            last_verified_at: now,
          }));
          const resultInsert = await service.from("lr_results").insert(resultRows);
          if (resultInsert.error) throw new Error(`result insert failed: ${resultInsert.error.message}`);
          resultsRows += resultRows.length;
        }
      }
    }

    if (missing.length) {
      for (const missingRecord of missing as any[]) {
        const open = await service.from("lr_review_queue").select("id").eq("issue_type", "source_disappearance").eq("event_id", missingRecord.event_id).in("status", ["open", "in_review"]).maybeSingle();
        if (!open.data) {
          await service.from("lr_review_queue").insert({
            issue_type: "source_disappearance",
            severity: "medium",
            event_id: missingRecord.event_id,
            summary: "HBNF event disappeared from the current first-party source state",
            details: { source_id: sourceId, external_id: missingRecord.external_id, run_id: runId },
          });
        }
      }
    }

    const runUpdate = await service.from("lr_source_runs").update({
      parse_status: "ok",
      records_seen: records.length,
      records_valid: valid,
      records_new: created,
      records_changed: 0,
      records_rejected: rejected,
      records_missing: missing.length,
      metrics: {
        trigger,
        first_party: true,
        skins_weeks: Object.keys(skinsWeeks).length,
        glow_weeks: Object.keys(glowWeeks).length,
        derived_glow_schedule_records: derivedGlowScheduleRecords,
        matched,
        review_required: reviewRequired,
        results_rows: resultsRows,
      },
    }).eq("id", runId);
    if (runUpdate.error) throw new Error(runUpdate.error.message);

    const finalized = await service.rpc("lr_finalize_source_run", { p_run_id: runId });
    if (finalized.error) throw new Error(`run finalize failed: ${finalized.error.message}`);

    return json({
      ok: true,
      run_id: runId,
      records: records.length,
      valid,
      created,
      matched,
      rejected,
      review_required: reviewRequired,
      missing: missing.length,
      results_rows: resultsRows,
      derived_glow_schedule_records: derivedGlowScheduleRecords,
      health: finalized.data?.health_status ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failRun("parse", message);
    console.error("lr-sync-hbnf", message);
    return json({ error: "sync_failed", detail: message }, 500);
  }
});
