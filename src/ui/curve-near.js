// The pressure ladder's monotone curve, and a cheap answer to "does this point fall on the curve's stroke?".
//
// The ladder places every value label, the LIVER caption and the HVPG and PPG pills where they keep clear of the curve,
// testing each candidate box point by point against the stroke widened by the clearance (isPointInStroke). The browser
// strokes the whole path for every one of those calls, thousands a frame while the pressures glide, which made the
// Pressure panel lag. Here the curve is also kept as a fine polyline whose distance from the true curve is bounded, so
// most points are settled by plain arithmetic: well outside the widened stroke or well inside it. Only a point within a
// hair of the stroke's edge is still asked of the browser, so every answer, and so every placement, is the same as before.

// Control points of the curve through pts (monotone cubic, Fritsch–Carlson): one [x0, y0, c1x, c1y, c2x, c2y, x1, y1]
// per span, or null where fewer than three points are joined by straight lines.
export function monotoneSegs(pts) {
  const n = pts.length;
  if (n < 3) return null;
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0] || 1e-6; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h2 = a * a + b * b;
    if (h2 > 9) { const k = 3 / Math.sqrt(h2); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const d = dx[i] / 3;
    out.push([pts[i][0], pts[i][1], pts[i][0] + d, pts[i][1] + t[i] * d, pts[i + 1][0] - d, pts[i + 1][1] - t[i + 1] * d, pts[i + 1][0], pts[i + 1][1]]);
  }
  return out;
}

// The curve as a polyline, with err: how far any point of it may lie from the true curve (and back). A cubic cut into k
// equal steps of t strays from its chords by at most max|B''| / (8 k²), and |B''| ≤ 6 · max(|P0 − 2P1 + P2|, |P1 − 2P2 + P3|).
const STEP_ERR = 0.05;   // (CSS px)
export function flatten(pts) {
  const segs = monotoneSegs(pts);
  const xs = [], ys = [];
  let err = 0;
  if (!pts.length) return { xs, ys, err };
  xs.push(pts[0][0]); ys.push(pts[0][1]);
  if (!segs) { for (let i = 1; i < pts.length; i++) { xs.push(pts[i][0]); ys.push(pts[i][1]); } return { xs, ys, err }; }
  for (const [x0, y0, ax, ay, bx, by, x1, y1] of segs) {
    const dd = 6 * Math.max(Math.hypot(x0 - 2 * ax + bx, y0 - 2 * ay + by), Math.hypot(ax - 2 * bx + x1, ay - 2 * by + y1));
    const k = Math.min(512, Math.max(1, Math.ceil(Math.sqrt(dd / (8 * STEP_ERR)))));
    err = Math.max(err, dd / (8 * k * k));
    for (let j = 1; j <= k; j++) {
      const t = j / k, u = 1 - t;
      xs.push(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x1);
      ys.push(u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y1);
    }
  }
  return { xs, ys, err };
}

// How far the browser's own stroke may stray from the ideal one (every point within half the line width of the curve),
// with room to spare: its curve flattening is a fraction of a device pixel.
const SLACK = 1;

// A tester for one curve: near(r, lineWidth, exact) answers as the old loop did (the box's points every 2 px or less,
// in order, the first on the stroke wins), calling exact(px, py) only where arithmetic cannot settle a point. The
// stroke's ends (round caps) are always asked of the browser.
export function curveTester(pts) {
  const { xs, ys, err } = flatten(pts);
  const n = xs.length;
  const sx0 = [], sx1 = [], sy0 = [], sy1 = [];
  for (let i = 0; i < n - 1; i++) {
    sx0.push(Math.min(xs[i], xs[i + 1])); sx1.push(Math.max(xs[i], xs[i + 1]));
    sy0.push(Math.min(ys[i], ys[i + 1])); sy1.push(Math.max(ys[i], ys[i + 1]));
  }
  const ends = n ? [[xs[0], ys[0]], [xs[n - 1], ys[n - 1]]] : [];
  function dist(px, py, segs) {
    if (n === 1) return Math.hypot(px - xs[0], py - ys[0]);
    let best = Infinity;
    for (const i of segs) {
      const ax = xs[i], ay = ys[i], vx = xs[i + 1] - ax, vy = ys[i + 1] - ay, L2 = vx * vx + vy * vy;
      const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)) : 0;
      const d = Math.hypot(px - ax - t * vx, py - ay - t * vy);
      if (d < best) best = d;
    }
    return best;
  }
  // (A coordinate that is not a number: the browser's own answer for every point, as before.)
  const odd = !pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) || !Number.isFinite(err);
  return function near(r, lineWidth, exact) {
    if (odd) {
      const sx = Math.min(2, (r.x1 - r.x0) / 2 || 2), sy = Math.min(2, (r.y1 - r.y0) / 2 || 2);
      for (let px = r.x0; px <= r.x1 + 0.1; px += sx) for (let py = r.y0; py <= r.y1 + 0.1; py += sy) if (exact(px, py)) return true;
      return false;
    }
    if (!n) return false;
    const hw = lineWidth / 2, reach = hw + err + SLACK;
    // (Only the spans that come within reach of the box can touch it; none, and no point of it is on the stroke.)
    const segs = [];
    for (let i = 0; i < n - 1; i++) if (sx1[i] >= r.x0 - reach && sx0[i] <= r.x1 + reach && sy1[i] >= r.y0 - reach && sy0[i] <= r.y1 + reach) segs.push(i);
    if (n > 1 && !segs.length) return false;
    const capR = hw + err + SLACK;
    const stepX = Math.min(2, (r.x1 - r.x0) / 2 || 2), stepY = Math.min(2, (r.y1 - r.y0) / 2 || 2);
    for (let px = r.x0; px <= r.x1 + 0.1; px += stepX) for (let py = r.y0; py <= r.y1 + 0.1; py += stepY) {
      const d = dist(px, py, segs);
      if (d > reach) continue;                                   // well outside
      const atEnd = ends.some(([ex, ey]) => Math.hypot(px - ex, py - ey) <= capR);
      if (!atEnd && d < hw - err - SLACK) return true;          // well inside
      if (exact(px, py)) return true;                            // on the edge: the browser decides
    }
    return false;
  };
}
