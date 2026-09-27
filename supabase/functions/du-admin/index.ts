import { createClient } from "npm:@supabase/supabase-js@2.57.0";
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-du-device-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const workflowStates = new Set([
  "draft", "intake_complete", "handoff_preparing", "chatgpt_ready",
  "notification_sent", "stage_a_started", "awaiting_art_approval",
  "art_approved", "production_ready", "complete", "handoff_failed",
]);
const vapidSubject = "https://localrootsdg.com/dyed-and-unattached";
const pairAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
type ServiceClient = ReturnType<typeof createClient>;
type PushConfig = { public_key: string; private_key: string };
type PushRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
};

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newPairCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => pairAlphabet[byte & 31]).join("");
}

function displayPairCode(code: string) {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

function randomDeviceToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

type AdminAuth = {
  userId: string;
  email: string | null;
  admin: { user_id: string; display_name: string | null; role: string; active: boolean };
  mode: "jwt" | "device";
  deviceId?: string;
  deviceExpiresAt?: string;
};

async function resolveAdmin(service: ServiceClient, req: Request): Promise<AdminAuth | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const deviceToken = String(req.headers.get("x-du-device-token") || "").trim();
  if (deviceToken.length >= 32 && deviceToken.length <= 256) {
    const tokenHash = await sha256Hex(deviceToken);
    const { data: device } = await service.from("du_admin_device_tokens")
      .select("id,user_id,expires_at")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
      .maybeSingle();
    if (device) {
      const { data: admin } = await service.from("lr_admin_users")
        .select("user_id,display_name,role,active")
        .eq("user_id", device.user_id).eq("active", true).maybeSingle();
      if (admin) {
        const extendedExpiry = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
        await service.from("du_admin_device_tokens").update({
          last_used_at: nowIso,
          expires_at: extendedExpiry,
        }).eq("id", device.id);
        return {
          userId: device.user_id,
          email: null,
          admin,
          mode: "device",
          deviceId: device.id,
          deviceExpiresAt: extendedExpiry,
        };
      }
    }
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData.user) return null;
  const { data: admin } = await service.from("lr_admin_users")
    .select("user_id,display_name,role,active")
    .eq("user_id", userData.user.id).eq("active", true).maybeSingle();
  if (!admin) return null;
  return {
    userId: userData.user.id,
    email: userData.user.email || null,
    admin,
    mode: "jwt",
  };
}

async function ensurePushConfig(service: ServiceClient): Promise<PushConfig> {
  const { data: existing, error: readError } = await service.from("du_push_config")
    .select("public_key,private_key").eq("id", 1).maybeSingle();
  if (readError) throw readError;
  if (existing) return existing as PushConfig;

  const generated = webpush.generateVAPIDKeys();
  const { data: created, error: createError } = await service.from("du_push_config").insert({
    id: 1,
    public_key: generated.publicKey,
    private_key: generated.privateKey,
  }).select("public_key,private_key").single();
  if (!createError && created) return created as PushConfig;

  // A concurrent first-time setup may have inserted the singleton first.
  const { data: raced, error: raceError } = await service.from("du_push_config")
    .select("public_key,private_key").eq("id", 1).single();
  if (raceError || !raced) throw createError || raceError || new Error("push_config_failed");
  return raced as PushConfig;
}

async function sendPushes(
  service: ServiceClient,
  config: PushConfig,
  subscriptions: PushRow[],
  payload: Record<string, unknown>,
) {
  webpush.setVapidDetails(vapidSubject, config.public_key, config.private_key);
  let sent = 0;
  const now = new Date().toISOString();

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify(payload), { TTL: 86400, urgency: "high" });
      sent += 1;
      await service.from("du_push_subscriptions").update({
        last_success_at: now,
        failure_count: 0,
        updated_at: now,
      }).eq("id", subscription.id);
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
      const patch: Record<string, unknown> = {
        failure_count: Number(subscription.failure_count || 0) + 1,
        updated_at: now,
      };
      if (statusCode === 404 || statusCode === 410) patch.disabled_at = now;
      console.error("D&U push delivery failed", { subscription_id: subscription.id, statusCode });
      await service.from("du_push_subscriptions").update(patch).eq("id", subscription.id);
    }
  }
  return sent;
}

const galleryImageRoles = ["source_photo", "stencil", "finished_disc"] as const;
type GalleryImageRole = typeof galleryImageRoles[number];

