// Esophageal varices beaded by their size, as the endoscopy draws them (endo-render.js: beaded once grow, (d − 2) / 10,
// passes 0.5). Each varix strand's radius swells and narrows along its course, r · (1 + b · sin(2π s / λ + φ)), with no
// beading where the strands leave and rejoin the trunk. The amount b rises smoothly about that same size (d 6 to 8 mm),
// up to BEAD_MAX, so a small varix stays a smooth column and a large one is visibly knotted.

export const BEAD_MAX = 0.35, BEAD_LAMBDA = 22;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The beading amount (0 … BEAD_MAX) for a varix of diameter d (mm). */
export const varixBead = (d) => BEAD_MAX * smooth(0.4, 0.6, ((Number.isFinite(d) ? d : 0) - 2) / 10);

/**
 * The radius at sample u (0–1 along the strand) of a strand of radius r and length len (world units), beaded by b,
 * phase ph; the strand leaves its trunk at u0 and rejoins it at its end, where it stays smooth.
 */
export function beadRadius(r, b, u, len, ph, u0 = 0) {
  if (b <= 0) return r;
  const v = Math.min(1, Math.max(0, (u - u0) / (1 - u0)));
  return r * (1 + b * Math.sin(Math.PI * v) * Math.sin((2 * Math.PI * u * len) / BEAD_LAMBDA + ph));
}
