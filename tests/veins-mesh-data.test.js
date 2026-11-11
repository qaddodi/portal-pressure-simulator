import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TIERS, F_SHADOW, TUBE_FLOATS, pointsFromEntries, joinEntryList, tierBuckets, patchesByTier } from '../src/ui/veins-mesh-data.js';
import { N_SAMPLES, N_QUADS, patchInstances } from '../src/ui/veins-mesh.js';
import { ENT_W } from '../src/ui/veins-bin.js';
import { binSwept, writePoints } from '../src/ui/veins-sweep.js';

// The mesh renderer's data builders (the deleted docs/veins-mesh-plan.md): pure JS, hand-built inputs, plus one round trip through the real binning.

const pt = (row, i) => [row * 10 + i * 0.5, row * 3 - i * 0.25];   // exactly representable in float32
const pointsOf = (row) => Array.from({ length: N_SAMPLES }, (_, i) => pt(row, i));
const at = (row, i) => (row * (N_SAMPLES / 2) + (i >> 1)) * 4 + (i & 1) * 2;

/** Entries of a hand-built binning: heads and segments, 8 floats each. list: [[row, seg | -1 for a head]]. */
function entries(list, nEntMax = list.length + 4) {
  const ent = new Float32Array(nEntMax * 8);
  list.forEach(([row, seg], e) => {
    ent[e * 8 + 4] = row; ent[e * 8 + 5] = seg;
    if (seg >= 0) { const a = pt(row, seg), b = pt(row, seg + 1); ent[e * 8] = a[0]; ent[e * 8 + 1] = a[1]; ent[e * 8 + 2] = b[0]; ent[e * 8 + 3] = b[1]; }
  });
  return ent;
}
const cellRec = (...c) => Float32Array.from(c.flatMap(([x, y, s, n, j, jn]) => [x, y, s, n, j, jn]));

test('pointsFromEntries: a vessel in two cells (duplicates), a row without entries, a partial row', () => {
  const list = [];
  const cellA = list.length; list.push([0, -1]); for (let i = 0; i <= 40; i++) list.push([0, i]);
  list.push([2, -1], [2, 5], [2, 6]);
  const nA = list.length - cellA;
  const cellB = list.length; list.push([0, -1]); for (let i = 30; i < N_QUADS; i++) list.push([0, i]);   // segments 30..40 sit in both cells
  const nB = list.length - cellB;
  const ent = entries(list), cells = cellRec([0, 0, cellA, nA, 0, 0], [16, 0, cellB, nB, 0, 0]);
  const out = {};
  const r = pointsFromEntries(ent, cells, 2, 3, out);
  assert.equal(r, out);
  assert.equal(out.rows, 1);
  assert.equal(out.pts.length % (ENT_W * 4), 0);
  assert.deepEqual(Array.from(out.on.subarray(0, 3)), [1, 0, 1]);
  assert.equal(out.missing, 1, 'row 2 has two of its segments');
  const want = new Float32Array(out.pts.length);
  writePoints(want, 0, N_SAMPLES, 0, pointsOf(0));
  for (let i = 0; i < N_SAMPLES; i++) {
    assert.equal(out.pts[at(0, i)], want[at(0, i)], `row 0 point ${i} x`);
    assert.equal(out.pts[at(0, i) + 1], want[at(0, i) + 1], `row 0 point ${i} y`);
  }
  // row 1 has no entries at all: nothing written, off, not counted as missing
  for (let k = at(1, 0); k < at(2, 0); k++) assert.equal(out.pts[k], 0);
  // row 2: points 5, 6 (segment 5 gives 5 and 6) and 7 (segment 6 gives 6 and 7)
  for (let i = 0; i < N_SAMPLES; i++) {
    const has = i >= 5 && i <= 7;
    assert.equal(out.pts[at(2, i)], has ? pt(2, i)[0] : 0, `row 2 point ${i}`);
    assert.equal(out.pts[at(2, i) + 1], has ? pt(2, i)[1] : 0);
  }
});

test('pointsFromEntries: heads are skipped, a stale buffer is cleared, and a big row count spans texture rows', () => {
  const nTubes = 80;   // 80 * 32 texels > ENT_W
  const out = {};
  const ent1 = entries([[3, -1], [3, 0]]);
  pointsFromEntries(ent1, cellRec([0, 0, 0, 2, 0, 0]), 1, nTubes, out);
  assert.equal(out.rows, Math.ceil((nTubes * 32) / ENT_W));
  assert.equal(out.rows, 2);
  assert.equal(out.on[3], 1);
  assert.equal(out.pts[at(3, 0)], pt(3, 0)[0]);
  const ptsBefore = out.pts;
  pointsFromEntries(entries([[7, -1], [7, 1]]), cellRec([0, 0, 0, 2, 0, 0]), 1, nTubes, out);
  assert.equal(out.pts, ptsBefore, 'the buffer is kept');
  assert.equal(out.on[3], 0, 'last call cleared');
  assert.equal(out.pts[at(3, 0)], 0);
  assert.equal(out.on[7], 1);
  assert.equal(out.pts[at(7, 1)], pt(7, 1)[0]);
  assert.equal(out.missing, 1);
});

