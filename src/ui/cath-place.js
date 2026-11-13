// Where the HVPG summary (the two readings, their bracket and the HVPG) sits on the stage (pure, no DOM).
// It keeps clear of the cards and of what it names: the catheter's tip, the wedged balloon and the point
// ahead of it, so the label never covers its target.

/** The world box round the balloon's outline (balloonOutline's samples: centre c, direction t, half width h). */
export function outlineBox(ol) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of ol) for (const k of [1, -1]) {
    const x = o.c[0] - o.t[1] * o.h * k, y = o.c[1] + o.t[0] * o.h * k;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return ol.length ? { x0, y0, x1, y1 } : null;
}

// The area of the box (x0, y0, w, h) that the rects rs cover, each grown by pad.
const area = (x0, y0, w, h, rs, pad) => {
  let n = 0;
  for (let i = 0; i < rs.length; i++) {
    const b = rs[i];
    n += Math.max(0, Math.min(x0 + w, b.x1 + pad) - Math.max(x0, b.x0 - pad)) * Math.max(0, Math.min(y0 + h, b.y1 + pad) - Math.max(y0, b.y0 - pad));
  }
  return n;
};

// One placement at a time: its numbers and the best spot so far are kept here (no closures made per call), and its answer is one kept
// object, rewritten by each call (the stage reads x and y at once).
const NONE = [];
let sBw = 0, sBh = 0, sW = 0, sCx0 = 0, sXMin = 28, sXMax = 28, sBlockers = NONE, sKeep = NONE;
let bestFound = false, bestC = 0, bestX = 0, bestY = 0, bestH = 0;
const PLACE = { x: 0, y: 0 };
const tryRow = (y0, pen) => {
  for (let d = 0; d <= sW; d += 8) for (let si = d ? 0 : 1; si < 2; si++) {
    const x0 = sCx0 + (si ? 1 : -1) * d; if (x0 < sXMin || x0 > sXMax) continue;
    const h = area(x0, y0, sBw, sBh, sBlockers, 4) + area(x0, y0, sBw, sBh, sKeep, 8), c = h * 1e3 + d + pen;
    if (!bestFound || c < bestC) { bestFound = true; bestC = c; bestX = x0; bestY = y0; bestH = h; }
    if (!h) return;
  }
};

/**
 * The summary box's top-left on the stage. A: the readings' points ({ tip, ahead } in stage pixels); bw, bh: the box;
 * W: the stage width; top, lim: the free band's top and bottom (the cards' edges); gap: how far it stands off the points;
 * blockers: the cards' rects; keep: the rects it must never cover (the balloon, the tip, the point ahead).
 * Above the readings, centred between them; below them when there is no room above; sideways to the nearest clear spot.
 * When neither holds it clear, any height in the free band that does, nearest first.
 * The answer ({ x, y }) is one kept object, rewritten by each call.
 */
export function placeSummary({ A, bw, bh, W, top, lim, gap, blockers = NONE, keep = NONE }) {
  const cx0 = (A.tip[0] + A.ahead[0]) / 2 - bw / 2, xMin = 28, xMax = Math.max(28, W - bw - 12), yMax = Math.max(top, lim - bh - 12);
  const yUp = Math.min(A.tip[1], A.ahead[1]) - bh - gap, yDown = Math.min(Math.max(Math.max(A.tip[1], A.ahead[1]) + gap, top), yMax);
  sBw = bw; sBh = bh; sW = W; sCx0 = cx0; sXMin = xMin; sXMax = xMax; sBlockers = blockers; sKeep = keep;
  bestFound = false;
  if (yUp >= top) { tryRow(yUp, 0); tryRow(yDown, 60); }
  else { tryRow(yDown, 0); tryRow(Math.min(Math.max(yUp, top), yMax), 60); }
  // Both rows cover something (a short free band pushes the box onto the vein): every height in the band.
  if (bestFound && bestH) for (let y0 = top; y0 <= yMax; y0 += 8) tryRow(y0, 120 + Math.abs(y0 - bestY) * 0.1);
  if (bestFound && bestH) tryRow(yMax, 120);
  if (bestFound) { PLACE.x = bestX; PLACE.y = Math.min(Math.max(bestY, top), yMax); }
  else { PLACE.x = Math.min(Math.max(cx0, xMin), xMax); PLACE.y = Math.min(Math.max(yUp, top), yMax); }
  sBlockers = NONE; sKeep = NONE;   // (nothing of the caller's is held between calls)
  return PLACE;
}

// The stack's candidate places, tried one at a time (kept state, no closures per call): the box's top-left, clamped into the free band, costs
// the cards and the keep-clear rects it would cover (heavily), what the clamp moved it (so a box pushed onto the points is dear), and the side's
// own preference and slide.
const tryBox = (x0, y0, pen, xMin, xMax, top, yMax) => {
  const x = Math.min(Math.max(x0, xMin), xMax), y = Math.min(Math.max(y0, top), yMax);
  const h = area(x, y, sBw, sBh, sBlockers, 4) + area(x, y, sBw, sBh, sKeep, 6), c = h * 1e3 + pen + (Math.abs(x - x0) + Math.abs(y - y0)) * 0.5;
  if (!bestFound || c < bestC) { bestFound = true; bestC = c; bestX = x; bestY = y; bestH = h; }
};

/**
 * The HVPG stack's top-left, close to the points it names (the leaders are short: `off` px from the points' box to the stack's edge).
 * A: the readings' points ({ tip, ahead }, stage pixels); bw, bh: the box; W: the stage width; top, lim: the free band; off: the stand-off;
 * blockers: the cards' rects; keep: what it must never cover (the stretch of vein between the points, the balloon, the points).
 * Above the points, below them, or to their right (its readings' left edge faces them, so each leader runs out of its own row with nothing
 * in the way), each slid sideways to the nearest clear spot; the side with nothing under it wins, else the one covering least.
 * The answer ({ x, y }) is one kept object, rewritten by each call.
 */
export function placeBeside({ A, bw, bh, W, top, lim, off = 16, blockers = NONE, keep = NONE }) {
  const minX = Math.min(A.tip[0], A.ahead[0]), maxX = Math.max(A.tip[0], A.ahead[0]), minY = Math.min(A.tip[1], A.ahead[1]), maxY = Math.max(A.tip[1], A.ahead[1]);
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2, xMin = 28, xMax = Math.max(28, W - bw - 12), yMax = Math.max(top, lim - bh - 12);
  sBw = bw; sBh = bh; sBlockers = blockers; sKeep = keep;
  bestFound = false;
  for (let d = 0; d <= W; d += 8) for (let si = d ? 0 : 1; si < 2; si++) {
    const dx = (si ? 1 : -1) * d, x0 = midX - bw / 2 + dx;
    tryBox(x0, minY - off - bh, d * 0.3, xMin, xMax, top, yMax);
    tryBox(x0, maxY + off, 30 + d * 0.3, xMin, xMax, top, yMax);
  }
  for (let d = 0; d <= lim - top; d += 8) for (let si = d ? 0 : 1; si < 2; si++) tryBox(maxX + off, midY - bh / 2 + (si ? 1 : -1) * d, 60 + d * 0.3, xMin, xMax, top, yMax);
  PLACE.x = bestX; PLACE.y = bestY;
  sBlockers = NONE; sKeep = NONE;   // (nothing of the caller's is held between calls)
  return PLACE;
}
