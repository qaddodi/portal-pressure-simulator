// The after-meal gut glow lights only the loop edges that show (Mohammad, 20 Oct, Circulation 10/13: the glow had traced the
// loops hidden under the pile too, an orange tangle, and ticked along his drawn outline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { warmVisible, ringGrid, inGrid } from '../src/ui/warm-vis.js';

const line = (x0, y0, x1, y1, step = 4) => { const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / step); return Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); };
const near = (r, x, y) => r.reduce((b, p, i) => (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(r[b][0] - x, r[b][1] - y) ? i : b), 0);

test('a loop drawn over another hides that one\'s edges where it lies on them, and shows its own', () => {
  const under = line(0, 100, 200, 100), over = line(100, 0, 100, 200);
  const [vu, vo] = warmVisible([under, over], 12);
  const k = near(under, 100, 100);
  assert.equal(vu[2 * k], 0); assert.equal(vu[2 * k + 1], 0);
  const far = near(under, 20, 100);
  assert.equal(vu[2 * far], 1); assert.equal(vu[2 * far + 1], 1);
  assert.ok(vo.every((x) => x === 1), 'the top loop shows whole');
});

test('in one tube a later piece covers an earlier one where it crosses back over it, not along its own bend', () => {
  // Out along y 100, round a tight turn, and back across its own start.
  const tube = [...line(0, 100, 200, 100), ...line(200, 100, 200, 130).slice(1), ...line(200, 130, 60, 130).slice(1), ...line(60, 130, 60, 40).slice(1)];
  const [v] = warmVisible([tube], 12);
  const cross = near(tube.slice(0, 60), 60, 100);
  assert.ok(!v[2 * cross] || !v[2 * cross + 1], 'its first stretch is under the last');
  const turn = near(tube, 200, 115);
  assert.ok(v[2 * turn] || v[2 * turn + 1], 'a bend keeps its edges');
});

test('nothing glows outside the organ\'s outline', () => {
  const g = ringGrid([[[0, 0], [100, 0], [100, 100], [0, 100]]]);
  assert.ok(inGrid(g, 50, 50) && !inGrid(g, 150, 50) && !inGrid(g, -5, 50));
  const [v] = warmVisible([line(10, 50, 190, 50)], 10, { inside: (x, y) => inGrid(g, x, y) });
  const r = line(10, 50, 190, 50);
  r.forEach((p, k) => { if (p[0] > 110) assert.equal(v[2 * k] + v[2 * k + 1], 0, `x ${p[0]}`); if (p[0] > 15 && p[0] < 85) assert.equal(v[2 * k] + v[2 * k + 1], 2, `x ${p[0]}`); });
});

test('the stage lights only the edges that show, and an outline\'s glow follows its line across a few points', () => {
  const STAGE = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(STAGE, /const seen = warmVis\(o\.id\);/);
  assert.match(STAGE, /\(vis && !vis\[2 \* \(t < 0\.5 \? i0 : i1\) \+ \(side > 0 \? 1 : 0\)\]\)/);
  assert.match(STAGE, /ringGrid\(olRingsRaw\(id, true\)\)/, 'clipped to the organ\'s own outline');
  assert.match(STAGE, /sp = glow \? Math\.min\(GLOW_SPAN, \(n - 1\) >> 1\) : 1/);
  assert.ok(+/const GLOW_SPAN = (\d+)/.exec(STAGE)[1] >= 3, 'a glow\'s direction spans several points');
});
