// The vector renderer's short runs and their per-contribution bounds (src/ui/vec-runs.js, workstream A; plan revision 1 sections 2.1, 2.2).
// Part 1 on made scenes (fast): runs are never widened over a gap, a join's required runs are a list, each material change rebuilds exactly the rows it should.
// Part 2 on the real anatomy (every preset, with glow, selection and shadow put on some rows, and the lobule): the bounds are conservative (every point
// within a contribution's true reach of a vessel lies inside its run's bound for that contribution, sampled densely) and no looser than the reach plus the sagitta.
import { bootAnatomy, taps } from './vec-anatomy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { binVeins } from '../src/ui/veins-bin.js';
import { N_SAMPLES, N_QUADS } from '../src/ui/veins-mesh.js';
import { F_SHADOW } from '../src/ui/veins-mesh-data.js';
import { PRESETS } from '../src/engine/scenario.js';
import {
  RUN_SEGS, RUNS_PER_ROW, RUN_TEXELS, C_LUMEN, C_SHADOW, C_GLOW, C_RING, BOUND_HEADROOM, REACH_RING, REACH_SHADOW_BLUR, REACH_SHADOW_OFF, REACH_AA, REACH_GLOW,
} from '../src/ui/vec-contract.js';
import { createVecGraph, TUBE_FLOATS, A_CASING, A_GLOW, A_GLOW_W, A_SEL, A_FLAGS, A_HOVER } from '../src/ui/vec-graph.js';
import { createRuns, glowReachOf } from '../src/ui/vec-runs.js';

const NS = N_SAMPLES;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0; return Math.hypot(ax + t * dx - px, ay + t * dy - py); };

// ── Part 1: made scenes ──
const line = (x, y, dx, dy) => Array.from({ length: NS }, (_, i) => [x + i * dx, y + i * dy]);
const curve = (x, y) => Array.from({ length: NS }, (_, i) => [x + i * 6, y + 30 * Math.sin(i / 5)]);
function made(opts = {}) {
  const tubes = [{ id: 0, pts: line(10, 10, 4, 1.5), reach: 14 }, { id: 1, pts: curve(0, 150), reach: 14 }, { id: 2, pts: line(400, 20, -3, 2.5), reach: 11 }];
  const bins = binVeins(tubes, [{ x: 250, y: 100, reach: 20, k: 0.4, fillet: 0.5, members: [0, 2] }]);
  const g = createVecGraph();
  g.fromBins(bins, 3);
  const tube = new Float32Array(3 * TUBE_FLOATS), ra = new Float32Array(3 * NS * 4);
  for (let i = 0; i < 3 * NS; i++) ra[i * 4] = 4;
  g.attrs(tube); g.radii(ra);
  if (opts.gap) for (let i = 8; i < 12; i++) g.seg[1 * N_QUADS + i] = 0;   // run 2 of row 1 not in the binning
  return { g, tube, ra, R: createRuns(g).build() };
}
const rowsOf = (R, n) => [...R.changed.subarray(0, n)].map((id) => Math.floor(id / RUNS_PER_ROW));

test('runs: 4 segments each, 16 a row, ids row · 16 + k, the last run shorter; bounds present only where the contribution applies', () => {
  const { R } = made();
  for (let r = 0; r < 3; r++) {
    const ids = R.runsOf(r);
    assert.equal(ids.length, RUNS_PER_ROW);
    ids.forEach((id, k) => { assert.equal(id, r * RUNS_PER_ROW + k); });
    assert.equal(R.seg[ids[0] * 2], 0); assert.equal(R.seg[ids[0] * 2 + 1], RUN_SEGS - 1);
    assert.equal(R.seg[ids[15] * 2 + 1], N_QUADS - 1, 'the last run ends at the last segment (3 segments)');
    for (const id of ids) {
      const b = R.boundOf(id, C_LUMEN); assert.ok(b && b.r > 4 * BOUND_HEADROOM);
      assert.equal(R.boundOf(id, C_SHADOW), null, 'no shadow flag: no shadow bound'); assert.equal(R.boundOf(id, C_GLOW), null); assert.equal(R.boundOf(id, C_RING), null);
    }
  }
  assert.equal(RUN_TEXELS, 4);
});

