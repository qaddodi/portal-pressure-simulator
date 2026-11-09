// The vector renderer's vessel graph (src/ui/vec-graph.js, workstream A): one kept record per vessel row, read from the inputs veins-gl already
// receives (a binning, the tube attributes, the radii), reporting only the rows each call changed. Small made scenes (the binning of
// veins-bin.js); the real anatomy is judged in tests/vec-compile.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { binVeins } from '../src/ui/veins-bin.js';
import { N_SAMPLES } from '../src/ui/veins-mesh.js';
import {
  createVecGraph, A_CASING, A_TIER, A_Z, A_FLAGS, A_ALPHA, A_HOVER, A_GLOW, A_SEL, TUBE_FLOATS, MAX_TIERS, JOIN_MEMBERS,
} from '../src/ui/vec-graph.js';

const NS = N_SAMPLES;
const line = (x, y, dx, dy) => Array.from({ length: NS }, (_, i) => [x + i * dx, y + i * dy]);
const scene = (opts = {}) => ({
  tubes: [
    { id: 0, pts: line(10, 10, 4, 1.5), reach: 14 },
    { id: 1, pts: line(400, 20, -3, 2.5).map(([x, y]) => [x + (opts.move1 ?? 0), y]), reach: 11 },
    { id: 2, pts: line(40, 300, 5, 0.2), reach: 12 },
  ],
  joins: [{ x: 250, y: 100, reach: 20, k: opts.k ?? 0.4, fillet: opts.fillet ?? 0.5, members: [0, 1], ...(opts.trunk == null ? {} : { trunk: opts.trunk }), ...(opts.fork ? { fork: true } : {}) }],
});
const bin = (opts, memo) => { const s = scene(opts); return binVeins(s.tubes, s.joins, memo); };
const tubeArr = (n) => new Float32Array(n * TUBE_FLOATS);
const radArr = (n, f) => { const a = new Float32Array(n * NS * 4); for (let r = 0; r < n; r++) for (let i = 0; i < NS; i++) a[(r * NS + i) * 4] = f(r, i); return a; };
const listOf = (g) => [...g.list.subarray(0, g.n)];

test('fromBins: one record a row with its points back, every segment seen, the join decoded', () => {
  const g = createVecGraph(), s = scene();
  g.fromBins(bin({ trunk: 1 }), 3);
  assert.equal(g.nRows, 3);
  assert.deepEqual(listOf(g), [0, 1, 2]);
  for (let r = 0; r < 3; r++) {
    assert.equal(g.rows[r].row, r); assert.equal(g.rows[r].on, 1);
    for (let i = 0; i < NS; i++) {
      assert.equal(g.rows[r].pts[2 * i], Math.fround(s.tubes[r].pts[i][0]), `row ${r} point ${i} x`);
      assert.equal(g.rows[r].pts[2 * i + 1], Math.fround(s.tubes[r].pts[i][1]), `row ${r} point ${i} y`);
    }
    for (let i = 0; i < NS - 1; i++) assert.equal(g.seg[r * (NS - 1) + i], 1, `row ${r} segment ${i} is in the binning`);
  }
  const J = g.joins;
  assert.equal(J.n, 1);
  assert.equal(J.x[0], 250); assert.equal(J.y[0], 100); assert.equal(J.reach[0], 20);
  assert.equal(J.k[0], Math.fround(0.4)); assert.ok(Math.abs(J.fillet[0] - 0.5) < 0.02, `fillet ${J.fillet[0]}`);
  assert.deepEqual([...J.mem.subarray(0, JOIN_MEMBERS)], [0, 1, -1, -1]);
  assert.equal(J.trunk[0], 1); assert.equal(J.fork[0], 0);
  assert.equal(g.joinsMoved, true);
});

test('a fork is marked, a join with no trunk has none, fillet and k stay in their ranges', () => {
  for (const [trunk, fork] of [[null, false], [0, false], [1, true]]) {
    for (const fillet of [0, 0.3, 1]) {
      const g = createVecGraph();
      g.fromBins(bin({ trunk, fork, fillet }), 3);
      assert.equal(g.joins.trunk[0], trunk ?? -1);
      assert.equal(g.joins.fork[0], fork ? 1 : 0);
      assert.ok(g.joins.fillet[0] >= 0 && g.joins.fillet[0] <= 1);
      assert.ok(Math.abs(g.joins.fillet[0] - fillet) < 0.02, `fillet ${fillet} read as ${g.joins.fillet[0]}`);
      assert.equal(g.joins.k[0], Math.fround(0.4));
    }
  }
});

