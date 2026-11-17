// Pure data and rules for stencil workflow risk. Not wired to the UI. Labels only.
// Evidence basis (public community reports, uncalibrated, not physical measurements):
//  - r/discdyeing wiki dye ratings 1-5 by plastic (reddit wiki by u/cleverquestion, 2023).
//  - dgcoursereview.com threads: acetone can attack contact-paper adhesive and cause bleed;
//    heat loosens contact paper edges; vinyl preferred over cheap contact paper;
//    cheap or very sticky vinyl is unreliable; bubbles and torn leftovers are bleed points.
//  - Maker stencil sellers: smooth cut edges, remove air bubbles, keep overhang past dye area.

export const PLASTIC_UPTAKE_RATING = Object.freeze({
  'Innova DX': 2,
  'Innova Star': 5,
  'Innova GStar': 5,
  'Innova EchoStar': 4,
  'Innova Pro': 4,
  'Innova Champion': 5,
  'Dynamic Discs Prime': 2,
  'Dynamic Discs Fuzion': 5
});

export const STENCIL_MATERIALS = Object.freeze(['contact-paper', 'vinyl-removable', 'vinyl-permanent', 'wax-resist']);
export const MEDIA = Object.freeze(['acetone', 'water-hot', 'lotion', 'shaving-cream', 'glue-bed', 'floetrol']);

const BASE_RISK = {
  'contact-paper': 2,
  'vinyl-removable': 1,
  'vinyl-permanent': 2,
  'wax-resist': 1
};

export function plasticUptake(name) {
  const v = PLASTIC_UPTAKE_RATING[name];
  return typeof v === 'number' ? v : null;
}

// Returns {score, level, factors}. Score is an ordinal screening value, not a probability.
export function stencilBleedRisk({ medium, stencil, hotBath = false, edgesSmoothed = true, bubblesRemoved = true, leftoversRemoved = true, cheapAdhesive = false } = {}) {
  if (!MEDIA.includes(medium)) throw new Error('Unknown medium');
  if (!STENCIL_MATERIALS.includes(stencil)) throw new Error('Unknown stencil');
  let score = BASE_RISK[stencil];
  const factors = [];
  if (medium === 'acetone' && stencil === 'contact-paper') { score += 3; factors.push('acetone-adhesive'); }
  else if (medium === 'acetone' && stencil !== 'wax-resist') { score += 1; factors.push('acetone-solvent'); }
  if (hotBath && stencil !== 'wax-resist') { score += 2; factors.push('heat-edge-lift'); }
  if (!edgesSmoothed) { score += 2; factors.push('edge-unsealed'); }
  if (!bubblesRemoved) { score += 2; factors.push('air-bubbles'); }
  if (!leftoversRemoved) { score += 1; factors.push('vinyl-remnant'); }
  if (cheapAdhesive) { score += 2; factors.push('weak-adhesive'); }
  const level = score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';
  return { score, level, factors };
}

// Soak-time multiplier for translucent premium plastics; community reports about twice the opaque time.
export function soakHours(baseHours, { translucent = false } = {}) {
  if (!(baseHours > 0)) throw new Error('baseHours must be positive');
  return translucent ? baseHours * 2 : baseHours;
}
