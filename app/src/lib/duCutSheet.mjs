// Cut-sheet calibration for D&U stencils. buildCutSheet() makes a true-size SVG test sheet
// (black = cut away and weeded, white = retained vinyl, same convention as the stencils) with graded
// islands, necks, slits and tapers. deriveRules() turns the owner's pass/fail results into compiler limits.
export const CUT_SHEET = Object.freeze({
  widthMm: 190.5,
  islandDiametersMm: [1.0, 1.5, 2.0, 2.5, 3.0, 4.0],
  neckWidthsMm: [0.4, 0.6, 0.8, 1.0, 1.2, 1.6],
  slitWidthsMm: [0.3, 0.4, 0.6, 0.8, 1.0, 1.5],
  taperAnglesDeg: [15, 30, 45, 60, 90],
});

const f = (n) => (+n).toFixed(3);
const circle = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
const poly = (pts) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';

export function buildCutSheet() {
  const S = CUT_SHEET, pitch = 28, rowPitch = 30, left = 6, top = 6, paths = [], legend = [];
  const rows = [
    ['islands', S.islandDiametersMm, (d, x, y) => { const r = d / 2; paths.push(circle(x + 10, y + 10, r + 1.5) + circle(x + 10, y + 10, r)); }],
    ['necks', S.neckWidthsMm, (t, x, y) => { const c = y + 10, x0 = x + 2; paths.push(poly([[x0, y], [x0 + 9.5, y], [x0 + 9.5, y + 20], [x0, y + 20], [x0, c + t / 2], [x0 + 3, c + t / 2], [x0 + 3, c + 2.5], [x0 + 8, c + 2.5], [x0 + 8, c - 2.5], [x0 + 3, c - 2.5], [x0 + 3, c - t / 2], [x0, c - t / 2]])); }],
    ['slits', S.slitWidthsMm, (w, x, y) => { paths.push(poly([[x + 10 - w / 2, y + 2], [x + 10 + w / 2, y + 2], [x + 10 + w / 2, y + 18], [x + 10 - w / 2, y + 18]])); }],
    ['tapers', S.taperAnglesDeg, (a, x, y) => { const L = 8, hw = L * Math.tan((a * Math.PI) / 360), c = y + 10; paths.push(poly([[x, y], [x + 18, y], [x + 18, y + 20], [x, y + 20], [x, c + hw], [x + L, c], [x, c - hw]])); }],
  ];
  rows.forEach(([name, values, draw], r) => values.forEach((v, i) => { const x = left + i * pitch, y = top + r * rowPitch; draw(v, x, y); legend.push({ row: name, position: i + 1, rowNumber: r + 1, value: v }); }));
  const height = top + rows.length * rowPitch;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${S.widthMm}mm" height="${height}mm" viewBox="0 0 ${S.widthMm} ${height}"><path fill="#000" fill-rule="evenodd" d="${paths.join('')}"/></svg>`, legend, widthMm: S.widthMm, heightMm: height };
}

// results: { islands:[{value,ok}], necks:[...], slits:[...], tapers:[...] }; ok = survived cutting, weeding and application.
export function deriveRules(results, margin = 1.2) {
  const smallestOk = (list) => {
    const sorted = [...(list || [])].sort((a, b) => a.value - b.value);
    for (let i = 0; i < sorted.length; i++) if (sorted.slice(i).every((x) => x.ok)) return sorted[i].value;
    return null;
  };
  const up = (v) => (v == null ? null : Math.round(v * margin * 10) / 10);
  const out = {}, island = up(smallestOk(results.islands)), neck = up(smallestOk(results.necks)), slit = up(smallestOk(results.slits));
  if (island != null) { out.islandMinDiameterMm = island; out.islandMinBboxMm = island; }
  if (neck != null) { out.whiteMinWidthMm = neck; out.whiteTargetWidthMm = Math.round((neck + 0.1) * 10) / 10; }
  if (slit != null) out.blackMinWidthMm = slit;
  const angle = smallestOk(results.tapers); if (angle != null) out.taperMinAngleDeg = angle;
  return out;
}
