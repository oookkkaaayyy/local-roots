import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESULTS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCORE_TYPES = new Set(["to_par", "total_score", "points"]);

type ScoreType = "to_par" | "total_score" | "points";
type ResultRow = { division_code: string; place: number; player_name: string; value: number };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

function text(value: unknown, max: number) {
  if (value == null) return undefined;
  const result = String(value).trim();
  return result ? result.slice(0, max) : undefined;
}

async function readBoundedJson(req: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new Error("request_too_large");
  }
  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new Error("request_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
  return parsed as Record<string, unknown>;
}

function normalizeRows(input: unknown, scoreType: ScoreType): ResultRow[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_RESULTS) return null;
  const rows: ResultRow[] = [];
  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const row = candidate as Record<string, unknown>;
    const division = text(row.division_code, 24)?.toUpperCase();
    const player = text(row.player_name, 160);
    const place = Number(row.place);
    const value = Number(row.value);
    if (!division || !player || !Number.isInteger(place) || place < 1 || place > 999 || !Number.isFinite(value)) return null;
    if ((scoreType === "to_par" || scoreType === "total_score") && !Number.isInteger(value)) return null;
    if (scoreType === "total_score" && value <= 0) return null;
    if (scoreType === "points" && value < 0) return null;
    rows.push({ division_code: division, place, player_name: player, value });
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "service_unavailable" }, 503);

  let input: Record<string, unknown>;
  try {
    input = await readBoundedJson(req);
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large") return json({ error: "request_too_large" }, 413);
    return json({ error: "invalid_json" }, 400);
  }

  // Public-form honeypot. A populated value is accepted but discarded.
  if (text(input.website, 200)) return json({ ok: true });

  const eventId = text(input.event_id, 36);
  const scoreType = text(input.score_type, 32) as ScoreType | undefined;
  const submitterName = text(input.submitter_name, 160);
  const submitterEmail = text(input.submitter_email, 320)?.toLowerCase();
  const submitterRole = text(input.submitter_role, 120);
  const organization = text(input.organization, 200);
  const featuredDivision = text(input.featured_division, 24)?.toUpperCase();
  const sourceNotes = text(input.source_notes, 2000);

  if (!eventId || !UUID_RE.test(eventId) || !scoreType || !SCORE_TYPES.has(scoreType)) return json({ error: "invalid_submission" }, 400);
  if (!submitterName || !submitterEmail || !submitterEmail.includes("@") || !submitterRole || !organization || !featuredDivision || input.attested !== true) {
    return json({ error: "missing_required_fields" }, 400);
  }

  const rows = normalizeRows(input.results, scoreType);
  if (!rows || !rows.some((row) => row.division_code === featuredDivision)) return json({ error: "invalid_results" }, 400);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("lr_ingest_result_submission", {
    p_submission: {
      event_id: eventId,
      score_type: scoreType,
      featured_division: featuredDivision,
      results: rows,
      submitter_name: submitterName,
      submitter_email: submitterEmail,
      submitter_role: submitterRole,
      organization,
      source_notes: sourceNotes,
      attested: true,
    },
  });

  if (error) {
    console.error("lr-submit-results", error.code, error.message);
    return json({ error: "submission_rejected" }, 400);
  }

  return json({ ok: true, submission_id: data }, 201);
});
