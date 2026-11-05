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

  // Acknowledging one generation does not acknowledge edits queued during its request.
  function settleAcknowledged(submitted, current) {
    if (pending?.generation === submitted.generation) {
      if (!clear()) return {status: 'local-failure', current};
      return {status: 'saved', current};
    }
    if (pending) {
      const newer = {...pending, baseUpdatedAt: current.updatedAt, baseBranchState: clone(submitted.branchState)};
      if (!persist(newer)) return {status: 'local-failure', current};
      status('pending');
      return {status: 'pending', current};
    }
    return {status: 'saved', current}; // Explicit user clear while a save was in flight.
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
        return settleAcknowledged(submitted, current);
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
          return settleAcknowledged(submitted, current);
        }
        // A zero-row/error acknowledgement can be ambiguous even when the next
        // GET still shows the baseline. Never issue a second CAS inside this
        // same flush. Keep the on-device draft; a later flush must perform its
        // own fresh server preflight and conditional write.
        status('conflict');
        return {status: 'conflict', current};
      }

      // UPDATE RETURNING is necessary but not sufficient: independently GET the
      // row again before telling the scorekeeper the save is complete.
      current = await readCurrent();
      if (!current?.root || !same(current.root.glow, submitted.branchState)) {
        status('conflict');
        return {status: 'conflict', current};
      }
      return settleAcknowledged(submitted, current);
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