test('records and arrays are kept: a repeated call allocates nothing and moves no record', () => {
  const g = createVecGraph(), memo = new Map();
  g.fromBins(bin({}, memo), 3);
  const recs = g.rows.slice(), pts = g.pts, rad = g.rad, seg = g.seg, list = g.list, views = g.rows.map((r) => r.pts), J = g.joins.x;
  const tube = tubeArr(3), ra = radArr(3, () => 5);
  g.attrs(tube); g.radii(ra); g.patch(bin({}, memo)); g.fromBins(bin({}, memo), 3); g.attrs(tube); g.radii(ra);
  assert.equal(g.pts, pts); assert.equal(g.rad, rad); assert.equal(g.seg, seg); assert.equal(g.list, list); assert.equal(g.joins.x, J);
  g.rows.forEach((r, i) => { assert.equal(r, recs[i]); assert.equal(r.pts, views[i]); });
});

test('patch: only the row whose points moved is listed, joins unmoved', () => {
  const g = createVecGraph(), memo = new Map();
  g.fromBins(bin({}, memo), 3);
  g.patch(bin({}, memo));
  assert.equal(g.n, 0, 'nothing changed: nothing listed'); assert.equal(g.joinsMoved, false);
  const moved = bin({ move1: 0.3 }, memo);
  g.patch(moved);
  assert.deepEqual(listOf(g), [1]);
  assert.equal(g.rows[1].pts[0], Math.fround(400.3));
  assert.equal(g.joinsMoved, false);
  g.patch(moved);
  assert.equal(g.n, 0);
});

test('patch: a join whose numbers changed is reported (jlist, joinsMoved) and the others are not', () => {
  const g = createVecGraph(), memo = new Map();
  g.fromBins(bin({}, memo), 3);
  const b = bin({ k: 0.7 }, memo);
  g.patch(b);
  assert.equal(g.joinsMoved, true); assert.equal(g.nj, 1); assert.equal(g.jlist[0], 0); assert.equal(g.joins.k[0], Math.fround(0.7));
  g.patch(b);
  assert.equal(g.joinsMoved, false); assert.equal(g.nj, 0);
});

test('attrs: the tube attributes are copied into the records and only a tier or casing change lists the row', () => {
  const g = createVecGraph();
  g.fromBins(bin({}), 3);
  const tube = tubeArr(3);
  tube[0 * TUBE_FLOATS + A_TIER] = 4; tube[0 * TUBE_FLOATS + A_CASING] = 2;
  tube[1 * TUBE_FLOATS + A_TIER] = 99;                                        // (past the tiers there are: the last)
  tube[2 * TUBE_FLOATS + A_FLAGS] = 3; tube[2 * TUBE_FLOATS + A_Z] = 7; tube[2 * TUBE_FLOATS + A_ALPHA] = 0.5; tube[2 * TUBE_FLOATS + A_HOVER] = 1;
  tube[2 * TUBE_FLOATS + A_GLOW] = 0.25; tube[2 * TUBE_FLOATS + A_SEL] = 1;
  g.attrs(tube);
  assert.deepEqual(listOf(g), [0, 1]);   // (row 2 changed only flags and the rest: the shader's, not a compile's)
  assert.equal(g.rows[0].tier, 4); assert.equal(g.rows[0].casing, 2);
  assert.equal(g.rows[1].tier, MAX_TIERS - 1);
  assert.equal(g.rows[2].flags, 3); assert.equal(g.rows[2].z, 7); assert.equal(g.rows[2].alpha, 0.5); assert.equal(g.rows[2].hover, 1); assert.equal(g.rows[2].glow, 0.25); assert.equal(g.rows[2].sel, 1);
  g.attrs(tube);
  assert.equal(g.n, 0, 'the same attributes again: nothing listed');
  tube[0 * TUBE_FLOATS + A_TIER] = 5;
  g.attrs(tube);
  assert.deepEqual(listOf(g), [0]);
  g.attrs(tube.subarray(0, 2 * TUBE_FLOATS));   // (a shorter array: only the rows it holds)
  assert.equal(g.n, 0);
});

test('radii: the rows whose radii differ are listed; rmax and rmin follow', () => {
  const g = createVecGraph();
  g.fromBins(bin({}), 3);
  const ra = radArr(3, (r, i) => 3 + r + (i === 10 ? 2 : 0));
  g.radii(ra);
  assert.deepEqual(listOf(g), [0, 1, 2]);
  assert.equal(g.rows[0].rmax, 5); assert.equal(g.rows[0].rmin, 3); assert.equal(g.rows[2].rmax, 7); assert.equal(g.rad[1 * NS + 10], 6);
  g.radii(ra);
  assert.equal(g.n, 0);
  ra[(1 * NS + 20) * 4] = 9;
  g.radii(ra);
  assert.deepEqual(listOf(g), [1]);
  assert.equal(g.rows[1].rmax, 9);
});
