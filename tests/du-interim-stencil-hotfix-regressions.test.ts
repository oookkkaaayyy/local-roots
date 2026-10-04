// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app=readFileSync(new URL("../../app/src/App.tsx",import.meta.url),"utf8");
const admin=readFileSync(new URL("../../app/src/pages/DuAdminPage.tsx",import.meta.url),"utf8");
const prompt=readFileSync(new URL("../../app/src/lib/duInterimPrompt.ts",import.meta.url),"utf8");
const packageJson=readFileSync(new URL("../../app/package.json",import.meta.url),"utf8");

test("interim D&U prompt is centralized and enforces current clean-room targets",()=>{
  assert.ok(app.includes("buildDuInterimCleanRoomPrompt"));
  assert.ok(admin.includes("buildDuInterimCleanRoomPrompt"));
  assert.ok(prompt.includes("CLEAN ROOM v1.1"));
  assert.ok(prompt.includes("Crop out the chest, shoulders, forelegs, and torso"));
  assert.ok(prompt.includes("at least 2.0 mm × 2.0 mm"));
  assert.ok(prompt.includes("must be at least 1.0 mm wide"));
  assert.ok(prompt.includes("continues for 0.4 mm or longer"));
  assert.ok(prompt.includes("FEWER, LARGER"));
  assert.ok(prompt.includes("tiny floating white specks"));
});

test("admin exposes one-click source ZIP without mutating workflow state",()=>{
  assert.ok(packageJson.includes('"jszip": "^3.10.1"'));
  assert.ok(admin.includes("new JSZip()"));
  assert.ok(admin.includes(">Download source ZIP</button>"));
  assert.ok(admin.includes("source-photos.zip"));
  const zipFunction=admin.slice(admin.indexOf("async function downloadSourceZip"),admin.indexOf("function JobCard"));
  assert.equal(zipFunction.includes("set_workflow"),false);
  assert.equal(zipFunction.includes("du-handoff-create"),false);
});
