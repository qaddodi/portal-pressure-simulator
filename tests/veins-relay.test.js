import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binVeins, ENT_W } from '../src/ui/veins-bin.js';

// binVeins with room in its cells' lists (memo.relay): a vessel whose cells changed is written in place, in only the cells it left
// or entered. The lists must hold, cell for cell, what a binning of the same tubes gives.

const line = (x, y, n, dx, dy) => Array.from({ length: n }, (_, i) => [x + i * dx, y + i * dy]);
const scene = (t, dy = 0) => ({
  tubes: [
    { id: 0, pts: line(10, 40, 40, 9, 2), reach: 22, core: 6 },
    { id: 1, pts: line(30, 120, 40, 8, -3), reach: 22, core: 6 },
    { id: 2, pts: line(20 + t * 1.7, 70 + dy + Math.sin(t * 0.4) * 6, 40, 8.5, 0.5), reach: 22, core: 6 },
    { id: 3, pts: line(200, 20, 20, 0, 9), reach: 18, core: 5 },
  ],
  joins: [{ x: 120, y: 70, reach: 24, k: 0.4, fillet: 1, members: [0, 2] }],
});

// A binning as its cells list it: per cell (by origin) its entries and its joins' entries, read through the cell records.
function content(b) {
  const out = new Map();
  for (let c = 0; c < b.nCells; c++) {
    const [x, y, s0, n, j0, jn] = Array.from(b.cells.subarray(c * 6, c * 6 + 6));
    const take = (a, k) => Array.from(b.ent.subarray(a * 8, (a + k) * 8));
    out.set(`${x},${y}`, { n, jn, segs: take(s0, n), joins: take(j0, jn) });
  }
  // (The blood's squares are drawn from their origins alone: the other four floats of a row are where its cell's list was.)
  const origins = (a, n) => Array.from({ length: n }, (_, k) => [a[k * 6], a[k * 6 + 1]]);
  return { cells: out, nCells: b.nCells, nBlood: b.nBlood, blood: origins(b.blood, b.nBlood), nBloodQ: b.nBloodQ, bloodQ: origins(b.bloodQ, b.nBloodQ) };
}
const same = (a, b, msg) => assert.deepEqual(content(a), content(b), msg);

test('lists written in place match a fresh binning, cell for cell, while a vessel wanders across cells', () => {
  const memo = new Map(); memo.relay = true;
  let relays = 0, fulls = 0;
  for (let t = 0; t <= 80; t++) {
    const { tubes, joins } = scene(t);
    const r = binVeins(tubes, joins, memo), f = binVeins(...Object.values(scene(t)));
    same(r, f, `step ${t}`);
    if (r.patchCells?.length) relays++; else if (!r.patch) fulls++;
  }
  assert.ok(relays >= 3, `the cells were written in place at least a few times (${relays} of 81, ${fulls} whole)`);
});

test('a later move of the points alone still lands in the right entries after cells were written in place', () => {
  const memo = new Map(); memo.relay = true;
  binVeins(...Object.values(scene(0)), memo);
  let relays = 0;
  for (let t = 1; t <= 60; t++) {
    // (Two steps of the cells' change, then four of points alone: the places the patches write to must have been kept right.)
    const tt = t % 6 < 2 ? t : Math.floor(t / 6) * 6 + 2 + (t % 6) * 0.001;
    const r = binVeins(...Object.values(scene(tt)), memo);
    same(r, binVeins(...Object.values(scene(tt))), `step ${t}`);
    if (r.patchCells?.length) relays++;
  }
  assert.ok(relays >= 1);
});

test('without relay the layout is exactly what it was: no room in the lists, no cell patches', () => {
  const memo = new Map();
  for (let t = 0; t < 30; t++) {
    const r = binVeins(...Object.values(scene(t)), memo), f = binVeins(...Object.values(scene(t)));
    assert.deepEqual(Array.from(r.ent), Array.from(f.ent));
    assert.deepEqual(Array.from(r.cells), Array.from(f.cells));
    assert.ok(!r.patchCells?.length);
  }
});

test('a cell that would be left with nothing, or has no room, is binned whole', () => {
  const memo = new Map(); memo.relay = true;
  binVeins(...Object.values(scene(0)), memo);
  // A jump of the wandering vessel to another place: cells it never listed, so no record: whole.
  const far = scene(0, 300);
  const r = binVeins(far.tubes, far.joins, memo);
  assert.ok(!r.patchCells?.length);
  same(r, binVeins(...Object.values(scene(0, 300))));
  assert.ok(ENT_W > 0);
});

// A seeded random walk of several vessels (some with a core, some without), reaches growing and shrinking, joins moving: every
// step must match a fresh binning, whichever way it was reached (whole, points alone, or written in place).
test('a random walk of vessels, reaches and joins always matches a fresh binning', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const V = Array.from({ length: 6 }, (_, i) => ({ id: i, x: 20 + (i % 3) * 140, y: 30 + Math.floor(i / 3) * 120, dx: 7 + rnd() * 3, dy: (rnd() - 0.5) * 6, reach: 16 + rnd() * 6, core: i % 3 === 2 ? null : 4 + rnd() * 3 }));
  const memo = new Map(); memo.relay = true;
  let relays = 0;
  for (let step = 0; step < 250; step++) {
    // (Mostly small moves of one or two vessels, now and then a bigger one.)
    for (let k = 0; k < 1 + (rnd() < 0.3); k++) {
      const v = V[(rnd() * V.length) | 0];
      const big = rnd() < 0.05;
      v.x += (rnd() - 0.5) * (big ? 60 : 3); v.y += (rnd() - 0.5) * (big ? 60 : 3);
      if (rnd() < 0.2) v.reach = Math.max(10, v.reach + (rnd() - 0.5) * 4);
    }
    const tubes = V.map((v) => ({ id: v.id, reach: v.reach, core: v.core, pts: line(v.x, v.y, 30, v.dx, v.dy) }));
    const joins = [{ x: 70 + (step % 7), y: 60, reach: 22, k: 0.4, fillet: 1, members: [0, 3] }];
    const r = binVeins(tubes, joins, memo);
    same(r, binVeins(tubes, joins), `step ${step}`);
    if (r.patchCells?.length) relays++;
  }
  assert.ok(relays >= 5, `written in place ${relays} times`);
});

test('the figure opts in, and the renderer draws the written cells again whole', async () => {
  const { readFileSync } = await import('node:fs');
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(stage, /binMemo\.relay = !\/\[\?&\]relay=0\\b\/\.test\(location\.search\);/);
  assert.match(gl, /for \(const c of bins\.patchCells\) if \(!patchMark\[c\]\) \{ patchMark\[c\] = 1; patchK\+\+; \}\n\s+rowCells = null;\n\s+uploadCells\(\);/);
  assert.match(gl, /if \(bins\.patchBlood\) uploadBlood\(bins\);/);
});
