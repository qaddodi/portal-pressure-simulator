// N2: the pen's strokes are kept in figure units and laid through the figure's matrix (ink-gl.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { invertInto, scaleOf, newStroke, addPoint, segmentsInto } from '../src/ui/ink-gl.js';

const M = { a: 2, b: 0.5, c: -0.5, d: 2, e: 30, f: -12 };
const apply = (m, x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];

test('invertInto undoes the matrix and refuses a flat one', () => {
  const inv = {};
  assert.ok(invertInto(inv, M));
  const [sx, sy] = apply(M, 7, -3), [x, y] = apply(inv, sx, sy);
  assert.ok(Math.abs(x - 7) < 1e-9 && Math.abs(y + 3) < 1e-9);
  assert.equal(invertInto({}, { a: 0, b: 0, c: 0, d: 0, e: 1, f: 1 }), false);
});

test('addPoint thins points closer than the step and grows its buffer', () => {
  const s = newStroke('w', 1);
  assert.ok(addPoint(s, 0, 0, 1));
  assert.equal(addPoint(s, 0.2, 0.2, 1), false);
  for (let i = 1; i < 200; i++) assert.ok(addPoint(s, i * 2, 0, 1));
  assert.equal(s.n, 200);
  assert.equal(s.pts[2 * 199], 398);
});

test('segmentsInto lays figure points where the matrix puts them, every time the matrix changes', () => {
  const s = newStroke('w', 3);
  [[0, 0], [10, 0], [10, 10]].forEach(([x, y]) => addPoint(s, x, y));
  const out = new Float32Array(5 * 16);
  for (const m of [M, { ...M, e: 100, f: 40 }, { a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0 }]) {
    const n = segmentsInto(out, [s], 'w', m);
    assert.equal(n, 2);
    for (let i = 0; i < 2; i++) {
      const p0 = apply(m, s.pts[2 * i], s.pts[2 * i + 1]), p1 = apply(m, s.pts[2 * i + 2], s.pts[2 * i + 3]);
      assert.ok(Math.abs(out[5 * i] - p0[0]) < 1e-3 && Math.abs(out[5 * i + 1] - p0[1]) < 1e-3);
      assert.ok(Math.abs(out[5 * i + 2] - p1[0]) < 1e-3 && Math.abs(out[5 * i + 3] - p1[1]) < 1e-3);
      assert.ok(Math.abs(out[5 * i + 4] - Math.max(0.75, 3 * scaleOf(m))) < 1e-3);
    }
  }
});

test('a stroke of another view is not laid; a single point is a dot', () => {
  const a = newStroke('w', 2), b = newStroke('l', 2);
  addPoint(a, 1, 1); addPoint(b, 5, 5); addPoint(b, 6, 6);
  const out = new Float32Array(5 * 8);
  assert.equal(segmentsInto(out, [a, b], 'w', M), 1);
  assert.equal(out[0], out[2]);
  assert.equal(segmentsInto(out, [a, b], 'l', M), 1);
  assert.equal(segmentsInto(out, [a, b], 's', M), 0);
});