test('two separate pieces of a vessel are two runs, and no interval is widened over the gap between them', () => {
  const { R } = made({ gap: true });
  const ids = [...R.runsOf(1)];
  assert.equal(ids.length, RUNS_PER_ROW - 1);
  assert.ok(!ids.includes(1 * RUNS_PER_ROW + 2), 'the run with no segment in the binning is left out');
  assert.ok(ids.includes(1 * RUNS_PER_ROW + 1) && ids.includes(1 * RUNS_PER_ROW + 3));
  for (const id of ids) assert.ok(R.seg[id * 2 + 1] - R.seg[id * 2] + 1 <= RUN_SEGS, 'no run holds more than RUN_SEGS segments');
  // the two pieces' chords are where their own segments are, not joined across the gap
  const a = R.boundOf(1 * RUNS_PER_ROW + 1, C_LUMEN), b = R.boundOf(1 * RUNS_PER_ROW + 3, C_LUMEN);
  assert.ok(Math.hypot(a.bx - b.ax, a.by - b.ay) > 20, 'the gap lies between them');
});

test('a join\'s required runs are a list of the member runs its disc reaches, not an interval', () => {
  const { R, g } = made();
  const J = g.joins;
  const disc = R.joinDisc(0), list = [...R.joinRunsOf(0)];
  assert.equal(disc.x, 250); assert.equal(disc.y, 100); assert.ok(disc.r >= (J.reach[0] + J.k[0]));
  const want = [];
  for (let m = 0; m < 4; m++) {
    const row = J.mem[m];
    if (row < 0) continue;
    for (const id of R.runsOf(row)) { const o = id * 4; if (segDist(disc.x, disc.y, R.chord[o], R.chord[o + 1], R.chord[o + 2], R.chord[o + 3]) <= disc.r + R.rad[o]) want.push(id); }
  }
  assert.deepEqual(list.sort((a, b) => a - b), want.sort((a, b) => a - b));
  assert.ok(list.length > 0 && list.length < 2 * RUNS_PER_ROW, `${list.length} required runs of the 32 the members have`);
  for (const id of list) assert.ok([0, 2].includes(Math.floor(id / RUNS_PER_ROW)), 'only a member\'s runs');
  const out = {}; R.packJoins(out);
  assert.equal(out.count, 1); assert.equal(out.data[0], 250); assert.equal(out.data[4], 0); assert.equal(out.data[5], 2); assert.equal(out.data[6], -1);
});

test('invalidation: a radius inside BOUND_HEADROOM, a colour, a hover, a pressure: no rebuild', () => {
  const { R, g, tube, ra } = made();
  const list = new Int32Array(8);
  assert.equal(R.pastRows(list), 0);
  for (let i = 0; i < NS; i++) ra[(1 * NS + i) * 4] = 4 * BOUND_HEADROOM - 0.01;   // inside
  g.radii(ra);
  assert.equal(R.pastRows(list), 0, 'a radius inside the headroom');
  for (let i = 0; i < NS; i++) ra[(1 * NS + i) * 4] = 2;                            // narrower
  g.radii(ra);
  assert.equal(R.pastRows(list), 0, 'a narrower radius');
  for (let f = 0; f < 3; f++) tube[0 * TUBE_FLOATS + f] = 0.5;                       // a lumen colour
  tube[1 * TUBE_FLOATS + A_HOVER] = 1;                                              // the hover
  tube[2 * TUBE_FLOATS + A_FLAGS - 1] = 0;
  g.attrs(tube);
  assert.equal(R.pastRows(list), 0, 'a colour or a hover moves no bound');
});

