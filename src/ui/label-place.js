// The placement rules every label layer shares (Mohammad, 3 Nov 2026: "Same engine for labels everywhere"): the boxes a label may not
// overlap, may not leave, and the lines that may not cross it. Boxes are { x0, y0, x1, y1 } in the layer's px. Circuit's and Anatomy's layout
// (stage.js layoutLabels) and the lobule's and sinusoid's (lobule-zoom.js) ask these, so one rule decides a clash on every figure.

/** Whether two boxes overlap. */
export const hits = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
/** Whether the segment (x0, y0) → (x1, y1) passes through the box (clipped against it, Liang–Barsky). */
export const crosses = (x0, y0, x1, y1, b) => {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (let n = 0; n < 4; n++) {
    const p = n === 0 ? -dx : n === 1 ? dx : n === 2 ? -dy : dy, q = n === 0 ? x0 - b.x0 : n === 1 ? b.x1 - x0 : n === 2 ? y0 - b.y0 : b.y1 - y0;
    if (!p) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
};
/** Whether box r lies wholly inside box B (the visible area). */
export const within = (r, B) => r.x0 >= B.x0 && r.y0 >= B.y0 && r.x1 <= B.x1 && r.y1 <= B.y1;
/** The area where two boxes overlap (0 for none). */
export const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
/** The same, for a box kept as { l, r, t, b } (the lobule's own). */
export const overlapLRTB = (p, q) => Math.max(0, Math.min(p.r, q.r) - Math.max(p.l, q.l)) * Math.max(0, Math.min(p.b, q.b) - Math.max(p.t, q.t));
/** How far a disc { x, y, r } reaches into a { l, r, t, b } box (0 for none). */
export const discInto = (q, b) => Math.max(0, q.r - Math.hypot(Math.max(b.l - q.x, 0, q.x - b.r), Math.max(b.t - q.y, 0, q.y - b.b)));
