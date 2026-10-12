import test from "node:test";
import assert from "node:assert/strict";
import { planGuestCommand, reduceCartCommand } from "./guest-command.ts";
import { phase2VibeReady, runtimeVibeCode } from "./runtime-vibe.ts";
import { runtimeVibeField } from "../hbnf-matrix-adapter-foundation/runtime-vibe.ts";
import { readFileSync } from "node:fs";

const values = ["chill", "groove", "heavy", "psychedelic", "cosmic", "auto"];
const state = () => ({
  guestMode: true,
  revision: 20,
  vibe: "moderate", // legacy energy category must survive Cart 2.0 Vibe selection
  vibeMode: "manual",
  devices: { matrix: { brightness: 44 }, aux: { brightness: 44 } },
});

test("six Cart 2.0 Vibes map to the exact pinned firmware enum", () => {
  const pinnedCore = readFileSync(new URL("../../../firmware/phase2/integration-r5/usermod/hbnf_foundation_core.h", import.meta.url), "utf8");
  assert.match(pinnedCore, /VIBE_CHILL=0[\s\S]*VIBE_GROOVE=1[\s\S]*VIBE_HEAVY=2[\s\S]*VIBE_PSYCHEDELIC=3[\s\S]*VIBE_COSMIC=4[\s\S]*VIBE_AUTO=5/);
  values.forEach((value, code) => {
    assert.equal(runtimeVibeCode(value), code);
    assert.deepEqual(runtimeVibeField(value), { vibe: code });
  });
  assert.deepEqual(runtimeVibeField(undefined), {});
  assert.deepEqual(runtimeVibeField("unknown"), {});
});

test("Vibe UI is fail-closed until backend qualification flag and never calls a desired value confirmed", () => {
  assert.equal(phase2VibeReady(undefined), false);
  assert.equal(phase2VibeReady("false"), false);
  assert.equal(phase2VibeReady("TRUE"), false);
  assert.equal(phase2VibeReady("true"), true);
  const owner = readFileSync(new URL("../../../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
  const guest = readFileSync(new URL("../../../hbnf-final-controller/guest/hbnf-cart/guest.js", import.meta.url), "utf8");
  const statusApi = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const adapter = readFileSync(new URL("../hbnf-matrix-adapter-foundation/index.ts", import.meta.url), "utf8");
  const projection = readFileSync(new URL("./matrix-relay-projection.ts", import.meta.url), "utf8");
  const relay = readFileSync(new URL("./matrix-relay.ts", import.meta.url), "utf8");
  const control = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(owner, /canonicalCapabilities\.phase2VibeRuntimeV1 === true/);
  assert.match(guest, /snapshot\.capabilities\.phase2VibeRuntimeV1===true/);
  assert.match(statusApi, /HBNF_PHASE2_VIBE_RUNTIME_READY/);
  assert.match(control, /handleMatrixRelay\(req\)/, "authenticated relay remains the sole Matrix command writer");
  assert.match(relay, /buildWledProjection\(c,d\.revision,f\.epoch\)/, "relay projects the canonical selected Vibe with revision and fence context");
  assert.match(projection, /vibes\[String\(s\.selectedVibe\?\?""\)\]/, "Matrix projection reads canonical selectedVibe");
  assert.match(projection, /hbnf:\{schema:"foundation-v1",candidate:MATRIX_CANDIDATE,scene:scenes\[sceneId\],vibe,/, "expected readback binds the selected Vibe");
  assert.match(adapter, /Compatibility endpoint only\. It is no longer a command writer/);
  assert.match(adapter, /confirmed:false,commandApplicationConfirmed:false,transportConfirmed:false/);
  assert.match(adapter, /matrix_writer_moved_to_opal_relay/);
  assert.match(owner, /device application and physical AUX illumination are not confirmed/);
});

test("owner canonical reducer preserves legacy vibe and stores runtime selection separately", () => {
  values.slice(0, 5).forEach((selectedVibe, index) => {
    const next = reduceCartCommand(state(), "VIBE", { vibe: selectedVibe }, `owner-${index}`, 20);
    assert.equal(next.selectedVibe, selectedVibe);
    assert.equal(next.vibe, "moderate");
    assert.equal(next.revision, 21);
    assert.deepEqual(runtimeVibeField(next.selectedVibe), { vibe: index });
  });
  const auto = reduceCartCommand(state(), "VIBE_AUTO", {}, "owner-auto", 20);
  assert.equal(auto.selectedVibe, "auto");
  assert.equal(auto.vibeMode, "music");
  assert.deepEqual(runtimeVibeField(auto.selectedVibe), { vibe: 5 });
});

test("Guest Vibe action enters the same canonical reducer and WLED projection", () => {
  for (const [index, vibe] of values.slice(0, 5).entries()) {
    const plan = planGuestCommand({ commandId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, expectedRevision: 20, guestAction: "vibe", value: vibe }, state(), 20);
    assert.equal(plan.ok, true);
    if (!plan.ok) continue;
    assert.equal(plan.nextState.selectedVibe, vibe);
    assert.deepEqual(runtimeVibeField(plan.nextState.selectedVibe), { vibe: index });
  }
  const autoPlan = planGuestCommand({ commandId: "00000000-0000-4000-8000-000000000005", expectedRevision: 20, guestAction: "vibe_auto", value: "" }, state(), 20);
  assert.equal(autoPlan.ok, true);
  if (autoPlan.ok) assert.deepEqual(runtimeVibeField(autoPlan.nextState.selectedVibe), { vibe: 5 });
});

test("invalid Vibe cannot overwrite the legacy state", () => {
  assert.equal(reduceCartCommand(state(), "VIBE", { vibe: "rainbow" }, "bad", 20), null);
  assert.equal(planGuestCommand({ commandId: "00000000-0000-4000-8000-000000000006", expectedRevision: 20, guestAction: "vibe", value: "rainbow" }, state(), 20).ok, false);
});
