// Which vessel segments a label's box touches, for the figure's label placement (stage.js layoutLabels).
//
// The segments sit in a grid of `cell`-px buckets (key gx * 4096 + gy), each segment in every bucket its box, grown by its
// half width, reaches. A label tries dozens of spots per frame while a pinch re-solves the labels, so these run thousands
// of times a frame: they allocate nothing.

/** Does the segment cross the box `r` grown by `m` on every side? (Liang-Barsky.) */
export function segHitsBox(sg, r, m) {
  const x0 = r.x0 - m, y0 = r.y0 - m, x1 = r.x1 + m, y1 = r.y1 + m;
  let t0 = 0, t1 = 1, p, q, u;
  const dx = sg.x1 - sg.x0, dy = sg.y1 - sg.y0;
  // The four sides, in order: left, right, top, bottom.
  p = -dx; q = sg.x0 - x0;
  if (p === 0) { if (q < 0) return false; } else { u = q / p; if (p < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; } }
  p = dx; q = x1 - sg.x0;
  if (p === 0) { if (q < 0) return false; } else { u = q / p; if (p < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; } }
  p = -dy; q = sg.y0 - y0;
  if (p === 0) { if (q < 0) return false; } else { u = q / p; if (p < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; } }
  p = dy; q = y1 - sg.y0;   // (the last side: only whether it cuts the span left)
  if (p === 0) return q >= 0;
  u = q / p;
  return p < 0 ? u <= t1 : u >= t0;
}

/** How many segments of `grid` the box touches, each segment's own half width and `margin` px of air included. With
 *  `any`, stops at the first: 1 when one touches, else 0. `stamp` is a number no earlier call used (each segment is
 *  counted once, though it sits in several buckets). */
export function gridHits(grid, cell, r, margin, stamp, any = false) {
  let n = 0;
  const gx1 = Math.floor((r.x1 + margin) / cell), gy0 = Math.floor((r.y0 - margin) / cell), gy1 = Math.floor((r.y1 + margin) / cell);
  for (let gx = Math.floor((r.x0 - margin) / cell); gx <= gx1; gx++) {
    for (let gy = gy0; gy <= gy1; gy++) {
      const c = grid.get(gx * 4096 + gy);
      if (!c) continue;
      for (let i = 0; i < c.length; i++) {
        const sg = c[i];
        if (sg.stamp === stamp) continue;
        sg.stamp = stamp;
        if (segHitsBox(sg, r, sg.hw + margin)) { n++; if (any) return n; }
      }
    }
  }
  return n;
}

// ---- The line index, as data (plan rev 2 step 2: labels off the DOM, the solver headed for a worker). ----
// Everything here is plain numbers in and out: no element, no stage state, so the same code runs on the page and in a worker.

/** The vessels' lines as the labels' solver sees them: each line { pts: [[x, y]...] in world units, R: radii along it or null,
 *  flat: the radius when R is null, wall: px added to it, id } cut into segments in stage px (toLocal(x, y) → [x, y], sc: px per
 *  world unit), each in every `cell`-px bucket its box, grown by its half width, reaches. Returns { segs, grid, cell, stamp }.
 *  The index is built in one of two kept buffers (segments, buckets and their lists reused, written in place: a rebuild allocates only
 *  when the picture has more segments or buckets than ever before), so the one a caller holds stays whole while the next is built in the
 *  other; an index older than the one before it has been written over. */
const newIdx = () => ({ segs: [], grid: new Map(), cell: 64, stamp: 0, pool: [] });
const BUFS = [newIdx(), newIdx()];
/** A buffer of one's own for lineIndex's `into`: an index a caller keeps across the two shared buffers' rebuilds (the labels' ahead-of-time
 *  solve, which runs in slices between the live layouts, each of which builds the shared index again). */
