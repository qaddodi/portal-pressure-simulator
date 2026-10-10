import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../src/ui/circuit-router.js';

const octilinear = (pts) => pts.slice(1).every(([x, y], i) => {
  const dx = Math.abs(x - pts[i][0]), dy = Math.abs(y - pts[i][1]);
  return dx < 7 || dy < 7 || Math.abs(dx - dy) < 7;   // ends may snap a few units onto the grid
});

test('a custom shunt runs only horizontally, vertically or at 45°', () => {
  const r = createRouter({ lines: [], stations: [], bounds: [0, 0, 600, 400] });
  const pts = r.route([40, 300], [500, 80]);
  assert.ok(pts && octilinear(pts));
  assert.deepEqual(pts[0], [40, 300]);
  assert.deepEqual(pts.at(-1), [500, 80]);
});

test('a custom shunt never runs along another line, and crosses it square', () => {
  // A horizontal line right across the middle; the shunt must cross it, not follow it.
  const wall = Array.from({ length: 61 }, (_, i) => [i * 10, 200]);
  const r = createRouter({ lines: [wall], stations: [], bounds: [0, 0, 600, 400] });
  const pts = r.route([100, 100], [500, 300]);
  assert.ok(pts && octilinear(pts));
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if ((ay - 200) * (by - 200) < 0) assert.ok(Math.abs(ax - bx) < 1, 'crosses the line vertically');
    if (Math.abs(ay - by) < 1) assert.ok(Math.abs(ay - 200) >= 30, 'keeps a lane clear of the line');
  }
});

test('a second custom shunt does not cross the first', () => {
  const r = createRouter({ lines: [], stations: [], bounds: [0, 0, 600, 400] });
  const a = r.route([100, 200], [500, 200]);
  r.addLine(a.flatMap((p, i) => (i ? Array.from({ length: 20 }, (_, k) => [a[i - 1][0] + ((p[0] - a[i - 1][0]) * k) / 19, a[i - 1][1] + ((p[1] - a[i - 1][1]) * k) / 19]) : [])), true);
  const b = r.route([300, 60], [300, 340]);
  assert.ok(b);
  const ys = b.map((p) => p[1]);
  assert.ok(Math.max(...ys) < 200 || Math.min(...ys) > 200 || b.some((p) => p[0] < 100 || p[0] > 500), 'goes round, not across');
});
