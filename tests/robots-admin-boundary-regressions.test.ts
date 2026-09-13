// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const robots = readFileSync(new URL("../../app/public/robots.txt", import.meta.url), "utf8");

test("robots policy blocks both exact and nested admin routes", () => {
  assert.ok(robots.includes("Disallow: /admin\n"));
  assert.ok(!robots.includes("Disallow: /admin/\n"));
});