function decodeGalleryImage(value: unknown) {
  const text = String(value || "");
  const match = text.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("invalid_gallery_image");
  const mime = match[1];
  const raw = atob(match[2]);
  if (!raw.length || raw.length > 6 * 1024 * 1024) throw new Error("gallery_image_too_large");
  const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
  const jpeg = mime === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = mime === "image/png" && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = mime === "image/webp" && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (!jpeg && !png && !webp) throw new Error("invalid_gallery_image_signature");
  const extension = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  return { bytes, mime, extension };
}

const galleryRoleColumn: Record<GalleryImageRole, "source_photo_path"|"stencil_path"|"finished_disc_path"> = {
  source_photo: "source_photo_path",
  stencil: "stencil_path",
  finished_disc: "finished_disc_path",
};

function galleryImageCount(item: Record<string, unknown>) {
  return ["source_photo_path","stencil_path","finished_disc_path"].filter(key=>Boolean(item[key])).length;
}

async function getGalleryItem(service: ServiceClient, itemId: string) {
  const { data, error } = await service.from("gallery_items")
    .select("id,job_id,is_published,caption,source_photo_path,stencil_path,finished_disc_path,sort_order,created_at,updated_at")
    .eq("id", itemId).maybeSingle();
  if (error) throw error;
  return data;
}

