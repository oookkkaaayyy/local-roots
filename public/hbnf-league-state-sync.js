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

  async function snapshot(root, revision) {
    if (!root || !isObject(root) || !revision || !Number.isFinite(Date.parse(revision))) {
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
      if (!value || value.schemaVersion !== 2 || !value.revision || !Number.isFinite(Date.parse(value.revision)) || !value.keyHashes || !isObject(value.keyHashes)) return null;
      return { revision: String(value.revision), keyHashes: value.keyHashes };
    } catch (_) { return null; }
  }

  async function prepare(client, storage, storageKey, localRoot, localBranch, hasLocalBranch, verifiedRemote) {
    const remote = verifiedRemote || await read(client);
    const cached = loadBaseline(storage, storageKey);
    if (cached) {
      if (Date.parse(remote.revision) < Date.parse(cached.revision)) throw new Error('Cloud returned a stale revision; local edits were retained and sync is paused.');
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
    const error = new Error('Cloud data changed in overlapping fields. Local edits are retained; review the conflict before retrying.');
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
      if (Date.parse(current.revision) < Date.parse(baseline.revision)) throw new Error('Cloud returned a stale revision; local edits were retained and no write was attempted.');
      const result = await reconcile(baseline, draftRoot, current.root, options && options.forceKeys);
      if (!result.hasLocalChanges) return current;
      const currentMs = Date.parse(current.revision), nowMs = Date.now();
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
      if (Number(ack.id) !== 1 || ack.updated_at !== sentAt || !equal(ack.state_json, result.root)) {
        throw new Error('Cloud acknowledgment did not match the submitted state; local edits were retained.');
      }
      return await snapshot(ack.state_json, ack.updated_at);
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

  global.HBNFLeagueStateSync = Object.freeze({ clone, equal, hash, read, reconcile, prepare, save, snapshot, cacheBaseline, loadBaseline, status });
})(window);
