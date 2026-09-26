/** Leases own a visual slot only. Expiry calls the resolver on current cart state. */
export function activeOverlay(overlays, now = Date.now()) {
  return [...(overlays ?? [])].filter(lease => lease.expiresAt > now).sort((a, b) => b.priority - a.priority)[0] ?? null;
}

export async function expireAndReconcile({ state, now = Date.now(), storeState, reconcile }) {
  const overlays = (state.overlays ?? []).filter(lease => lease.expiresAt > now);
  const changed = overlays.length !== (state.overlays ?? []).length;
  const next = changed ? { ...state, overlays, revision: state.revision + 1 } : state;
  if (changed) await storeState(next);
  // reconcile() resolves next against its current persistent device profiles/state;
  // it does not restore the pre-overlay snapshot.
  const result = await reconcile(next);
  return { state: next, result, expired: changed };
}
