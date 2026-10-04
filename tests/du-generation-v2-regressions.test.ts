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

test("Generation V2 uses immutable same-pet roles and controlled accepted-style references",()=>{
  assert.ok(prompt.includes("reference-anchored-v3.0"));
  assert.ok(prompt.includes("03-STYLE-REFERENCE"));
  assert.ok(prompt.includes("Never copy their identity, markings, pose, expression, eye shape, or anatomy"));
  assert.ok(prompt.includes("scratchboard/engraving texture"));
  assert.ok(prompt.includes("Crop out the chest, shoulders, forelegs, and torso"));
  assert.ok(prompt.includes("locked composition source"));
  assert.ok(prompt.includes("DU_ARTWORK_WIDTH_MM=190.5"));
  assert.ok(prompt.includes("DU_MIN_FLOATING_WHITE_MM=2.0"));
  assert.ok(prompt.includes("DU_MIN_CONNECTED_WHITE_WIDTH_MM=1.0"));
  assert.ok(prompt.includes("DU_MIN_CONNECTED_WHITE_LENGTH_MM=0.4"));
  assert.ok(prompt.includes("generation targets, not production certification"));
  assert.ok(prompt.includes("FEWER, LARGER"));
  assert.ok(workflow.includes("buildDuGenerationPrompt"));
  assert.ok(workflow.includes("generation_import_style_reference"));
  assert.ok(prompt.includes("mandatory controls"));
  assert.ok(workflow.includes("prompt_version:DU_GENERATION_PROMPT_VERSION"));
  assert.ok(backend.includes('const generationPromptVersion = "reference-anchored-v3.0"'));
  assert.ok(backend.includes('"at_least_three_approved_style_references_required"'));
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
  assert.ok(workflow.includes("Download full reference package (.zip)"));
  assert.ok(workflow.includes("source.sha256"));
  assert.ok(workflow.includes("Source package integrity check failed"));
  assert.ok(workflow.includes("Individual package downloads"));
  assert.ok(admin.includes("jobNumber={job.job_number}"));
  assert.ok(admin.includes("notes={job.notes}"));
});

test("style reference records are private, append-only, and copied into immutable package manifests",()=>{
  const migration=readFileSync(new URL("../../supabase/migrations/20261004230000_add_du_generation_style_reference_library.sql",import.meta.url),"utf8");
  assert.ok(migration.includes("du_generation_style_references"));
  assert.ok(migration.includes("enable row level security"));
  assert.ok(migration.includes("append-only"));
  assert.ok(backend.includes("style_reference_integrity_mismatch"));
  assert.ok(backend.includes('role: "style_reference"'));
  assert.ok(backend.includes("sourceManifest = { version: 2"));
});