for (const [what, apply, rows] of [
  ['a radius past BOUND_HEADROOM', (c) => { for (let i = 0; i < NS; i++) c.ra[(1 * NS + i) * 4] = 4 * BOUND_HEADROOM + 0.5; c.g.radii(c.ra); }, [1]],
  ['one sample\'s radius past it', (c) => { c.ra[(2 * NS + 30) * 4] = 9; c.g.radii(c.ra); }, [2]],
  ['a casing change', (c) => { c.tube[0 * TUBE_FLOATS + A_CASING] = 1.5; c.g.attrs(c.tube); }, [0]],
  ['glow on', (c) => { c.tube[1 * TUBE_FLOATS + A_GLOW] = 1; c.g.attrs(c.tube); }, [1]],
  ['selection on', (c) => { c.tube[2 * TUBE_FLOATS + A_SEL] = 1; c.g.attrs(c.tube); }, [2]],
  ['the shadow flag', (c) => { c.tube[0 * TUBE_FLOATS + A_FLAGS] = F_SHADOW; c.g.attrs(c.tube); }, [0]],
]) {
  test(`invalidation: ${what} rebuilds exactly row${rows.length > 1 ? 's' : ''} ${rows.join(', ')}, and only that row's runs change`, () => {
    const c = made();
    const list = new Int32Array(8);
    apply(c);
    const n = c.R.pastRows(list);
    assert.deepEqual([...list.subarray(0, n)], rows);
    const k = c.R.rebuildRows(list, n);
    assert.ok(k > 0, 'some runs changed');
    for (const r of rowsOf(c.R, k)) assert.ok(rows.includes(r), `row ${r} was not asked for`);
    assert.equal(c.R.pastRows(list), 0, 'after the rebuild nothing is past');
  });
}

test('invalidation: glow wider and glow off, selection off: each rebuilds its row once, and the bounds follow', () => {
  const c = made(), list = new Int32Array(8), run = 1 * RUNS_PER_ROW + 5;
  c.tube[1 * TUBE_FLOATS + A_GLOW] = 1; c.g.attrs(c.tube); c.R.rebuildRows(Int32Array.of(1));
  const narrow = c.R.boundOf(run, C_GLOW).r;
  c.tube[1 * TUBE_FLOATS + A_GLOW_W] = 1.3; c.g.attrs(c.tube);
  assert.deepEqual([...list.subarray(0, c.R.pastRows(list))], [1]);
  c.R.rebuildRows(Int32Array.of(1));
  assert.ok(c.R.boundOf(run, C_GLOW).r > narrow + 3, 'a wider glow, a wider bound');
  assert.ok(Math.abs(glowReachOf(c.g.rows[1]) - REACH_GLOW) < 1e-6);
  c.tube[1 * TUBE_FLOATS + A_GLOW] = 0; c.g.attrs(c.tube);
  assert.equal(c.R.pastRows(list), 1); c.R.rebuildRows(Int32Array.of(1));
  assert.equal(c.R.boundOf(run, C_GLOW), null, 'glow off: no glow bound');
  c.tube[2 * TUBE_FLOATS + A_SEL] = 1; c.g.attrs(c.tube); c.R.rebuildRows(Int32Array.of(2));
  assert.ok(c.R.boundOf(2 * RUNS_PER_ROW, C_RING));
  c.tube[2 * TUBE_FLOATS + A_SEL] = 0; c.g.attrs(c.tube);
  assert.equal(c.R.pastRows(list), 1); c.R.rebuildRows(Int32Array.of(2));
  assert.equal(c.R.boundOf(2 * RUNS_PER_ROW, C_RING), null);
});

test('packRuns writes the contract\'s RUN texture layout, in place and in part', () => {
  const c = made(), out = {};
  c.R.packRuns(out);
  assert.equal(out.width, RUNS_PER_ROW * RUN_TEXELS); assert.equal(out.height, 3); assert.deepEqual(out.dirty, [0, 2]);
  const id = 1 * RUNS_PER_ROW + 3, t = (1 * out.width + 3 * RUN_TEXELS) * 4, o = id * 4;
  assert.deepEqual([...out.data.subarray(t, t + 4)], [...c.R.chord.subarray(o, o + 4)]);
  assert.deepEqual([...out.data.subarray(t + 4, t + 8)], [...c.R.rad.subarray(o, o + 4)]);
  assert.equal(out.data[t + 8], 12); assert.equal(out.data[t + 9], 15);
  const data = out.data;
  c.tube[1 * TUBE_FLOATS + A_GLOW] = 1; c.g.attrs(c.tube); c.R.rebuildRows(Int32Array.of(1));
  c.R.packRuns(out, Int32Array.of(1), 1);
  assert.equal(out.data, data, 'written in place'); assert.deepEqual(out.dirty, [1, 1]);
  assert.ok(out.data[t + 6] > 0, 'the glow radius is in the texture');
});

