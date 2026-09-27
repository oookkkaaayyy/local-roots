// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminUi = readFileSync(new URL("../../app/src/pages/DuAdminPage.tsx", import.meta.url), "utf8");
const adminFn = readFileSync(new URL("../../supabase/functions/du-admin/index.ts", import.meta.url), "utf8");
const pairFn = readFileSync(new URL("../../supabase/functions/du-pair/index.ts", import.meta.url), "utf8");
const handoffFn = readFileSync(new URL("../../supabase/functions/du-handoff-create/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260927040500_add_du_admin_device_tokens.sql", import.meta.url), "utf8");

test("D&U admin stores a device credential independent of frontend deployments", () => {
  assert.ok(adminUi.includes("DU_DEVICE_TOKEN_KEY='du-admin-device-token-v1'"));
  assert.ok(adminUi.includes("localStorage.setItem(DU_DEVICE_TOKEN_KEY"));
  assert.ok(adminUi.includes("Pair another device"));
  assert.ok(adminUi.includes("normal site builds will not make you sign in again"));
});

test("existing Supabase sessions automatically upgrade to persistent device auth", () => {
  assert.ok(adminUi.includes("action:'device_register'"));
  assert.ok(adminUi.includes("session.access_token"));
  assert.ok(adminUi.includes("A successful recovery automatically converts this browser into a persistent paired device."));
});

test("paired-device credentials are hashed server-side and use sliding 180-day expiry", () => {
  assert.ok(migration.includes("token_hash text not null unique"));
  assert.ok(migration.includes("expires_at timestamptz not null"));
  assert.ok(adminFn.includes('req.headers.get("x-du-device-token")'));
  assert.ok(adminFn.includes("180 * 24 * 60 * 60 * 1000"));
  assert.ok(adminFn.includes("token_hash"));
  assert.equal(/\bdevice_token\s+text\b/.test(migration), false, "raw device token must not be stored in the database schema");
});

test("pair redemption issues a device token instead of another magic-link session", () => {
  assert.ok(pairFn.includes('service.from("du_admin_device_tokens").insert'));
  assert.ok(pairFn.includes("device_token: rawToken"));
  assert.equal(pairFn.includes("generateLink"), false);
  assert.equal(pairFn.includes("verification_type"), false);
});

test("protected D&U actions accept device auth only after active-admin verification", () => {
  assert.ok(adminFn.includes('service.from("lr_admin_users")'));
  assert.ok(adminFn.includes('.eq("active", true)'));
  assert.ok(handoffFn.includes('req.headers.get("x-du-device-token")'));
  assert.ok(handoffFn.includes('service.from("lr_admin_users")'));
  assert.ok(handoffFn.includes('.eq("active", true)'));
});


test("JWT fallback verifies the actual authenticated user id before device upgrade", () => {
  assert.ok(adminFn.includes('.eq("user_id", userData.user.id).eq("active", true)'));
  assert.ok(adminFn.includes('userId: userData.user.id'));
});
