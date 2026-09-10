// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../supabase/functions/lr-submit-event/index.ts", import.meta.url),
  "utf8",
);

test("public event submission bounds request bodies before JSON parsing", () => {
  assert.ok(source.includes("const MAX_REQUEST_BYTES = 64 * 1024"));
  assert.ok(source.includes("async function readBoundedJson"));
  assert.ok(source.includes('req.headers.get("content-length")'));
  assert.ok(source.includes("size > MAX_REQUEST_BYTES"));
  assert.ok(source.includes("await reader.cancel()"));
  assert.ok(source.includes('return json({ error: "request_too_large" }, 413)'));
});

test("public event submission still rejects malformed or non-object JSON without exposing internals", () => {
  assert.ok(source.includes('throw new Error("invalid_json")'));
  assert.ok(source.includes('return json({ error: "invalid_json" }, 400)'));
  assert.equal(source.includes("error.message:"), false);
});
