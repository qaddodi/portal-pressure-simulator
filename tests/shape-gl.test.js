import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenPath, ellipsePoly, polyBox, polyMesh, insidePoly, innerEdges, SEG } from '../src/ui/shape-gl.js';
import { ORGANS, SEAM_D } from '../src/ui/anatomy.js';

// The GPU's shapes (shape-gl.js) are the SVG's paths cut into chords: every chord end lies on the curve, and every
// point of the curve lies within the tolerance of the chords, so a stroke or fill drawn from them sits where the
// browser draws the path, at any zoom the figure reaches.

const cubicAt = (p0, p1, p2, p3, u) => { const v = 1 - u; return [0, 1].map((j) => v * v * v * p0[j] + 3 * v * v * u * p1[j] + 3 * v * u * u * p2[j] + u * u * u * p3[j]); };
const distToPoly = (pts, x, y, closed) => {
  let best = Infinity;
  const n = pts.length / 2, m = closed ? n : n - 1;
  for (let k = 0; k < m; k++) {
    const j = (k + 1) % n, ax = pts[2 * k], ay = pts[2 * k + 1], bx = pts[2 * j], by = pts[2 * j + 1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, u = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(ax + u * dx - x, ay + u * dy - y));
  }
  return best;
};

test('lines, moves and closes come through as they are, absolute and relative', () => {
  const [a, b] = flattenPath('M10 20 L 30 20 L30 40 Z m 5 5 h 10 v 10 l -10 0');
  assert.equal(a.closed, true);
  assert.deepEqual([...a.pts], [10, 20, 30, 20, 30, 40]);
  // (After a close, a relative move starts from the closed run's start.)
  assert.equal(b.closed, false);
  assert.deepEqual([...b.pts], [15, 25, 25, 25, 25, 35, 15, 35]);
});

test('a closed run that ends on its start drops the repeat', () => {
  const [a] = flattenPath('M0 0 L 10 0 L 10 10 L 0 0 Z');
  assert.deepEqual([...a.pts], [0, 0, 10, 0, 10, 10]);
});

test('a cubic is cut within the tolerance, and its ends are exact', () => {
  const P = [[0, 0], [40, -80], [120, 90], [160, 10]];
  for (const tol of [0.1, 0.01]) {
    const [r] = flattenPath(`M${P[0]} C ${P[1]} ${P[2]} ${P[3]}`, tol);
    const n = r.pts.length / 2;
    assert.deepEqual([r.pts[0], r.pts[1]], [0, 0]);
    assert.ok(Math.abs(r.pts[2 * n - 2] - 160) < 1e-4 && Math.abs(r.pts[2 * n - 1] - 10) < 1e-4);
    for (let i = 0; i <= 400; i++) {
      const [x, y] = cubicAt(...P, i / 400);
      assert.ok(distToPoly(r.pts, x, y, false) <= tol * 1.05, `tol ${tol}: point ${i} off by ${distToPoly(r.pts, x, y, false)}`);
    }
  }
});

test('quadratics (the nodules) and their smooth continuations are cut the same way', () => {
  const [r] = flattenPath('M0 0 Q 50 80 100 0 T 200 0', 0.01);
  for (let i = 0; i <= 200; i++) {
    const u = i / 200, v = 1 - u;
    const q1 = [2 * v * u * 50 + u * u * 100, 2 * v * u * 80];
    const q2 = [100 + 2 * v * u * 50 + u * u * 100, 2 * v * u * -80];
    assert.ok(distToPoly(r.pts, ...q1, false) <= 0.0106);
    assert.ok(distToPoly(r.pts, ...q2, false) <= 0.0106);
  }
});

test('an arc lies on its circle', () => {
  const [r] = flattenPath('M 0 50 A 50 50 0 0 1 100 50', 0.01);
  for (let k = 0; k < r.pts.length; k += 2) assert.ok(Math.abs(Math.hypot(r.pts[k] - 50, r.pts[k + 1] - 50) - 50) < 1e-3);
  assert.ok(Math.min(...r.pts.filter((_, k) => k % 2)) < 0.01, 'the sweep flag takes it over the top');
});

test('every organ outline and the seam flatten into one closed run inside its own box', () => {
  for (const o of ORGANS.filter((q) => q.d && !q.deco && !q.band && !q.art)) {
    const runs = flattenPath(o.d);
    assert.equal(runs.length, 1, o.id);
    assert.equal(runs[0].closed, true, o.id);
  }
  const [seam] = flattenPath(SEAM_D);
  const [x0, y0, x1, y1] = polyBox([seam]);
  assert.ok(x0 > 700 && x1 < 1000 && y0 >= -90 && y1 < 570);
});

