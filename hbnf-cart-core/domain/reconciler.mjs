import { DEVICES, resolveEffectiveState } from "./cart-state.mjs";

export class FenceError extends Error {
  constructor(message) { super(message); this.name = "FenceError"; }
}

/** Fenced full-state fan-out. It deliberately has no historical command queue. */
export async function reconcileCart({ desiredState, release, fence, adapters, readFence, writeObserved = async () => {} }) {
  if (!fence || !Number.isSafeInteger(fence.epoch) || !fence.active || !fence.release) throw new FenceError("No active actuator fence.");
  if (release !== fence.release) throw new FenceError("Release does not own the active actuator fence.");
  const initialFence = await readFence();
  assertFence(initialFence, fence);
  const projections = resolveEffectiveState(desiredState, { release, fenceEpoch: fence.epoch });
  const devices = await Promise.allSettled(DEVICES.map(async deviceId => {
    const projection = projections[deviceId];
    const adapter = adapters[deviceId];
    if (!adapter) throw new Error(`Missing ${deviceId} adapter.`);
    if (!projection.enabled) {
      const ack = await adapter.apply(projection);
      assertCurrentAck(ack, projection);
      await writeObserved(deviceId, toObserved(ack, projection, "off"));
      return { deviceId, status: "off", projection };
    }
    const online = await adapter.isOnline();
    if (!online) {
      await writeObserved(deviceId, { deviceId, online: false, cartRevision: desiredState.revision, fenceEpoch: fence.epoch, release, observedAt: Date.now(), error: "offline" });
      return { deviceId, status: "offline", projection };
    }
    const beforeApply = await readFence();
    assertFence(beforeApply, fence);
    const ack = await adapter.apply(projection);
    assertCurrentAck(ack, projection);
    const afterApply = await readFence();
    assertFence(afterApply, fence);
    if (projection.cartRevision !== desiredState.revision) throw new FenceError("Cart revision changed during reconciliation; discard acknowledgement.");
    await writeObserved(deviceId, toObserved(ack, projection, "online"));
    return { deviceId, status: "applied", projection, ack };
  }));
  const results = devices.map((result, i) => result.status === "fulfilled"
    ? result.value
    : { deviceId: DEVICES[i], status: "failed", error: String(result.reason?.message ?? result.reason), projection: projections[DEVICES[i]] });
  return {
    release,
    fenceEpoch: fence.epoch,
    cartRevision: desiredState.revision,
    status: results.every(r => r.status === "applied" || r.status === "off") ? "applied" : "degraded",
    results,
  };
}

function assertFence(actual, expected) {
  if (!actual?.active || actual.release !== expected.release || actual.epoch !== expected.epoch) {
    throw new FenceError("Active fence changed; no acknowledgement may update observed state.");
  }
}
function assertCurrentAck(ack, projection) {
  if (!ack || ack.confirmed !== true || ack.cartRevision !== projection.cartRevision || ack.fenceEpoch !== projection.fenceEpoch || ack.deviceId !== projection.deviceId) {
    throw new FenceError(`Fresh acknowledgement did not match ${projection.deviceId} desired revision/fence.`);
  }
  if (ack.brightness !== projection.brightness || ack.enabled !== projection.enabled) throw new FenceError(`Fresh acknowledgement mismatched ${projection.deviceId} safety/profile state.`);
}
function toObserved(ack, projection, status) {
  return {
    deviceId: projection.deviceId,
    online: status === "online",
    status,
    cartRevision: projection.cartRevision,
    fenceEpoch: projection.fenceEpoch,
    release: projection.release,
    bootId: ack.bootId ?? null,
    sceneId: ack.sceneId ?? null,
    brightness: ack.brightness,
    enabled: ack.enabled,
    observedAt: ack.observedAt ?? Date.now(),
  };
}
