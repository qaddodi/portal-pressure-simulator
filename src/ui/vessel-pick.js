// Vessel picking on the vessels' own data (no element, no browser hit test, 2 Nov 2026 "everything on GPU"): the pointer, taken
// into the figure's world units, is tested against each vessel's drawn course as a stroke of its hit width with round caps. The
// stage walks its vessels and hands each course over (visit(id, rank, r, pts)): pts its course as [x, y] points in world units, r
// its hit half-width in world units, rank its draw order (the GPU's tier and row), so the vessel drawn on top is the one picked. A
// GPU pick (the lumen buffer's row per pixel) can take over behind the same pick().
//
// pick(wx, wy, k, slop): the id under the world point (wx, wy), or within `slop` CSS px past a stroke's edge the nearest; k is the
// camera's CSS px per world unit. On a stroke, the highest rank wins; near one, the nearest. Nothing is allocated per pick.

/** The squared distance from (x, y) to a course of [x, y] points. */
export function dist2(P, x, y) {
  const n = P.length;
  if (n === 1) { const ex = P[0][0] - x, ey = P[0][1] - y; return ex * ex + ey * ey; }
  let d2 = Infinity;
  for (let j = 0; j < n - 1; j++) {
    const ax = P[j][0], ay = P[j][1], dx = P[j + 1][0] - ax, dy = P[j + 1][1] - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    const ex = ax + t * dx - x, ey = ay + t * dy - y, q = ex * ex + ey * ey;
    if (q < d2) d2 = q;
  }
  return d2;
}

// A course's bounding box, kept by the course array itself (a new course is a new array, so a box never goes stale).
const boxes = new WeakMap();
function boxOf(P) {
  let b = boxes.get(P);
  if (!b) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    b = [x0, y0, x1, y1];
    boxes.set(P, b);
  }
  return b;
}

/** each(visit): calls visit(id, rank, r, pts) for every course that can be picked now. */
export function createVesselPick(each) {
  let px = 0, py = 0, pk = 1, pslop = 0, best = null, bestRank = -Infinity, bestGap = Infinity, on = false;
  function visit(id, rank, r, P) {
    if (!P || !P.length || !(r > 0)) return;
    const reach = r + pslop / pk, b = boxOf(P);
    if (px < b[0] - reach || px > b[2] + reach || py < b[1] - reach || py > b[3] + reach) return;
    const gap = (Math.sqrt(dist2(P, px, py)) - r) * pk;   // (CSS px past the stroke's edge; at most 0 on it)
    if (gap > pslop) return;
    if (gap <= 0) { if (!on || rank >= bestRank) { best = id; bestRank = rank; on = true; } }
    else if (!on && gap < bestGap) { best = id; bestGap = gap; }
  }
  function pick(wx, wy, k, slop = 0) {
    if (!(k > 0) || !Number.isFinite(wx) || !Number.isFinite(wy)) return null;
    px = wx; py = wy; pk = k; pslop = slop; best = null; bestRank = -Infinity; bestGap = Infinity; on = false;
    each(visit);
    return best;
  }
  return { pick };
}
