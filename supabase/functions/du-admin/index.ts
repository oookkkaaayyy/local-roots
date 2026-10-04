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
const generationPromptVersion = "reference-anchored-v3.0";
const generationRoleInstructions = [
  "Use the attachment named 01-APPROVED-COMPOSITION as the sole authority for pose, framing, and composition.",
  "Use attachments named 02-IDENTITY-REFERENCE-NN only as same-subject identity references; they must not replace the composition source.",
  "Use attachments named 03-STYLE-REFERENCE-NN only as visual-language references for D&U stencil abstraction, edge quality, black/white balance, and detail scale. Never copy their pet identity, pose, expression, or anatomy.",
].join("\n");
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

async function sha256Bytes(value: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signedGenerationState(service: ServiceClient, jobId: string) {
  const { data: styleRows } = await service.from("du_generation_style_references").select("*").order("created_at").order("id");
  const styleReferences = await Promise.all((styleRows || []).map(async (reference) => {
    const { data } = await service.storage.from("du-intake").createSignedUrl(reference.storage_path, 3600);
    return { ...reference, signed_url: data?.signedUrl || null };
  }));
  const { data: packageRow } = await service.from("du_generation_packages").select("*").eq("job_id", jobId).maybeSingle();
  if (!packageRow) return { package: null, style_references: styleReferences, attempts: [], selection: null, correction: null, final_master: null, production_run: null };
  const { data: attempts } = await service.from("du_generation_attempts").select("*").eq("job_id", jobId).order("attempt_number");
  const { data: selection } = await service.from("du_generation_selections").select("*").eq("job_id", jobId).maybeSingle();
  const { data: correction } = await service.from("du_generation_corrections").select("*").eq("job_id", jobId).maybeSingle();
  const { data: finalMaster } = await service.from("du_generation_final_masters").select("*").eq("job_id", jobId).maybeSingle();
  const { data: productionRun } = await service.from("du_generation_production_runs").select("*").eq("job_id", jobId).maybeSingle();
  const sources = Array.isArray(packageRow.source_manifest?.sources) ? packageRow.source_manifest.sources : [];
  const signedSources = await Promise.all(sources.map(async (source: Record<string, unknown>) => {
    const { data } = await service.storage.from("du-intake").createSignedUrl(String(source.storage_path), 3600);
    return { ...source, signed_url: data?.signedUrl || null };
  }));
  const withCandidateUrls = await Promise.all((attempts || []).map(async (attempt) => {
    const { data } = attempt.candidate_path
      ? await service.storage.from("du-intake").createSignedUrl(attempt.candidate_path, 3600)
      : { data: null };
    return { ...attempt, candidate_url: data?.signedUrl || null };
  }));
  let correctionUrl: string | null = null;
  if (correction?.corrected_path) {
    const { data } = await service.storage.from("du-intake").createSignedUrl(correction.corrected_path, 3600);
    correctionUrl = data?.signedUrl || null;
  }
  let finalMasterUrl: string | null = null;
  if (finalMaster?.master_path) {
    const { data } = await service.storage.from("du-intake").createSignedUrl(finalMaster.master_path, 3600);
    finalMasterUrl = data?.signedUrl || null;
  }
  let productionOutputUrl: string | null = null;
  if (productionRun?.output_path) {
    const { data } = await service.storage.from("du-intake").createSignedUrl(productionRun.output_path, 3600);
    productionOutputUrl = data?.signedUrl || null;
  }
  return {
    style_references: styleReferences,
    package: { ...packageRow, source_manifest: { ...packageRow.source_manifest, sources: signedSources } },
    attempts: withCandidateUrls,
    selection,
    correction: correction ? { ...correction, corrected_url: correctionUrl } : null,
    final_master: finalMaster ? { ...finalMaster, signed_url: finalMasterUrl } : null,
    production_run: productionRun ? { ...productionRun, output_url: productionOutputUrl } : null,
  };
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
    .select("id,job_id,is_published,caption,source_photo_path,stencil_path,finished_disc_path,sort_order,legacy_roles_confirmed,created_at,updated_at")
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
    let latestDraftUrl: string | null = null;
    if (job.latest_draft_path) {
      const { data: draftSigned } = await service.storage.from("du-intake")
        .createSignedUrl(job.latest_draft_path, 3600);
      latestDraftUrl = draftSigned?.signedUrl || null;
    }
    return json({ job: { ...job, latest_draft_url: latestDraftUrl }, photos: hydrated, options: options || [], checklist });
  }

  if (action === "generation_state") {
    const jobId = String(body.job_id || "").trim();
    if (!jobId) return json({ error: "invalid_job_id" }, 400);
    const state = await signedGenerationState(service, jobId);
    return json(state);
  }

  if (action === "generation_import_style_reference") {
    try {
      const image = decodeGalleryImage(body.image_data_url);
      const { data: existing } = await service.from("du_generation_style_references").select("id,sha256").eq("sha256", await sha256Bytes(image.bytes)).maybeSingle();
      if (existing) return json({ error: "style_reference_already_imported", reference_id: existing.id }, 409);
      const { count } = await service.from("du_generation_style_references").select("id", { count: "exact", head: true });
      if ((count || 0) >= 12) return json({ error: "style_reference_library_full" }, 409);
      const id = crypto.randomUUID();
      const filename = String(body.original_filename || `style-reference-${id}.${image.extension}`).replace(/[^A-Za-z0-9._-]/g, "_").slice(-160);
      const storagePath = `generation-v2/style-references/${id}/${filename}`;
      const { error: uploadError } = await service.storage.from("du-intake").upload(storagePath, image.bytes, {
        contentType: image.mime, cacheControl: "31536000", upsert: false,
      });
      if (uploadError) return json({ error: "style_reference_upload_failed", detail: uploadError.message }, 400);
      const { error } = await service.from("du_generation_style_references").insert({
        id, storage_path: storagePath, filename, mime_type: image.mime,
        sha256: await sha256Bytes(image.bytes), size_bytes: image.bytes.length, created_by: userId,
      });
      if (error) return json({ error: "style_reference_record_failed", detail: error.message }, 400);
      return json(await signedGenerationState(service, String(body.job_id || "")));
    } catch (error) {
      const code = error instanceof Error ? error.message : "style_reference_import_failed";
      return json({ error: code }, code === "gallery_image_too_large" ? 413 : 400);
    }
  }

  if (action === "generation_lock_package") {
    try {
      const jobId = String(body.job_id || "").trim();
      const compositionPhotoId = String(body.composition_photo_id || "").trim();
      const basePrompt = String(body.locked_prompt || "").trim();
      const promptVersion = String(body.prompt_version || "").trim();
      if (!jobId || !compositionPhotoId || basePrompt.length < 20 || basePrompt.length > 11800) {
        return json({ error: "package_fields_invalid" }, 400);
      }
      if (promptVersion !== generationPromptVersion) {
        return json({ error: "generation_prompt_version_mismatch", expected: generationPromptVersion }, 409);
      }
      const { data: styleRows } = await service.from("du_generation_style_references").select("*").order("created_at").order("id");
      if (!styleRows || styleRows.length < 3) return json({ error: "at_least_three_approved_style_references_required" }, 409);
      const lockedPrompt = `${generationRoleInstructions}\n\n${basePrompt}`;
      const { data: existing } = await service.from("du_generation_packages").select("id").eq("job_id", jobId).maybeSingle();
      if (existing) return json({ error: "source_package_already_locked" }, 409);
      const { data: job } = await service.from("jobs").select("id,job_number").eq("id", jobId).maybeSingle();
      if (!job) return json({ error: "job_not_found" }, 404);
      const { data: photos, error: photoError } = await service.from("job_photos").select("*")
        .eq("job_id", jobId).order("sort_order");
      if (photoError || !photos?.length) return json({ error: "source_photos_unavailable" }, 400);
      if (!photos.some((photo) => photo.id === compositionPhotoId)) return json({ error: "composition_photo_not_in_job" }, 400);
      const packageId = crypto.randomUUID();
      const sources = [];
      for (const photo of photos) {
        const role = photo.id === compositionPhotoId ? "composition" : "identity_reference";
        const bucket = String(photo.storage_bucket || "du-intake");
        const { data: download, error: downloadError } = await service.storage.from(bucket).download(photo.storage_path);
        if (downloadError || !download) return json({ error: "source_photo_download_failed", photo_id: photo.id }, 400);
        const bytes = new Uint8Array(await download.arrayBuffer());
        const sha = await sha256Bytes(bytes);
        const sourceMime = download.type || photo.content_type || "";
        const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/avif": "avif" } as Record<string, string>)[sourceMime.toLowerCase()] || "img";
        const name = role === "composition"
          ? `01-APPROVED-COMPOSITION.${extension}`
          : `02-IDENTITY-REFERENCE-${String(sources.filter((item) => item.role === "identity_reference").length + 1).padStart(2, "0")}.${extension}`;
        const path = `jobs/${job.job_number}/generation-v2/source-packages/${packageId}/${name}`;
        const { error: uploadError } = await service.storage.from("du-intake").upload(path, bytes, {
          contentType: sourceMime || "application/octet-stream", cacheControl: "31536000", upsert: false,
        });
        if (uploadError) return json({ error: "source_package_copy_failed", photo_id: photo.id }, 400);
        sources.push({ source_photo_id: photo.id, role, filename: name, storage_path: path, sha256: sha, size_bytes: bytes.length, sort_order: photo.sort_order });
      }
      const styleReferences = [];
      for (const reference of styleRows) {
        const { data: download, error: downloadError } = await service.storage.from("du-intake").download(reference.storage_path);
        if (downloadError || !download) return json({ error: "style_reference_download_failed", reference_id: reference.id }, 400);
        const bytes = new Uint8Array(await download.arrayBuffer());
        const sha = await sha256Bytes(bytes);
        if (sha !== reference.sha256) return json({ error: "style_reference_integrity_mismatch", reference_id: reference.id }, 409);
        const name = `03-STYLE-REFERENCE-${String(styleReferences.length + 1).padStart(2, "0")}.${reference.mime_type === "image/jpeg" ? "jpg" : reference.mime_type === "image/png" ? "png" : "webp"}`;
        const path = `jobs/${job.job_number}/generation-v2/source-packages/${packageId}/${name}`;
        const { error: uploadError } = await service.storage.from("du-intake").upload(path, bytes, {
          contentType: reference.mime_type, cacheControl: "31536000", upsert: false,
        });
        if (uploadError) return json({ error: "style_reference_package_copy_failed", reference_id: reference.id }, 400);
        styleReferences.push({ style_reference_id: reference.id, role: "style_reference", filename: name, storage_path: path, sha256: sha, size_bytes: bytes.length, source_filename: reference.filename });
      }
      const sourceManifest = { version: 2, prompt_version: promptVersion, job_id: jobId, composition_photo_id: compositionPhotoId, sources: [...sources, ...styleReferences] };
      const sourceManifestSha256 = await sha256Hex(JSON.stringify(sourceManifest));
      const promptSha256 = await sha256Hex(lockedPrompt);
      const { data: packageRow, error: packageError } = await service.from("du_generation_packages").insert({
        id: packageId, job_id: jobId, composition_photo_id: compositionPhotoId,
        locked_prompt: lockedPrompt, prompt_sha256: promptSha256,
        source_manifest: sourceManifest, source_manifest_sha256: sourceManifestSha256, created_by: userId,
      }).select("id").single();
      if (packageError || !packageRow) return json({ error: "source_package_lock_failed", detail: packageError?.message }, 400);
      const { error: attemptError } = await service.from("du_generation_attempts").insert({
        package_id: packageId, job_id: jobId, attempt_number: 1, status: "ready", created_by: userId,
      });
      if (attemptError) return json({ error: "attempt_a_create_failed", detail: attemptError.message }, 400);
      return json(await signedGenerationState(service, jobId));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "source_package_failed" }, 400);
    }
  }

  if (action === "generation_next_attempt") {
    const jobId = String(body.job_id || "").trim();
    const { data: selected } = await service.from("du_generation_selections").select("job_id").eq("job_id", jobId).maybeSingle();
    if (selected) return json({ error: "visual_master_already_selected" }, 409);
    const { data: attempts } = await service.from("du_generation_attempts").select("attempt_number,status").eq("job_id", jobId).order("attempt_number");
    const previous = attempts?.at(-1);
    if (!previous || !["failed", "rejected"].includes(previous.status) || attempts!.length >= 3) {
      return json({ error: "next_attempt_not_available" }, 409);
    }
    const { data: packageRow } = await service.from("du_generation_packages").select("id").eq("job_id", jobId).maybeSingle();
    if (!packageRow) return json({ error: "source_package_missing" }, 409);
    const { error } = await service.from("du_generation_attempts").insert({
      package_id: packageRow.id, job_id: jobId, attempt_number: attempts!.length + 1, status: "ready", created_by: userId,
    });
    if (error) return json({ error: "next_attempt_create_failed", detail: error.message }, 400);
    return json(await signedGenerationState(service, jobId));
  }

  if (action === "generation_mark_attempt") {
    const jobId = String(body.job_id || "").trim();
    const attemptId = String(body.attempt_id || "").trim();
    const status = String(body.status || "");
    if (!["failed", "rejected"].includes(status)) return json({ error: "invalid_attempt_status" }, 400);
    const failureNote = String(body.failure_note || "").trim().slice(0, 1000);
    if (failureNote.length < 5) return json({ error: "attempt_outcome_note_required" }, 400);
    const { data, error } = await service.from("du_generation_attempts").update({ status, failure_note: failureNote, updated_at: new Date().toISOString() })
      .eq("id", attemptId).eq("job_id", jobId).eq("status", status === "failed" ? "ready" : "candidate").select("id").maybeSingle();
    if (error || !data) return json({ error: "attempt_status_update_failed", detail: error?.message }, 400);
    return json(await signedGenerationState(service, jobId));
  }

  if (action === "generation_upload_candidate") {
    try {
      const jobId = String(body.job_id || "").trim();
      const attemptId = String(body.attempt_id || "").trim();
      const image = decodeGalleryImage(body.image_data_url);
      const { data: attempt } = await service.from("du_generation_attempts").select("id,package_id,attempt_number,status")
        .eq("id", attemptId).eq("job_id", jobId).maybeSingle();
      if (!attempt || attempt.status !== "ready") return json({ error: "attempt_not_uploadable" }, 409);
      const { data: job } = await service.from("jobs").select("job_number").eq("id", jobId).maybeSingle();
      const path = `jobs/${job!.job_number}/generation-v2/candidates/${String.fromCharCode(64 + attempt.attempt_number)}-${crypto.randomUUID()}.${image.extension}`;
      const { error: uploadError } = await service.storage.from("du-intake").upload(path, image.bytes, { contentType: image.mime, cacheControl: "31536000", upsert: false });
      if (uploadError) return json({ error: "candidate_upload_failed", detail: uploadError.message }, 400);
      const candidateSha = await sha256Bytes(image.bytes);
      const metadata = { filename: `attempt-${String.fromCharCode(64 + attempt.attempt_number)}.${image.extension}`, mime: image.mime, size_bytes: image.bytes.length, uploaded_by: userId, uploaded_at: new Date().toISOString() };
      const { error } = await service.from("du_generation_attempts").update({ status: "candidate", candidate_path: path, candidate_sha256: candidateSha, candidate_metadata: metadata, updated_at: new Date().toISOString() }).eq("id", attemptId).eq("status", "ready");
      if (error) return json({ error: "candidate_record_failed", detail: error.message }, 400);
      return json(await signedGenerationState(service, jobId));
    } catch (error) {
      const code = error instanceof Error ? error.message : "candidate_upload_failed";
      return json({ error: code }, code === "gallery_image_too_large" ? 413 : 400);
    }
  }

  if (action === "generation_select_attempt") {
    const jobId = String(body.job_id || "").trim();
    const attemptId = String(body.attempt_id || "").trim();
    const { data: attempt } = await service.from("du_generation_attempts").select("id,candidate_path,candidate_sha256,status").eq("id", attemptId).eq("job_id", jobId).maybeSingle();
    if (!attempt || attempt.status !== "candidate" || !attempt.candidate_path) return json({ error: "candidate_not_selectable" }, 409);
    const { error: selectError } = await service.from("du_generation_selections").insert({ job_id: jobId, attempt_id: attemptId, candidate_path: attempt.candidate_path, candidate_sha256: attempt.candidate_sha256, selected_by: userId });
    if (selectError) return json({ error: "visual_master_already_selected", detail: selectError.message }, 409);
    const { error } = await service.from("du_generation_attempts").update({ status: "selected", updated_at: new Date().toISOString() }).eq("id", attemptId).eq("status", "candidate");
    if (error) return json({ error: "candidate_selection_state_failed", detail: error.message }, 400);
    return json(await signedGenerationState(service, jobId));
  }

  if (action === "generation_start_correction") {
    const jobId = String(body.job_id || "").trim();
    const requestedCorrection = String(body.correction_prompt || "").trim();
    if (requestedCorrection.length < 10 || requestedCorrection.length > 1000) return json({ error: "localized_correction_prompt_invalid" }, 400);
    const { data: finalMaster } = await service.from("du_generation_final_masters").select("job_id").eq("job_id", jobId).maybeSingle();
    if (finalMaster) return json({ error: "final_master_already_locked" }, 409);
    const { data: selection } = await service.from("du_generation_selections").select("attempt_id,candidate_path,candidate_sha256").eq("job_id", jobId).maybeSingle();
    if (!selection) return json({ error: "visual_master_not_selected" }, 409);
    const prompt = `Apply only this one localized change to the attached selected visual master: ${requestedCorrection}\nPreserve every other part of the artwork, including the subject identity, anatomy, composition, expression, and style.`;
    const { error } = await service.from("du_generation_corrections").insert({
      job_id: jobId, base_attempt_id: selection.attempt_id, base_candidate_path: selection.candidate_path,
      base_candidate_sha256: selection.candidate_sha256, correction_prompt: prompt,
      correction_prompt_sha256: await sha256Hex(prompt), created_by: userId,
    });
    if (error) return json({ error: "correction_branch_already_used", detail: error.message }, 409);
    return json(await signedGenerationState(service, jobId));
  }

  if (action === "generation_upload_correction") {
    try {
      const jobId = String(body.job_id || "").trim();
      const image = decodeGalleryImage(body.image_data_url);
      const { data: correction } = await service.from("du_generation_corrections").select("created_at,corrected_path").eq("job_id", jobId).maybeSingle();
      if (!correction || correction.corrected_path) return json({ error: "correction_upload_unavailable" }, 409);
      const { data: job } = await service.from("jobs").select("job_number").eq("id", jobId).maybeSingle();
      const path = `jobs/${job!.job_number}/generation-v2/correction/${crypto.randomUUID()}.${image.extension}`;
      const { error: uploadError } = await service.storage.from("du-intake").upload(path, image.bytes, { contentType: image.mime, cacheControl: "31536000", upsert: false });
      if (uploadError) return json({ error: "correction_upload_failed", detail: uploadError.message }, 400);
      const sha = await sha256Bytes(image.bytes);
      const { error } = await service.from("du_generation_corrections").update({
        corrected_path: path, corrected_sha256: sha,
        corrected_metadata: { filename: `localized-correction.${image.extension}`, mime: image.mime, size_bytes: image.bytes.length, uploaded_by: userId, uploaded_at: new Date().toISOString() },
      }).eq("job_id", jobId).is("corrected_path", null);
      if (error) return json({ error: "correction_record_failed", detail: error.message }, 400);
      return json(await signedGenerationState(service, jobId));
    } catch (error) {
      const code = error instanceof Error ? error.message : "correction_upload_failed";
      return json({ error: code }, code === "gallery_image_too_large" ? 413 : 400);
    }
  }

  if (action === "generation_finalize_master") {
    const jobId = String(body.job_id || "").trim();
    const kind = String(body.master_kind || "");
    let path = "", sha = "", attemptId: string | null = null;
    if (kind === "attempt") {
      const { data: selection } = await service.from("du_generation_selections").select("attempt_id,candidate_path,candidate_sha256").eq("job_id", jobId).maybeSingle();
      if (!selection) return json({ error: "visual_master_not_selected" }, 409);
      path = selection.candidate_path; sha = selection.candidate_sha256; attemptId = selection.attempt_id;
    } else if (kind === "correction") {
      const { data: correction } = await service.from("du_generation_corrections").select("corrected_path,corrected_sha256").eq("job_id", jobId).maybeSingle();
      if (!correction?.corrected_path || !correction.corrected_sha256) return json({ error: "correction_candidate_missing" }, 409);
      path = correction.corrected_path; sha = correction.corrected_sha256;
    } else return json({ error: "invalid_master_kind" }, 400);
    const { error } = await service.from("du_generation_final_masters").insert({ job_id: jobId, master_kind: kind, attempt_id: attemptId, master_path: path, master_sha256: sha, selected_by: userId });
    if (error) return json({ error: "final_master_already_locked", detail: error.message }, 409);
    return json(await signedGenerationState(service, jobId));
  }

  if (action === "generation_upload_production") {
    try {
      const jobId = String(body.job_id || "").trim();
      const report = body.validator_report;
      if (!report || typeof report !== "object") return json({ error: "passing_validator_report_required" }, 400);
      const { data: master } = await service.from("du_generation_final_masters").select("master_path,master_sha256").eq("job_id", jobId).maybeSingle();
      if (!master) return json({ error: "final_master_not_locked" }, 409);
      const image = decodeGalleryImage(body.image_data_url);
      const outputSha = await sha256Bytes(image.bytes);
      const cases = Array.isArray(report.cases) ? report.cases : [];
      if (report.artwork_width_mm !== 190.5 || !cases.length ||
          cases.some((item: Record<string, unknown>) => item.physical_verdict !== "PASS" || item.source_sha256 !== outputSha)) {
        return json({ error: "validator_report_must_pass_at_190_5mm_for_exact_uploaded_file" }, 400);
      }
      const { data: job } = await service.from("jobs").select("job_number").eq("id", jobId).maybeSingle();
      const path = `jobs/${job!.job_number}/generation-v2/productionized/${crypto.randomUUID()}.${image.extension}`;
      const { error: uploadError } = await service.storage.from("du-intake").upload(path, image.bytes, { contentType: image.mime, cacheControl: "31536000", upsert: false });
      if (uploadError) return json({ error: "production_output_upload_failed", detail: uploadError.message }, 400);
      const { error } = await service.from("du_generation_production_runs").insert({
        job_id: jobId, input_master_path: master.master_path, input_master_sha256: master.master_sha256,
        output_path: path, output_sha256: outputSha, artwork_width_mm: 190.5,
        validator_report: report, created_by: userId,
      });
      if (error) return json({ error: "production_run_already_recorded", detail: error.message }, 409);
      return json(await signedGenerationState(service, jobId));
    } catch (error) {
      const code = error instanceof Error ? error.message : "production_output_upload_failed";
      return json({ error: code }, code === "gallery_image_too_large" ? 413 : 400);
    }
  }

  if (action === "set_workflow") {
    const jobId = String(body.job_id || "").trim();
    const workflowStatus = String(body.workflow_status || "").trim();
    if (!jobId || !workflowStates.has(workflowStatus)) return json({ error: "invalid_workflow_update" }, 400);
    const { data: generationPackage } = await service.from("du_generation_packages").select("job_id").eq("job_id", jobId).maybeSingle();
    if (generationPackage && ["awaiting_art_approval", "art_approved"].includes(workflowStatus)) {
      const { data: master } = await service.from("du_generation_final_masters").select("job_id").eq("job_id", jobId).maybeSingle();
      if (!master) return json({ error: "final_visual_master_required_before_art_approval" }, 409);
    }
    if (generationPackage && ["production_ready", "complete"].includes(workflowStatus)) {
      const { data: production } = await service.from("du_generation_production_runs").select("job_id").eq("job_id", jobId).maybeSingle();
      if (!production) return json({ error: "passing_production_validation_required_before_production" }, 409);
    }
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
      .select("id,job_id,is_published,caption,source_photo_path,stencil_path,finished_disc_path,sort_order,legacy_roles_confirmed,created_at,updated_at")
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
      if (supplied.length < 1) return json({ error: "gallery_needs_image" }, 400);

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
      }).select("id,is_published,caption,source_photo_path,stencil_path,finished_disc_path,sort_order,legacy_roles_confirmed,created_at,updated_at").single();
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

  if (action === "gallery_classify_legacy") {
    const itemId = String(body.item_id || "").trim();
    const leftRole = String(body.left_role || "") as GalleryImageRole;
    const rightRole = String(body.right_role || "") as GalleryImageRole;
    if (!itemId || !galleryImageRoles.includes(leftRole) || !galleryImageRoles.includes(rightRole) || leftRole === rightRole) {
      return json({ error: "invalid_gallery_classification" }, 400);
    }
    const existing = await getGalleryItem(service, itemId);
    if (!existing) return json({ error: "gallery_item_not_found" }, 404);

    const legacyPaths = [existing.source_photo_path,existing.stencil_path,existing.finished_disc_path]
      .map(path => String(path || ""))
      .filter(path => path.startsWith("legacy:"));
    const leftPath = legacyPaths.find(path => path.endsWith(":left"));
    const rightPath = legacyPaths.find(path => path.endsWith(":right"));
    if (!leftPath || !rightPath) return json({ error: "legacy_pair_missing" }, 400);

    const patch: Record<string, unknown> = {
      source_photo_path: null,
      stencil_path: null,
      finished_disc_path: null,
      legacy_roles_confirmed: true,
    };
    patch[galleryRoleColumn[leftRole]] = leftPath;
    patch[galleryRoleColumn[rightRole]] = rightPath;

    const { data, error } = await service.from("gallery_items").update(patch).eq("id", itemId)
      .select("id,job_id,is_published,caption,source_photo_path,stencil_path,finished_disc_path,sort_order,legacy_roles_confirmed,created_at,updated_at").single();
    if (error) return json({ error: "gallery_classification_failed", detail: error.message }, 400);
    return json({ ok: true, item: data });
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
      if (existing.is_published && galleryImageCount(preview) < 1) patch.is_published = false;

      const { data, error } = await service.from("gallery_items").update(patch).eq("id", itemId)
        .select("id,job_id,is_published,caption,source_photo_path,stencil_path,finished_disc_path,sort_order,legacy_roles_confirmed,created_at,updated_at").single();
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
    if (existing.is_published && galleryImageCount(preview) < 1) patch.is_published = false;
    const { data, error } = await service.from("gallery_items").update(patch).eq("id", itemId)
      .select("id,job_id,is_published,caption,source_photo_path,stencil_path,finished_disc_path,sort_order,legacy_roles_confirmed,created_at,updated_at").single();
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
      if (galleryImageCount(existing) < 1) return json({ error: "gallery_needs_image" }, 400);
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
