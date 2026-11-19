import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-du-device-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const BUCKET = "du-dye-designs";
const FILES: Array<[string, string]> = [
  ["preview", "preview.png"], ["stencil_svg", "stencil.svg"], ["stencil_png", "stencil.png"],
  ["photo", "photo.jpg"], ["design", "design.json"],
];
const STATUSES = new Set(["new", "making", "done", "archived"]);
type Service = ReturnType<typeof createClient>;

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function isAdmin(service: Service, req: Request): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const deviceToken = String(req.headers.get("x-du-device-token") || "").trim();
  if (deviceToken.length >= 32 && deviceToken.length <= 256) {
    const { data: device } = await service.from("du_admin_device_tokens").select("id,user_id")
      .eq("token_hash", await sha256Hex(deviceToken)).is("revoked_at", null).gt("expires_at", nowIso).maybeSingle();
    if (device) {
      const { data: admin } = await service.from("lr_admin_users").select("user_id")
        .eq("user_id", device.user_id).eq("active", true).maybeSingle();
      if (admin) return true;
    }
  }
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const { data: userData, error } = await service.auth.getUser(authHeader.slice(7));
  if (error || !userData.user) return false;
  const { data: admin } = await service.from("lr_admin_users").select("user_id")
    .eq("user_id", userData.user.id).eq("active", true).maybeSingle();
  return !!admin;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "server_config_missing" }, 500);
  const service = createClient(url, key, { auth: { persistSession: false } });
  if (!(await isAdmin(service, req))) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");

  const signed = async (id: string, files: Record<string, boolean>, fileName: string, download: boolean) => {
    const out: Record<string, string> = {};
    for (const [k, name] of FILES) {
      if (!files[k]) continue;
      const ext = name.slice(name.lastIndexOf("."));
      const { data } = await service.storage.from(BUCKET).createSignedUrl(`${id}/${name}`, 3600,
        download ? { download: `${fileName}${k === "stencil_svg" ? "_CRICUT" : k === "stencil_png" ? "_stencil" : k === "photo" ? "_photo" : k === "design" ? "_design" : ""}${ext}` } : undefined);
      if (data?.signedUrl) out[k] = data.signedUrl;
    }
    return out;
  };

  if (action === "list") {
    const status = body.status ? String(body.status) : null;
    let q = service.from("du_dye_recipes").select("id,created_at,file_name,plastic,base_hex,status,has_stencil,files,spec")
      .order("created_at", { ascending: false }).limit(200);
    q = status ? q.eq("status", status) : q.neq("status", "archived");
    const { data, error } = await q;
    if (error) return json({ error: "list_failed", detail: error.message }, 400);
    const items = [];
    for (const row of data || []) {
      const urls = row.files?.preview ? await signed(row.id, { preview: true }, row.file_name, false) : {};
      items.push({ ...row, spec: undefined, layers: (row.spec?.layers || []).filter((l: any) => l.vis !== false).map((l: any) => ({ type: l.type, dyes: (l.dyes || []).map((d: any) => d.n) })), preview_url: urls.preview || null });
    }
    return json({ items });
  }
  if (action === "get") {
    const { data, error } = await service.from("du_dye_recipes").select("*").eq("id", String(body.id || "")).maybeSingle();
    if (error || !data) return json({ error: "not_found" }, 404);
    return json({ item: data, urls: await signed(data.id, data.files || {}, data.file_name, true), view: await signed(data.id, data.files || {}, data.file_name, false) });
  }
  if (action === "status") {
    const status = String(body.status || "");
    if (!STATUSES.has(status)) return json({ error: "bad_status" }, 400);
    const { error } = await service.from("du_dye_recipes").update({ status }).eq("id", String(body.id || ""));
    if (error) return json({ error: "update_failed", detail: error.message }, 400);
    return json({ ok: true });
  }
  return json({ error: "unknown_action" }, 400);
});
