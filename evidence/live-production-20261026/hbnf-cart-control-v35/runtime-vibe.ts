/** Cart 2.0 runtime Vibes, mapped to the pinned R5 WLED HBNF enum. */
export const CART2_RUNTIME_VIBES = ["chill", "groove", "heavy", "psychedelic", "cosmic", "auto"] as const;
export type Cart2RuntimeVibe = typeof CART2_RUNTIME_VIBES[number];

const codes: Record<Cart2RuntimeVibe, number> = {
  chill: 0,
  groove: 1,
  heavy: 2,
  psychedelic: 3,
  cosmic: 4,
  auto: 5,
};

export function runtimeVibeCode(value: unknown): number | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(codes, value)
    ? codes[value as Cart2RuntimeVibe]
    : null;
}

export function isManualRuntimeVibe(value: unknown): value is Exclude<Cart2RuntimeVibe, "auto"> {
  return typeof value === "string" && ["chill", "groove", "heavy", "psychedelic", "cosmic"].includes(value);
}

/** Fail closed until matching firmware and frozen runtime gates are accepted. */
export function phase2VibeReady(setting: unknown): boolean {
  return setting === "true";
}

/**
 * Add the runtime enum only when canonical state contains a recognized Cart 2.0
 * selection. Legacy `state.vibe` energy labels remain untouched and are not
 * guessed into a visual Vibe.
 */
export function runtimeVibeProjection(state: Record<string, unknown>): { vibe?: number } {
  const code = runtimeVibeCode(state.selectedVibe);
  return code === null ? {} : { vibe: code };
}

