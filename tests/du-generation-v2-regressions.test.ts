// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource=(path:string)=>readFileSync(new URL(`../../app/src/${path}`,import.meta.url),"utf8");
const prompt=appSource("lib/duGenerationPrompt.ts");
const workflow=appSource("components/DuGenerationWorkflow.tsx");
const admin=appSource("pages/DuAdminPage.tsx");
const app=appSource("App.tsx");
const backend=readFileSync(new URL("../../supabase/functions/du-admin/index.ts",import.meta.url),"utf8");
const packageJson=readFileSync(new URL("../../app/package.json",import.meta.url),"utf8");

test("Generation V2 uses one versioned canonical prompt with current physical bias",()=>{
  assert.ok(prompt.includes("clean-room-v2.2"));
  assert.ok(prompt.includes("Crop out the chest, shoulders, forelegs, and torso"));
  assert.ok(prompt.includes("locked composition source"));
  assert.ok(prompt.includes("DU_ARTWORK_WIDTH_MM=190.5"));
  assert.ok(prompt.includes("DU_MIN_FLOATING_WHITE_MM=2.0"));
  assert.ok(prompt.includes("DU_MIN_CONNECTED_WHITE_WIDTH_MM=1.0"));
  assert.ok(prompt.includes("DU_MIN_CONNECTED_WHITE_LENGTH_MM=0.4"));
  assert.ok(prompt.includes("generation targets, not production certification"));
  assert.ok(prompt.includes("FEWER, LARGER"));
  assert.ok(prompt.includes("tiny floating white specks"));
  assert.ok(workflow.includes("buildDuGenerationPrompt"));
  assert.ok(workflow.includes("prompt_version:DU_GENERATION_PROMPT_VERSION"));
  assert.ok(backend.includes('const generationPromptVersion = "clean-room-v2.2"'));
  assert.ok(backend.includes('"generation_prompt_version_mismatch"'));
  assert.ok(backend.includes("prompt_version: promptVersion"));
});

test("temporary duplicate prompt implementations cannot silently return",()=>{
  assert.equal(app.includes("duCleanRoomPrompt"),false);
  assert.equal(app.includes("SUCCESS-DERIVED VISUAL TARGET"),false);
});

test("Generation V2 provides one-click verified ZIP download of immutable source package",()=>{
  assert.ok(packageJson.includes('"jszip": "^3.10.1"'));
  assert.ok(workflow.includes("new JSZip()"));
  assert.ok(workflow.includes("Download all source photos (.zip)"));
  assert.ok(workflow.includes("source.sha256"));
  assert.ok(workflow.includes("Source package integrity check failed"));
  assert.ok(workflow.includes("Individual source downloads"));
  assert.ok(admin.includes("jobNumber={job.job_number}"));
  assert.ok(admin.includes("notes={job.notes}"));
});
