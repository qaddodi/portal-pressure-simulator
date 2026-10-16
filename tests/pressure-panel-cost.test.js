import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monotoneSegs, curveTester } from '../src/ui/curve-near.js';
import { firstAtOrAbove, firstAbove } from '../src/ui/sorted.js';
import { limitLabelX } from '../src/ui/limit-label.js';

// The Tests > Pressure panel lagged: the ladder above it placed its labels by asking the browser, point by point,
// whether each lay on the curve's widened stroke (isPointInStroke), thousands of times a frame while the pressures
// glide. Now arithmetic settles every point that is clearly off or on the stroke, and only a point on its very edge is
// still asked, so every placement is the same as before.

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// The curve's control points exactly as smoothPath computed them before they moved into curve-near.js.
function oldSegs(pts) {
  const n = pts.length, dx = [], m = [];
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
  for (let i = 0; i < n - 1; i++) { const d = dx[i] / 3; out.push([pts[i][0], pts[i][1], pts[i][0] + d, pts[i][1] + t[i] * d, pts[i + 1][0] - d, pts[i + 1][1] - t[i + 1] * d, pts[i + 1][0], pts[i + 1][1]]); }
  return out;
}

// A ladder like the panel's: eight stations, a plateau, a steep fall at the liver, a tail (and random ones).
function ladder(w = 1060, h = 640) {
  const P = [28.8, 28.1, 28.0, 27.6, 3.4 * rnd() + 2, 2.4, 1.7, 1.3].map((v) => v + (rnd() - 0.5) * 6);
  return P.map((p, i) => [80 + (w / 8) * (i + 0.5), 20 + h * (1 - Math.max(0, p) / 35)]);
}

// The ideal stroke: every point within half the line width of the curve (round joins and caps), measured on a very
// dense sampling of the cubics. Points within a hundredth of a pixel of the edge are left out of the comparison.
function oracle(pts) {
  const segs = monotoneSegs(pts) || pts.slice(1).map((p, i) => [pts[i][0], pts[i][1], pts[i][0], pts[i][1], p[0], p[1], p[0], p[1]]);
  const xs = [], ys = [];
  for (const [x0, y0, ax, ay, bx, by, x1, y1] of segs) for (let j = 0; j <= 1500; j++) {
    const t = j / 1500, u = 1 - t;
    xs.push(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x1);
    ys.push(u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y1);
  }
  // (In chunks of 60 samples with their boxes, so a far chunk is skipped.)
  const C = 60, boxes = [];
  for (let i = 0; i < xs.length; i += C) {
    const sx = xs.slice(i, i + C), sy = ys.slice(i, i + C);
    boxes.push([i, Math.min(...sx), Math.max(...sx), Math.min(...sy), Math.max(...sy)]);
  }
  return (px, py) => {
    let d = Infinity;
    for (const [i, x0, x1, y0, y1] of boxes) {
      if (Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(y0 - py, 0, py - y1)) >= d) continue;
      for (let j = i; j < Math.min(i + C, xs.length); j++) { const q = Math.hypot(px - xs[j], py - ys[j]); if (q < d) d = q; }
    }
    return d;
  };
}
// The old loop, word for word, with the stroke test passed in.
function oldNear(r, inStroke) {
  let hit = false;
  for (let px = r.x0; px <= r.x1 + 0.1 && !hit; px += Math.min(2, (r.x1 - r.x0) / 2 || 2)) for (let py = r.y0; py <= r.y1 + 0.1 && !hit; py += Math.min(2, (r.y1 - r.y0) / 2 || 2)) hit = inStroke(px, py);
  return hit;
}

test('the ladder curve keeps exactly the control points it was drawn with', () => {
  for (let k = 0; k < 200; k++) {
    const pts = ladder();
    if (k % 7 === 0) pts[3][1] = pts[2][1];   // (a flat span)
    assert.deepEqual(monotoneSegs(pts), oldSegs(pts));
  }
  assert.equal(monotoneSegs([[0, 0], [10, 10]]), null);
});