export const lineIndexBuf = newIdx;
let bufAt = 0, CUM = new Float64Array(512);
const radAt = (R, flat, u) => (R ? R[Math.round(Math.min(1, Math.max(0, u)) * (R.length - 1))] : flat);
export function lineIndex(lines, toLocal, sc, cell = 64, into = null) {
  const idx = into || BUFS[bufAt];
  if (!into) bufAt ^= 1;
  const { segs, grid, pool } = idx;
  idx.cell = cell; idx.stamp = 0;
  for (const c of grid.values()) c.length = 0;   // (the buckets keep their lists)
  if (grid.size > 20000) grid.clear();   // (buckets of places the picture has left, never visited again)
  let n = 0;
  for (let li = 0; li < lines.length; li++) {
    const ln = lines[li], pts = ln.pts;
    if (!pts || pts.length < 2) continue;
    const R = ln.R, flat = ln.flat, wall = ln.wall || 0;
    if (pts.length > CUM.length) CUM = new Float64Array(pts.length * 2);   // alloc-rare: grows only when a line has more points than any before
    CUM[0] = 0;
    for (let i = 1; i < pts.length; i++) CUM[i] = CUM[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const L = CUM[pts.length - 1] || 1;
    let prev = toLocal(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const cur = toLocal(pts[i][0], pts[i][1]);
      const hw = (Math.max(radAt(R, flat, CUM[i - 1] / L), radAt(R, flat, CUM[i] / L)) + wall) * sc;
      const sg = pool[n] || (pool[n] = { x0: 0, y0: 0, x1: 0, y1: 0, hw: 0, stamp: 0, id: null });   // alloc-rare: a new segment object only when the picture has more segments than ever before
      sg.x0 = prev[0]; sg.y0 = prev[1]; sg.x1 = cur[0]; sg.y1 = cur[1]; sg.hw = hw; sg.stamp = 0; sg.id = ln.id;
      segs[n++] = sg;
      for (let gx = Math.floor((Math.min(sg.x0, sg.x1) - hw) / cell); gx <= Math.floor((Math.max(sg.x0, sg.x1) + hw) / cell); gx++) {
        for (let gy = Math.floor((Math.min(sg.y0, sg.y1) - hw) / cell); gy <= Math.floor((Math.max(sg.y0, sg.y1) + hw) / cell); gy++) {
          const k = gx * 4096 + gy;
          let c = grid.get(k);
          if (!c) grid.set(k, (c = []));   // alloc-rare: a bucket for a place the picture has not reached before
          c.push(sg);
        }
      }
      prev = cur;
    }
  }
  segs.length = n;
  return idx;
}

/** How many of the index's segments the box touches, each one's own half width and `margin` px of air included. `skip`: true asks
 *  only whether one does; a line's id leaves that one out; { only: id } counts just that one. */
export function indexHits(idx, r, margin, skip = false) {
  if (typeof skip === 'boolean') return gridHits(idx.grid, idx.cell, r, margin, ++idx.stamp, skip);
  const stamp = ++idx.stamp, cell = idx.cell;
  let n = 0;
  for (let gx = Math.floor((r.x0 - margin) / cell); gx <= Math.floor((r.x1 + margin) / cell); gx++) {
    for (let gy = Math.floor((r.y0 - margin) / cell); gy <= Math.floor((r.y1 + margin) / cell); gy++) {
      const c = idx.grid.get(gx * 4096 + gy);
      if (!c) continue;
      for (let i = 0; i < c.length; i++) {
        const sg = c[i];
        if (sg.stamp === stamp) continue;
        sg.stamp = stamp;
        if ((skip?.only ? sg.id === skip.only : sg.id !== skip) && segHitsBox(sg, r, sg.hw + margin)) n++;
      }
    }
  }
  return n;
}

const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
/** Do two segments cross (or touch)? Each is [x0, y0, x1, y1] or { x0, y0, x1, y1 }. */
export function segsCross(a, b) {
  const a0 = a.x0 ?? a[0], a1 = a.y0 ?? a[1], a2 = a.x1 ?? a[2], a3 = a.y1 ?? a[3];
  const b0 = b.x0 ?? b[0], b1 = b.y0 ?? b[1], b2 = b.x1 ?? b[2], b3 = b.y1 ?? b[3];
  return o(a0, a1, a2, a3, b0, b1) !== o(a0, a1, a2, a3, b2, b3) && o(b0, b1, b2, b3, a0, a1) !== o(b0, b1, b2, b3, a2, a3);
}

// ---- A leader against the vessels (the Circuit's readings: a leader never runs through a vessel it does not start on). ----

const ptSegDist = (px, py, x0, y0, x1, y1) => {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2)) : 0;
  return Math.hypot(px - x0 - dx * t, py - y0 - dy * t);
};
const side = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
/** The least distance between segment a (a0 → a1) and segment b (b0 → b1): 0 when they cross. */
export function segSegDist(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) {
  if (side(ax0, ay0, ax1, ay1, bx0, by0) !== side(ax0, ay0, ax1, ay1, bx1, by1) && side(bx0, by0, bx1, by1, ax0, ay0) !== side(bx0, by0, bx1, by1, ax1, ay1)) return 0;
  return Math.min(ptSegDist(ax0, ay0, bx0, by0, bx1, by1), ptSegDist(ax1, ay1, bx0, by0, bx1, by1), ptSegDist(bx0, by0, ax0, ay0, ax1, ay1), ptSegDist(bx1, by1, ax0, ay0, ax1, ay1));
}

