import { stageSource } from './stage-src.js';
// A join easing wider (its vessels widening on a slide change) inside its binning circle keeps its cells, so the binning is patched in
// place instead of made again whole: 11 whole binnings and 4 MB uploads each in one Varices slide change (motion budget, 2 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { binVeins } from '../src/ui/veins-bin.js';

const line = (x, y, n, dx, dy) => Array.from({ length: n }, (_, i) => [x + i * dx, y + i * dy]);
const tubes = () => [{ id: 0, pts: line(10, 10, 30, 8, 3), reach: 14 }, { id: 1, pts: line(400, 20, 25, -5, 9), reach: 11 }];
const join = (reach, x = 250, room = true) => ({ x, y: 100, reach, k: 0.4, fillet: 1, members: [0, 1], ...(room ? { binX: 250, binY: 100, binReach: 40 } : {}) });
const same = (a, b) => {
  assert.equal(a.nEnt, b.nEnt); assert.equal(a.nCells, b.nCells); assert.equal(a.rows, b.rows);
  assert.deepEqual(Array.from(a.ent), Array.from(b.ent));
  assert.deepEqual(Array.from(a.cells), Array.from(b.cells));
};

test('a join widening or sliding inside its binning circle is a patch, entry for entry a whole binning of it', () => {
  const memo = new Map();
  binVeins(tubes(), [join(20)], memo);
  for (const [r, x] of [[24, 250], [30, 252], [36, 253]]) {
    const b = binVeins(tubes(), [join(r, x)], memo);
    assert.ok(b.patch, `reach ${r} at ${x}: patched`);
    same(b, binVeins(tubes(), [join(r, x)]));
  }
});

test('without a binning circle a widening join changes its cells and is binned whole, as before', () => {
  const memo = new Map();
  binVeins(tubes(), [join(20, 250, false)], memo);
  const b = binVeins(tubes(), [join(36, 250, false)], memo);
  assert.ok(!b.patch);
});

test('the figure keeps a circle per join while it stays inside', () => {
  const st = stageSource();
  // (A circle is made once, and written in place when a join leaves it: at least half as wide again as the last.)
  assert.match(st, /const out = b && Math\.hypot\(j\.x - b\.x, j\.y - b\.y\) \+ j\.reach > b\.r;\n\s+let c = b;\n\s+if \(!b\) joinBin\.set\(k, c = \{ x: j\.x, y: j\.y, r: Math\.ceil\(Math\.max\(j\.reach \* 1\.5, 0\) \/ 2\) \* 2 \+ 8 \}\);\n\s+else if \(out\) \{ b\.x = j\.x; b\.y = j\.y; b\.r = Math\.ceil\(Math\.max\(j\.reach \* 1\.5, b\.r \* 1\.5\) \/ 2\) \* 2 \+ 8; \}/);
  assert.match(st, /const J = veinJoins\(items\), smooth = smoothRunOn\(items\);\n\s+joinRoom\(J, items\);/);
});