test('pointsFromEntries: the real binning gives back the points writePoints lays', () => {
  const tubes = [], P = [];
  for (let r = 0; r < 5; r++) {
    const pts = Array.from({ length: N_SAMPLES }, (_, i) => [r * 5 + i * 3, 40 + r * 7 + Math.sin(i / 5) * 10]);   // long: crosses many 16-unit cells
    P.push(pts); tubes.push({ id: r, path: [pts], reach: 3, core: null });
  }
  const b = binSwept(tubes, [], { rows: 5, samples: N_SAMPLES });
  assert.ok(b.nCells > 20);
  const out = {};
  pointsFromEntries(b.ent, b.cells, b.nCells, 5, out);
  const want = new Float32Array(out.pts.length);
  P.forEach((pts, r) => writePoints(want, 0, N_SAMPLES, r, pts));
  assert.equal(out.missing, 0);
  assert.deepEqual(Array.from(out.on.subarray(0, 5)), [1, 1, 1, 1, 1]);
  assert.deepEqual(out.pts, want);
});

test('joinEntryList: every entry of every cell\'s join range, the count in out.n', () => {
  const cells = cellRec([0, 0, 0, 3, 3, 2], [16, 0, 5, 2, 10, 0], [32, 0, 7, 1, 20, 3], [0, 16, 8, 1, 40, 1]);
  const out = {};
  const v = joinEntryList(cells, 4, out);
  assert.deepEqual(Array.from(v), [3, 4, 20, 21, 22, 40]);
  assert.equal(out.n, 6);
  assert.ok(v instanceof Int32Array);
  const list = out.list;
  const v2 = joinEntryList(cells, 3, out);
  assert.deepEqual(Array.from(v2), [3, 4, 20, 21, 22]);
  assert.equal(out.n, 5);
  assert.equal(out.list, list, 'the list is kept when it is big enough');
  joinEntryList(cells, 0, out);
  assert.equal(out.n, 0);
  assert.equal(out.view.length, 0);
});

/** A tube attribute array of rows: [{ tier, z, flags, alpha, glow, glowW, sel }]. */
function tubeOf(rows) {
  const a = new Float32Array(rows.length * TUBE_FLOATS);
  rows.forEach((t, r) => {
    const o = r * TUBE_FLOATS;
    a[o + 7] = t.alpha ?? 1; a[o + 8] = t.tier ?? 0; a[o + 9] = t.z ?? 0; a[o + 10] = t.flags ?? 0;
    a[o + 43] = t.glow ?? 0; a[o + 47] = t.glowW ?? 1; a[o + 48] = t.sel ?? 0;
  });
  return a;
}

test('tierBuckets: grouped by tier, ascending; off and alpha-0 rows skipped; the per-tier flags', () => {
  const tube = tubeOf([
    { tier: 5, flags: F_SHADOW | 2 },            // 0
    { tier: 2, glow: 0.7, glowW: 1 },            // 1
    { tier: 5, alpha: 0, glow: 1, sel: 1 },      // 2: alpha 0, leaves no mark
    { tier: 2, sel: 0.4, glowW: 1.3 },           // 3
    { tier: 9, glow: 0.5, glowW: 8 },            // 4: an "up" glow
    { tier: 7, flags: F_SHADOW },                // 5: off
    { tier: 5 },                                 // 6
    { tier: 19, glow: 0.2, glowW: 0 },           // 7: the top tier
    { tier: 9, glow: 0 , glowW: 9 },             // 8: no glow amount, so not up either
  ]);
  const on = Uint8Array.from([1, 1, 1, 1, 1, 0, 1, 1, 1]);
  const out = {};
  tierBuckets(tube, on, 9, out);
  assert.equal(out.n, 7);
  assert.deepEqual(Array.from(out.rows.subarray(0, out.n)), [1, 3, 0, 6, 4, 8, 7]);
  const s = (t) => [out.start[t], out.count[t]];
  assert.deepEqual(s(2), [0, 2]);
  assert.deepEqual(s(5), [2, 2]);
  assert.deepEqual(s(7), [4, 0]);
  assert.deepEqual(s(9), [4, 2]);
  assert.deepEqual(s(19), [6, 1]);
  assert.deepEqual(s(0), [0, 0]);
  assert.equal(out.start.length, MAX_TIERS);
  const pick = (a) => Array.from({ length: MAX_TIERS }, (_, t) => t).filter((t) => a[t]);
  assert.deepEqual(pick(out.lit), [2, 19]);
  assert.deepEqual(pick(out.litUp), [9]);
  assert.deepEqual(pick(out.sel), [2]);
  assert.deepEqual(pick(out.shadow), [5]);
  // a second call with other data resets everything and keeps the buffers
  const rowsBuf = out.rows;
  tierBuckets(tubeOf([{ tier: 1 }, { tier: 1 }]), Uint8Array.from([1, 1]), 2, out);
  assert.equal(out.rows, rowsBuf);
  assert.equal(out.n, 2);
  assert.deepEqual(Array.from(out.rows.subarray(0, 2)), [0, 1]);
  assert.deepEqual([out.start[1], out.count[1], out.count[2], out.count[19]], [0, 2, 0, 0]);
  assert.deepEqual(pick(out.lit), []);
  assert.deepEqual(pick(out.shadow), []);
});

