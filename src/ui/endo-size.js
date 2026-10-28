// How engorged the endoscopy draws a varix of diameter d mm (grow 0..1, endo-gl.js and endo-render.js).
// Below 5 mm (Small) the drawing follows a straight scale, (d − 2) / 10. From 5 mm (Large, read to a tenth as
// metrics.js grades it) it starts at the engorgement a 7 mm varix had on that scale and rises to full at 12 mm, so a varix
// the slide calls large is drawn plainly large and bulging, not as the thin column a third of the way up the scale.
export const LARGE_MM = 5;
const LARGE_GROW = 0.5;
export function endoGrow(d) {
  if (!(Math.round(+(+d).toFixed(1) * 10) / 10 >= LARGE_MM)) return Math.min(1, Math.max(0, (d - 2) / 10));
  return Math.min(1, LARGE_GROW + (1 - LARGE_GROW) * Math.max(0, d - LARGE_MM) / (12 - LARGE_MM));
}

/** The share of its resting diameter a varix is seen at with `air` mmHg of air in the lumen round it: the model's table
 *  (metrics.varix.air, one diameter for each mmHg from none), read between its steps. 1 with no air or no table. */
export function airRatio(table, air) {
  if (!Array.isArray(table) || !(table[0] > 0) || !(air > 0)) return 1;
  const x = Math.min(air, table.length - 1), k = Math.floor(x);
  return (table[k] + ((table[k + 1] ?? table[k]) - table[k]) * (x - k)) / table[0];
}
/** How much of its engorgement (endoGrow) the scope draws a varix of resting diameter d at that share of it: all of it with no air,
 *  none once it has flattened to the resting vein (2 mm), in between on the same straight scale as a small varix, so the drawing
 *  flattens smoothly while the grade, read at rest, stays what it was. */
export function airFlat(d, ratio) {
  return ratio >= 1 || !(d > 2) ? 1 : Math.min(1, Math.max(0, (d * ratio - 2) / (d - 2)));
}
