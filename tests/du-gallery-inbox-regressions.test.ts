// @ts-nocheck
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const duPublic = readFileSync(new URL("../../app/src/pages/DyedUnattachedPage.tsx", import.meta.url), "utf8");
const duAdmin = readFileSync(new URL("../../app/src/pages/DuAdminPage.tsx", import.meta.url), "utf8");
const duAdminFunction = readFileSync(new URL("../../supabase/functions/du-admin/index.ts", import.meta.url), "utf8");
const dropField = readFileSync(new URL("../../app/src/components/ImageDropField.tsx", import.meta.url), "utf8");
const legacyMigration = readFileSync(new URL("../../supabase/migrations/20260927054500_migrate_du_legacy_gallery_to_items.sql", import.meta.url), "utf8");
const galleryAuthFix = readFileSync(new URL("../../supabase/migrations/20260927062200_restore_du_authenticated_is_du_admin_execute.sql", import.meta.url), "utf8");
const duLogo = readFileSync(new URL("../../app/public/brand/dyed-unattached-logo.png", import.meta.url));
const duTombstone = readFileSync(new URL("../../app/public/brand/dyed-unattached-tombstone.png", import.meta.url));

test("D&U public page keeps only approved/functional copy and intake", () => {
  assert.ok(duPublic.includes('src="/brand/dyed-unattached-logo.png"'));
  assert.ok(duPublic.includes('alt="Dyed & Unattached"'));
  assert.ok(duPublic.includes('href="#request-stencil"'));
  assert.ok(duPublic.includes('id="gallery"'));
  assert.ok(duPublic.includes("SUBMIT_INTAKE_URL"));
  assert.equal(duPublic.includes("Custom disc-golf stencil portraits"), false);
  assert.equal(duPublic.includes("Turn a favorite pet photo"), false);
  assert.equal(duPublic.includes("See the transformation."), false);
  assert.equal(duPublic.includes("Each example pairs"), false);
  assert.equal(duPublic.includes("From photo to disc"), false);
  assert.equal(duPublic.includes("Start here"), false);
  assert.equal(duPublic.includes("No account required."), false);
});

test("D&U public page uses the preserved canonical brand artwork", () => {
  assert.ok(duPublic.includes('src="/brand/dyed-unattached-logo.png"'));
  assert.ok(duPublic.includes('src="/brand/dyed-unattached-tombstone.png"'));
  assert.equal(duPublic.includes('className="branch-monogram"'), false);
  assert.equal(createHash("sha256").update(duLogo).digest("hex"), "a9bdcd967c968008e3493f52be96c0cb2066364848e78b9987a4350bfb1f4136");
  assert.equal(createHash("sha256").update(duTombstone).digest("hex"), "89ce5f6db5fa730182610575a2bc53aa07ac8a1bd3cf7c33b26af75d23ade879");
});

test("D&U public gallery renders the portfolio from managed item records", () => {
  assert.ok(duPublic.includes("gallery-v2.avif"));
  assert.ok(duPublic.includes("gallery_items"));
  assert.ok(duPublic.includes(".eq('is_published',true)"));
  assert.ok(duPublic.includes("gallerySlides"));
  assert.ok(duPublic.includes("GalleryMediaView"));
  assert.ok(duPublic.includes("parseLegacyPath"));
  assert.ok(duPublic.includes("source_photo_path"));
  assert.ok(duPublic.includes("finished_disc_path"));
});

test("D&U admin manages gallery items directly by system image role", () => {
  assert.ok(duAdmin.includes("Gallery manager"));
  assert.ok(duAdmin.includes("Reference photo"));
  assert.ok(duAdmin.includes("Stencil artwork"));
  assert.ok(duAdmin.includes("Finished disc"));
  assert.ok(duAdmin.includes("Save changes"));
  assert.ok(duAdmin.includes("gallery_update"));
  assert.ok(duAdmin.includes("gallery_remove_image"));
  assert.ok(duAdmin.includes("gallery_delete"));
  assert.ok(duAdmin.includes("gallery_move"));
  assert.ok(duAdmin.includes("gallery_classify_legacy"));
  assert.ok(duAdmin.includes("Needs roles"));
  assert.ok(duAdmin.includes("Save roles"));
  assert.ok(duAdmin.includes("Publish immediately"));
  assert.ok(duAdmin.includes("GalleryAdminPreview"));
  assert.ok(duAdmin.includes("parseLegacyGalleryPath"));
  assert.equal(duAdmin.includes("Legacy portfolio · 17 existing examples"), false);
});

test("gallery image fields support drag/drop previews instead of menu-only picking", () => {
  assert.ok(dropField.includes("onDrop"));
  assert.ok(dropField.includes("Drag from Photos here"));
  assert.ok(dropField.includes("URL.createObjectURL"));
  assert.ok(dropField.includes("image-drop-previews"));
});

test("gallery writes remain admin-protected and validate image payloads", () => {
  assert.ok(duAdminFunction.includes("resolveAdmin(service, req)"));
  assert.ok(duAdminFunction.includes('if (!auth) return json({ error: "unauthorized" }, 401)'));
  assert.ok(duAdminFunction.includes('action === "gallery_upload"'));
  assert.ok(duAdminFunction.includes('action === "gallery_update"'));
  assert.ok(duAdminFunction.includes('action === "gallery_remove_image"'));
  assert.ok(duAdminFunction.includes('action === "gallery_delete"'));
  assert.ok(duAdminFunction.includes('action === "gallery_classify_legacy"'));
  assert.ok(duAdminFunction.includes("gallery_needs_two_images"));
  assert.ok(duAdminFunction.includes("gallery_image_too_large"));
  assert.ok(duAdminFunction.includes("invalid_gallery_image_signature"));
  assert.ok(duAdminFunction.includes('service.storage.from("du-gallery").upload'));
});

test("published gallery items cannot be left with fewer than two understood images", () => {
  assert.ok(duAdminFunction.includes("galleryImageCount(existing) < 2"));
  assert.ok(duAdminFunction.includes("patch.is_published = false"));
});


test("legacy sprite-backed gallery roles remain editable without fake storage deletes", () => {
  assert.ok(duAdminFunction.includes('!oldPath.startsWith("legacy:")'));
  assert.ok(duAdminFunction.includes('!String(path).startsWith("legacy:")'));
});


test("legacy D&U portfolio migration creates all 17 managed examples in accepted row order", () => {
  const inserted = legacyMigration.match(/'legacy:\d+:(?:left|right)'/g) || [];
  assert.equal(new Set(inserted).size, 34);
  assert.ok(legacyMigration.includes("'legacy:15:left'"));
  assert.ok(legacyMigration.includes("'legacy:15:right'"));
  assert.ok(legacyMigration.includes("update public.gallery_items"));
});

test("managed carousel autoplay tracks the loaded slide count", () => {
  assert.ok(duPublic.includes("[galleryPaused,gallerySlideCount]"));
});


test("legacy gallery roles are never silently asserted before owner classification", () => {
  assert.ok(legacyMigration.includes("legacy_roles_confirmed"));
  assert.ok(legacyMigration.includes("false"));
  assert.ok(duAdmin.includes("legacy_roles_confirmed"));
  assert.ok(duPublic.includes("legacy_roles_confirmed"));
});


test("authenticated D&U sessions can evaluate the admin predicate used by RLS", () => {
  assert.ok(galleryAuthFix.includes("grant execute on function public.is_du_admin() to authenticated"));
  assert.ok(galleryAuthFix.includes("revoke execute on function public.is_du_admin() from anon"));
});
