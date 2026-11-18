// The marks painter's ear clipping (ear-clip.js): the triangles must cover the polygon exactly, and a thousand-point outline must be quick
// (the first version took 893 ms for one build's outlines, tester 18 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { earClip } from '../src/ui/ear-clip.js';

const polyArea = (P, n) => { let a = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += P[2 * i] * P[2 * j + 1] - P[2 * j] * P[2 * i + 1]; } return Math.abs(a) / 2; };
const triArea = (P, t) => { let s = 0; for (let k = 0; k < t.length; k += 3) { const [a, b, c] = [t[k], t[k + 1], t[k + 2]]; s += Math.abs((P[2 * b] - P[2 * a]) * (P[2 * c + 1] - P[2 * a + 1]) - (P[2 * b + 1] - P[2 * a + 1]) * (P[2 * c] - P[2 * a])) / 2; } return s; };
const star = (n, wob, flip) => { const P = []; for (let i = 0; i < n; i++) { const a = (flip ? -1 : 1) * (i / n) * Math.PI * 2, r = 100 + wob * Math.sin(i * 7.3) * (i % 2 ? 1 : -1); P.push(r * Math.cos(a), r * Math.sin(a)); } return P; };

test('the triangles cover a convex, a concave and a reversed polygon exactly', () => {
  for (const [n, wob, flip] of [[12, 0, false], [40, 30, false], [40, 30, true], [201, 45, false]]) {
    const P = star(n, wob, flip), out = [];
    const sgn = earClip(P, n, out);
    assert.equal(out.length, (n - 2) * 3, `n ${n} wob ${wob}`);
    assert.ok(Math.abs(triArea(P, out) - polyArea(P, n)) < 1e-6 * polyArea(P, n), 'the triangles add up to the polygon');
    assert.equal(sgn, flip ? -1 : 1);
  }
});

test('a rectangle with a notch, and a triangle', () => {
  const out = [];
  const L = [0, 0, 10, 0, 10, 10, 5, 4, 0, 10];
  earClip(L, 5, out);
  assert.equal(out.length, 9);
  assert.ok(Math.abs(triArea(L, out) - polyArea(L, 5)) < 1e-9);
  earClip([0, 0, 1, 0, 0, 1], 3, out);
  assert.deepEqual(out.length, 3);
});

test('a 3000-point wiggly outline is cut in well under a quarter of a second', () => {
  const P = star(3000, 20, false), out = [];
  const t0 = performance.now();
  earClip(P, 3000, out);
  const ms = performance.now() - t0;
  assert.equal(out.length, 2998 * 3);
  assert.ok(ms < 250, `${ms.toFixed(0)} ms`);
});

test('a long thin wavy outline of 12000 points is cut quickly and covers its area', () => {
  // A snake: a sine centre line, 6000 points out along one side and 6000 back along the other.
  const n = 6000, P = [];
  for (let i = 0; i < n; i++) { const x = i * 0.5, y = 40 * Math.sin(i * 0.02); P.push(x, y + 2 + 0.2 * Math.sin(i)); }
  for (let i = n - 1; i >= 0; i--) { const x = i * 0.5, y = 40 * Math.sin(i * 0.02); P.push(x, y - 2 + 0.2 * Math.sin(i * 1.3)); }
  const out = [], t0 = performance.now();
  earClip(P, 2 * n, out);
  const ms = performance.now() - t0;
  assert.equal(out.length, (2 * n - 2) * 3);
  assert.ok(Math.abs(triArea(P, out) - polyArea(P, 2 * n)) < 1e-6 * polyArea(P, 2 * n));
  assert.ok(ms < 300, `${ms.toFixed(0)} ms`);
});
