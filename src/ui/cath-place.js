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
