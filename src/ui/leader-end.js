// Where a leader meets its label. A leader runs from the spot a label names towards the middle of the label and stops
// on the edge of what is seen of it (`box`, { x0, y0, x1, y1 }: a pill's outline, or the letters' own box for a label
// drawn as haloed text), so it reaches the label in every frame and never runs in under the letters.
// Null when the spot lies inside the box: there is no leader to draw.
// A pill's rounded corners (`box.r`, the corner radius) are followed too: a leader towards a corner stops on its curve,
// not on the square corner a few pixels short of it.
// (The point returned is one kept object, written anew by each call of leaderEnd and leaderEndRects: read it before the next call,
// do not keep it. Every caller takes x and y at once.)
const END = { x: 0, y: 0 };
export function leaderEnd(box, ax, ay) {
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const hw = (box.x1 - box.x0) / 2, hh = (box.y1 - box.y0) / 2;
  const dx = ax - cx, dy = ay - cy;
  let t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  const r = Math.min(box.r || 0, hw, hh);
  if (r > 0 && t < Infinity) {
    // The corner circle's middle, on the side the line leaves by; a point past it on both axes is on the curve.
    const qx = cx + Math.sign(dx) * (hw - r), qy = cy + Math.sign(dy) * (hh - r), px = cx + dx * t, py = cy + dy * t;
    if (dx && dy && Math.abs(px - cx) > hw - r && Math.abs(py - cy) > hh - r) {
      // |c + d·s − q| = r, the far root.
      const ox = cx - qx, oy = cy - qy, a = dx * dx + dy * dy, b = ox * dx + oy * dy, c = ox * ox + oy * oy - r * r;
      t = (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a;
    }
  }
  if (t >= 1) return null;
  END.x = cx + dx * t; END.y = cy + dy * t;
  return END;
}

// How far the segment p→q runs inside `box` (0 when it misses it, or only grazes an edge or a corner).
export function runInside(p, q, box) {
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 2; i++) {   // (x, then y)
    const d = i ? q[1] - p[1] : q[0] - p[0], lo = i ? box.y0 : box.x0, hi = i ? box.y1 : box.x1, o = i ? p[1] : p[0];
    if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) return 0; continue; }
    let u = (lo - o) / d, v = (hi - o) / d;
    if (u > v) { const w = u; u = v; v = w; }
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 >= t1) return 0;
  }
  return (t1 - t0) * Math.hypot(q[0] - p[0], q[1] - p[1]);
}

// The same for a label seen as several boxes (one per line of text, each as wide as its own letters): the leader runs
// from the spot (ax, ay) towards (cx, cy), the label's middle, and stops where it first meets any of them. Null when the
// spot is inside one; falls back to `outer` when the line misses them all.
export function leaderEndRects(rects, outer, ax, ay) {
  const cx = (outer.x0 + outer.x1) / 2, cy = (outer.y0 + outer.y1) / 2, dx = cx - ax, dy = cy - ay;
  let best = Infinity;
  for (const b of rects) {
    let t0 = 0, t1 = 1, hit = true;
    for (let i = 0; i < 2; i++) {   // (x, then y)
      const d = i ? dy : dx, lo = i ? b.y0 : b.x0, hi = i ? b.y1 : b.x1, o = i ? ay : ax;
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) hit = false; continue; }
      let u = (lo - o) / d, v = (hi - o) / d;
      if (u > v) { const w = u; u = v; v = w; }
      t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    }
    if (hit && t0 <= t1) best = Math.min(best, t0);
  }
  if (best === 0) return null;
  if (best < Infinity) { END.x = ax + dx * best; END.y = ay + dy * best; return END; }
  return leaderEnd(outer, ax, ay);
}
