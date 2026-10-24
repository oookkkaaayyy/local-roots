(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HBNFWeekRecovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TABLES = ['hbnf_round_tag_entries', 'hbnf_round_available_tags'];
  const KIND = 'hbnf-week-recovery-v1';
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const stable = value => {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((out, key) => { out[key] = stable(value[key]); return out; }, {});
  };
  const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  const idFor = (date, now) => `${date}-${now().replace(/[^0-9]/g, '')}`;
  const envelopeOf = (root, id) => ((root && Array.isArray(root.__backups)) ? root.__backups : []).find(x => x && x.kind === KIND && x.id === id);
  function withEnvelope(root, envelope) {
    const next = clone(root || {});
    const backups = Array.isArray(next.__backups) ? next.__backups.filter(x => !(x && x.kind === KIND && x.id === envelope.id)) : [];
    backups.unshift(clone(envelope));
    // Never evict unresolved recovery records when applying the ordinary history cap.
    const recovery = backups.filter(x => x && x.kind === KIND && x.status !== 'restored');
    const ordinary = backups.filter(x => !(x && x.kind === KIND));
    next.__backups = [...recovery, ...ordinary.slice(0, Math.max(0, 50 - recovery.length)), ...backups.filter(x => x && x.kind === KIND && x.status === 'restored').slice(0, 50)];
    return next;
  }
  async function readRoot(api) {
    const result = await api.readRoot();
    if (!result || !result.root || !result.revision) throw new Error('Cloud root/revision unavailable');
    return { root: clone(result.root), revision: result.revision };
  }
  async function casRoot(api, before, next) {
    const ack = await api.casRoot(before.revision, next);
    if (!ack || ack.acknowledged !== true) throw new Error('Cloud revision conflict; no later step was attempted');
    const check = await readRoot(api);
    if (!same(check.root, next)) throw new Error('Cloud root readback did not match acknowledged state');
    return check;
  }
  function weekBranch(root) { return clone(root.skins || { weeks: {}, deletedWeeks: {}, restoredWeeks: {} }); }
  function setWeekBranch(root, branch) { const next = clone(root); next.skins = branch; return next; }
  async function readTagSnapshot(api, date) {
    const rows = {};
    for (const table of TABLES) rows[table] = clone(await api.readTagRows(table, date));
    return rows;
  }
  async function persistStatus(api, id, status, detail) {
    const before = await readRoot(api), envelope = envelopeOf(before.root, id);
    if (!envelope) throw new Error('Recovery envelope is missing from cloud');
    const updated = Object.assign({}, envelope, { status, updatedAt: api.now() });
    if (detail) updated.detail = String(detail).slice(0, 300);
    return casRoot(api, before, withEnvelope(before.root, updated));
  }
  async function removeCapturedRows(api, date, rows) {
    for (const table of TABLES) {
      for (const captured of rows[table]) {
        const current = await api.readTagRow(table, captured);
        if (!current) continue; // idempotent retry after a successful prior delete
        if (!same(current, captured)) throw new Error(`Tag revision conflict in ${table}; newer row retained`);
        const result = await api.deleteTagRow(table, captured);
        if (!result || result.acknowledged !== true) throw new Error(`Conditional delete was not acknowledged in ${table}`);
        const after = await api.readTagRow(table, captured);
        if (after) throw new Error(`Deleted tag row remains in provider readback: ${table}`);
      }
      const remaining = await api.readTagRows(table, date);
      if (remaining.length) throw new Error(`Unexpected tag rows remain for ${date} in ${table}`);
    }
  }
  async function deleteWeek(api, date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid week date');
    let before = await readRoot(api), branch = weekBranch(before.root), week = branch.weeks && branch.weeks[date];
    if (!week) throw new Error('Selected cloud week is missing');
    if (week.finalized) throw new Error('Finalized weeks cannot be deleted');
    if ((branch.deletedWeeks && branch.deletedWeeks[date]) > (branch.restoredWeeks && branch.restoredWeeks[date])) throw new Error('Week is already deleted');
    const rows = await readTagSnapshot(api, date), marker = api.now(), id = idFor(date, () => marker);
    const envelope = { kind: KIND, version: 1, id, date, status: 'prepared', createdAt: marker, updatedAt: marker, deleteMarker: marker, week: clone(week), rows };
    before = await casRoot(api, before, withEnvelope(before.root, envelope)); // durable snapshot ACK + independent readback precede mutation

    branch = weekBranch(before.root);
    if (!same(branch.weeks && branch.weeks[date], week)) throw new Error('Week changed after recovery snapshot; deletion stopped');
    branch.deletedWeeks = Object.assign({}, branch.deletedWeeks || {}, { [date]: marker });
    delete branch.weeks[date];
    before = await casRoot(api, before, setWeekBranch(before.root, branch));
    await persistStatus(api, id, 'deleting');
    try {
      await removeCapturedRows(api, date, rows);
      await persistStatus(api, id, 'deleted');
    } catch (error) {
      try { await persistStatus(api, id, 'recovery-required', error.message); } catch (_) { /* the prepared envelope remains durable */ }
      throw error;
    }
    return { id, status: 'deleted', date };
  }
  async function restoreWeek(api, id) {
    let before = await readRoot(api), envelope = envelopeOf(before.root, id);
    if (!envelope || envelope.kind !== KIND) throw new Error('Recovery record not found');
    if (envelope.status === 'restored') return { id, date: envelope.date, status: 'restored', idempotent: true };
    const branch = weekBranch(before.root), date = envelope.date;
    if ((branch.deletedWeeks && branch.deletedWeeks[date]) !== envelope.deleteMarker) throw new Error('Deletion marker changed; restore refused');
    if (branch.weeks && branch.weeks[date]) throw new Error('A newer week already exists; restore refused');
    await persistStatus(api, id, 'restoring');
    try {
      for (const table of TABLES) {
        const currentRows = await api.readTagRows(table, date);
        for (const captured of envelope.rows[table]) {
          const existing = await api.readTagRow(table, captured);
          if (existing) {
            if (!same(existing, captured)) throw new Error(`Tag row conflict in ${table}; newer data will not be overwritten`);
          } else {
            const ack = await api.insertTagRow(table, captured);
            if (!ack || ack.acknowledged !== true) throw new Error(`Restore insert was not acknowledged in ${table}`);
          }
        }
        const verified = await api.readTagRows(table, date);
        if (!same(verified, envelope.rows[table])) throw new Error(`Tag restore readback mismatch in ${table}`);
        // currentRows is deliberately read before inserts to establish the pre-write conflict baseline.
        void currentRows;
      }
      before = await readRoot(api); envelope = envelopeOf(before.root, id);
      const nextBranch = weekBranch(before.root);
      if ((nextBranch.deletedWeeks && nextBranch.deletedWeeks[date]) !== envelope.deleteMarker || nextBranch.weeks[date]) throw new Error('Week changed during restore; scorecard write refused');
      nextBranch.weeks = Object.assign({}, nextBranch.weeks || {}, { [date]: clone(envelope.week) });
      nextBranch.restoredWeeks = Object.assign({}, nextBranch.restoredWeeks || {}, { [date]: api.now() });
      before = await casRoot(api, before, setWeekBranch(before.root, nextBranch));
      await persistStatus(api, id, 'restored');
      return { id, date, status: 'restored' };
    } catch (error) {
      try { await persistStatus(api, id, 'recovery-required', error.message); } catch (_) { /* keep last acknowledged envelope */ }
      throw error;
    }
  }
  return { KIND, TABLES, same, deleteWeek, restoreWeek, envelopeOf };
});