async function uploadGalleryReplacement(service: ServiceClient, itemId: string, role: GalleryImageRole, value: unknown) {
  const image = decodeGalleryImage(value);
  const path = `items/${itemId}/${role}-${Date.now()}-${crypto.randomUUID().slice(0,8)}.${image.extension}`;
  const { error } = await service.storage.from("du-gallery").upload(path, image.bytes, {
    contentType: image.mime,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_config_missing" }, 500);

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const auth = await resolveAdmin(service, req);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const { admin, userId } = auth;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "dashboard");

  if (action === "device_register") {
    if (auth.mode !== "jwt") {
      return json({ ok: true, already_paired: true, expires_at: auth.deviceExpiresAt || null });
    }
    const rawToken = randomDeviceToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    await service.from("du_admin_device_tokens")
      .delete().eq("user_id", userId).lt("expires_at", new Date().toISOString());
    const { error } = await service.from("du_admin_device_tokens").insert({
      token_hash: tokenHash,
      user_id: userId,
      label: String(body.label || "D&U admin device").slice(0, 120),
      user_agent: String(body.user_agent || req.headers.get("user-agent") || "").slice(0, 1000) || null,
      expires_at: expiresAt,
      last_used_at: new Date().toISOString(),
    });
    if (error) return json({ error: "device_register_failed", detail: error.message }, 400);
    return json({ ok: true, device_token: rawToken, expires_at: expiresAt });
  }

  if (action === "dashboard") {
    const { data: jobs, error } = await service.from("jobs").select([
      "id", "job_number", "client_name", "phone", "email", "subject_name", "subject_type",
      "disc_brand", "disc_model", "disc_details", "notes", "created_at", "updated_at",
      "workflow_status", "handoff_ready_at", "handoff_last_error", "handoff_retry_count",
      "drive_folder_id", "notification_sent_at", "stage_a_started_at", "art_approved_at",
      "production_ready_at", "completed_at", "latest_draft_path", "final_stencil_path",
      "finished_disc_path",
    ].join(",")).order("created_at", { ascending: false }).limit(300);
    if (error) return json({ error: "dashboard_failed", detail: error.message }, 400);
    const ids = (jobs || []).map((job) => job.id);
    const { data: photos, error: photoError } = ids.length
      ? await service.from("job_photos").select("job_id").in("job_id", ids)
      : { data: [], error: null };
    if (photoError) return json({ error: "dashboard_failed", detail: photoError.message }, 400);
    const counts = new Map<string, number>();
    for (const photo of photos || []) counts.set(photo.job_id, (counts.get(photo.job_id) || 0) + 1);
    return json({ admin, jobs: (jobs || []).map((job) => ({ ...job, source_photo_count: counts.get(job.id) || 0 })) });
  }

  if (action === "job") {
    const jobNumber = String(body.job_number || "").trim().toUpperCase();
    const jobId = String(body.job_id || "").trim();
    let query = service.from("jobs").select("*").limit(1);
    query = jobId ? query.eq("id", jobId) : query.eq("job_number", jobNumber);
    const { data: rows, error } = await query;
    const job = rows?.[0];
    if (error || !job) return json({ error: "job_not_found" }, 404);
    const { data: photos, error: photoError } = await service.from("job_photos").select("*")
      .eq("job_id", job.id).order("sort_order");
    if (photoError) return json({ error: "job_failed", detail: photoError.message }, 400);
    const hydrated = await Promise.all((photos || []).map(async (photo) => {
      const { data } = await service.storage.from(photo.storage_bucket || "du-intake")
        .createSignedUrl(photo.storage_path, 3600);
      return { ...photo, signed_url: data?.signedUrl || null };
    }));
    const { data: options } = await service.from("draft_options").select("*")
      .eq("job_id", job.id).order("option_code");
    const { data: checklist } = await service.from("production_checklist").select("*")
      .eq("job_id", job.id).maybeSingle();
    return json({ job, photos: hydrated, options: options || [], checklist });
  }

  if (action === "set_workflow") {
    const jobId = String(body.job_id || "").trim();
    const workflowStatus = String(body.workflow_status || "").trim();
    if (!jobId || !workflowStates.has(workflowStatus)) return json({ error: "invalid_workflow_update" }, 400);
    const patch: Record<string, unknown> = { workflow_status: workflowStatus };
    if (workflowStatus === "handoff_failed") {
      patch.handoff_last_error = String(body.handoff_last_error || "Handoff failed").slice(0, 2000);
      const { data: existing } = await service.from("jobs").select("handoff_retry_count").eq("id", jobId).single();
      patch.handoff_retry_count = Number(existing?.handoff_retry_count || 0) + 1;
    } else if (body.clear_handoff_error) patch.handoff_last_error = null;
    const { data, error } = await service.from("jobs").update(patch).eq("id", jobId)
      .select("id,job_number,workflow_status,updated_at").single();
    if (error) return json({ error: "workflow_update_failed", detail: error.message }, 400);
    return json({ ok: true, job: data });
  }

  if (action === "gallery_list") {
    const { data, error } = await service.from("gallery_items")
      .select("id,job_id,is_published,caption,source_photo_path,stencil_path,finished_disc_path,sort_order,created_at,updated_at")
      .order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    if (error) return json({ error: "gallery_list_failed", detail: error.message }, 400);
    return json({ items: data || [] });
  }

  if (action === "gallery_upload") {
    try {
      const caption = String(body.caption || "").trim().slice(0, 300) || null;
      const publish = body.is_published === true;
      const images = body.images && typeof body.images === "object" ? body.images : {};
      const supplied = galleryImageRoles.filter(role => Boolean(images[role]));
      if (supplied.length < 2) return json({ error: "gallery_needs_two_images" }, 400);

      const decoded = new Map<GalleryImageRole, ReturnType<typeof decodeGalleryImage>>();
      for (const role of supplied) decoded.set(role, decodeGalleryImage(images[role]));

      const itemId = crypto.randomUUID();
      const { data: latest, error: orderError } = await service.from("gallery_items")
        .select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      if (orderError) return json({ error: "gallery_order_failed", detail: orderError.message }, 400);
      const sortOrder = Number(latest?.sort_order ?? -1) + 1;
      const paths: Partial<Record<GalleryImageRole, string>> = {};
      const uploaded: string[] = [];

      for (const role of supplied) {
        const image = decoded.get(role)!;
        const path = `items/${itemId}/${role}.${image.extension}`;
        const { error } = await service.storage.from("du-gallery").upload(path, image.bytes, {
          contentType: image.mime,
          cacheControl: "31536000",
          upsert: false,
        });
        if (error) {
          if (uploaded.length) await service.storage.from("du-gallery").remove(uploaded);
          return json({ error: "gallery_upload_failed", detail: error.message }, 400);
        }
        uploaded.push(path);
        paths[role] = path;
      }

      const { data, error } = await service.from("gallery_items").insert({
        id: itemId,
        job_id: null,
        is_published: publish,
        caption,
        source_photo_path: paths.source_photo || null,
        stencil_path: paths.stencil || null,
        finished_disc_path: paths.finished_disc || null,
        sort_order: sortOrder,
      }).select("id,is_published,caption,source_photo_path,stencil_path,finished_disc_path,sort_order,created_at,updated_at").single();
      if (error) {
        if (uploaded.length) await service.storage.from("du-gallery").remove(uploaded);
        return json({ error: "gallery_insert_failed", detail: error.message }, 400);
      }
      return json({ ok: true, item: data });
    } catch (error) {
      const code = error instanceof Error ? error.message : "gallery_upload_failed";
      const status = code === "gallery_image_too_large" ? 413 : 400;
      return json({ error: code }, status);
    }
  }

  if (action === "gallery_update") {
    const itemId = String(body.item_id || "").trim();
    if (!itemId) return json({ error: "gallery_item_required" }, 400);
    try {
      const existing = await getGalleryItem(service, itemId);
      if (!existing) return json({ error: "gallery_item_not_found" }, 404);
      const patch: Record<string, unknown> = {};
      if (Object.prototype.hasOwnProperty.call(body, "caption")) {
        patch.caption = String(body.caption || "").trim().slice(0, 300) || null;
      }

      const images = body.images && typeof body.images === "object" ? body.images : {};
      const supplied = galleryImageRoles.filter(role => Boolean(images[role]));
      const uploaded: string[] = [];
      const replacedOld: string[] = [];
      try {
        for (const role of supplied) {
          const nextPath = await uploadGalleryReplacement(service, itemId, role, images[role]);
          uploaded.push(nextPath);
          const column = galleryRoleColumn[role];
          const oldPath = String(existing[column] || "");
          if (oldPath && !oldPath.startsWith("legacy:")) replacedOld.push(oldPath);
          patch[column] = nextPath;
        }
      } catch (error) {
        if (uploaded.length) await service.storage.from("du-gallery").remove(uploaded);
        throw error;
      }

      if (!Object.keys(patch).length) return json({ ok: true, item: existing });
      const preview = { ...existing, ...patch };
      if (existing.is_published && galleryImageCount(preview) < 2) patch.is_published = false;

      const { data, error } = await service.from("gallery_items").update(patch).eq("id", itemId)
        .select("id,job_id,is_published,caption,source_photo_path,stencil_path,finished_disc_path,sort_order,created_at,updated_at").single();
      if (error) {
        if (uploaded.length) await service.storage.from("du-gallery").remove(uploaded);
        return json({ error: "gallery_update_failed", detail: error.message }, 400);
      }
      if (replacedOld.length) await service.storage.from("du-gallery").remove(replacedOld);
      return json({ ok: true, item: data });
    } catch (error) {
      const code = error instanceof Error ? error.message : "gallery_update_failed";
      const status = code === "gallery_image_too_large" ? 413 : 400;
      return json({ error: code }, status);
    }
  }

  if (action === "gallery_remove_image") {
    const itemId = String(body.item_id || "").trim();
    const role = String(body.role || "") as GalleryImageRole;
    if (!itemId || !galleryImageRoles.includes(role)) return json({ error: "invalid_gallery_image_remove" }, 400);
    const existing = await getGalleryItem(service, itemId);
    if (!existing) return json({ error: "gallery_item_not_found" }, 404);
    const column = galleryRoleColumn[role];
    const oldPath = String(existing[column] || "");
    const patch: Record<string, unknown> = { [column]: null };
    const preview = { ...existing, [column]: null };
    if (existing.is_published && galleryImageCount(preview) < 2) patch.is_published = false;
    const { data, error } = await service.from("gallery_items").update(patch).eq("id", itemId)
      .select("id,job_id,is_published,caption,source_photo_path,stencil_path,finished_disc_path,sort_order,created_at,updated_at").single();
    if (error) return json({ error: "gallery_remove_failed", detail: error.message }, 400);
    if (oldPath && !oldPath.startsWith("legacy:")) await service.storage.from("du-gallery").remove([oldPath]);
    return json({ ok: true, item: data });
  }

  if (action === "gallery_delete") {
    const itemId = String(body.item_id || "").trim();
    if (!itemId) return json({ error: "gallery_item_required" }, 400);
    const existing = await getGalleryItem(service, itemId);
    if (!existing) return json({ error: "gallery_item_not_found" }, 404);
    const paths = [existing.source_photo_path,existing.stencil_path,existing.finished_disc_path].filter(path=>Boolean(path)&&!String(path).startsWith("legacy:")) as string[];
    const { error } = await service.from("gallery_items").delete().eq("id", itemId);
    if (error) return json({ error: "gallery_delete_failed", detail: error.message }, 400);
    if (paths.length) await service.storage.from("du-gallery").remove(paths);
    return json({ ok: true });
  }

  if (action === "gallery_move") {
    const itemId = String(body.item_id || "").trim();
    const direction = String(body.direction || "");
    if (!itemId || !["earlier","later"].includes(direction)) return json({ error: "invalid_gallery_move" }, 400);
    const { data: ordered, error } = await service.from("gallery_items")
      .select("id,sort_order,created_at").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    if (error) return json({ error: "gallery_move_failed", detail: error.message }, 400);
    const index = (ordered || []).findIndex(item=>item.id===itemId);
    const targetIndex = direction === "earlier" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= (ordered || []).length) return json({ ok: true });
    const current = ordered![index];
    const target = ordered![targetIndex];
    const currentOrder = Number(current.sort_order ?? index);
    const targetOrder = Number(target.sort_order ?? targetIndex);
    const { error: firstError } = await service.from("gallery_items").update({ sort_order: targetOrder }).eq("id", current.id);
    if (firstError) return json({ error: "gallery_move_failed", detail: firstError.message }, 400);
    const { error: secondError } = await service.from("gallery_items").update({ sort_order: currentOrder }).eq("id", target.id);
    if (secondError) {
      await service.from("gallery_items").update({ sort_order: currentOrder }).eq("id", current.id);
      return json({ error: "gallery_move_failed", detail: secondError.message }, 400);
    }
    return json({ ok: true });
  }

  if (action === "gallery_set_published") {
    const itemId = String(body.item_id || "").trim();
    if (!itemId) return json({ error: "gallery_item_required" }, 400);
    const publish = body.is_published === true;
    if (publish) {
      const existing = await getGalleryItem(service, itemId);
      if (!existing) return json({ error: "gallery_item_not_found" }, 404);
      if (galleryImageCount(existing) < 2) return json({ error: "gallery_needs_two_images" }, 400);
    }
    const { data, error } = await service.from("gallery_items")
      .update({ is_published: publish })
      .eq("id", itemId)
      .select("id,is_published,updated_at").single();
    if (error) return json({ error: "gallery_publish_failed", detail: error.message }, 400);
    return json({ ok: true, item: data });
  }

  if (action === "pair_create") {
    const { data: account, error: accountError } = await service.auth.admin.getUserById(userId);
    const email = String(account?.user?.email || auth.email || "").trim().toLowerCase();
    if (accountError || !email) return json({ error: "pair_email_missing" }, 400);
    const code = newPairCode();
    const codeHash = await sha256Hex(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await service.from("du_device_pair_codes").delete().eq("user_id", userId);
    const { error } = await service.from("du_device_pair_codes").insert({
      code_hash: codeHash,
      user_id: userId,
      email,
      expires_at: expiresAt,
    });
    if (error) return json({ error: "pair_create_failed", detail: error.message }, 400);
    return json({ code: displayPairCode(code), expires_at: expiresAt });
  }

  if (action === "push_config") {
    try {
      const config = await ensurePushConfig(service);
      const { count, error: countError } = await service.from("du_push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId).is("disabled_at", null);
      if (countError) throw countError;
      return json({ public_key: config.public_key, subscription_count: count || 0 });
    } catch (error) {
      console.error("push_config_failed", error);
      return json({ error: "push_config_failed" }, 500);
    }
  }

  if (action === "push_subscribe") {
    const subscription = body.subscription || {};
    const endpoint = String(subscription.endpoint || "").trim();
    const p256dh = String(subscription.keys?.p256dh || "").trim();
    const auth = String(subscription.keys?.auth || "").trim();
    if (!endpoint.startsWith("https://") || p256dh.length < 20 || auth.length < 8) {
      return json({ error: "invalid_push_subscription" }, 400);
    }
    const now = new Date().toISOString();
    const { error } = await service.from("du_push_subscriptions").upsert({
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      user_agent: String(body.user_agent || req.headers.get("user-agent") || "").slice(0, 1000) || null,
      updated_at: now,
      disabled_at: null,
      failure_count: 0,
    }, { onConflict: "endpoint" });
    if (error) return json({ error: "push_subscribe_failed", detail: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "push_unsubscribe") {
    const endpoint = String(body.endpoint || "").trim();
    if (!endpoint) return json({ error: "invalid_push_subscription" }, 400);
    const { error } = await service.from("du_push_subscriptions").update({
      disabled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("endpoint", endpoint);
    if (error) return json({ error: "push_unsubscribe_failed", detail: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "push_test") {
    try {
      const config = await ensurePushConfig(service);
      const { data: subscriptions, error } = await service.from("du_push_subscriptions")
        .select("id,endpoint,p256dh,auth,failure_count")
        .eq("user_id", userId).is("disabled_at", null);
      if (error) throw error;
      if (!subscriptions?.length) return json({ error: "no_push_subscription" }, 400);
      const sent = await sendPushes(service, config, subscriptions as PushRow[], {
        title: "D&U notifications are live",
        body: "Tap to open the production queue. New requests will arrive here automatically.",
        url: "/admin/dyed-and-unattached",
        tag: "du-push-test",
        badge: 1,
      });
      return json({ ok: sent > 0, sent });
    } catch (error) {
      console.error("push_test_failed", error);
      return json({ error: "push_test_failed" }, 500);
    }
  }

  return json({ error: "unknown_action" }, 400);
});
