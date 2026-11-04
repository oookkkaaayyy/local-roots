// DORA E1 deterministic, offline-only one-event SQL generator.
// It emits SQL but never connects to a database or executes it.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { DORA_E1 } from "../supabase/functions/lr-sync-hbnf/dora-e1-quarantine.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (why) => { throw new Error("DORA E1 preimage: " + why); };
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
export function validatePreimage(input) {
  if (!input || typeof input !== "object") fail("object required");
  const { event, links, results } = input;
  if (!event || event.id !== DORA_E1.eventId || event.slug !== DORA_E1.slug
      || event.status !== "completed" || event.published !== true
      || typeof event.updated_at !== "string") fail("event identity or full-row baseline");
  if (!Array.isArray(links) || links.length !== 1 || !uuid.test(links[0]?.id ?? "")
      || links[0].event_id !== DORA_E1.eventId || links[0].source_id !== DORA_E1.sourceId
      || links[0].external_id !== DORA_E1.externalId) fail("source association");
  if (!Array.isArray(results) || results.length !== 6) fail("six results required");
  const ids = new Set();
  for (const result of results) {
    if (!uuid.test(result?.id ?? "") || ids.has(result.id)
      || result.event_id !== DORA_E1.eventId || result.source_id !== DORA_E1.sourceId
      || !/^Fixture(?:\s|$)/i.test(result.player_name ?? "")) {
      fail("result identity, provenance or Fixture marker");
    }
    ids.add(result.id);
  }
  return canonical(input);
}
export const CAPTURE_SQL = [
  "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
  "SELECT jsonb_build_object(",
  " 'event', to_jsonb(e),",
  " 'links', (SELECT coalesce(jsonb_agg(to_jsonb(es) ORDER BY es.id), '[]'::jsonb)",
  "           FROM public.lr_event_sources es WHERE es.event_id=e.id),",
  " 'results', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb)",
  "             FROM public.lr_results r WHERE r.event_id=e.id)",
  ") AS e1_preimage FROM public.lr_events e",
  "WHERE e.id='" + DORA_E1.eventId + "'::uuid AND e.slug='" + DORA_E1.slug + "';",
  "COMMIT;",
].join("\n") + "\n";
export function preimageSha256(snapshot) {
  return createHash("sha256").update(JSON.stringify(validatePreimage(snapshot)), "utf8").digest("hex");
}
export function buildTransitionSql(preimage, operation) {
  if (!["apply", "restore"].includes(operation)) fail("operation must be apply or restore");
  const baseline = validatePreimage(preimage);
  const literal = "'" + JSON.stringify(baseline).replaceAll("'", "''") + "'::jsonb";
  const id = "'" + DORA_E1.eventId + "'::uuid";
  const target = operation === "apply" ? "false" : "true";
  const prior = operation === "apply" ? "true" : "false";
  const compareBefore = operation === "apply"
    ? "current_event IS DISTINCT FROM baseline->'event'"
    : "(current_event - 'published' - 'updated_at') IS DISTINCT FROM (baseline->'event' - 'published' - 'updated_at')";
  return [
    "BEGIN;",
    "DO $dora_e1$",
    "DECLARE",
    " baseline jsonb := " + literal + ";",
    " current_event jsonb;",
    " current_links jsonb;",
    " current_results jsonb;",
    "BEGIN",
    " SELECT to_jsonb(e) INTO STRICT current_event FROM public.lr_events e",
    "  WHERE e.id=" + id + " AND e.slug='" + DORA_E1.slug + "' FOR UPDATE;",
    " SELECT coalesce(jsonb_agg(to_jsonb(es) ORDER BY es.id), '[]'::jsonb)",
    "  INTO current_links FROM public.lr_event_sources es WHERE es.event_id=" + id + ";",
    " SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb)",
    "  INTO current_results FROM public.lr_results r WHERE r.event_id=" + id + ";",
    " IF current_links IS DISTINCT FROM baseline->'links'",
    "   OR current_results IS DISTINCT FROM baseline->'results' THEN",
    "   RAISE EXCEPTION 'DORA E1 provenance/results changed since preimage';",
    " END IF;",
    " IF current_event->'published' = '" + target + "'::jsonb THEN",
    "   IF (current_event - 'published' - 'updated_at') IS DISTINCT FROM",
    "      (baseline->'event' - 'published' - 'updated_at') THEN",
    "     RAISE EXCEPTION 'DORA E1 other event fields drifted';",
    "   END IF;",
    " ELSIF current_event->'published' = '" + prior + "'::jsonb THEN",
    "   IF " + compareBefore + " THEN",
    "     RAISE EXCEPTION 'DORA E1 event does not match admitted baseline';",
    "   END IF;",
    "   UPDATE public.lr_events SET published=" + target,
    "     WHERE id=" + id + " AND slug='" + DORA_E1.slug + "' AND published=" + prior + ";",
    "   IF NOT FOUND THEN RAISE EXCEPTION 'DORA E1 compare-and-set failed'; END IF;",
    " ELSE",
    "   RAISE EXCEPTION 'DORA E1 unexpected publication state';",
    " END IF;",
    " IF NOT EXISTS (SELECT 1 FROM public.lr_events WHERE id=" + id + " AND published=" + target + ") THEN",
    "   RAISE EXCEPTION 'DORA E1 publication readback failed';",
    " END IF;",
    "END;",
    "$dora_e1$;",
    "COMMIT;",
  ].join("\n") + "\n";
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const operation = process.argv[2];
  if (operation === "capture") process.stdout.write(CAPTURE_SQL);
  else {
    if (!process.argv[3]) fail("usage: node scripts/dora-e1-release.mjs apply|restore /private/preimage.json");
    const snapshot = JSON.parse(readFileSync(process.argv[3], "utf8"));
    process.stdout.write("-- preimage SHA-256 " + preimageSha256(snapshot) + "\n");
    process.stdout.write(buildTransitionSql(snapshot, operation));
  }
}
