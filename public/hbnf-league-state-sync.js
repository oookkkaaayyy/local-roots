(function (global) {
  'use strict';

  const ABSENT = Object.freeze({ __hbnfAbsent: true });
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const canonical = value => {
    if (value === ABSENT) return '"__HBNF_ABSENT__"';
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (isObject(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const equal = (left, right) => canonical(left) === canonical(right);
  const hash = async value => {
    if (!global.crypto || !global.crypto.subtle || !global.TextEncoder) throw new Error('Secure hashing is unavailable; cloud sync is paused.');
    const bytes = new TextEncoder().encode(canonical(value));
    const digest = await global.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const keyHash = (root, key) => hash(has(root, key) ? root[key] : ABSENT);
  function revisionMicros(value) {
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) return null;
    const fraction = String(value).match(/\.(\d+)(?=Z|[+-]\d\d:\d\d$)/i)?.[1] || '';
    const subMillisecondMicros = fraction.slice(3, 6).padEnd(3, '0');
    return BigInt(milliseconds) * 1000n + BigInt(subMillisecondMicros || '0');
  }
  const revisionBefore = (left, right) => {
    const a = revisionMicros(left), b = revisionMicros(right);
    return a === null || b === null || a < b;
  };

  async function snapshot(root, revision) {
    if (!root || !isObject(root) || !revision || revisionMicros(revision) === null) {
      throw new Error('Cloud baseline is missing or invalid; changes were not sent.');
    }
    const keyHashes = {};
    await Promise.all(Object.keys(root).map(async key => { keyHashes[key] = await keyHash(root, key); }));
    return { root: clone(root), revision: String(revision), keyHashes };
  }

  function cacheBaseline(storage, key, baseline) {
    try {
      storage.setItem(key, JSON.stringify({ schemaVersion: 2, revision: baseline.revision, keyHashes: baseline.keyHashes }));
      return true;
    } catch (_) { return false; }
  }

  function loadBaseline(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null');
      if (!value || value.schemaVersion !== 2 || !value.revision || revisionMicros(value.revision) === null || !value.keyHashes || !isObject(value.keyHashes)) return null;
      return { revision: String(value.revision), keyHashes: value.keyHashes };
    } catch (_) { return null; }
  }

  function retainPendingDraft(storage, key, root, baseline, forceKeys) {
    try {
      const value = { schemaVersion: 1, root: clone(root), revision: String(baseline.revision), forceKeys: Array.from(forceKeys || []) };
      const serialized = JSON.stringify(value);
      storage.setItem(key, serialized);
      return storage.getItem(key) === serialized;
    } catch (_) { return false; }
  }

  function loadPendingDraft(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null');
      if (!value || value.schemaVersion !== 1 || !isObject(value.root) || !value.revision || revisionMicros(value.revision) === null) return null;
      return { root: clone(value.root), revision: String(value.revision), forceKeys: Array.isArray(value.forceKeys) ? value.forceKeys.slice() : [] };
    } catch (_) { return null; }
  }

  function clearPendingDraft(storage, key) {
    try { storage.removeItem(key); return storage.getItem(key) === null; }
    catch (_) { return false; }
  }

  async function prepare(client, storage, storageKey, localRoot, localBranch, hasLocalBranch, verifiedRemote) {
    const remote = verifiedRemote || await read(client);
    const cached = loadBaseline(storage, storageKey);
    if (cached) {
      if (revisionBefore(remote.revision, cached.revision)) throw new Error('Cloud returned a stale revision; local edits were retained and sync is paused.');
      const result = await reconcile(cached, localRoot, remote.root);
      if (!result.hasLocalChanges) {
        cacheBaseline(storage, storageKey, remote);
        return { baseline: remote, root: remote.root, pending: false, legacyConflict: false };
      }
      return { baseline: cached, root: result.root, pending: true, legacyConflict: false };
    }
    const localDiffers = hasLocalBranch && (localBranch === '__root__' ? !equal(localRoot, remote.root) : !equal(localRoot[localBranch], remote.root[localBranch]));
    if (localDiffers) return { baseline: Object.assign({}, remote, { blocked: true }), root: localRoot, pending: true, legacyConflict: true };
    cacheBaseline(storage, storageKey, remote);
    return { baseline: remote, root: remote.root, pending: false, legacyConflict: false };
  }

  function conflictError(paths) {
    const error = new Error('Cloud data changed in overlapping fields (' + paths.join(', ') + '). Local edits are retained; review the conflict before retrying.');
    error.name = 'HbnfSyncConflictError';
    error.paths = paths;
    return error;
  }

  async function read(client) {
    if (!client) throw new Error('Cloud connection unavailable; local edits were not sent.');
    const response = await client.from('league_state').select('id,state_json,updated_at').eq('id', 1).single();
    if (response.error) throw new Error('Cloud read failed; local edits were retained and no write was attempted. ' + response.error.message);
    if (!response.data || Number(response.data.id) !== 1) throw new Error('Cloud row is missing; local edits were retained and no write was attempted.');
    return await snapshot(response.data.state_json, response.data.updated_at);
  }

  async function reconcile(baseline, localRoot, remoteRoot, forceKeys) {
    if (!baseline || !baseline.keyHashes || !isObject(localRoot) || !isObject(remoteRoot)) {
      throw new Error('A verified cloud baseline is required before synchronizing.');
    }
    const merged = clone(remoteRoot), conflicts = [], forced = new Set(forceKeys || []), keys = new Set([...Object.keys(baseline.keyHashes), ...Object.keys(localRoot), ...Object.keys(remoteRoot), ...forced]);
    for (const key of keys) {
      const oldHash = baseline.keyHashes[key] || await keyHash({}, key);
      const localHash = await keyHash(localRoot, key), remoteHash = await keyHash(remoteRoot, key);
      if (localHash === oldHash && !forced.has(key)) continue;
      if (remoteHash !== oldHash && remoteHash !== localHash) { conflicts.push(key); continue; }
      if (has(localRoot, key)) merged[key] = clone(localRoot[key]);
      else delete merged[key];
    }
    if (conflicts.length) throw conflictError(conflicts);
    return { root: merged, hasLocalChanges: !equal(merged, remoteRoot) };
  }

  async function save(client, baseline, draftRoot, options) {
    if (!baseline || baseline.blocked || !baseline.keyHashes) throw new Error('Cloud baseline unavailable or requires review; local edits were retained and no write was attempted.');
    const maxAttempts = Math.max(1, Math.min(5, Number(options && options.maxAttempts) || 3));
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const current = await read(client);
      if (revisionBefore(current.revision, baseline.revision)) throw new Error('Cloud returned a stale revision; local edits were retained and no write was attempted.');
      const result = await reconcile(baseline, draftRoot, current.root, options && options.forceKeys);
      if (!result.hasLocalChanges) {
        if (options && typeof options.clearPending === 'function') {
          let cleared = false;
          try { cleared = await options.clearPending(current); } catch (_) {}
          if (!cleared) {
            const error = new Error('Cloud already contains the intended state, but the local recovery marker could not be cleared; changes remain pending until cleanup succeeds.');
            error.name = 'HbnfSyncStorageError';
            throw error;
          }
        }
        return current;
      }
      if (options && typeof options.retainDraft === 'function') {
        let retained = false;
        try { retained = await options.retainDraft(clone(result.root), current); } catch (_) {}
        if (!retained) {
          const error = new Error('Local recovery draft could not be stored; cloud write was not attempted.');
          error.name = 'HbnfSyncStorageError';
          throw error;
        }
      }
      const currentMs = Date.parse(current.revision), currentRevisionMicros = revisionMicros(current.revision), nowMs = Date.now();
      const sentAt = new Date(Math.max(nowMs, currentMs + 1)).toISOString();
      const response = await client.from('league_state')
        .update({ state_json: result.root, updated_at: sentAt })
        .eq('id', 1)
        .eq('updated_at', current.revision)
        .select('id,state_json,updated_at');
      if (response.error) throw new Error('Cloud save failed; local edits were retained. ' + response.error.message);
      if (!Array.isArray(response.data) || response.data.length === 0) continue;
      if (response.data.length !== 1) throw new Error('Cloud acknowledgment was ambiguous; local edits were retained.');
      const ack = response.data[0];
      const ackRevisionMicros = revisionMicros(ack.updated_at);
      if (Number(ack.id) !== 1 || ackRevisionMicros === null || ackRevisionMicros <= currentRevisionMicros || !equal(ack.state_json, result.root)) {
        throw new Error('Cloud acknowledgment did not match the submitted state or advance its revision; local edits were retained.');
      }
      // The UPDATE response is an acknowledgment, not the independent readback
      // that callers require before clearing their recoverable local draft.
      const verified = await read(client);
      if (revisionBefore(verified.revision, ack.updated_at)) {
        throw new Error('Cloud readback returned an older revision; the save remains unverified and the local draft was retained.');
      }
      const allKeys = new Set([
        ...Object.keys(baseline.keyHashes), ...Object.keys(draftRoot),
        ...Object.keys(current.root), ...new Set(options && options.forceKeys || []),
      ]);
      const intendedKeys = [];
      for (const key of allKeys) {
        const oldHash = baseline.keyHashes[key] || await keyHash({}, key);
        const draftHash = await keyHash(draftRoot, key);
        if (draftHash !== oldHash || (options && options.forceKeys || []).includes(key)) {
          intendedKeys.push(key);
        }
      }
      for (const key of intendedKeys) {
        if (!equal(await keyHash(verified.root, key), await keyHash(result.root, key))) {
          const error = conflictError([key]);
          error.message = 'Cloud changed the saved field before independent readback (' + key + '); local edits remain pending for review.';
          throw error;
        }
      }
      if (!equal(verified.root, ack.state_json) && revisionMicros(verified.revision) === revisionMicros(ack.updated_at)) {
        throw new Error('Cloud readback diverged from the acknowledged state at the same revision; local edits were retained.');
      }
      if (options && typeof options.clearPending === 'function') {
        let cleared = false;
        try { cleared = await options.clearPending(verified); } catch (_) {}
        if (!cleared) {
          const error = new Error('Cloud readback matched, but the local recovery marker could not be cleared; changes remain pending until cleanup succeeds.');
          error.name = 'HbnfSyncStorageError';
          throw error;
        }
      }
      return verified;
    }
    throw conflictError(['updated_at']);
  }

  function status(element, kind, detail) {
    if (!element) return;
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    const messages = {
      connecting: 'Checking cloud data…',
      loaded: 'Cloud data loaded; no pending changes.',
      saved: 'Cloud save confirmed.',
      pending: 'Cloud not confirmed — changes remain on this device and will retry.',
      conflict: 'Cloud changed in overlapping fields — local edits are retained for review.',
      unavailable: 'Cloud data could not be verified — no write was attempted.',
      legacy: 'Saved local data has no matching cloud baseline — it is retained and automatic sync is paused for review.',
    };
    element.textContent = detail || messages[kind] || String(kind || '');
  }

  global.HBNFLeagueStateSync = Object.freeze({ clone, equal, hash, read, reconcile, prepare, save, snapshot, cacheBaseline, loadBaseline, retainPendingDraft, loadPendingDraft, clearPendingDraft, status });
})(window);