test('the label tester gives the same answer as testing every point, and rarely asks the browser', () => {
  let asked = 0, points = 0, hits = 0;
  for (let k = 0; k < 4; k++) {
    const pts = ladder(), dist = oracle(pts), near = curveTester(pts);
    for (let j = 0; j < 100; j++) {
      const pad = [2, 4][j % 2], lw = 3 + 2 * pad, hw = lw / 2;
      const tw = 20 + rnd() * 70, th = [12, 16, 18][j % 3];
      // (Boxes near the curve, where the answer is hard, as well as anywhere on the chart.)
      const anchor = pts[Math.floor(rnd() * pts.length)];
      const cx = j % 3 ? anchor[0] + (rnd() - 0.5) * 120 : 60 + rnd() * 1000, cy = j % 3 ? anchor[1] + (rnd() - 0.5) * 60 : 20 + rnd() * 640;
      const r = { x0: cx - tw / 2, x1: cx + tw / 2, y0: cy - th / 2, y1: cy + th / 2 };
      let edge = false;
      const inStroke = (px, py) => { points++; const d = dist(px, py); if (Math.abs(d - hw) < 0.01) edge = true; return d <= hw; };
      const want = oldNear(r, inStroke);
      const got = near(r, lw, (px, py) => { asked++; return dist(px, py) <= hw; });
      if (!edge) assert.equal(got, want, `box ${JSON.stringify(r)} pad ${pad}`);
      if (want) hits++;
    }
  }
  assert.ok(hits > 30, `only ${hits} boxes touched the curve`);
  assert.ok(asked < points * 0.05, `asked the browser ${asked} times for ${points} points`);
});

test('the window of samples is found by bisection, as the old scan found it', () => {
  const a = [0.1, 0.2, 0.2, 0.5, 0.9, 1.3];
  for (const v of [-Infinity, 0, 0.1, 0.15, 0.2, 0.5, 1.3, 2, Infinity]) {
    assert.equal(firstAtOrAbove(a, v), a.findIndex((x) => x >= v) === -1 ? a.length : a.findIndex((x) => x >= v));
    assert.equal(firstAbove(a, v), a.findIndex((x) => x > v) === -1 ? a.length : a.findIndex((x) => x > v));
  }
});

test('HVPG cut-off labels never sit on each other', () => {
  // CSPH 10 at y 100 on a short lane, Can bleed 12 a few pixels above it: the second moves past the first's right end.
  assert.equal(limitLabelX(null, 100.5, 40), 40);
  assert.equal(limitLabelX({ x1: 118, y: 100.5 }, 92.5, 40), 124);
  // Far enough apart, both start at the left.
  assert.equal(limitLabelX({ x1: 118, y: 100.5 }, 70.5, 40), 40);
  const src = read('../src/ui/pressure-time.js');
  assert.match(src, /limitLabelX as labelX/);
  assert.match(src, /labs\.push\(\[label, yy\]\)/, 'the labels are drawn after every dashed line');
});

test('the panel does no layout work it does not need on each frame', () => {
  const charts = read('../src/ui/charts.js');
  assert.doesNotMatch(charts, /isPointInStroke\(path, M\.a \* px \+ M\.e, M\.d \* py \+ M\.f\);\s*\n\s*ctx\.restore\(\); return hit/, 'the old point-by-point loop is back');
  assert.match(charts, /testers\.get\(path\)\(r, 3 \+ 2 \* pad/);
  assert.doesNotMatch(charts, /cv\.offsetParent\) ease\(\)/, 'the glide reads offsetParent every frame again');
  assert.doesNotMatch(charts, /\.textContent = hasArt/, 'the note is rewritten every frame again');
  assert.doesNotMatch(charts, /\.style\.display = (strip|'')/);
});

test('the HVPG trend under the header is never cut with an ellipsis', () => {
  const css = read('../styles/app.css');
  const rule = css.match(/^\.pt-delta \{[^}]*\}/m)[0];
  assert.doesNotMatch(rule, /ellipsis|nowrap/);
  assert.match(rule, /min-width: min-content/);
});

test('a curve with a missing reading leaves every point to the browser', () => {
  const pts = ladder(); pts[3][1] = NaN;
  let n = 0;
  assert.equal(curveTester(pts)({ x0: 0, x1: 10, y0: 0, y1: 10 }, 7, () => { n++; return false; }), false);
  assert.equal(n, 36);
});
