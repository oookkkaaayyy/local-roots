// Calibration cut-sheet: a stencil frame with one rectangular cut per (dye, step) cell.
// Each cell id is the region_label used by du_record_calibration, so photos map to samples.
export function cutSheet({ dyes, steps, cellMm = 20, gapMm = 6, marginMm = 10, labelMm = 4 } = {}) {
  if (!Array.isArray(dyes) || !dyes.length || !Array.isArray(steps) || !steps.length) throw new Error('dyes and steps required');
  const w = marginMm * 2 + steps.length * cellMm + (steps.length - 1) * gapMm;
  const h = marginMm * 2 + dyes.length * (cellMm + labelMm) + (dyes.length - 1) * gapMm;
  const cells = []; let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="none" stroke="#000" stroke-width="0.2"/>`;
  dyes.forEach((dye, r) => steps.forEach((step, c) => {
    const x = marginMm + c * (cellMm + gapMm), y = marginMm + r * (cellMm + labelMm + gapMm);
    const id = `${String(dye).replace(/\W+/g, '_')}__${String(step).replace(/\W+/g, '_')}`;
    cells.push({ id, dye, step, x, y, w: cellMm, h: cellMm });
    svg += `<rect x="${x}" y="${y}" width="${cellMm}" height="${cellMm}" fill="none" stroke="#f00" stroke-width="0.1"/><text x="${x}" y="${y + cellMm + labelMm - 1}" font-size="3" fill="#000">${id}</text>`;
  }));
  return { svg: svg + '</svg>', cells, widthMm: w, heightMm: h };
}
