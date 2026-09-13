// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const headers = readFileSync(new URL("../../app/public/_headers", import.meta.url), "utf8");

test("public responses disable unused sensitive browser capabilities", () => {
  assert.ok(headers.includes("Permissions-Policy: geolocation=(), microphone=(), payment=()"));
});
