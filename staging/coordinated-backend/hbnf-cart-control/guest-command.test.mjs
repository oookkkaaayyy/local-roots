import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isMetadataOnlyCommand, planGuestCommand, reconcileTargetsForCommand, reduceCartCommand, requiresOwnerAuthorization, runGuestCommand } from "./guest-command.ts";

const commandId = "2f7cfa6d-1c9f-4f64-8c8b-ff8dc7f3a9bb";

function state(overrides = {}) {
  return {
    cartId: "hbnf-cart",
    revision: 17,
    guestMode: true,
    power: "on",
    programMode: "lock",
    sceneId: "course-flow",
    paletteId: "hbnf-default",
    vibe: "moderate",
    vibeMode: "manual",
    sequenceCursor: 2,
    manualSpeedBias: 1,
    tuning: {},
    devices: {
      matrix: { enabled: true, brightness: 120, profileRevision: 2 },
      aux: { enabled: true, brightness: 80, profileRevision: 3 },
    },
    ...overrides,
  };
}

function request(guestAction, value = "", expectedRevision = 17) {
  return { commandId, expectedRevision, guestAction, value };
}

test("Guest Mode defaults closed when the canonical state has no flag", () => {
  const plan = planGuestCommand(request("next"), state({ guestMode: undefined }));
  assert.deepEqual(plan, { ok: false, status: 403, error: "guest_mode_closed" });
});

test("Guest actions use the canonical reducer and only its bounded command subset", () => {
  const vibe = planGuestCommand(request("vibe", "energetic"), state());
  assert.equal(vibe.ok, true);
  if (!vibe.ok) return;
  assert.equal(vibe.type, "VIBE");
  assert.equal(vibe.nextState.vibe, "energetic");
  assert.equal(vibe.nextState.revision, 18);

  const next = planGuestCommand(request("next"), state());
  assert.equal(next.ok, true);
  if (next.ok) {
    assert.equal(next.type, "NEXT");
    assert.equal(next.nextState.sequenceCursor, 3);
    assert.equal(next.nextState.programMode, "auto");
  }

  assert.equal(planGuestCommand(request("vibe", "unknown"), state()).ok, false);
  assert.equal(planGuestCommand(request("release", ""), state()).ok, false);
  const injectedType = planGuestCommand({ ...request("next"), type: "OFF" }, state());
  assert.equal(injectedType.ok, true);
  if (injectedType.ok) assert.equal(injectedType.type, "NEXT");
});

test("Guest request with an old revision is rejected before commit", async () => {
  let commits = 0, reconciles = 0;
  const result = await runGuestCommand(request("vibe", "peak", 16), {
    readContext: async () => ({ data: { desired: { revision: 17, state: state() }, fence: { active: true, epoch: 9, release_id: "release-1" } }, error: null }),
    commit: async () => { commits++; return { data: null, error: null }; },
    reconcile: async () => { reconciles++; return { ok: true, status: 200, body: {} }; },
  });
  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: "stale_revision", currentRevision: 17 });
  assert.equal(commits, 0);
  assert.equal(reconciles, 0);
});

test("Owner closing Guest Mode wins a stale guest attempt", async () => {
  let commits = 0;
  const result = await runGuestCommand(request("next", "", 17), {
    readContext: async () => ({ data: { desired: { revision: 18, state: state({ revision: 18, guestMode: false }) }, fence: { active: true, epoch: 9, release_id: "release-1" } }, error: null }),
    commit: async () => { commits++; return { data: null, error: null }; },
    reconcile: async () => ({ ok: true, status: 200, body: {} }),
  });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, "guest_mode_closed");
  assert.equal(commits, 0);
});