// ── Part 2: the real anatomy ──
/** The conservative-bound oracle: points on and inside the true reach of each segment of each run, for every contribution on, are inside the run's capsule. */
function judge(g, R, name, t) {
  let pts = 0, runs = 0, loosest = 0;
  const cap = { ax: 0, ay: 0, bx: 0, by: 0, r: 0 };
  for (let r = 0; r < g.nRows; r++) {
    const rec = g.rows[r];
    if (!rec.on) { assert.equal(R.runsOf(r).length, 0); continue; }
    for (const id of R.runsOf(r)) {
      runs++;
      const i0 = R.seg[id * 2], i1 = R.seg[id * 2 + 1];
      assert.ok(i1 - i0 + 1 <= RUN_SEGS);
      let rmax = 0;
      for (let i = i0; i <= i1 + 1; i++) rmax = Math.max(rmax, g.rad[r * NS + i]);
      const glow = glowReachOf(rec), shadow = (rec.flags & F_SHADOW) !== 0;
      for (const [c, extra, dx, dy, on] of [[C_LUMEN, 0, 0, 0, true], [C_SHADOW, REACH_SHADOW_BLUR, REACH_SHADOW_OFF, 0, shadow], [C_GLOW, glow, 0, 0, glow > 0], [C_RING, REACH_RING, 0, 0, rec.sel > 0]]) {
        const b = R.boundOf(id, c, cap);
        if (!on) { assert.equal(b, null, `row ${r} run ${id}: no bound where the contribution is off`); continue; }
        assert.ok(b, `row ${r} run ${id} has a bound for ${c}`);
        // no looser than the reach plus the sagitta: the radius is the reach (headroom included) + the run's own stray from its chord
        let sag = 0;
        for (let i = i0; i <= i1 + 1; i++) sag = Math.max(sag, segDist(g.pts[(r * NS + i) * 2], g.pts[(r * NS + i) * 2 + 1], R.chord[id * 4], R.chord[id * 4 + 1], R.chord[id * 4 + 2], R.chord[id * 4 + 3]));
        const reach = rmax * BOUND_HEADROOM + rec.casing + REACH_AA / 2 + extra;
        assert.ok(b.r >= reach - 1e-3 && b.r <= reach + sag + 0.01, `row ${r} run ${id} contribution ${c}: bound ${b.r}, reach ${reach}, sagitta ${sag}`);
        loosest = Math.max(loosest, b.r - reach - sag);
        // conservative: points at the true reach (and inside it) of every segment of the run
        for (let i = i0; i <= i1; i++) {
          const ax = g.pts[(r * NS + i) * 2] + dx, ay = g.pts[(r * NS + i) * 2 + 1] + dy, bx = g.pts[(r * NS + i + 1) * 2] + dx, by = g.pts[(r * NS + i + 1) * 2 + 1] + dy;
          const D = Math.max(g.rad[r * NS + i], g.rad[r * NS + i + 1]) + rec.casing + REACH_AA / 2 + extra;
          for (const u of [0, 0.25, 0.5, 0.75, 1]) for (let a = 0; a < 8; a++) for (const f of [1, 0.6]) {
            const px = ax + (bx - ax) * u + Math.cos(a * Math.PI / 4) * D * f, py = ay + (by - ay) * u + Math.sin(a * Math.PI / 4) * D * f;
            if (segDist(px, py, ax, ay, bx, by) > D + 1e-6) continue;   // (a point farther than the reach from its own segment is not in it)
            pts++;
            assert.ok(segDist(px, py, b.ax, b.ay, b.bx, b.by) <= b.r + 1e-3, `row ${r} segment ${i} contribution ${c}: a point in the reach lies outside the run's bound`);
          }
        }
      }
    }
  }
  t.diagnostic(`${name}: ${runs} runs, ${pts} reach points inside their bounds; loosest bound ${loosest.toFixed(3)} past reach + sagitta`);
}
function graphOf(f, decorate) {
  const g = createVecGraph();
  g.fromBins(f.bins, f.nTubes); g.attrs(f.tube);
  const ra = new Float32Array(f.nTubes * NS * 4);
  for (let i = 0; i < f.nTubes * NS; i++) ra[i * 4] = f.rad[i];
  g.radii(ra);
  if (decorate) for (let r = 0; r < g.nRows; r++) {   // put the soft contributions on some rows: the figure's own tubes have none on
    const rec = g.rows[r];
    if (r % 4 === 0) { rec.glow = 1; rec.glowW = r % 8 === 0 ? 1.3 : 1; }
    if (r % 5 === 0) rec.sel = 1;
    if (r % 3 === 0) rec.flags |= F_SHADOW;
    rec.casing = r % 2 ? 0.5 : 0;
  }
  return g;
}

