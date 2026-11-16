// Which vessel a tap on the Lobule picks, when several lie under it (16 Nov 2026: with Wet Disse the space of Disse is a sleeve that wraps its
// sinusoid, and a tap on the sinusoid picked the lymph, Mohammad). The rule is the picture's: a point inside a vessel as drawn belongs to the one
// drawn on top there (its depth, Z_OF in lobule-zoom-field.js), so a sinusoid wins inside its own lumen and the sleeve only in its band outside
// the wall; a point inside none goes to the nearest edge. Lower ranks win. Nothing is made: the pointer's hover asks on every move.

/** The rank of a vessel for a point at distance `d` from its axis, where it is drawn `r` wide (radius, at the nearest point) at depth `z`;
 *  `bias` (world units) favours a fine vessel at its edge. Inside every vessel ranks below every edge, the topmost lowest. */
export function pickRank(d, r, z, bias = 0) {
  return d <= r ? -1e6 - z : d - r - bias;
}
