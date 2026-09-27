// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const duPublic = readFileSync(new URL("../../app/src/pages/DyedUnattachedPage.tsx", import.meta.url), "utf8");
const duAdmin = readFileSync(new URL("../../app/src/pages/DuAdminPage.tsx", import.meta.url), "utf8");
const duAdminFunction = readFileSync(new URL("../../supabase/functions/du-admin/index.ts", import.meta.url), "utf8");

test("D&U public page is share-ready and keeps intake available", () => {
  assert.ok(duPublic.includes("Custom disc-golf stencil portraits"));
  assert.ok(duPublic.includes('href="#request-stencil"'));
  assert.ok(duPublic.includes('id="gallery"'));
  assert.ok(duPublic.includes("See the transformation."));
  assert.ok(duPublic.includes("SUBMIT_INTAKE_URL"));
});

test("D&U public gallery keeps the accepted legacy portfolio while adding live items", () => {
  assert.ok(duPublic.includes("gallery-v2.avif"));
  assert.ok(duPublic.includes("gallery_items"));
  assert.ok(duPublic.includes(".eq('is_published',true)"));
  assert.ok(duPublic.includes("source_photo_path"));
  assert.ok(duPublic.includes("finished_disc_path"));
});

test("D&U admin exposes a gallery inbox with explicit publish control", () => {
  assert.ok(duAdmin.includes("Gallery inbox"));
  assert.ok(duAdmin.includes("Add to gallery inbox"));
  assert.ok(duAdmin.includes("gallery_upload"));
  assert.ok(duAdmin.includes("gallery_set_published"));
  assert.ok(duAdmin.includes("Publish immediately"));
});

test("gallery uploads remain admin-protected and validate image payloads", () => {
  assert.ok(duAdminFunction.includes("resolveAdmin(service, req)"));
  assert.ok(duAdminFunction.includes('if (!auth) return json({ error: "unauthorized" }, 401)'));
  assert.ok(duAdminFunction.includes('action === "gallery_upload"'));
  assert.ok(duAdminFunction.includes("gallery_needs_two_images"));
  assert.ok(duAdminFunction.includes("gallery_image_too_large"));
  assert.ok(duAdminFunction.includes("invalid_gallery_image_signature"));
  assert.ok(duAdminFunction.includes('service.storage.from("du-gallery").upload'));
});
