import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { deviceReadinessChecks } from "../hbnf-final-controller/hbnf-cart-readiness.mjs";

const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name} in the Cart controller`);
  const open = source.indexOf("{", start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "/") { lineComment = true; i += 1; continue; }
    if (ch === "/" && next === "*") { blockComment = true; i += 1; continue; }
    if (ch === "\"" || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`unterminated ${name} function`);
}

function makeSnapshot(now, { matrix = 255, auxTarget = 210, auxGlobal = 255, ageMs = 1000 } = {}) {
  const revision = 12;
  const observedAt = new Date(now - ageMs).toISOString();
  return {
    desired: { revision },
    devices: {
      matrix: { confirmed: true, confirmedRevision: revision },
      aux: { confirmed: true, confirmedRevision: revision },
    },
    observed: [
      {
        device_id: "matrix", desired_revision: revision, status: "online", observed_at: observedAt,
        reported: { confirmed: true, appliedProjection: { brightness: matrix }, brightness: matrix },
      },
      {
        device_id: "aux", desired_revision: revision, status: "online", observed_at: observedAt,
        reported: {
          confirmed: true, ddp: true, brightness: auxGlobal,
          matrixTargetBrightness: auxTarget, appliedProjection: { brightness: auxTarget },
        },
      },
    ],
  };
}

const matrixOutputMarkup = html.match(/<output\b[^>]*id="matrixValue"[^>]*>(.*?)<\/output>/s)?.[1]?.trim();
const auxOutputMarkup = html.match(/<output\b[^>]*id="auxValue"[^>]*>(.*?)<\/output>/s)?.[1]?.trim();
assert.equal(matrixOutputMarkup, "Unconfirmed", "first-load Matrix readback must not present the 8 slider default as measured brightness");
assert.equal(auxOutputMarkup, "Unconfirmed", "first-load AUX readback must not present the 64 slider default as measured brightness");
assert.match(html, /aria-label="Set Matrix brightness target"/);
assert.match(html, /aria-label="Set Matrix AUX target brightness"/);

function makeOutput(initial) {
  let text = initial;
  return {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    get value() { return text; },
    set value(value) { text = String(value); },
    get textContent() { return text; },
    set textContent(value) { text = String(value); },
  };
}
const output = {
  matrixValue: makeOutput(matrixOutputMarkup),
  auxValue: makeOutput(auxOutputMarkup),
  auxBrightnessLabel: makeOutput("Underglow · Matrix AUX target"),
};
const eventHandlers = new Map();
const controls = Object.fromEntries([
  "scene", "energy", "energyValue", "audioResponse", "audioResponseValue", "motion", "motionValue",
  "variation", "variationValue", "matrixBrightness", "auxBrightness", "matrixValue", "auxValue", "auxBrightnessLabel",
  "micSensitivity", "micSensitivityValue", "audioProfile", "audioStyle",
].map(id => [id, output[id] || {
  value: "0", textContent: "", disabled: false, attributes: {},
  setAttribute(name, value) { this.attributes[name] = String(value); },
  addEventListener(type, handler) { eventHandlers.set(`${id}:${type}`, handler); },
}]));
let frozenNow = Date.parse("2026-10-31T08:00:00Z");
let commandCalls = 0;
const context = {
  Date: { now: () => frozenNow },
  Number,
  Math,
  deviceReadinessChecks,
  $: id => controls[String(id).replace(/^#/, "")],
  valueOr: (value, fallback) => value == null ? fallback : value,
  pathValue(object, path, fallback) {
    let value = object;
    for (const key of path) value = value == null ? undefined : value[key];
    return value === undefined ? fallback : value;
  },
  command() { commandCalls += 1; },
  updateVibeSelection() {},
  renderGuestMode() {},
  hydrating: false,
};
const setRangeAndHydration = `${extractFunction("setRange")}\n${extractFunction("hydrateLocalControls")}\n${extractFunction("hydrateControls")}`;
vm.runInNewContext(setRangeAndHydration, context);
const brightnessRenderer = extractFunction("renderBrightnessTruth");
vm.runInNewContext(brightnessRenderer, context);
vm.runInNewContext(extractFunction("renderLocalComponentControls"), context);
const bindingStart = source.indexOf("for (const [inputId, outputId] of [");
const bindingEnd = source.indexOf('\nfor (const id of ["energy",', bindingStart);
assert.ok(bindingStart >= 0 && bindingEnd > bindingStart, "brightness input handlers must remain present");
vm.runInNewContext(source.slice(bindingStart, bindingEnd), context);

context.renderBrightnessTruth(null, frozenNow);
assert.equal(output.matrixValue.textContent, "Unconfirmed");
assert.equal(output.auxValue.textContent, "Unconfirmed");

const auxOnlyDirect = { componentStatus: { matrix: { available: false }, aux: { available: true } }, capabilities: { independentAuxBrightnessReadbackV1: true, independentAuxBrightnessWriteV1: false }, desired: { state: { devices: { aux: { actualWledBrightness: 255 } } } } };
context.renderLocalComponentControls(auxOnlyDirect);
assert.equal(output.auxBrightnessLabel.textContent, "Underglow · AUX WLED read-only");
assert.equal(controls.auxBrightness.disabled, true, "direct Opal does not invent an AUX write path");
assert.equal(controls.auxBrightness.attributes["aria-label"], "AUX WLED global brightness control unavailable");
assert.equal(output.auxValue.textContent, "255", "AUX WLED global readback is labeled and shown independently");

const pairedMatrixOnly = { componentStatus: { matrix: { available: true }, aux: { available: false } }, capabilities: { pairedAuxBrightnessAtomicV1: true } };
context.renderLocalComponentControls(pairedMatrixOnly);
assert.equal(controls.matrixBrightness.disabled, false, "Matrix control remains available during AUX outage");
assert.equal(controls.auxBrightness.disabled, true, "paired cross-device brightness control stays disabled without AUX readback");
assert.equal(controls.auxBrightness.attributes["aria-label"], "Matrix AUX target control unavailable while AUX readback is unavailable");
context.renderBrightnessTruth(null, frozenNow);

const desired = {
  guestMode: true,
  revision: 12,
  state: {
    sceneId: "course-flow", vibe: "groove",
    tuning: { energy: 40, audioResponse: 75, motion: 60, variation: 85 },
    devices: { matrix: { brightness: 8 }, aux: { brightness: 64 } },
  },
};
assert.ok(controls.scene);
assert.ok(context.$("scene"));
context.hydrateControls(desired.state);
context.hydrateLocalControls(desired.state);
assert.equal(controls.matrixBrightness.value, "8", "the slider keeps its target position");
assert.equal(controls.auxBrightness.value, "64", "the slider keeps its target position");
assert.equal(output.matrixValue.textContent, "Unconfirmed", "desired-state hydration must not overwrite measured-readback truth");
assert.equal(output.auxValue.textContent, "Unconfirmed", "desired-state hydration must not overwrite measured-readback truth");
assert.equal(commandCalls, 0, "brightness display hydration must send no control command");

const missing = makeSnapshot(frozenNow);
missing.observed = missing.observed.filter(item => item.device_id !== "aux");
context.renderBrightnessTruth(missing, frozenNow);
assert.equal(output.matrixValue.textContent, "255", "a fresh Matrix readback remains independently visible");
assert.equal(output.auxValue.textContent, "Unconfirmed", "a missing AUX readback stays unconfirmed");

const fresh = makeSnapshot(frozenNow, { matrix: 255, auxTarget: 210, auxGlobal: 255 });
context.renderBrightnessTruth(fresh, frozenNow);
assert.equal(output.matrixValue.textContent, "255");
assert.equal(output.auxValue.textContent, "210", "Underglow displays Matrix AUX target, not AUX WLED global brightness");
eventHandlers.get("matrixBrightness:input")?.({ target: { value: "180" } });
eventHandlers.get("auxBrightness:input")?.({ target: { value: "190" } });
assert.equal(output.matrixValue.textContent, "255", "moving the Matrix target slider cannot masquerade as a device readback");
assert.equal(output.auxValue.textContent, "210", "moving the AUX target slider cannot masquerade as a device readback");
const failed = makeSnapshot(frozenNow);
failed.observed[0].status = "failed";
failed.observed[1].reported.confirmed = false;
context.renderBrightnessTruth(failed, frozenNow);
assert.equal(output.matrixValue.textContent, "Unconfirmed", "a failed refresh clears the last displayed value");
assert.equal(output.auxValue.textContent, "Unconfirmed", "an unconfirmed refresh cannot leave an old value looking current");
context.renderBrightnessTruth(null, frozenNow);
assert.equal(output.matrixValue.textContent, "Unconfirmed", "a missing status response clears previous values");
assert.equal(output.auxValue.textContent, "Unconfirmed");

const zero = makeSnapshot(frozenNow, { matrix: 0, auxTarget: 0, auxGlobal: 255 });
context.renderBrightnessTruth(zero, frozenNow);
assert.equal(output.matrixValue.textContent, "0", "zero is a valid confirmed brightness");
assert.equal(output.auxValue.textContent, "0", "zero is a valid confirmed AUX target");

const boundary = makeSnapshot(frozenNow, { matrix: 255, auxTarget: 210, ageMs: 90000 });
context.renderBrightnessTruth(boundary, frozenNow);
assert.equal(output.matrixValue.textContent, "255", "the existing 90-second freshness boundary remains inclusive");
assert.equal(output.auxValue.textContent, "210");
frozenNow += 1;
context.renderBrightnessTruth(boundary, frozenNow);
assert.equal(output.matrixValue.textContent, "Stale", "readback older than 90 seconds is no longer presented as current");
assert.equal(output.auxValue.textContent, "Stale");

const missingValue = makeSnapshot(frozenNow);
missingValue.observed[0].reported.appliedProjection.brightness = null;
missingValue.observed[0].reported.brightness = null;
missingValue.observed[1].reported.appliedProjection.brightness = Number.NaN;
missingValue.observed[1].reported.matrixTargetBrightness = Number.NaN;
context.renderBrightnessTruth(missingValue, frozenNow);
assert.equal(output.matrixValue.textContent, "Unconfirmed", "missing or invalid brightness fields remain unconfirmed");
assert.equal(output.auxValue.textContent, "Unconfirmed", "missing or invalid AUX targets remain unconfirmed");
assert.equal(commandCalls, 0, "display rendering and hydration never send control commands");

console.log("PASS: offline brightness truth, missing/failed/stale readback, fresh target values, zero, 90-second boundary, and command-free hydration");
