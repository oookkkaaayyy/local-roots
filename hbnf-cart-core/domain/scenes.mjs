import { assertSceneSafe } from "./cart-state.mjs";

export const SCENES = Object.freeze({
  "course-flow": Object.freeze({ family: "course", rendering: "flow", tempoPolicy: "semantic", palettePolicy: "cart", overlayPolicy: "exclusive" }),
  "field-mix": Object.freeze({ family: "field-mix", rendering: "continuous", tempoPolicy: "semantic", palettePolicy: "cart", overlayPolicy: "exclusive" }),
  "hbnf-signature": Object.freeze({ family: "signature", rendering: "accented", tempoPolicy: "semantic", palettePolicy: "cart", overlayPolicy: "exclusive" }),
  "quiet-cosmos": Object.freeze({ family: "cosmic", rendering: "sparse", tempoPolicy: "semantic", palettePolicy: "cart", overlayPolicy: "exclusive" }),
});

export function validateSceneRegistry(scenes = SCENES) {
  for (const [sceneId, scene] of Object.entries(scenes)) {
    if (!sceneId.trim() || !scene || typeof scene !== "object") throw new TypeError("Each scene needs an id and object definition.");
    assertSceneSafe(scene, `scenes.${sceneId}`);
  }
  return true;
}

validateSceneRegistry();