test('patchesByTier: a patch is copied into each tier it has a member in', () => {
  const tube = tubeOf([{ tier: 2 }, { tier: 5 }, { tier: 5 }, { tier: 8 }]);
  const entry = (members, x) => [x, 0, 6, 150, ...members];
  const joinEntries = Float32Array.from([
    ...entry([0, 1, -1, -1], 1),          // tiers 2 and 5: two copies
    ...entry([1, 2.25, -1, -1], 2),       // two members in tier 5 (row 2 marked as trunk): once
    ...entry([3, -1, -1, -1], 3),         // tier 8 only
    ...entry([-1, -1, -1, -1], 4),        // no member: dropped by patchInstances
    ...entry([2.375, 0, -1, -1], 5),      // trunk at a fork (row 2) with row 0: tiers 5 and 2
  ]);
  const { data, count } = patchInstances(joinEntries, 1);
  assert.equal(count, 4);
  const out = {};
  patchesByTier(data, count, tube, out);
  assert.equal(out.n, 6);
  assert.deepEqual([2, 5, 8].map((t) => [out.start[t], out.count[t]]), [[0, 2], [2, 3], [5, 1]]);
  const xs = (t) => Array.from({ length: out.count[t] }, (_, k) => out.data[(out.start[t] + k) * 8]);
  assert.deepEqual(xs(2), [1, 5]);
  assert.deepEqual(xs(5), [1, 2, 5]);
  assert.deepEqual(xs(8), [3]);
  // each copy is the whole patch: the reach with its pad, the blend width, the member values
  const k = out.start[5] + 1;
  assert.deepEqual(Array.from(out.data.subarray(k * 8, k * 8 + 8)), [2, 0, 7, 150, 1, 2.25, -1, -1]);
  assert.equal(out.count[0], 0);
  assert.equal(out.start[19], 6);
  // a smaller second call keeps the buffer and rewrites the counts
  const buf = out.data;
  patchesByTier(data, 1, tube, out);
  assert.equal(out.data, buf);
  assert.equal(out.n, 2);
  assert.deepEqual([out.count[2], out.count[5], out.count[8]], [1, 1, 0]);
});

test('patchesByTier: members outside the tube array are ignored', () => {
  const tube = tubeOf([{ tier: 3 }]);
  const data = Float32Array.from([0, 0, 5, 100, 0, 9, -1, -1]);
  const out = {};
  patchesByTier(data, 1, tube, out);
  assert.equal(out.n, 1);
  assert.equal(out.count[3], 1);
});

test('patchGroups: joins sharing a vessel with overlapping reaches are one patch (the hepatic veins on the cava), others stay apart', async () => {
  const { patchGroups, PG_W, PG_M } = await import('../src/ui/veins-mesh-data.js');
  // Entries: three hepatic joins on the cava (rows 10 above, 11 below), close together; one far join of other vessels; a repeat.
  const J = [
    [0, 0, 5, 300.5, 1, 10, 11.25, -1],
    [0, 4, 5, 300.5, 2, 10, 11.25, -1],
    [0, -4, 5, 300.5, 3, 10.25, 11, -1],
    [100, 100, 5, 300.5, 20, 21, -1, -1],
    [0, 0, 5, 300.5, 1, 10, 11.25, -1],
    [50, 50, 0, 300.5, 30, 31, -1, -1],   // (no reach: left out)
  ];
  const ent = new Float32Array(J.flat());
  const out = patchGroups(ent, [0, 1, 2, 3, 4, 5], {});
  assert.equal(out.count, 2);
  assert.equal(out.j.length, 4 * 8, 'four joins kept, the repeat and the reachless one left out');
  const g0 = out.data.subarray(0, PG_W), rows = [...g0.subarray(4, 4 + PG_M)].filter((r) => r >= 0).sort((a, b) => a - b);
  assert.deepEqual(rows, [1, 2, 3, 10, 11], 'one patch holds the three veins and the cava');
  assert.equal(g0[13], 3, 'with its three joins');
  assert.deepEqual([g0[0], g0[1], g0[2]], [0, 0, 9], 'its box: every join\'s reach');
  const g1 = out.data.subarray(PG_W, 2 * PG_W);
  assert.equal(g1[12], 3); assert.equal(g1[13], 1);
  assert.deepEqual([...out.j.subarray(24, 32)], J[3], 'a join\'s entry as the binning holds it');
});
