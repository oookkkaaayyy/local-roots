// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detail = readFileSync(new URL("../../app/src/pages/EventDetailPage.tsx", import.meta.url), "utf8");

test("event detail calendar action has an event-specific accessible name", () => {
  assert.ok(detail.includes('aria-label={`Add ${event.name} to calendar`}'));
  assert.ok(detail.includes('>Add to Calendar</button>'));
});
