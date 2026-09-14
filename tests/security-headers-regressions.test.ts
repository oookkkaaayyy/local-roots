// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const headers = readFileSync(new URL("../../app/public/_headers", import.meta.url), "utf8");

test("public responses preserve the security header baseline", () => {
  assert.ok(headers.includes("X-Frame-Options: DENY"));
  assert.ok(headers.includes("X-Content-Type-Options: nosniff"));
  assert.ok(headers.includes("Referrer-Policy: strict-origin-when-cross-origin"));
  assert.ok(headers.includes("Strict-Transport-Security: max-age=31536000"));
  assert.ok(headers.includes("Permissions-Policy: geolocation=(), microphone=(), payment=()"));
});

test("Cloudflare staging remains excluded from search indexing", () => {
  assert.ok(headers.includes("https://local-roots.pages.dev/*"));
  assert.ok(headers.includes("X-Robots-Tag: noindex, nofollow, noarchive"));
});
