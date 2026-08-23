import { createClient } from "npm:@supabase/supabase-js@2";

type FeedItem = { externalId: string; title: string; link: string; publishedAt: string | null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .trim();
}
function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}
function parseFeed(xml: string): FeedItem[] {
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  const items: FeedItem[] = [];
  for (const block of blocks) {
    const title = tag(block, "title");
    const link = tag(block, "link");
    const guid = tag(block, "guid");
    const pubDate = tag(block, "pubDate");
    const externalId = guid || link;
    if (!title || !link || !externalId || !/^https?:\/\//i.test(link)) continue;
    const parsedDate = pubDate ? new Date(pubDate) : null;
    items.push({ externalId, title, link, publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null });
  }
  return items;
}
function shouldAlert(title: string) {
  return /(registration|register|event|tournament|schedule|calendar|upcoming|open for)/i.test(title);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "server_configuration" }, 500);
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = req.headers.get("x-local-roots-sync-secret") ?? "";
  const verified = await service.rpc("lr_verify_socal_rss_sync_secret", { p_token: token });
  if (verified.error || verified.data !== true) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* optional body */ }
  const trigger = body.trigger === "cron" ? "cron" : "manual";
  const sourceRead = await service.from("lr_sources").select("id,base_url,enabled").eq("key", "socal_dgc_rss").maybeSingle();
  if (sourceRead.error || !sourceRead.data?.enabled || !sourceRead.data.base_url) return json({ error: "source_disabled_or_missing" }, 409);
  const sourceId = sourceRead.data.id as string;
  const feedUrl = sourceRead.data.base_url as string;

  const runInsert = await service.from("lr_source_runs").insert({
    source_id: sourceId, fetch_status: "running", parse_status: "pending", validation_status: "pending", health_status: "running",
    scheduler_status: trigger === "cron" ? "ok" : "skipped", parser_version: "socal-rss-v1", metrics: { trigger, discovery_only: true },
  }).select("id").single();
  if (runInsert.error || !runInsert.data) return json({ error: "run_create_failed", detail: runInsert.error?.message }, 500);
  const runId = runInsert.data.id as string;

  async function fail(stage: "fetch" | "parse", message: string) {
    await service.from("lr_source_runs").update({
      fetch_status: stage === "fetch" ? "failed" : "ok",
      parse_status: stage === "fetch" ? "skipped" : "failed",
      validation_status: "skipped",
      error_code: `socal_rss_${stage}_failed`, error_message: message.slice(0, 2000),
    }).eq("id", runId);
    await service.rpc("lr_finalize_source_run", { p_run_id: runId });
  }

  let xml = "";
  try {
    const response = await fetch(feedUrl, { headers: { "User-Agent": "LocalRoots/1.0 (+https://local-roots.pages.dev/)" } });
    if (!response.ok) throw new Error(`RSS HTTP ${response.status}`);
    xml = await response.text();
    await service.from("lr_source_runs").update({ fetch_status: "ok", parse_status: "running" }).eq("id", runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await fail("fetch", message);
    return json({ error: "fetch_failed", detail: message }, 502);
  }

  try {
    const items = parseFeed(xml);
    if (!items.length) throw new Error("RSS contained no valid items");
    const latest = items[0];
    const cursorRead = await service.from("lr_source_cursors").select("cursor").eq("source_id", sourceId).maybeSingle();
    if (cursorRead.error) throw new Error(cursorRead.error.message);

    if (!cursorRead.data) {
      const baseline = await service.from("lr_source_cursors").insert({ source_id: sourceId, cursor: latest.externalId, checked_at: new Date().toISOString() });
      if (baseline.error) throw new Error(baseline.error.message);
      await service.from("lr_source_runs").update({
        parse_status: "ok", validation_status: "ok", records_seen: items.length, records_valid: items.length,
        records_new: 0, records_changed: 0, records_rejected: 0, records_missing: 0,
        metrics: { trigger, discovery_only: true, baseline: true, latest_title: latest.title },
      }).eq("id", runId);
      const final = await service.rpc("lr_finalize_source_run", { p_run_id: runId });
      if (final.error) throw new Error(final.error.message);
      return json({ ok: true, baseline: true, items_seen: items.length, alerts_created: 0, health: final.data?.health_status ?? null });
    }

    const previousCursor = cursorRead.data.cursor as string;
    const cursorIndex = items.findIndex((item) => item.externalId === previousCursor);
    if (cursorIndex < 0) {
      const existing = await service.from("lr_review_queue").select("id").eq("issue_type", "source_cursor_gap").in("status", ["open", "in_review"]).contains("details", { source_id: sourceId }).maybeSingle();
      if (!existing.data) {
        await service.from("lr_review_queue").insert({
          issue_type: "source_cursor_gap", severity: "medium", summary: "SoCal DGC RSS cursor fell outside the current feed",
          details: { source_id: sourceId, source_key: "socal_dgc_rss", prior_cursor: previousCursor, latest_external_id: latest.externalId, feed_url: feedUrl, publication_behavior: "Discovery only; no event changes made." },
        });
      }
      await service.from("lr_source_cursors").update({ cursor: latest.externalId, checked_at: new Date().toISOString() }).eq("source_id", sourceId);
      await service.from("lr_source_runs").update({
        parse_status: "ok", validation_status: "warning", records_seen: items.length, records_valid: items.length,
        records_new: 0, records_changed: 0, records_rejected: 0, records_missing: 0,
        metrics: { trigger, discovery_only: true, cursor_gap: true, latest_title: latest.title },
      }).eq("id", runId);
      const final = await service.rpc("lr_finalize_source_run", { p_run_id: runId });
      if (final.error) throw new Error(final.error.message);
      return json({ ok: true, cursor_gap: true, items_seen: items.length, alerts_created: 1, health: final.data?.health_status ?? null });
    }

    const newItems = items.slice(0, cursorIndex).reverse();
    let inserted = 0, alertsCreated = 0;
    for (const item of newItems) {
      const created = await service.from("lr_source_discovery_items").upsert({
        source_id: sourceId, external_id: item.externalId, title: item.title, source_url: item.link, published_at: item.publishedAt,
      }, { onConflict: "source_id,external_id", ignoreDuplicates: true }).select("id,review_id").maybeSingle();
      if (created.error) throw new Error(created.error.message);
      if (!created.data) continue;
      inserted++;
      if (!shouldAlert(item.title)) continue;
      const review = await service.from("lr_review_queue").insert({
        issue_type: "source_update", severity: "low", summary: `SoCal DGC posted: ${item.title}`.slice(0, 500),
        details: { source_id: sourceId, source_key: "socal_dgc_rss", external_id: item.externalId, source_url: item.link, published_at: item.publishedAt, discovery_only: true, publication_behavior: "Review only; no event changes made." },
      }).select("id").single();
      if (review.error) throw new Error(review.error.message);
      alertsCreated++;
      await service.from("lr_source_discovery_items").update({ review_id: review.data.id }).eq("id", created.data.id);
    }

    await service.from("lr_source_cursors").update({ cursor: latest.externalId, checked_at: new Date().toISOString() }).eq("source_id", sourceId);
    await service.from("lr_source_runs").update({
      parse_status: "ok", validation_status: "ok", records_seen: items.length, records_valid: items.length,
      records_new: inserted, records_changed: 0, records_rejected: 0, records_missing: 0,
      metrics: { trigger, discovery_only: true, new_feed_items: newItems.length, discovery_items_inserted: inserted, alerts_created: alertsCreated, latest_title: latest.title },
    }).eq("id", runId);
    const final = await service.rpc("lr_finalize_source_run", { p_run_id: runId });
    if (final.error) throw new Error(final.error.message);
    return json({ ok: true, baseline: false, items_seen: items.length, new_items: newItems.length, discovery_items_inserted: inserted, alerts_created: alertsCreated, health: final.data?.health_status ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await fail("parse", message);
    console.error("lr-sync-socal-rss", message);
    return json({ error: "sync_failed", detail: message }, 500);
  }
});
