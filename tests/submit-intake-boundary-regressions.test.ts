// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../supabase/functions/submit-intake/index.ts", import.meta.url),
  "utf8",
);

test("D&U public intake stream-bounds request bodies before JSON parsing", () => {
  assert.ok(source.includes("const MAX_REQUEST_BYTES = 50 * 1024 * 1024"));
  assert.ok(source.includes("async function readBoundedJson"));
  assert.ok(source.includes('req.headers.get("content-length")'));
  assert.ok(source.includes("size > MAX_REQUEST_BYTES"));
  assert.ok(source.includes("await reader.cancel()"));
  assert.equal(source.includes("await req.json()"), false);
  assert.ok(source.includes('return json({ error: "Request is too large" }, 413)'));
});

test("D&U public intake rejects malformed/non-object JSON without exposing internals", () => {
  assert.ok(source.includes('throw new Error("invalid_json")'));
  assert.ok(source.includes('return json({ error: "The request could not be read." }, 400)'));
});
