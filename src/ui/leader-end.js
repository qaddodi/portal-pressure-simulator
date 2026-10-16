// Where a leader meets its label. A leader runs from the spot a label names towards the middle of the label and stops
// on the edge of what is seen of it (`box`, { x0, y0, x1, y1 }: a pill's outline, or the letters' own box for a label
// drawn as haloed text), so it reaches the label in every frame and never runs in under the letters.
// Null when the spot lies inside the box: there is no leader to draw.
export function leaderEnd(box, ax, ay) {
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const hw = (box.x1 - box.x0) / 2, hh = (box.y1 - box.y0) / 2;
  const dx = ax - cx, dy = ay - cy;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return t >= 1 ? null : { x: cx + dx * t, y: cy + dy * t };
}

// How far the segment p→q runs inside `box` (0 when it misses it, or only grazes an edge or a corner).
export function runInside(p, q, box) {
  let t0 = 0, t1 = 1;
  for (const [d, lo, hi, o] of [[q[0] - p[0], box.x0, box.x1, p[0]], [q[1] - p[1], box.y0, box.y1, p[1]]]) {
    if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) return 0; continue; }
    let u = (lo - o) / d, v = (hi - o) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 >= t1) return 0;
  }
  return (t1 - t0) * Math.hypot(q[0] - p[0], q[1] - p[1]);
}
