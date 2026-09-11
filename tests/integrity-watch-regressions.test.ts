// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const watch = readFileSync(new URL("../supabase/functions/lr-integrity-watch/index.ts", import.meta.url), "utf8");

test("integrity watch follows the current event discovery UI contract", () => {
  assert.equal(watch.includes('"Show past events"'), false);
  for (const marker of [
    '"Results available"',
    '"Past events & results"',
    '"Add to Calendar"',
    '"View official results"',
    '"/events/"',
  ]) {
    assert.ok(watch.includes(marker), `missing current event marker: ${marker}`);
  }
});

test("integrity watch verifies the permanent event-page styles", () => {
  assert.ok(watch.includes('".event-title-link{"'));
  assert.ok(watch.includes('".event-detail-card{"'));
});

test("integrity watch version advances with its deployed contract", () => {
  assert.ok(watch.includes('LocalRootsIntegrityWatch/8.0'));
  assert.equal(watch.includes('LocalRootsIntegrityWatch/7.0'), false);
});
