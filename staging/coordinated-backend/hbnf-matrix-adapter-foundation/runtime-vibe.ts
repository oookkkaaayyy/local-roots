const RUNTIME_VIBE_CODES: Record<string, number> = {
  chill: 0,
  groove: 1,
  heavy: 2,
  psychedelic: 3,
  cosmic: 4,
  auto: 5,
};

/** Translate canonical Cart 2.0 selection to the pinned R5 WLED HBNF enum. */
export function runtimeVibeField(selectedVibe: unknown): { vibe?: number } {
  if (typeof selectedVibe !== "string" || !Object.prototype.hasOwnProperty.call(RUNTIME_VIBE_CODES, selectedVibe)) return {};
  return { vibe: RUNTIME_VIBE_CODES[selectedVibe] };
}
