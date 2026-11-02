// The pressure ladder's monotone curve, and a cheap answer to "does this point fall on the curve's stroke?".
//
// The ladder places every value label, the LIVER caption and the HVPG and PPG pills where they keep clear of the curve,
// testing each candidate box point by point against the stroke widened by the clearance (isPointInStroke). The browser
// strokes the whole path for every one of those calls, thousands a frame while the pressures glide, which made the
// Pressure panel lag. Here the curve is also kept as a fine polyline whose distance from the true curve is bounded, so
// most points are settled by plain arithmetic: well outside the widened stroke or well inside it. Only a point within a
// hair of the stroke's edge is still asked of the browser, so every answer, and so every placement, is the same as before.

// (The working below builds nothing: its numbers go into flat lists kept between calls and written in place, each with an explicit count,
// and a tester keeps its lists for as long as the caller keeps it. The names without "Into" and the curveTester function keep their old
// shape, a fresh result per call, for callers that keep what they get; they are thin wrappers over the same code.)

const DX = [], SL = [], TN = [];   // (a curve's spans: run in x, slope, tangent)

/**
 * Control points of the curve through pts (monotone cubic, Fritsch–Carlson), written into `out`, eight numbers to a span
 * [x0, y0, c1x, c1y, c2x, c2y, x1, y1]; returns the number of spans, or 0 where fewer than three points are joined by straight lines.
 */
export function monotoneInto(pts, out) {
  const n = pts.length;
  if (n < 3) return 0;
  for (let i = 0; i < n - 1; i++) { DX[i] = pts[i + 1][0] - pts[i][0] || 1e-6; SL[i] = (pts[i + 1][1] - pts[i][1]) / DX[i]; }
  TN[0] = SL[0];
  for (let i = 1; i < n - 1; i++) TN[i] = SL[i - 1] * SL[i] <= 0 ? 0 : (SL[i - 1] + SL[i]) / 2;
  TN[n - 1] = SL[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (SL[i] === 0) { TN[i] = TN[i + 1] = 0; continue; }
    const a = TN[i] / SL[i], b = TN[i + 1] / SL[i], h2 = a * a + b * b;
    if (h2 > 9) { const k = 3 / Math.sqrt(h2); TN[i] = k * a * SL[i]; TN[i + 1] = k * b * SL[i]; }
  }
  for (let i = 0; i < n - 1; i++) {
    const d = DX[i] / 3, o = 8 * i;
    out[o] = pts[i][0]; out[o + 1] = pts[i][1]; out[o + 2] = pts[i][0] + d; out[o + 3] = pts[i][1] + TN[i] * d;
    out[o + 4] = pts[i + 1][0] - d; out[o + 5] = pts[i + 1][1] - TN[i + 1] * d; out[o + 6] = pts[i + 1][0]; out[o + 7] = pts[i + 1][1];
  }
  return n - 1;
}

const SEGS = [];   // (monotoneInto's spans for the functions below, which finish with them before they return)

// Control points of the curve through pts (monotone cubic, Fritsch–Carlson): one [x0, y0, c1x, c1y, c2x, c2y, x1, y1]
// per span, or null where fewer than three points are joined by straight lines. (monotoneInto's numbers, as fresh lists.)
export function monotoneSegs(pts) {
  const spans = monotoneInto(pts, SEGS);
  if (!spans) return null;
  const out = [];
  for (let i = 0; i < spans; i++) out.push(SEGS.slice(8 * i, 8 * i + 8));
  return out;
}

// The curve as a polyline, with err: how far any point of it may lie from the true curve (and back). A cubic cut into k
// equal steps of t strays from its chords by at most max|B''| / (8 k²), and |B''| ≤ 6 · max(|P0 − 2P1 + P2|, |P1 − 2P2 + P3|).
const STEP_ERR = 0.05;   // (CSS px)
const FLAT = { n: 0, err: 0 };   // (flattenInto's count and err)
/** The curve through pts as a polyline in xs, ys (written in place); the count of points and err are left in FLAT. */
function flattenInto(pts, xs, ys) {
  const spans = monotoneInto(pts, SEGS);
  let n = 0, err = 0;
  if (pts.length) {
    xs[0] = pts[0][0]; ys[0] = pts[0][1]; n = 1;
    if (!spans) { for (let i = 1; i < pts.length; i++) { xs[n] = pts[i][0]; ys[n] = pts[i][1]; n++; } }
    else for (let s = 0; s < spans; s++) {
      const o = 8 * s, x0 = SEGS[o], y0 = SEGS[o + 1], ax = SEGS[o + 2], ay = SEGS[o + 3], bx = SEGS[o + 4], by = SEGS[o + 5], x1 = SEGS[o + 6], y1 = SEGS[o + 7];
      const dd = 6 * Math.max(Math.hypot(x0 - 2 * ax + bx, y0 - 2 * ay + by), Math.hypot(ax - 2 * bx + x1, ay - 2 * by + y1));
      const k = Math.min(512, Math.max(1, Math.ceil(Math.sqrt(dd / (8 * STEP_ERR)))));
      err = Math.max(err, dd / (8 * k * k));
      for (let j = 1; j <= k; j++) {
        const t = j / k, u = 1 - t;
        xs[n] = u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x1;
        ys[n] = u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y1;
        n++;
      }
    }
  }
  FLAT.n = n; FLAT.err = err;
}
export function flatten(pts) {
  const xs = [], ys = [];
  flattenInto(pts, xs, ys);
  xs.length = ys.length = FLAT.n;
  return { xs, ys, err: FLAT.err };
}

