// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../app/public/sw.js", import.meta.url), "utf8");

test("push notification navigation is constrained to the Local Roots origin", () => {
  assert.ok(source.includes("target.origin === self.location.origin"));
  assert.ok(source.includes("return target.origin === self.location.origin ? target.href : fallback.href"));
  assert.ok(source.includes("const targetUrl = notificationTarget(event.notification.data?.url)"));
  assert.ok(source.includes("url: notificationTarget(payload.url)"));
});
