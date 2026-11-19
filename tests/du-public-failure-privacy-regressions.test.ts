// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const du = readFileSync(new URL("../../app/src/pages/DyedUnattachedPage.tsx", import.meta.url), "utf8");

test("D&U public page has no intake form or backend error text", () => {
  assert.equal(du.includes("result.error"), false);
  assert.equal(du.includes("submit-intake"), false);
});
