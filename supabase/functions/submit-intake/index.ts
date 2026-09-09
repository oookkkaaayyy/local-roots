import { createClient } from "npm:@supabase/supabase-js@2.57.0";
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const vapidSubject = "https://localrootsdg.com/dyed-and-unattached";
const MAX_REQUEST_BYTES = 50 * 1024 * 1024;
const MAX_PHOTO_DATA_URL_CHARS = 12 * 1024 * 1024;
const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function safeSlug(input: unknown, fallback = "unnamed") {
  return String(input || fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || fallback;
}

function hasExpectedImageSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function dataUrlToBytes(dataUrl: string) {
  if (dataUrl.length > MAX_PHOTO_DATA_URL_CHARS) throw new Error("photo_too_large");
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error("invalid_image_data_url");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType: match[1].trim().toLowerCase(), size: bytes.byteLength };
}

function lockedRules() {
  return `Dyed & Unattached Stencil Spec v4 — Face-First Binary Production.
- Final artwork width: 7.5 inches on a 10-inch square vinyl sheet.
- Pet only; no background objects unless explicitly requested.
- Face-dominant head portrait; no full-body composition.
- One approved base crop per option controls angle, expression, proportions, and framing.
- Solid black artwork and binary transparency only; no gray, shading, gradients, color, or partial alpha.
- Preserve likeness with the fewest large production-safe shapes necessary—not maximum decorative detail.
- No whiskers, hairlines, catchlights, eye rings, dots, pinholes, slivers, repeated fur texture, or tiny unsupported transparent islands.
- Critical retained-vinyl bridges >= 1.5 mm; open channels >= 1.0 mm; isolated enclosed transparent details >= 2.0 mm at the 7.5-inch final width.
- Generate and validate one option at a time.`;
}

function photoRules() {
  return `PREFLIGHT PROTOCOL:
- Select and approve one face-focused base crop independently for A, B, and C before generation; rotate any sideways source before approval.
- Each crop must preserve visible ears, eyes, muzzle, head shape, and a real source-supported viewpoint.
- All remaining uploaded photos are included automatically as same-pet identity references; no manual identity-reference selection is needed.
- Choose Dog or Cat once in Admin; the matching approved house-style reference is then included automatically.
- A, B, and C differ through real angle, crop, eye direction, expression, or head orientation—not production quality.
- Process each option separately and validate the returned PNG before it becomes client-facing.`;
}

function generationBrief(job: Record<string, any>, photos: Array<Record<string, any>>) {
  const photoList = photos.map((photo, index) => `${index + 1}. ${photo.original_filename || `reference-${index + 1}`}`).join("\n");
  return `${lockedRules()}\n\n${photoRules()}\n\nJOB: ${job.job_number}\nPet: ${job.subject_name}\nDesign notes: ${job.notes || "None"}\n\nUploaded photo candidates:\n${photoList}`;
}

function draftOptions(job: Record<string, any>, photos: Array<Record<string, any>>) {
  const brief = generationBrief(job, photos);
  return [
    {
      option_code: "A",
      title: "A · composition candidate",
      summary: "Fully detailed, production-ready stencil using one of the strongest available source compositions.",
      prompt: `${brief}\n\nOPTION A: Choose one of the strongest available source angles and create a fully detailed, production-ready stencil. Reserve other viable compositions for B and C.`,
    },
    {
      option_code: "B",
      title: "B · alternate composition",
      summary: "Equally detailed and production-ready, with a clearly different angle, framing, crop, pose, or expression.",
      prompt: `${brief}\n\nOPTION B: Choose a different viable source angle, pose, crop, framing, head orientation, or expression from A. Match A's maximum production-safe detail and finish quality.`,
    },
    {
      option_code: "C",
      title: "C · third composition",
      summary: "A third equally detailed, production-ready direction with distinct framing or composition.",
      prompt: `${brief}\n\nOPTION C: Choose another distinct viable source angle, pose, crop, framing, head orientation, expression, or composition from A and B. Match their maximum production-safe detail and finish quality.`,
    },
  ];
}

