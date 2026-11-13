// Esophageal varices beaded by their size, as the endoscopy draws them (endo-render.js: beaded once grow, (d − 2) / 10,
// passes 0.5). Each varix strand's radius swells and narrows along its course, r · (1 + b · sin(2π s / λ + φ)), with no
// beading where the strands leave and rejoin the trunk. The amount b rises smoothly about that same size (d 6 to 8 mm),
// up to BEAD_MAX, so a small varix stays a smooth column and a large one is visibly knotted.

export const BEAD_MAX = 0.35, BEAD_LAMBDA = 22;
// The fundal varices (the short gastric feeder C2 and the gastrorenal shunt C5 that drains them) bead too, on a longer period so they
// read as a knot, not a string of the esophageal varices' beads (visual-style V3); each follows its own varix's size (metrics key).
export const BEAD_LAMBDA_FUNDAL = 30;
export const BEAD_SITE = { C1a: 'varix', C2: 'gastricVarix', C5: 'gastricVarix' };
export const beadLambda = (id) => (id === 'C2' || id === 'C5' ? BEAD_LAMBDA_FUNDAL : BEAD_LAMBDA);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The beading amount (0 … BEAD_MAX) for a varix of diameter d (mm). */
export const varixBead = (d) => BEAD_MAX * smooth(0.4, 0.6, ((Number.isFinite(d) ? d : 0) - 2) / 10);

/**
 * The radius at sample u (0–1 along the strand) of a strand of radius r and length len (world units), beaded by b,
 * phase ph; the strand leaves its trunk at u0 and rejoins it at its end, where it stays smooth.
 */
export function beadRadius(r, b, u, len, ph, u0 = 0, lambda = BEAD_LAMBDA) {
  if (b <= 0) return r;
  const v = Math.min(1, Math.max(0, (u - u0) / (1 - u0)));
  return r * (1 + b * Math.sin(Math.PI * v) * Math.sin((2 * Math.PI * u * len) / lambda + ph));
}

// The red wale sign on the figure (visual-style V3): the esophageal strands take the figure's --red-wale colour, a share of the way,
// when the varix's red-wale reading is on. It rises over the wall-stress ratio's first 0.1 above the 0.7 cut-off (no pop as the
// ratio crosses it) and follows the varix's size (varix-look.js varixSize, 0 … 1), so a smaller varix wears less of it.
export const WALE_MAX = 0.5, WALE_CUT = 0.7;
/** The share (0 … WALE_MAX) of the red-wale colour in a strand: on = the reading is on, ratio = the wall-stress ratio, size = the varix's size. */
export function varixWale(on, ratio, size) {
  if (!on || !Number.isFinite(ratio)) return 0;
  const k = smooth(WALE_CUT, WALE_CUT + 0.1, ratio), sz = Number.isFinite(size) ? Math.min(1, Math.max(0, size)) : 1;
  return WALE_MAX * k * (0.4 + 0.6 * sz);
}
