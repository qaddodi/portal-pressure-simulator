// Which vessel a tap on the Lobule picks, when several lie under it (16 Nov 2026: with Wet Disse the space of Disse is a sleeve that wraps its
// sinusoid, and a tap on the sinusoid picked the lymph, Mohammad). The rule is the picture's: a point inside a vessel as drawn belongs to the one
// drawn on top there (its depth, Z_OF in lobule-zoom-field.js), so a sinusoid wins inside its own lumen and the sleeve only in its band outside
// the wall; a point inside none goes to the nearest edge. Lower ranks win. Nothing is made: the pointer's hover asks on every move.

/**
 * The tier a lobule vessel is drawn in (tube texel 2, x). Tiers are drawn back to front, each with its own casings, so a vessel in a higher tier
 * keeps its outline over one in a lower tier, while vessels of one tier join with no line across the join (16 Nov 2026, Mohammad: the black
 * wall line between each sinusoid and its sleeve of Disse, open where sinusoids join). The lymph lies in tier 1, under the blood: the sleeves of
 * Disse, the terminal lymphatics they drain into and the tract's lymphatic, one network that joins with no line; every blood vessel in tier 2, so
 * its wall is drawn wherever it lies over lymph.
 */
export const LYMPH_KINDS = new Set(['ly', 'lt', 'lv']);
// The bile (Mohammad, 16 Nov 2026: "below everything else") lies in its own tier under the lymph, so the lymphatics it passes under keep their
// outline over it; the blood is then tier 2.
export const BILE_KINDS = new Set(['bs', 'bh']);
export const tierOf = (kind) => (BILE_KINDS.has(kind) ? 0 : LYMPH_KINDS.has(kind) ? 1 : 2);

/** The rank of a vessel for a point at distance `d` from its axis, where it is drawn `r` wide (radius, at the nearest point) at depth `z`;
 *  in `tier` (tierOf); `bias` (world units) favours a fine vessel at its edge. Inside every vessel ranks below every edge, the topmost (tier, then
 *  depth; z stays under 1) lowest. */
export function pickRank(d, r, z, bias = 0, tier = 1) {
  return d <= r ? -1e6 - tier - z : d - r - bias;
}
