// CH-1 (bible review, 19 Nov 2026): a parameter curve's separately settled sweep points were joined with straight L segments, so a dose-response curve showed
// corners; the course chart already drew a monotone cubic (smooth-path.js). curvePath does the same where x runs one way, and keeps the polyline where it does not.
import test from 'node:test';
import './dom-shim.js';
import assert from 'node:assert/strict';
import { curvePath } from '../src/ui/tool-curve.js';
import { smoothPath } from '../src/ui/smooth-path.js';
import { smoothPath as viaCourse } from '../src/ui/tool-course.js';

test('a curve with x rising is a smooth path through every point, and it never dips under a flat stretch', () => {
  const pts = [[0, 100], [20, 60], [40, 20], [60, 20], [80, 20], [100, 5]];
  const d = curvePath(pts);
  assert.match(d, /^M0 100C/);
  assert.equal((d.match(/C/g) || []).length, pts.length - 1);
  assert.equal(d, smoothPath(pts));
  // (the flat stretch 40 to 80: both control points of its two segments sit at its own height)
  const segs = d.split('C').slice(1).map((s) => s.trim().split(/[ ]/).map(Number));
  for (const i of [2, 3]) assert.equal(segs[i][1], 20, `segment ${i} leaves the flat at its height`);
});

test('x running the other way is still smooth; x that turns back stays a polyline, and two points a line', () => {
  assert.match(curvePath([[100, 5], [60, 20], [20, 60]]), /^M100 5C/);
  assert.equal(curvePath([[0, 0], [10, 10], [5, 20]]), 'M0.0 0.0L10.0 10.0L5.0 20.0');
  assert.equal(curvePath([[0, 0], [10, 10]]), 'M0.0 0.0L10.0 10.0');
  assert.equal(curvePath([]), '');
});

test('the course chart still gets smoothPath from tool-course.js', () => {
  assert.equal(viaCourse, smoothPath);
});
