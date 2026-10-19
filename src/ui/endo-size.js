// How engorged the endoscopy draws a varix of diameter d mm (grow 0..1, endo-gl.js and endo-render.js).
// Below 5 mm (F1, Small) the drawing follows a straight scale, (d − 2) / 10. From 5 mm (F2, Large, read to a tenth as
// metrics.js grades it) it starts at the engorgement a 7 mm varix had on that scale and rises to full at 12 mm, so a varix
// the slide calls large is drawn plainly large and bulging, not as the thin column a third of the way up the scale.
export const LARGE_MM = 5;
const LARGE_GROW = 0.5;
export function endoGrow(d) {
  if (!(Math.round(+(+d).toFixed(1) * 10) / 10 >= LARGE_MM)) return Math.min(1, Math.max(0, (d - 2) / 10));
  return Math.min(1, LARGE_GROW + (1 - LARGE_GROW) * Math.max(0, d - LARGE_MM) / (12 - LARGE_MM));
}
