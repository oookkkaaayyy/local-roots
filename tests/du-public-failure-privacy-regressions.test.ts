// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const du = readFileSync(new URL("../../app/src/pages/DyedUnattachedPage.tsx", import.meta.url), "utf8");

test("D&U public intake does not expose backend error text", () => {
  assert.equal(du.includes("result.error"), false);
  assert.equal(du.includes("error instanceof Error ? error.message"), false);
  assert.ok(du.includes("setMessage('The request could not be submitted.')"));
  assert.ok(du.includes("setMessage('The selected photos could not be read.')"));
});