// How far the browser's own stroke may stray from the ideal one (every point within half the line width of the curve),
// with room to spare: its curve flattening is a fraction of a device pixel.
const SLACK = 1;

/**
 * A tester for one curve, kept and refilled (`fill(pts)`) as the curve changes: near(r, lineWidth, exact) answers as the old loop did
 * (the box's points every 2 px or less, in order, the first on the stroke wins), calling exact(px, py) only where arithmetic cannot settle
 * a point. The stroke's ends (round caps) are always asked of the browser. exact null (no canvas to ask): a point on the edge is settled by
 * its distance from the fine polyline. Nothing is built by fill or near once its lists have grown to the curve's size.
 */
export class CurveTester {
  constructor() {
    this.xs = []; this.ys = []; this.sx0 = []; this.sx1 = []; this.sy0 = []; this.sy1 = []; this.segs = [];
    this.n = 0; this.err = 0; this.odd = false;
  }
  fill(pts) {
    flattenInto(pts, this.xs, this.ys);
    const n = this.n = FLAT.n, err = this.err = FLAT.err, xs = this.xs, ys = this.ys;
    for (let i = 0; i < n - 1; i++) {
      this.sx0[i] = Math.min(xs[i], xs[i + 1]); this.sx1[i] = Math.max(xs[i], xs[i + 1]);
      this.sy0[i] = Math.min(ys[i], ys[i + 1]); this.sy1[i] = Math.max(ys[i], ys[i + 1]);
    }
    // (A coordinate that is not a number: the browser's own answer for every point, as before.)
    let odd = !Number.isFinite(err);
    for (let i = 0; i < pts.length && !odd; i++) if (!Number.isFinite(pts[i][0]) || !Number.isFinite(pts[i][1])) odd = true;
    this.odd = odd;
    return this;
  }
  // The distance from (px, py) to the nearest of the spans listed (segs, `count` of them), or of all of them when segs is null.
  dist(px, py, segs, count) {
    const { xs, ys, n } = this;
    if (n === 1) return Math.hypot(px - xs[0], py - ys[0]);
    let best = Infinity;
    for (let q = 0, m = segs ? count : n - 1; q < m; q++) {
      const i = segs ? segs[q] : q;
      const ax = xs[i], ay = ys[i], vx = xs[i + 1] - ax, vy = ys[i + 1] - ay, L2 = vx * vx + vy * vy;
      const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)) : 0;
      const d = Math.hypot(px - ax - t * vx, py - ay - t * vy);
      if (d < best) best = d;
    }
    return best;
  }
  near(r, lineWidth, exact) {
    const { n, err, odd, xs, ys, segs } = this;
    if (!exact && odd) return false;
    if (odd) {
      const sx = Math.min(2, (r.x1 - r.x0) / 2 || 2), sy = Math.min(2, (r.y1 - r.y0) / 2 || 2);
      for (let px = r.x0; px <= r.x1 + 0.1; px += sx) for (let py = r.y0; py <= r.y1 + 0.1; py += sy) if (exact(px, py)) return true;
      return false;
    }
    if (!n) return false;
    const hw = lineWidth / 2, reach = hw + err + SLACK;
    // (Only the spans that come within reach of the box can touch it; none, and no point of it is on the stroke.)
    let count = 0;
    for (let i = 0; i < n - 1; i++) if (this.sx1[i] >= r.x0 - reach && this.sx0[i] <= r.x1 + reach && this.sy1[i] >= r.y0 - reach && this.sy0[i] <= r.y1 + reach) segs[count++] = i;
    if (n > 1 && !count) return false;
    const capR = hw + err + SLACK;
    const stepX = Math.min(2, (r.x1 - r.x0) / 2 || 2), stepY = Math.min(2, (r.y1 - r.y0) / 2 || 2);
    const ex0 = xs[0], ey0 = ys[0], ex1 = xs[n - 1], ey1 = ys[n - 1];
    for (let px = r.x0; px <= r.x1 + 0.1; px += stepX) for (let py = r.y0; py <= r.y1 + 0.1; py += stepY) {
      const d = this.dist(px, py, segs, count);
      if (d > reach) continue;                                   // well outside
      const atEnd = Math.hypot(px - ex0, py - ey0) <= capR || Math.hypot(px - ex1, py - ey1) <= capR;
      if (!atEnd && d < hw - err - SLACK) return true;          // well inside
      if (exact ? exact(px, py) : this.dist(px, py, null, 0) <= lineWidth / 2) return true;   // on the edge: the browser decides
    }
    return false;
  }
}

/** A tester for one curve as a function near(r, lineWidth, exact) (a CurveTester made and filled for it). */
export function curveTester(pts) {
  const t = new CurveTester().fill(pts);
  return (r, lineWidth, exact) => t.near(r, lineWidth, exact);
}
