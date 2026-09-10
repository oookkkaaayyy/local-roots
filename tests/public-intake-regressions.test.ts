// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const intake = readFileSync(
  new URL("../../supabase/functions/submit-intake/index.ts", import.meta.url),
  "utf8",
);

test("public intake accepts only the intended image MIME types", () => {
  assert.ok(intake.includes('"image/jpeg": "jpg"'));
  assert.ok(intake.includes('"image/png": "png"'));
  assert.ok(intake.includes('"image/webp": "webp"'));
  assert.ok(intake.includes("if (!extension) return json({ error: `Photo ${index + 1} must be JPEG, PNG, or WebP` }, 400);"));
});

test("public intake verifies image bytes instead of trusting the declared MIME type", () => {
  assert.ok(intake.includes("function hasExpectedImageSignature"));
  assert.ok(intake.includes("bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff"));
  assert.ok(intake.includes("signature.every((value, index) => bytes[index] === value)"));
  assert.ok(intake.includes('String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"'));
  assert.ok(intake.includes('String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"'));
  assert.ok(intake.includes("if (!hasExpectedImageSignature(contentType, bytes))"));
});

test("all photos are validated before any job row is created", () => {
  const validationStart = intake.indexOf("const validatedPhotos:");
  const validationComplete = intake.indexOf('if (!validatedPhotos.length) return json({ error: "No valid reference images were uploaded" }, 400);');
  const jobInsert = intake.indexOf('supabase.from("jobs").insert');
  assert.ok(validationStart >= 0);
  assert.ok(validationComplete > validationStart);
  assert.ok(jobInsert > validationComplete);
});

test("public intake keeps server-side request, field, count, and decoded-photo size limits", () => {
  for (const required of [
    "MAX_REQUEST_BYTES",
    "MAX_PHOTO_DATA_URL_CHARS",
    "clientName.length > 160",
    "phone.length > 80",
    "petName.length > 160",
    "notes.length > 4000",
    "rawPhotos.length > 6",
    "size > 8 * 1024 * 1024",
  ]) {
    assert.ok(intake.includes(required), `missing intake guard: ${required}`);
  }
});

test("unexpected intake failures do not return raw backend errors", () => {
  assert.ok(intake.includes('return json({ error: "The request could not be submitted." }, 500);'));
  assert.equal(intake.includes("error: String(error"), false);
  assert.equal(intake.includes("error.message"), false);
});