/**
 * How many of the index's vessels the leader (ax, ay) → (ex, ey) runs through. A vessel the leader starts on (its anchor within the
 * vessel's half width and 3 px of it) is left alone where the leader leaves it at an angle (over 20°), and for its first half width
 * and 4 px where it runs along it, so a leader climbs off its own vessel but does not ride on it; every other vessel counts when the leader comes within its half width and `air` px of it. `any`: stops at the first.
 * Allocates nothing (it runs for every spot a label tries).
 */
export function leaderVesselHits(idx, ax, ay, ex, ey, air = 1, any = false) {
  const segs = idx.segs, dx = ex - ax, dy = ey - ay, L = Math.hypot(dx, dy);
  if (L < 1e-6) return 0;
  // The vessels the leader starts on (up to three, by id: a vessel's other segments are its own too), and whether it leaves each at
  // an angle (over 20° to the run it starts on). Leaving at an angle, it may brush the rest of a bent vessel; along it, only its first
  // half width and 4 px are its own.
  let o1 = null, o2 = null, o3 = null, a1 = false, a2 = false, a3 = false;
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i];
    if (ptSegDist(ax, ay, sg.x0, sg.y0, sg.x1, sg.y1) > sg.hw + 3) continue;
    const gx = sg.x1 - sg.x0, gy = sg.y1 - sg.y0, angled = Math.abs(dx * gy - dy * gx) / (L * (Math.hypot(gx, gy) || 1)) > 0.34;
    if (sg.id === o1) a1 = a1 || angled; else if (sg.id === o2) a2 = a2 || angled; else if (sg.id === o3) a3 = a3 || angled;
    else if (o1 === null) { o1 = sg.id; a1 = angled; } else if (o2 === null) { o2 = sg.id; a2 = angled; } else if (o3 === null) { o3 = sg.id; a3 = angled; }
  }
  const lx0 = Math.min(ax, ex), lx1 = Math.max(ax, ex), ly0 = Math.min(ay, ey), ly1 = Math.max(ay, ey);
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i], m = sg.hw + air;
    if (lx1 < Math.min(sg.x0, sg.x1) - m || lx0 > Math.max(sg.x0, sg.x1) + m || ly1 < Math.min(sg.y0, sg.y1) - m || ly0 > Math.max(sg.y0, sg.y1) + m) continue;
    let sx = ax, sy = ay;
    const own = sg.id === o1 ? 1 : sg.id === o2 ? 2 : sg.id === o3 ? 3 : 0;
    if (own) {
      if (own === 1 ? a1 : own === 2 ? a2 : a3) continue;
      const off = sg.hw + 4;
      if (L <= off) continue;
      sx = ax + (dx / L) * off; sy = ay + (dy / L) * off;
    }
    if (segSegDist(sx, sy, ex, ey, sg.x0, sg.y0, sg.x1, sg.y1) < m) { n++; if (any) return n; }
  }
  return n;
}
