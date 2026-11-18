// Stencil island bridging. Mask: 1 = stencil material (blocks dye), 0 = cut (dye reaches plastic).
// Islands are material components not connected to the main body. Each island is joined by a bridge
// of material across the shortest cut path. Pure function, no I/O.
export function label(mask, w, h) {
  const id = new Int32Array(w * h).fill(-1); const comps = [];
  for (let s = 0; s < w * h; s++) {
    if (mask[s] !== 1 || id[s] !== -1) continue;
    const c = comps.length, q = [s]; id[s] = c; let n = 0, border = false;
    for (let i = 0; i < q.length; i++) {
      const p = q[i]; n++; const x = p % w, y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx; if (mask[np] === 1 && id[np] === -1) { id[np] = c; q.push(np); }
      }
    }
    comps.push({ size: n, border });
  }
  return { id, comps };
}
export function bridge(mask, w, h, opts = {}) {
  const maxChange = opts.maxChangeFraction ?? 0.05;
  const out = Uint8Array.from(mask); const { comps } = label(out, w, h);
  if (!comps.length) return { mask: out, islands: 0, bridges: 0, changed: 0, pass: true };
  let main = comps.findIndex(c => c.border); if (main < 0) main = comps.reduce((b, c, i, a) => c.size > a[b].size ? i : b, 0);
  const islands = comps.map((c, i) => i).filter(i => i !== main).sort((a, b) => comps[b].size - comps[a].size);
  let changed = 0, bridges = 0;
  for (const isl of islands) {
    const prev = new Int32Array(w * h).fill(-2), q = [];
    const cur = label(out, w, h); const mainId = cur.comps.findIndex(c => c.border) >= 0 ? cur.comps.findIndex(c => c.border) : 0;
    // island pixel set by original id mapping: pick pixels whose component differs from main
    for (let p = 0; p < w * h; p++) if (out[p] === 1 && cur.id[p] !== mainId && cur.comps[cur.id[p]].size === comps[isl].size) { prev[p] = -1; q.push(p); }
    let hit = -1;
    for (let i = 0; i < q.length && hit < 0; i++) {
      const p = q[i], x = p % w, y = (p - x) / w;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx; if (prev[np] !== -2) continue;
        if (out[np] === 1 && cur.id[np] === mainId) { prev[np] = p; hit = np; break; }
        if (out[np] === 0) { prev[np] = p; q.push(np); }
      }
    }
    if (hit < 0) continue; bridges++;
    for (let p = prev[hit]; p >= 0; p = prev[p]) if (out[p] === 0) { out[p] = 1; changed++; }
  }
  const frac = changed / (w * h);
  return { mask: out, islands: islands.length, bridges, changed, changedFraction: frac, pass: frac <= maxChange && label(out, w, h).comps.filter(c => !c.border).length === 0 };
}
