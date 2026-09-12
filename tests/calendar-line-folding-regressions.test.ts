// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const presentation = readFileSync(new URL("../../app/src/lib/eventPresentation.ts", import.meta.url), "utf8");

test("calendar output folds long UTF-8 content lines", () => {
  assert.ok(presentation.includes("const CALENDAR_ENCODER = new TextEncoder()"));
  assert.ok(presentation.includes("const limit=segments.length?74:75"));
  assert.ok(presentation.includes("CALENDAR_ENCODER.encode(char).length"));
  assert.ok(presentation.includes("index?` ${segment}`:segment"));
  assert.ok(presentation.includes(".map(line=>foldCalendarLine(line)).join('\\r\\n')"));
});
