// The ligation bands on the esophageal varices (pure, no DOM; visual-style D8). Each band is a ring round the esophagus seen at a slant, laid
// on balloon-eso.js's own centreline and walls (the tamponade balloon's), turned square to the line it sits on, and drawn inside the walls.
// The first sits above the cardia, on the drawn esophagus (it ends at y 251), not below it.
import { esoAt, smoothPath } from './balloon-eso.js';

/** y0: the first (lowest) band's height; dy: the step up between bands; ry: the ring's half depth; edge: how far inside the wall its outer stroke stays. */
export const BAND = { y0: 242, dy: 15, ry: 3, stroke: 2.4, edge: 0.4 };

/** The centreline's lean at height y: dx/dy (the esophagus runs top to bottom, easing right). */
const lean = (y) => (esoAt(y + 1).c - esoAt(y - 1).c) / 2;

/**
 * Band number i (0 the lowest): its centre, half width rx and half depth ry, the centreline's lean there (dx/dy), and the ring as a
 * closed smooth path `d` (the points are in pts). rx is the widest that keeps the whole ring, with its stroke, inside the walls.
 */
export function bandRing(i, n = 14) {
  const { y0, dy, ry, stroke, edge } = BAND, y = y0 - i * dy, { c: cx, h } = esoAt(y);
  const k = lean(y), len = Math.hypot(k, 1), nx = 1 / len, ny = -k / len, tx = k / len, ty = 1 / len;   // the ring's axis across the esophagus, and its depth
  const pts = [], inside = (rx) => {
    pts.length = 0;
    let ok = true;
    for (let j = 0; j < n; j++) {
      const a = (2 * Math.PI * j) / n, px = cx + rx * Math.cos(a) * nx + ry * Math.sin(a) * tx, py = y + rx * Math.cos(a) * ny + ry * Math.sin(a) * ty, e = esoAt(py);
      pts.push([px, py]);
      if (Math.abs(px - e.c) > e.h - stroke / 2 - edge) ok = false;
    }
    return ok;
  };
  let rx = h - stroke / 2 - edge;
  for (let q = 0; q < 24 && !inside(rx); q++) rx -= 0.25;
  inside(rx);
  return { cx, cy: y, rx, ry, lean: k, pts, d: smoothPath(pts, true) };
}