const A = await bootAnatomy();
let firstPreset = true;
for (const p of PRESETS) {
  test(`preset ${p.id}: the bounds are conservative and no looser than the reach plus the sagitta (all contributions on some rows)`, { timeout: 240000 }, async (t) => {
    await A.preset(p.id, firstPreset ? 40 : 10); firstPreset = false;
    const g = graphOf(A.figure(), true), R = createRuns(g).build();
    judge(g, R, p.id, t);
  });
}
test('the lobule: the bounds are conservative and no looser than the reach plus the sagitta', { timeout: 240000 }, async (t) => {
  await A.view('lobule', 200);
  const tap = taps.find((x) => x.who === 'lobule' && x.bins);
  assert.ok(tap, 'the lobule\'s renderer was given a binning');
  const f = { nTubes: tap.nTubes, bins: { ent: tap.bins.ent.slice(), cells: tap.bins.cells.slice(0, tap.bins.nCells * 6), nCells: tap.bins.nCells, nEnt: tap.bins.nEnt, rows: tap.bins.rows }, tube: tap.tube.slice(), rad: tap.rad.slice() };
  const g = graphOf(f, true), R = createRuns(g).build();
  judge(g, R, 'lobule', t);
});

test('fitGrid: the 16-unit grid holds every run\'s box and every join\'s disc, a multiple of CELL, and its cells are zeroed', async () => {
  const { fitGrid } = await import('../src/ui/vec-compile.js');
  const { CELL } = await import('../src/ui/veins-bin.js');
  const c = made(), grid = fitGrid(c.R);
  assert.equal(grid.cs, CELL); assert.equal(Math.abs(grid.x0 % CELL), 0); assert.equal(Math.abs(grid.y0 % CELL), 0);
  assert.equal(grid.cells.length >= 256 * grid.ny * 4, true); assert.ok(grid.cells.every((v) => v === 0));
  for (let r = 0; r < 3; r++) for (const id of c.R.runsOf(r)) {
    const o = id * 4;
    assert.ok(c.R.box[o] >= grid.x0 && c.R.box[o + 1] >= grid.y0 && c.R.box[o + 2] <= grid.x0 + grid.nx * CELL && c.R.box[o + 3] <= grid.y0 + grid.ny * CELL, `run ${id}'s box is inside the grid`);
  }
  const d = c.R.joinDisc(0);
  assert.ok(d.x - d.r >= grid.x0 && d.y - d.r >= grid.y0 && d.x + d.r <= grid.x0 + grid.nx * CELL && d.y + d.r <= grid.y0 + grid.ny * CELL);
  const cells = grid.cells;
  assert.equal(fitGrid(c.R, grid).cells, cells, 'a grid the same size keeps its array');
});
