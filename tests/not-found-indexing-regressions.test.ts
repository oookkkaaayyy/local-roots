// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../app/src/pages/NotFoundPage.tsx", import.meta.url), "utf8");

test("generic 404 pages are noindexed and use a specific document title", () => {
  assert.ok(source.includes("document.title='Page not found · Local Roots'"));
  assert.ok(source.includes("robots.content='noindex,nofollow,noarchive'"));
});