test("A commit-time owner race is returned as stale and is never retried", async () => {
  let commits = 0, reconciles = 0;
  const result = await runGuestCommand(request("vibe", "mellow"), {
    readContext: async () => ({ data: { desired: { revision: 17, state: state() }, fence: { active: true, epoch: 9, release_id: "release-1" } }, error: null }),
    commit: async () => { commits++; return { data: null, error: { code: "40001" } }; },
    reconcile: async () => { reconciles++; return { ok: true, status: 200, body: {} }; },
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "stale_revision");
  assert.equal(commits, 1);
  assert.equal(reconciles, 0);
});

test("Accepted Guest commands commit through the existing bridge and reconcile once", async () => {
  const calls = [];
  const result = await runGuestCommand(request("vibe", "moderate"), {
    readContext: async () => ({ data: { desired: { revision: 17, state: state() }, fence: { active: true, epoch: 9, release_id: "release-1" } }, error: null }),
    commit: async input => { calls.push(["commit", input]); return { data: { result_revision: 18, duplicate: false }, error: null }; },
    reconcile: async input => { calls.push(["reconcile", input]); return { ok: true, status: 200, body: { status: "applied" } }; },
  });
  assert.equal(result.status, 202);
  assert.equal(result.body.reconciliation.status, "applied");
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].type, "VIBE");
  assert.equal(calls[0][1].nextState.vibe, "moderate");
  assert.deepEqual(calls[1][1], { revision: 18, fence: { active: true, epoch: 9, release_id: "release-1" }, type: "VIBE" });
});

test("Guest uses canonical desired-row revision even when state JSON has no revision field", async () => {
  const canonical = state();
  delete canonical.revision;
  let committed;
  const result = await runGuestCommand(request("next"), {
    readContext: async () => ({ data: { desired: { revision: 17, state: canonical }, fence: { active: true, epoch: 9, release_id: "release-1" } }, error: null }),
    commit: async input => { committed = input; return { data: { result_revision: 18, duplicate: false }, error: null }; },
    reconcile: async () => ({ ok: true, status: 200, body: { status: "applied" } }),
  });
  assert.equal(result.status, 202);
  assert.equal(committed.expectedRevision, 17);
  assert.equal(committed.nextState.revision, 18);
});

test("Guest Mode is a metadata-only canonical command", () => {
  const before = state({ guestMode: false });
  const after = reduceCartCommand(before, "GUEST_MODE", { enabled: true }, commandId, before.revision);
  assert.equal(after.guestMode, true);
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual(after.devices, before.devices);
  assert.equal(isMetadataOnlyCommand("GUEST_MODE"), true);
  assert.equal(isMetadataOnlyCommand("VIBE"), false);
  assert.deepEqual(reconcileTargetsForCommand("GUEST_MODE", ["matrix", "aux"]), []);
  assert.deepEqual(reconcileTargetsForCommand("VIBE", ["matrix", "aux"]), ["matrix", "aux"]);
  assert.equal(reduceCartCommand(before, "GUEST_MODE", { enabled: "yes" }, commandId, before.revision), null);
  assert.equal(requiresOwnerAuthorization("command", "GUEST_MODE"), true);
  assert.equal(requiresOwnerAuthorization("guest_command", "GUEST_MODE"), false);
  assert.equal(requiresOwnerAuthorization("command", "VIBE"), false);
});

test("text overlays default to native font slot 4 and accept only reviewable ASCII slots", () => {
  const make = data => reduceCartCommand(state(), "OVERLAY_START", {
    overlayId: "text-font-review",
    kind: "text",
    ttlMs: 8000,
    data: { text: "ACE 25 FT", ...data },
  }, commandId, 17);
  assert.equal(make({}).overlays.at(-1).payload.fontIndex, 4);
  for (const fontIndex of [0, 2, 3, 4]) {
    assert.equal(make({ fontIndex }).overlays.at(-1).payload.fontIndex, fontIndex);
  }
  for (const fontIndex of [1, 5, -1, 2.5, "2", null]) {
    assert.equal(make({ fontIndex }), null, `font index ${String(fontIndex)} must be rejected`);
  }
});

test("Static Guest route calls only the existing endpoint without browser session persistence", () => {
  const page = readFileSync(new URL("../../../hbnf-final-controller/guest/hbnf-cart/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../../../hbnf-final-controller/guest/hbnf-cart/guest.js", import.meta.url), "utf8");
  assert.match(page, /data-guest-action="vibe"/);
  assert.match(page, /data-guest-action="next"/);
  assert.match(page, /guest\.js/);
  assert.match(script, /functions\/v1\/hbnf-cart-control/);
  assert.match(script, /action:"guest_command"/);
  assert.match(script, /credentials:"omit"/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie|guest_token|ticket/i);
  assert.doesNotMatch(page, /release|firmware|deploy|pairing/i);
});