test('an ellipse is round within the tolerance', () => {
  const [e] = ellipsePoly(468, 236, 118, 34, 0.01);
  for (let k = 0; k < e.pts.length; k += 2) assert.ok(Math.abs(((e.pts[k] - 468) / 118) ** 2 + ((e.pts[k + 1] - 236) / 34) ** 2 - 1) < 1e-4);
  // Chord midpoints within the tolerance of the curve.
  const n = e.pts.length / 2;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n, mx = (e.pts[2 * k] + e.pts[2 * j]) / 2, my = (e.pts[2 * k + 1] + e.pts[2 * j + 1]) / 2;
    const a = Math.atan2((my - 236) / 34, (mx - 468) / 118), px = 468 + 118 * Math.cos(a), py = 236 + 34 * Math.sin(a);
    assert.ok(Math.hypot(px - mx, py - my) < 0.011);
  }
});

test('a mesh fans each run into triangles that tile it, and lists each edge once with its caps', () => {
  const sq = { pts: new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]), closed: true };
  const line = { pts: new Float32Array([0, 0, 5, 5, 9, 5]), closed: false };
  const m = polyMesh([sq, line], 0);
  // Square: 2 triangles of area 50 each.
  let area = 0;
  for (let k = 0; k < 2 * 6; k += 6) { const [ax, ay, bx, by, cx, cy] = m.tri.slice(k, k + 6); area += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2; }
  assert.equal(area, 100);
  assert.equal(m.nSeg, 4 + 2);
  // The closed run's joints are round; the open run's ends take its cap, its joint is round.
  const caps = []; for (let k = 0; k < m.nSeg; k++) caps.push([m.seg[SEG * k + 4], m.seg[SEG * k + 5]]);
  assert.deepEqual(caps, [[1, 1], [1, 1], [1, 1], [1, 1], [0, 1], [1, 0]]);
});

test('each segment carries the directions of its neighbours, none at an open run\'s ends, and repeated points are skipped', () => {
  // (The stroke's round joints are the browser's wedge outside the turn: drawn as a whole disc, a joint near a butt end whose
  // last segment is shorter than the half width reached past the end, and every small-bowel loop showed round ends.)
  const line = { pts: new Float32Array([0, 0, 2, 0, 2, 0, 2, 3, 4, 3]), closed: false };
  const m = polyMesh([line], 0);
  assert.equal(m.nSeg, 3);
  const row = (k) => Array.from(m.seg.slice(SEG * k, SEG * k + SEG));
  assert.deepEqual(row(0), [0, 0, 2, 0, 0, 1, 0, 0, 0, 3]);
  assert.deepEqual(row(1), [2, 0, 2, 3, 1, 1, 2, 0, 2, 0]);
  assert.deepEqual(row(2), [2, 3, 4, 3, 1, 0, 0, 3, 0, 0]);
  // A closed run wraps round: its first segment's neighbour before is its last.
  const sq = polyMesh([{ pts: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0]), closed: true }], 0);
  assert.equal(sq.nSeg, 4);
  assert.deepEqual(Array.from(sq.seg.slice(6, 10)), [0, -1, 0, 1]);
  // A run of one point keeps its one segment, of no length (a round cap's dot).
  const dot = polyMesh([{ pts: new Float32Array([5, 5, 5, 5]), closed: false }], 1);
  assert.equal(dot.nSeg, 1);
  assert.deepEqual(Array.from(dot.seg.slice(0, 6)), [5, 5, 5, 5, 1, 1]);
});

test('overlapping runs leave out the edges inside each other; touching ones keep theirs', () => {
  const a = { pts: new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]), closed: true };
  const b = { pts: new Float32Array([5, 2, 15, 2, 15, 8, 5, 8]), closed: true };
  const drop = innerEdges([a, b]);
  const m = polyMesh([a, b], 0, drop);
  for (let k = 0; k < m.nSeg; k++) {
    const [ax, ay, bx, by] = m.seg.slice(SEG * k, SEG * k + 4), x = (ax + bx) / 2, y = (ay + by) / 2;
    assert.ok(!(insidePoly(a.pts, x, y) && insidePoly(b.pts, x, y)), `edge ${[ax, ay, bx, by]} lies inside both`);
  }
  // a's right edge (x 10) lies inside b; b's left edge (x 5) inside a: both gone, the other six kept.
  assert.equal(m.nSeg, 6);
});
