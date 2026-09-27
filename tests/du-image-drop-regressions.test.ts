// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const field = readFileSync(new URL("../../app/src/components/ImageDropField.tsx", import.meta.url), "utf8");
const publicPage = readFileSync(new URL("../../app/src/pages/DyedUnattachedPage.tsx", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../../app/src/pages/DuAdminPage.tsx", import.meta.url), "utf8");

test("D&U image fields support direct drag/drop from desktop photo apps", () => {
  assert.ok(field.includes("onDrop={event=>"));
  assert.ok(field.includes("event.dataTransfer.files"));
  assert.ok(field.includes("new DataTransfer()"));
  assert.ok(field.includes("Drag from Photos here"));
});

test("D&U public request uses the shared drop field for 1-6 reference photos", () => {
  assert.ok(publicPage.includes("<ImageDropField"));
  assert.ok(publicPage.includes('name="referencePhotos"'));
  assert.ok(publicPage.includes("multiple maxFiles={6} required"));
  assert.equal(publicPage.includes('name="referencePhotos" type="file"'), false);
});

test("D&U gallery inbox uses drop fields for every image role", () => {
  for (const name of ["gallerySource","galleryFinished","galleryStencil"]) {
    assert.ok(adminPage.includes(`name="${name}"`));
  }
  assert.ok(adminPage.includes("<ImageDropField"));
  assert.equal(adminPage.includes('type="file"'), false);
});

test("multi-photo drops append without exceeding the configured maximum", () => {
  assert.ok(field.includes("append&&multiple"));
  assert.ok(field.includes("maxFiles"));
  assert.ok(field.includes("images.slice(0,maxFiles)"));
});
