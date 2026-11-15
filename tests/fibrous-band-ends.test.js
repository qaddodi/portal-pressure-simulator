// The fibrous bands of cirrhosis end in round caps, so where they meet at a portal tract they blend instead of
// ending in flat, clipped-looking cuts (Mohammad, 16 Oct).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandOutline, bandOutlineFlat } from '../src/ui/lobule-look.js';

// A context that records the outline as points (arcs sampled finely).
function recorder() {
  const pts = [];
  return {
    pts,
    beginPath() {}, closePath() {},
    moveTo(x, y) { pts.push([x, y]); }, lineTo(x, y) { pts.push([x, y]); },
    arc(x, y, r, a0, a1, ccw) {
      const span = ccw ? -(((a0 - a1) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)) : (((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));
      for (let i = 0; i <= 32; i++) { const a = a0 + span * i / 32; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
    },
  };
}

test('a band from A to B is rounded past both ends, by half its width there, and never folds back over itself', () => {
  // A straight band along +x from (0, 0) to (100, 0), 10 wide at the start and 4 at the end.
  const n = 10, P = [], N = [], Wd = [];
  for (let i = 0; i <= n; i++) { P.push([10 * i, 0]); N.push([0, 1]); Wd.push(10 - 0.6 * i); }
  const c = recorder();
  bandOutline(c, P, N, Wd, 2);
  const xs = c.pts.map((p) => p[0]), ys = c.pts.map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...xs) - -10) < 1e-6, `start cap reaches ${Math.min(...xs)}, want -10`);
  assert.ok(Math.abs(Math.max(...xs) - 104) < 1e-6, `end cap reaches ${Math.max(...xs)}, want 104`);
  assert.ok(Math.max(...ys) <= 10 + 1e-6 && Math.min(...ys) >= -10 - 1e-6, 'the caps stay within the band\'s own width');
  // The end cap's points all lie at or past the end (it bulges outward, not back into the band).
  const cap = c.pts.slice(n + 1, n + 34);
  assert.ok(cap.every(([x]) => x >= 100 - 1e-6), 'end cap bulges past the end');
  const start = c.pts.slice(-33);
  assert.ok(start.every(([x]) => x <= 1e-6), 'start cap bulges past the start');
});

test('a wide pass narrows to kEnd at its ends: no outer halo round the tract, the same width mid-band', () => {
  const n = 20, P = [], N = [], Wd = [];
  for (let i = 0; i <= n; i++) { P.push([10 * i, 0]); N.push([0, 1]); Wd.push(10); }
  const c = recorder();
  bandOutline(c, P, N, Wd, 2.1, 1.45);
  const xs = c.pts.map((p) => p[0]);
  assert.ok(Math.abs(Math.min(...xs) - -7.25) < 1e-6 && Math.abs(Math.max(...xs) - 207.25) < 1e-6, 'caps as wide as the 1.45 pass');
  assert.ok(Math.abs(c.pts[n >> 1][1] - 10.5) < 1e-6, 'full 2.1 width in the middle');
});


test('bandOutlineFlat (a band kept as flat numbers, made with no array) draws exactly the points bandOutline does', () => {
  const n = 26, P = [], N = [], Wd = [], fP = new Float64Array(2 * (n + 1)), fN = new Float64Array(2 * (n + 1));
  for (let i = 0; i <= n; i++) {
    const x = 7 * i, y = 12 * Math.sin(i / 4), a = i / 9;
    P.push([x, y]); N.push([-Math.sin(a), Math.cos(a)]); Wd.push(3 + Math.sin(i));
    fP[2 * i] = x; fP[2 * i + 1] = y; fN[2 * i] = -Math.sin(a); fN[2 * i + 1] = Math.cos(a);
  }
  for (const [k, kEnd] of [[2, 2], [2.1, 1.45], [1, 1]]) {
    const a = recorder(), b = recorder();
    bandOutline(a, P, N, Wd, k, kEnd); bandOutlineFlat(b, fP, fN, Float64Array.from(Wd), k, kEnd);
    assert.deepEqual(b.pts, a.pts);
  }
});

// The tissue's cross-fade mixes old and new before laying them on the field: drawn one over the other, the see-through
// collagen past the lobule's edge grew denser mid-fade and dropped back after, so it pulsed (Mohammad, 16 Oct).
