import { createClient } from "npm:@supabase/supabase-js@2.57.0";
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";

const SUBJECT = "https://localrootsdg.com/dyed-and-unattached";
const URL_ADMIN = "/admin/dyed-and-unattached";
const SUB_GAP_MS = 30 * 60 * 1000, DIGEST_GAP_MS = 7 * 864e5, ABUSE_GAP_MS = 6 * 3600e3;
const MONTH_CAP = 120, THRESH = [0.5, 0.8, 1], HOUR_ALERT = 15;
const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function st(key: string) { const { data } = await service.from("du_notify_state").select("val").eq("key", key).maybeSingle(); return (data?.val ?? null) as Record<string, any> | null }
async function put(key: string, val: Record<string, unknown>) { await service.from("du_notify_state").upsert({ key, val, updated_at: new Date().toISOString() }) }
async function cnt(q: any) { const { count } = await q; return count || 0 }

async function push(title: string, body: string, tag: string) {
  const { data: cfg } = await service.from("du_push_config").select("public_key,private_key").eq("id", 1).maybeSingle();
  const { data: subs } = await service.from("du_push_subscriptions").select("id,endpoint,p256dh,auth,failure_count").is("disabled_at", null);
  if (!cfg || !subs?.length) return 0;
  webpush.setVapidDetails(SUBJECT, cfg.public_key, cfg.private_key);
  let sent = 0; const now = new Date().toISOString();
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, url: URL_ADMIN, tag, badge: 1 }), { TTL: 86400, urgency: "normal" });
      sent++; await service.from("du_push_subscriptions").update({ last_success_at: now, failure_count: 0, updated_at: now }).eq("id", s.id);
    } catch (e) {
      const code = Number((e as { statusCode?: number })?.statusCode || 0);
      const patch: Record<string, unknown> = { failure_count: Number(s.failure_count || 0) + 1, updated_at: now };
      if (code === 404 || code === 410) patch.disabled_at = now;
      await service.from("du_push_subscriptions").update(patch).eq("id", s.id);
    }
  }
  return sent;
}

Deno.serve(async () => {
  const now = Date.now(), iso = new Date(now).toISOString(), out: string[] = [];
  // 1 submissions (saved designs), batched, one push per 30 min at most
  const sub = (await st("sub")) || { cursor: iso, last: 0 };
  if (!(await st("sub"))) await put("sub", sub);
  const { data: fresh } = await service.from("du_dye_recipes").select("created_at").gt("created_at", sub.cursor).eq("status", "new").order("created_at", { ascending: false }).limit(1000);
  if (fresh?.length && now - Number(sub.last || 0) >= SUB_GAP_MS) {
    const n = fresh.length;
    if (await push("D&U Dye Studio", `${n} new saved design${n === 1 ? "" : "s"}`, "du-recipes")) { await put("sub", { cursor: fresh[0].created_at, last: now }); out.push("sub:" + n) }
  }
  // 2 accumulation digest: +5 waiting since last digest, or weekly while any wait
  const waitR = await cnt(service.from("du_dye_recipes").select("id", { count: "exact", head: true }).eq("status", "new"));
  const waitJ = await cnt(service.from("jobs").select("id", { count: "exact", head: true }).eq("status", "new"));
  const wait = waitR + waitJ, dg = await st("digest");
  if (!dg) await put("digest", { count: wait, last: now });
  else if (wait > 0 && (wait - Number(dg.count) >= 5 || now - Number(dg.last) >= DIGEST_GAP_MS)) {
    if (await push("D&U waiting", `${waitJ} request${waitJ === 1 ? "" : "s"} and ${waitR} saved design${waitR === 1 ? "" : "s"} unhandled`, "du-digest")) { await put("digest", { count: wait, last: now }); out.push("digest:" + wait) }
  } else if (wait < Number(dg.count)) await put("digest", { count: wait, last: dg.last });
  // 3 usage thresholds, once each per month
  const m = new Date(now); m.setUTCDate(1); m.setUTCHours(0, 0, 0, 0);
  const used = await cnt(service.from("du_stencil_gen_log").select("id", { count: "exact", head: true }).eq("ok", true).neq("ip_hash", "admin").gte("created_at", m.toISOString()));
  const key = "usage_" + m.toISOString().slice(0, 7), us = (await st(key)) || { level: 0 };
  const lvl = THRESH.filter((t) => used >= Math.round(MONTH_CAP * t)).length;
  if (lvl > Number(us.level)) {
    const body = lvl === 3 ? `${used} of ${MONTH_CAP} monthly generations used. Generation is stopped until next month.` : `${used} of ${MONTH_CAP} monthly generations used`;
    if (await push("D&U generation usage", body, "du-usage")) { await put(key, { level: lvl }); out.push("usage:" + lvl) }
  }
  // 4 abuse: global hourly spike, once per 6 h
  const hr = await cnt(service.from("du_stencil_gen_log").select("id", { count: "exact", head: true }).eq("ok", true).neq("ip_hash", "admin").gte("created_at", new Date(now - 3600e3).toISOString()));
  const ab = await st("abuse");
  if (hr >= HOUR_ALERT && now - Number(ab?.last || 0) >= ABUSE_GAP_MS) {
    if (await push("D&U generation spike", `${hr} generations in the last hour. Hourly cap is active.`, "du-abuse")) { await put("abuse", { last: now }); out.push("abuse:" + hr) }
  }
  return new Response(JSON.stringify({ ok: true, out }), { headers: { "content-type": "application/json" } });
});
