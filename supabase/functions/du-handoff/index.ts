import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import JSZip from "npm:jszip@3.10.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeName(value: string | null | undefined, fallback: string) {
  const cleaned = String(value || "").trim().replace(/[^A-Za-z0-9._ -]+/g, "_").replace(/\s+/g, " ").slice(0, 120);
  return cleaned || fallback;
}

function stencilPrompt(job: Record<string, unknown>, photoCount: number) {
  const subjectName = String(job.subject_name || "this subject");
  const notes = String(job.notes || "None");
  return `MAKE A DISC-GOLF STENCIL — ${String(job.job_number || "D&U JOB")}\n\nUse all ${photoCount} source photo${photoCount === 1 ? "" : "s"} in this package as the identity/anatomy authority for ${subjectName}.\n\nCreate one clean black-and-white stencil portrait directly from the source photos. Preserve the exact subject's identity, natural proportions, expression, asymmetry, eyes, ears, muzzle/nose, head shape, and distinctive markings. Use a head-dominant composition on a plain white background with bold connected black shapes, medium-scale negative space, and moderate detail. Remove background, body, and collar unless essential to recognition. White represents retained adhesive vinyl, so eliminate or merge tiny white specks/slivers that would not adhere after dye application. Respect natural cheeks, jaw, chin, and outer anatomy; do not create artificial black blobs. Avoid cartooning, generic breed-icon simplification, scratchboard texture, stippling, micro-speckle, tiny decorative marks, artificial borders, and geometry from rejected prior candidates.\n\nSubmission notes: ${notes}\n\nDo not run legacy Stage-A admission, best-of-N, semantic-master, benchmark-conditioning, raw-normalization, or machine semantic-PASS workflows. Compare the result directly with the sources before presenting it. If it plainly does not resemble the subject, reject it rather than calling it passed. Show one serious artwork candidate only.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_config_missing" }, 500);

  const requestUrl = new URL(req.url);
  const token = String(requestUrl.searchParams.get("token") || "").trim();
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return json({ error: "invalid_handoff" }, 400);

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();

  const { data: handoff, error: handoffError } = await service.from("du_chatgpt_handoffs")
    .select("id,job_id,expires_at,first_access_at,access_count")
    .eq("token_hash", tokenHash)
    .is("disabled_at", null)
    .gt("expires_at", now)
    .lt("access_count", 5)
    .maybeSingle();
  if (handoffError) return json({ error: "handoff_lookup_failed" }, 500);
  if (!handoff) return json({ error: "handoff_expired_or_invalid" }, 410);

  const { data: job, error: jobError } = await service.from("jobs")
    .select("id,job_number,subject_name,subject_type,disc_brand,disc_model,disc_details,notes,created_at,workflow_status")
    .eq("id", handoff.job_id)
    .maybeSingle();
  if (jobError || !job) return json({ error: "job_not_found" }, 404);

  const { data: photos, error: photoError } = await service.from("job_photos")
    .select("id,original_filename,sort_order,storage_bucket,storage_path")
    .eq("job_id", job.id)
    .order("sort_order");
  if (photoError) return json({ error: "source_lookup_failed" }, 500);
  if (!photos?.length) return json({ error: "no_source_photos" }, 404);

  // Atomically claim one of the handoff's five access slots before any private photo bytes are downloaded.
  // The access_count compare-and-swap prevents concurrent requests that observed the same count from all succeeding.
  const expectedAccessCount = Number(handoff.access_count || 0);
  const { data: claimedHandoff, error: claimError } = await service.from("du_chatgpt_handoffs")
    .update({
      first_access_at: handoff.first_access_at || now,
      access_count: expectedAccessCount + 1,
    })
    .eq("id", handoff.id)
    .eq("access_count", expectedAccessCount)
    .is("disabled_at", null)
    .gt("expires_at", now)
    .lt("access_count", 5)
    .select("id")
    .maybeSingle();
  if (claimError) return json({ error: "handoff_claim_failed" }, 500);
  if (!claimedHandoff) return json({ error: "handoff_expired_or_invalid" }, 410);

  const zip = new JSZip();
  const manifest = {
    version: 1,
    job_number: job.job_number,
    subject_name: job.subject_name,
    subject_type: job.subject_type,
    disc: {
      brand: job.disc_brand,
      model: job.disc_model,
      details: job.disc_details,
    },
    notes: job.notes,
    submitted_at: job.created_at,
    source_photo_count: photos.length,
    privacy: "Client name, phone, and email are intentionally excluded from this handoff.",
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("START_HERE.txt", stencilPrompt(job as Record<string, unknown>, photos.length));

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const bucket = String(photo.storage_bucket || "du-intake");
    const path = String(photo.storage_path || "");
    if (!path) return json({ error: "source_path_missing", source: index + 1 }, 500);
    const { data: blob, error: downloadError } = await service.storage.from(bucket).download(path);
    if (downloadError || !blob) {
      console.error("D&U handoff source download failed", { job_id: job.id, photo_id: photo.id });
      return json({ error: "source_download_failed", source: index + 1 }, 500);
    }
    const extensionMatch = path.match(/\.[A-Za-z0-9]{2,8}$/);
    const fallback = `source-${String(index + 1).padStart(2, "0")}${extensionMatch?.[0] || ".jpg"}`;
    const filename = safeName(photo.original_filename, fallback);
    const numberedName = `${String(index + 1).padStart(2, "0")}-${filename}`;
    zip.file(`source_photos/${numberedName}`, new Uint8Array(await blob.arrayBuffer()));
  }

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const earlyStates = ["intake_complete", "handoff_preparing", "chatgpt_ready", "notification_sent"];
  if (earlyStates.includes(String(job.workflow_status || ""))) {
    await service.from("jobs").update({
      workflow_status: "stage_a_started",
      stage_a_started_at: now,
      handoff_last_error: null,
    }).eq("id", job.id).in("workflow_status", earlyStates);
  }

  const filename = `${safeName(job.job_number, "DU-JOB")}-ChatGPT-Handoff.zip`;
  return new Response(bytes, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, private",
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
    },
  });
});
