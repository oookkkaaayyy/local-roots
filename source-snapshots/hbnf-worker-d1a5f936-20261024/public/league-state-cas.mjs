/* Shared revision-conditional writes for the HBNF league_state root. */
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const stable = value => JSON.stringify(value ?? null);
export function mergeLeagueValue(base, local, remote) {
  const b=stable(base), l=stable(local), r=stable(remote);
  if(l===b)return {status:"merged",value:clone(remote)};
  if(r===b||l===r)return {status:"merged",value:clone(local)};
  return {status:"conflict"};
}
const read = async client => {
  const result = await client.from("league_state").select("id,state_json,updated_at").eq("id", 1).single();
  if (result.error || !result.data || result.data.id !== 1 || !result.data.updated_at || !result.data.state_json) throw result.error || new Error("The current shared scores could not be verified.");
  return { root: result.data.state_json, revision: result.data.updated_at };
};
const write = async (client, root, revision) => {
  // The database BEFORE trigger ignores device time and assigns the monotonic revision.
  const result = await client.from("league_state").update({ state_json: root }).eq("id", 1).eq("updated_at", revision).select("id");
  if (result.error) throw result.error;
  return Array.isArray(result.data) && result.data.length === 1;
};
function persist(storage, key, draft) {
  try { storage.setItem(key, JSON.stringify(draft)); return true; } catch { return false; }
}
function clearIfSame(storage, key, draft) { try { if (storage.getItem(key) === JSON.stringify(draft)) storage.removeItem(key); } catch {} }
export function recoverLeagueDraft(storage = globalThis.localStorage, storageKey) {
  try { const value = JSON.parse(storage.getItem(storageKey) || 'null'); return value && typeof value === 'object' ? value : null; } catch { return null; }
}
export async function saveLeagueBranchCAS({ client, branch, branchState, baselineBranch, storage = globalThis.localStorage, storageKey, onStatus = () => {}, attempts = 3 }) {
  const draft = { branch, branchState: clone(branchState), baselineBranch: clone(baselineBranch) };
  const retained = persist(storage, storageKey, draft);
  onStatus(retained ? "Pending — saving" : "Saving; this device could not keep a recovery copy");
  for (let attempt = 0; attempt < attempts; attempt++) {
    let current;
    try { current = await read(client); } catch (error) { onStatus(retained ? "Not saved — draft kept on this device" : "Not saved — keep this page open"); return { status: "failed", error, retained }; }
    const remote = current.root?.[branch];
    if (stable(remote) !== stable(draft.baselineBranch) && stable(remote) !== stable(draft.branchState)) {
      onStatus(retained ? "Conflict — newer scores found; your edits are kept on this device" : "Conflict — keep this page open; device recovery could not be stored");
      return { status: "conflict", current, retained };
    }
    if (stable(remote) === stable(draft.branchState)) {
      const verified = await read(client);
      if (stable(verified.root?.[branch]) !== stable(draft.branchState)) { onStatus("Not saved — server readback differed"); return { status: "failed", current: verified, retained }; }
      clearIfSame(storage, storageKey, draft)
      onStatus("Saved and verified"); return { status: "saved", current: verified, retained };
    }
    const next = { ...clone(current.root), [branch]: clone(draft.branchState) };
    try {
      if (!await write(client, next, current.revision)) continue;
      const verified = await read(client);
      if (stable(verified.root?.[branch]) !== stable(draft.branchState)) { onStatus("Not saved — server readback differed"); return { status: "failed", current: verified, retained }; }
      clearIfSame(storage, storageKey, draft)
      onStatus("Saved and verified"); return { status: "saved", current: verified, retained };
    } catch (error) { onStatus(retained ? "Not saved — draft kept on this device" : "Not saved — keep this page open"); return { status: "failed", error, retained }; }
  }
  onStatus(retained ? "Conflict — shared data changed; your edits are kept on this device" : "Conflict — keep this page open; device recovery could not be stored");
  return { status: "conflict", retained };
}
export async function saveLeagueRootCAS({ client, rootState, baselineRoot, storage = globalThis.localStorage, storageKey, onStatus = () => {}, attempts = 3 }) {
  const draft = { rootState: clone(rootState), baselineRoot: clone(baselineRoot) };
  const retained = persist(storage, storageKey, draft);
  onStatus(retained ? "Saving — recovery copy kept on this device" : "Saving; this device could not keep a recovery copy");
  for (let attempt = 0; attempt < attempts; attempt++) {
    let current;
    try { current = await read(client); } catch (error) { onStatus(retained ? "Not saved — draft kept on this device" : "Not saved — keep this page open"); return { status: "failed", error, retained }; }
    const merged = clone(current.root);
    const keys = new Set([...Object.keys(draft.baselineRoot || {}), ...Object.keys(draft.rootState || {}), ...Object.keys(current.root || {})]);
    const conflicts = [];
    for (const key of keys) {
      if (key === "__backups") continue;
      const base = stable(draft.baselineRoot?.[key]), local = stable(draft.rootState?.[key]), remote = stable(current.root?.[key]);
      const localChanged = local !== base, remoteChanged = remote !== base;
      if (localChanged && remoteChanged && local !== remote) conflicts.push(key);
      else if (localChanged) { if (Object.hasOwn(draft.rootState || {}, key)) merged[key] = clone(draft.rootState[key]); else delete merged[key]; }
    }
    const backups = new Map();
    for (const item of [...(current.root?.__backups || []), ...(draft.rootState?.__backups || [])]) if (item?.id) backups.set(item.id, item);
    if (backups.size) merged.__backups = [...backups.values()].sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100);
    if (conflicts.length) { onStatus(retained ? `Conflict — shared data changed (${conflicts.join(", ")}); your edits are kept on this device` : "Conflict — shared data changed; keep this page open"); return { status: "conflict", conflicts, current, retained }; }
    try {
      if (!await write(client, merged, current.revision)) continue;
      const verified = await read(client);
      for (const key of keys) if (key !== "__backups" && stable(verified.root?.[key]) !== stable(merged?.[key])) { onStatus("Not saved — server readback differed"); return { status: "failed", current: verified, retained }; }
      clearIfSame(storage, storageKey, draft)
      onStatus("Saved and verified"); return { status: "saved", current: verified, retained };
    } catch (error) { onStatus(retained ? "Not saved — draft kept on this device" : "Not saved — keep this page open"); return { status: "failed", error, retained }; }
  }
  onStatus(retained ? "Conflict — shared data changed; your edits are kept on this device" : "Conflict — keep this page open");
  return { status: "conflict", retained };
}
