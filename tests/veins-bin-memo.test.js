import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binVeins } from '../src/ui/veins-bin.js';

// While collaterals coil, one vessel's points change on each model frame and the rest hold still. Binning remembers each
// vessel's cells, so only the moving one is tested again; the result must match a fresh binning entry for entry, and when
// nothing about the geometry changed it must be the very same object, so the figure skips the 4 MB re-upload.
const line = (x, y, n, dx, dy) => Array.from({ length: n }, (_, i) => [x + i * dx, y + i * dy]);
const coil = (t) => Array.from({ length: 40 }, (_, i) => [200 + i * 6, 300 + Math.sin(i * 0.7 + t) * 12 * t]);
const scene = (t, reach = 9) => ({
  tubes: [
    { id: 0, pts: line(10, 10, 30, 8, 3), reach: 14 },
    { id: 1, pts: line(400, 20, 25, -5, 9), reach: 11 },
    { id: 2, pts: coil(t), reach },
  ],
  joins: [{ x: 250, y: 100, reach: 20, k: 0.4, fillet: 1, members: [0, 1] }],
});
const same = (a, b) => {
  assert.equal(a.nEnt, b.nEnt); assert.equal(a.nCells, b.nCells); assert.equal(a.rows, b.rows);
  assert.deepEqual(Array.from(a.ent), Array.from(b.ent));
  assert.deepEqual(Array.from(a.cells), Array.from(b.cells));
};

test('remembered binning matches a fresh one while a vessel coils', () => {
  const memo = new Map();
  for (const [t, reach] of [[0, 9], [0.3, 9], [0.6, 9], [0.6, 12], [0.9, 12]]) {
    const { tubes, joins } = scene(t, reach);
    same(binVeins(tubes, joins, memo), binVeins(tubes, joins));
  }
});

test('the geometry is not rebuilt while nothing about it changed', () => {
  const memo = new Map();
  const a = binVeins(scene(0.5).tubes, scene(0.5).joins, memo);
  assert.equal(binVeins(scene(0.5).tubes, scene(0.5).joins, memo), a, 'same vessels, points, reaches and joins: same result object');
  const moved = binVeins(scene(0.6).tubes, scene(0.6).joins, memo);
  assert.notEqual(moved, a, 'a coiling vessel moved: a new result');
  const j = scene(0.6);
  j.joins[0].k = 0.5;
  assert.notEqual(binVeins(j.tubes, j.joins, memo), moved, 'a join changed: a new result');
  const fewer = scene(0.6);
  fewer.tubes.pop();
  const r = binVeins(fewer.tubes, fewer.joins, memo);
  same(r, binVeins(fewer.tubes, fewer.joins));
});

test('the figure uploads the vessel geometry only when binning gave a new result', async () => {
  const { readFileSync } = await import('node:fs');
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /binVeins\([^;]*, binMemo\);\s*\n\s*if \(bins !== binShown\) \{ binShown = bins; veins\.setGeometry\(bins\); \}/);
});

test('each cell lists its segments in runs of one vessel, each run bounded around its start', async () => {
  const { RUN } = await import('../src/ui/veins-bin.js');
  const b = binVeins(scene(0.4).tubes, scene(0.4).joins);
  let runs = 0;
  for (let c = 0; c < b.nCells; c++) {
    const s0 = b.cells[c * 6 + 2], n = b.cells[c * 6 + 3];
    for (let e = s0; e < s0 + n;) {
      const q0 = e * 8, len = b.ent[q0 + 7], rho = b.ent[q0 + 6];
      assert.ok(len >= 1 && len <= RUN && e + len <= s0 + n, 'a run stays inside its cell');
      for (let k = e; k < e + len; k++) {
        const q = k * 8;
        assert.equal(b.ent[q + 4], b.ent[q0 + 4], 'a run is one vessel');
        if (k > e) assert.equal(b.ent[q + 7], 0, 'only a run\'s first entry carries it');
        for (const [x, y] of [[b.ent[q], b.ent[q + 1]], [b.ent[q + 2], b.ent[q + 3]]]) assert.ok(Math.hypot(x - b.ent[q0], y - b.ent[q0 + 1]) <= rho, 'every point of the run lies within its radius');
      }
      // A run ends at RUN segments or where the vessel changes.
      if (len < RUN && e + len < s0 + n) assert.notEqual(b.ent[(e + len) * 8 + 4], b.ent[q0 + 4]);
      runs++; e += len;
    }
  }
  assert.ok(runs > 0);
});
