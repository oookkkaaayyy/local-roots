const PENDING_KEY = 'hbnf-glow-unsent-draft-v1';
const clone = value => JSON.parse(JSON.stringify(value));
const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
};
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));

export function createGlowSaveCoordinator({storage, onStatus = () => {}, now = () => new Date().toISOString()}) {
  let pending = null;
  let saving = false;
  let generation = 0;
  try {
    const parsed = JSON.parse(storage.getItem(PENDING_KEY) || 'null');
    if (parsed?.schema === 1 && parsed.branch === 'glow' && parsed.branchState && typeof parsed.branchState === 'object') {
      pending = parsed;
      generation = Number(parsed.generation) || 1;
    }
  } catch {}

  function status(value, details = {}) {
    onStatus(value, details);
  }

  function persist(next) {
    try {
      storage.setItem(PENDING_KEY, JSON.stringify(next));
      pending = next;
      return true;
    } catch {
      status('local-failure');
      return false;
    }
  }

  function queue(branchState, baseUpdatedAt, baseBranchState = null) {
    const next = {
      schema: 1,
      branch: 'glow',
      generation: ++generation,
      baseUpdatedAt: pending ? pending.baseUpdatedAt : (baseUpdatedAt || null),
      baseBranchState: pending ? pending.baseBranchState : (baseBranchState ? clone(baseBranchState) : null),
      queuedAt: pending?.queuedAt || now(),
      branchState: clone(branchState),
    };
    if (!persist(next)) throw new Error('The unsent score draft could not be saved on this device.');
    status('pending');
    return next;
  }

  function clear() {
    try { storage.removeItem(PENDING_KEY); }
    catch { status('local-failure'); return false; }
    pending = null;
    status('saved');
    return true;
  }

  async function flush({readCurrent, compareAndSwap}) {
    if (!pending) return {status: 'saved'};
    if (saving) return {status: 'pending'};
    saving = true;
    const submitted = pending;
    status('pending');
    try {
      let current = await readCurrent();
      if (!current || !current.root || !current.updatedAt) throw new Error('The shared score row could not be read.');
      if (same(current.root.glow, submitted.branchState)) {
        if (pending?.generation === submitted.generation) clear();
        return {status: 'saved', current};
      }
      if (!submitted.baseUpdatedAt || current.updatedAt !== submitted.baseUpdatedAt) {
        if (submitted.baseBranchState && same(current.root.glow, submitted.baseBranchState)) {
          submitted.baseUpdatedAt = current.updatedAt;
          submitted.baseBranchState = clone(current.root.glow);
          if (pending?.generation === submitted.generation) persist(submitted);
        } else {
          status('conflict');
          return {status: 'conflict', current};
        }
      }

      const nextRoot = {...clone(current.root), glow: clone(submitted.branchState)};
      const write = await compareAndSwap(current.updatedAt, nextRoot);
      const returnedRows = Array.isArray(write?.rows) ? write.rows : (write?.row ? [write.row] : []);
      if (!write || write.error || returnedRows.length !== 1) {
        current = await readCurrent();
        if (current?.root && same(current.root.glow, submitted.branchState)) {
          if (pending?.generation === submitted.generation) clear();
          return {status: 'saved', current};
        }
        if (current?.root && submitted.baseBranchState && same(current.root.glow, submitted.baseBranchState)) {
          submitted.baseUpdatedAt = current.updatedAt;
          submitted.baseBranchState = clone(current.root.glow);
          if (pending?.generation === submitted.generation) persist(submitted);
          const retry = await compareAndSwap(current.updatedAt, {...clone(current.root),glow:clone(submitted.branchState)});
          const retryRows = Array.isArray(retry?.rows) ? retry.rows : (retry?.row ? [retry.row] : []);
          if (!retry || retry.error || retryRows.length !== 1) { status('conflict'); return {status:'conflict',current:await readCurrent()}; }
        } else {
          status('conflict');
          return {status: 'conflict', current};
        }
      }

      // UPDATE RETURNING is necessary but not sufficient: independently GET the
      // row again before telling the scorekeeper the save is complete.
      current = await readCurrent();
      if (!current?.root || !same(current.root.glow, submitted.branchState)) {
        status('conflict');
        return {status: 'conflict', current};
      }
      if (pending?.generation === submitted.generation) {
        clear();
        return {status: 'saved', current};
      }
      // More edits arrived while the write was in flight. Keep them as a new
      // draft based on the acknowledged revision and let the caller flush again.
      pending = {...pending, baseUpdatedAt: current.updatedAt, baseBranchState: clone(submitted.branchState)};
      if (!persist(pending)) return {status: 'local-failure', current};
      status('pending');
      return {status: 'pending', current};
    } catch {
      status('failed');
      return {status: 'failed'};
    } finally {
      saving = false;
    }
  }

  return {
    queue,
    flush,
    clear,
    markConflict() { status('conflict'); },
    setBaseRevision(updatedAt) {
      if (!pending) return false;
      pending = {...pending, baseUpdatedAt: updatedAt || null};
      return persist(pending);
    },
    get pending() { return pending ? clone(pending) : null; },
    get hasPending() { return !!pending; },
    get key() { return PENDING_KEY; },
  };
}

export const glowSaveStatusText = status => ({
  local: 'Local only',
  pending: 'Saving…',
  failed: 'Save failed — changes kept on this device',
  conflict: 'Conflict — your edits are kept on this device',
  'local-failure': 'Could not save this draft on this device',
  saved: 'Saved',
})[status] || 'Save status unknown';
