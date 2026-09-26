#!/usr/bin/env node
import fs from "node:fs";
import { resolveEffectiveState } from "../hbnf-cart-core/domain/cart-state.mjs";

const [statePath, releaseId, epochText] = process.argv.slice(2);
if (!statePath || !releaseId || !/^\d+$/.test(epochText ?? "")) {
  console.error("usage: node scripts/hbnf-cart-projection-preflight.mjs <reviewed-state.json> <release-id> <fence-epoch>");
  process.exit(2);
}
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
if (state.cartId !== "hbnf-cart" || state.revision !== 0 || !state.devices?.matrix || !state.devices?.aux) {
  throw new Error("bootstrap state must identify hbnf-cart revision 0 and both device profiles");
}
for (const id of ["matrix", "aux"]) {
  const profile = state.devices[id];
  if (!Number.isInteger(profile.brightness) || profile.brightness < 0 || profile.brightness > 255 || profile.brightnessLocked !== true) {
    throw new Error(`${id} brightness profile is missing, out of range, or not sticky`);
  }
}
const epoch = Number(epochText);
const projections = resolveEffectiveState(state, { release: releaseId, fenceEpoch: epoch });
const matrix = projections.matrix, aux = projections.aux;
if (!matrix || !aux || matrix.cartRevision !== aux.cartRevision || matrix.fenceEpoch !== aux.fenceEpoch ||
    matrix.cartRevision !== 0 || matrix.fenceEpoch !== epoch ||
    matrix.brightness !== state.devices.matrix.brightness || aux.brightness !== state.devices.aux.brightness ||
    matrix.deviceId !== "matrix" || aux.deviceId !== "aux") {
  throw new Error("Matrix/AUX canonical projections are inconsistent");
}
for (const projection of [matrix, aux]) {
  if (projection.release !== releaseId || projection.applyCompleteProjection !== true) {
    throw new Error("projection release or completeness check failed");
  }
}
process.stdout.write(JSON.stringify({ projectionSane: true, cartRevision: 0, fenceEpoch: epoch,
  matrixBrightness: matrix.brightness, auxBrightness: aux.brightness, release: releaseId }) + "\n");
