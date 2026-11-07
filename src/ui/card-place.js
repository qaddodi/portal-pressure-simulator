// Where the action card goes beside the structure it belongs to. Pure geometry, so it can be tested on its own.
// A vessel's card never lies over the vessel: every spot that clears the whole drawn vessel (its width included)
// beats every spot that covers any of it. An organ is too big for that rule; its card only covers as little as it can.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// The vessel's path with no gap between samples wider than `step` px, so a card cannot sit between two samples.
export function densify(path, step = 4) {
  if (!path || path.length < 2) return path || [];
  const out = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1], [x1, y1] = path[i];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step);
    for (let j = 1; j <= n; j++) out.push([x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n]);
  }
  return out;
}

// Every sample of a vessel's drawn lines (its tube, and a braided bed's strands), each line densified on its own.
// The samples are one kept list ({ xs, ys, length }, the x and the y of each in its own array), rewritten by each call: card.js reads it
// at once, in coverCount, and placeCard makes its own and uses it before it returns. The arrays only grow, by writing past their end.
const SAMPLES = { xs: [], ys: [], length: 0 };
const ONE = [[0, 0]];
const addSample = (x, y) => { SAMPLES.xs[SAMPLES.length] = x; SAMPLES.ys[SAMPLES.length] = y; SAMPLES.length++; };
// densify's samples for one line, appended (the same numbers as densify gives).
const addLine = (path, step) => {
  if (!path || path.length < 1) return;
  if (path.length < 2) { addSample(path[0][0], path[0][1]); return; }
  addSample(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) {
    const x0 = path[i - 1][0], y0 = path[i - 1][1], x1 = path[i][0], y1 = path[i][1];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step);
    for (let j = 1; j <= n; j++) addSample(x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n);
  }
};
export function vesselPoints(a) {
  SAMPLES.length = 0;
  if (a.lines) { for (let i = 0; i < a.lines.length; i++) addLine(a.lines[i], 4); }
  else if (a.path) addLine(a.path, 4);
  else addSample(a.x, a.y);
  return SAMPLES;
}

// How many path samples lie under a w × hh card at (x, y), with `m` px of clearance. pts: a list of [x, y], or what vesselPoints returns.
export function coverCount(pts, x, y, w, hh, m) {
  let n = 0;
  if (pts.xs) {
    const xs = pts.xs, ys = pts.ys;
    for (let i = 0; i < pts.length; i++) if (xs[i] > x - m && xs[i] < x + w + m && ys[i] > y - m && ys[i] < y + hh + m) n++;
    return n;
  }
  for (let i = 0; i < pts.length; i++) { const px = pts[i][0], py = pts[i][1]; if (px > x - m && px < x + w + m && py > y - m && py < y + hh + m) n++; }
  return n;
}

// The candidate spots, as x, y pairs in one kept list (at most 6 + 2 + 8 + 99 of them), and the card's answer as one kept object that
// placeCard rewrites on each call (its caller reads x, y and cover at once).
const CAND_MAX = 120;
const CAND = new Float64Array(CAND_MAX * 2);
let candN = 0;
const cand = (x, y) => { CAND[candN * 2] = x; CAND[candN * 2 + 1] = y; candN++; };
const PLACED = { x: 0, y: 0, cover: 0 };

/**
 * a: { x, y, path, r? } in view pixels (r: the vessel's drawn half-width; present only for a vessel).
 * box: { top, bottom, right } the free part of the view (left edge is 8).
 * fig: the drawn figure's rectangle, or null. panel: a touch tablet's preferred spot (right side, under the top bar).
 */
export function placeCard(a, w, hh, box, fig = null, panel = false) {
  const { top, bottom, right } = box;
  const vessel = a.r != null;
  let pts;
  if (vessel) pts = vesselPoints(a);
  else if (a.path) pts = a.path;
  else { ONE[0][0] = a.x; ONE[0][1] = a.y; pts = ONE; }
  const m = vessel ? a.r + 8 : 6;
  const maxX = Math.max(8, right - w), maxY = Math.max(top, bottom - hh);
  // A touch tablet keeps its side panel on the right, so the card never lands under the hand working the figure,
  // unless the vessel runs under it there.
  if (panel) {
    const x = clamp(right - w, 8, maxX), y = clamp(top, top, maxY);
    if (!vessel || !coverCount(pts, x, y, w, hh, m)) { PLACED.x = x; PLACED.y = y; PLACED.cover = 0; return PLACED; }
  }
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  if (pts.xs) { for (let i = 0; i < pts.length; i++) { const px = pts.xs[i], py = pts.ys[i]; bx0 = Math.min(bx0, px); by0 = Math.min(by0, py); bx1 = Math.max(bx1, px); by1 = Math.max(by1, py); } }
  else for (let i = 0; i < pts.length; i++) { const px = pts[i][0], py = pts[i][1]; bx0 = Math.min(bx0, px); by0 = Math.min(by0, py); bx1 = Math.max(bx1, px); by1 = Math.max(by1, py); }
  const gap = 22, g = vessel ? m + 14 : gap;
  candN = 0;
  cand(a.x + gap, a.y - hh / 2); cand(a.x - gap - w, a.y - hh / 2); cand(a.x - w / 2, a.y + gap); cand(a.x - w / 2, a.y - gap - hh); cand(a.x + gap, a.y - 30); cand(a.x - gap - w, a.y - 30);
  if (fig) { cand(fig.x1 + 16, a.y - hh / 2); cand(fig.x0 - 16 - w, a.y - hh / 2); }
  if (vessel) {
    // Clear of the whole vessel: beside, above or below its extent.
    cand(bx1 + g, a.y - hh / 2); cand(bx0 - g - w, a.y - hh / 2); cand(a.x - w / 2, by1 + g); cand(a.x - w / 2, by0 - g - hh);
    cand(bx1 + g, top); cand(bx0 - g - w, top); cand(bx1 + g, maxY); cand(bx0 - g - w, maxY);
    // And a sweep of the whole free area, for vessels that wind through the middle of it.
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 8; j++) cand(8 + ((maxX - 8) * i) / 10, top + ((maxY - top) * j) / 8);
  }
  let bestCost = 0, bestX = 0, bestY = 0, bestCover = 0, found = false;
  for (let i = 0; i < candN; i++) {
    const x0 = CAND[i * 2], y0 = CAND[i * 2 + 1];
    const cx = clamp(x0, 8, maxX), cy = clamp(y0, top, maxY);
    const cover = coverCount(pts, cx, cy, w, hh, m);
    const shift = Math.abs(cx - x0) + Math.abs(cy - y0);
    // The share of the card lying over the drawn figure.
    const over = fig ? Math.max(0, Math.min(cx + w, fig.x1) - Math.max(cx, fig.x0)) * Math.max(0, Math.min(cy + hh, fig.y1) - Math.max(cy, fig.y0)) / (w * hh) : 0;
    const far = Math.max(0, Math.hypot(cx + w / 2 - a.x, cy + hh / 2 - a.y) - (w + hh) / 2);
    const cost = cover * (vessel ? 1e5 : 40) + over * 140 + shift * 0.5 + far * 0.15 + Math.min(i, 14) * 3;
    if (!found || cost < bestCost) { found = true; bestCost = cost; bestX = cx; bestY = cy; bestCover = vessel ? cover : 0; }
  }
  PLACED.x = bestX; PLACED.y = bestY; PLACED.cover = bestCover;
  return PLACED;
}