async function sendNewSubmissionPush(
  service: ReturnType<typeof createClient>,
  job: Record<string, any>,
  clientName: string,
  phone: string,
  petName: string,
  photoCount: number,
) {
  const { data: config, error: configError } = await service.from("du_push_config")
    .select("public_key,private_key").eq("id", 1).maybeSingle();
  if (configError || !config) return 0;

  const { data: subscriptions, error: subscriptionError } = await service.from("du_push_subscriptions")
    .select("id,endpoint,p256dh,auth,failure_count").is("disabled_at", null);
  if (subscriptionError || !subscriptions?.length) return 0;

  webpush.setVapidDetails(vapidSubject, config.public_key, config.private_key);
  const payload = JSON.stringify({
    title: `New D&U request — ${job.job_number}`,
    body: `${clientName} · ${phone} · ${petName} · ${photoCount} photo${photoCount === 1 ? "" : "s"}`,
    url: `/admin/dyed-and-unattached?job=${encodeURIComponent(job.job_number)}`,
    tag: `du-${job.id}`,
    badge: 1,
  });
  let sent = 0;
  const now = new Date().toISOString();

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 86400, urgency: "high" });
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

  if (sent > 0) {
    await service.from("jobs").update({ notification_sent_at: now }).eq("id", job.id);
  }
  return sent;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "Request is too large" }, 413);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Service unavailable" }, 503);
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const payload = await req.json();
    const clientName = String(payload.clientName || "").trim();
    const phone = String(payload.phone || "").trim();
    const petName = String(payload.petName || payload.subjectName || "").trim();
    const notes = String(payload.notes || "").trim() || null;
    const rawPhotos = Array.isArray(payload.photos) ? payload.photos : [];

    if (!clientName) return json({ error: "Name is required" }, 400);
    if (clientName.length > 160) return json({ error: "Name is too long" }, 400);
    if (phone.length > 80 || phone.replace(/\D/g, "").length < 7) return json({ error: "A valid phone number is required" }, 400);
    if (!petName) return json({ error: "Pet name is required" }, 400);
    if (petName.length > 160) return json({ error: "Pet name is too long" }, 400);
    if (notes && notes.length > 4000) return json({ error: "Notes are too long" }, 400);
    if (!rawPhotos.length) return json({ error: "At least one reference image is required" }, 400);
    if (rawPhotos.length > 6) return json({ error: "No more than six reference images are allowed" }, 400);

    const validatedPhotos: Array<{ bytes: Uint8Array; contentType: string; size: number; original: string; extension: string }> = [];
    for (let index = 0; index < rawPhotos.length; index++) {
      const photo = rawPhotos[index];
      if (!photo?.dataUrl) continue;
      try {
        const { bytes, contentType, size } = dataUrlToBytes(String(photo.dataUrl));
        const extension = PHOTO_EXTENSIONS[contentType];
        if (!extension) return json({ error: `Photo ${index + 1} must be JPEG, PNG, or WebP` }, 400);
        if (!hasExpectedImageSignature(contentType, bytes)) return json({ error: `Photo ${index + 1} could not be read` }, 400);
        if (size > 8 * 1024 * 1024) return json({ error: `Photo ${index + 1} exceeds 8 MB after compression` }, 400);
        const original = String(photo.name || `reference-${index + 1}.jpg`).slice(0, 240);
        validatedPhotos.push({ bytes, contentType, size, original, extension });
      } catch {
        return json({ error: `Photo ${index + 1} could not be read` }, 400);
      }
    }
    if (!validatedPhotos.length) return json({ error: "No valid reference images were uploaded" }, 400);

    const { data: job, error: jobError } = await supabase.from("jobs").insert({
      client_name: clientName,
      phone,
      email: null,
      subject_name: petName,
      subject_type: "Pet portrait",
      notes,
      gallery_permission: "none",
      submitted_user_agent: req.headers.get("user-agent")?.slice(0, 1000) || null,
      submitted_origin: req.headers.get("origin")?.slice(0, 1000) || null,
      locked_spec_version: "Stencil Spec v4 — 7.5in face-first binary preflight",
    }).select("*").single();
    if (jobError) throw jobError;

    const root = `jobs/${job.job_number}_${safeSlug(petName, "pet")}`;
    const uploadedPhotos: any[] = [];

    for (let index = 0; index < validatedPhotos.length; index++) {
      const photo = validatedPhotos[index];
      const path = `${root}/01_Source_Photos/${String(index + 1).padStart(2, "0")}_candidate_${safeSlug(photo.original, `reference-${index + 1}`)}.${photo.extension}`;
      const { error: uploadError } = await supabase.storage.from("du-intake").upload(path, photo.bytes, { contentType: photo.contentType, upsert: false });
      if (uploadError) throw uploadError;
      const { data: row, error: rowError } = await supabase.from("job_photos").insert({
        job_id: job.id,
        photo_role: "candidate",
        storage_path: path,
        original_filename: photo.original,
        content_type: photo.contentType,
        size_bytes: photo.size,
        sort_order: index,
      }).select("*").single();
      if (rowError) throw rowError;
      uploadedPhotos.push(row);
    }

    const options = draftOptions(job, uploadedPhotos);
    const { error: draftError } = await supabase.from("draft_options").insert(options.map(option => ({ ...option, job_id: job.id })));
    if (draftError) throw draftError;
    const { error: checklistError } = await supabase.from("production_checklist").insert({ job_id: job.id });
    if (checklistError) throw checklistError;

    const brief = generationBrief(job, uploadedPhotos);
    const packetFiles = [
      { path: `${root}/02_Admin_Packet/request-summary.txt`, content: `Job: ${job.job_number}\nPet: ${petName}\nReference photos: ${uploadedPhotos.length}\nDesign notes:\n${notes || "None"}\n` },
      { path: `${root}/02_Admin_Packet/stencil-brief.txt`, content: brief },
      ...options.map(option => ({ path: `${root}/02_Admin_Packet/option-${option.option_code.toLowerCase()}.txt`, content: option.prompt })),
    ];
    for (const file of packetFiles) {
      const { error } = await supabase.storage.from("du-intake").upload(file.path, new TextEncoder().encode(file.content), { contentType: "text/plain", upsert: true });
      if (error) throw error;
    }

    let pushSent = 0;
    try {
      pushSent = await sendNewSubmissionPush(supabase, job, clientName, phone, petName, uploadedPhotos.length);
    } catch (pushError) {
      // Notification failure must never turn a successfully stored customer request into a failed intake.
      console.error("D&U new-submission push failed", pushError);
    }

    return json({
      ok: true,
      job: { id: job.id, job_number: job.job_number, subject_name: job.subject_name },
      photos_saved: uploadedPhotos.length,
      push_sent: pushSent,
    });
  } catch (error) {
    console.error("D&U intake failed", error);
    return json({ error: "The request could not be submitted." }, 500);
  }
});