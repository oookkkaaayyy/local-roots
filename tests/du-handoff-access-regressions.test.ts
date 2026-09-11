// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../supabase/functions/du-handoff/index.ts", import.meta.url),
  "utf8",
);

test("D&U handoff claims an access slot before reading private photo bytes", () => {
  const claimIndex = source.indexOf("const expectedAccessCount = Number(handoff.access_count || 0)");
  const downloadIndex = source.indexOf("service.storage.from(bucket).download(path)");

  assert.ok(claimIndex >= 0, "expected access-slot claim logic");
  assert.ok(downloadIndex >= 0, "expected private photo download logic");
  assert.ok(claimIndex < downloadIndex, "access slot must be claimed before private photo download");
  assert.ok(source.includes('.eq("access_count", expectedAccessCount)'));
  assert.ok(source.includes("access_count: expectedAccessCount + 1"));
});

test("D&U handoff claim remains bounded by expiry, disablement, and five-access cap", () => {
  assert.ok(source.includes('.is("disabled_at", null)'));
  assert.ok(source.includes('.gt("expires_at", now)'));
  assert.ok(source.includes('.lt("access_count", 5)'));
  assert.ok(source.includes('if (!claimedHandoff) return json({ error: "handoff_expired_or_invalid" }, 410)'));
});
