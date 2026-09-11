// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../supabase/functions/du-health/index.ts", import.meta.url),
  "utf8",
);

test("D&U public health checks cache expensive service-role probes", () => {
  assert.ok(source.includes("const CACHE_TTL_MS = 60_000"));
  assert.ok(source.includes("let cachedHealth"));
  assert.ok(source.includes("let inFlightHealth"));
  assert.ok(source.includes("cachedHealth.expiresAt > now"));
  assert.ok(source.includes("inFlightHealth = runHealthChecks()"));
});

test("D&U health response remains generic on unexpected failures", () => {
  assert.ok(source.includes('return json({ ok: false, error: "health_check_failed" }, 500)'));
  assert.equal(source.includes("error.message:"), false);
});
