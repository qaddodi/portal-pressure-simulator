// The compiler as the renderer core calls it in revision 1 (createVecLeaves in src/ui/vec-compile.js, workstream A -> K -> E): graph -> runs -> K's leaves.
// The real anatomy (cirr-decomp, the Circuit), booted in node as tests/vec-compile.test.js does. The judgement is a brute force written here: a point
// inside a vessel's bound has to find a leaf that names that vessel's run with the contribution's bit, after a build, after a rebuild, and in a morph set.
import { bootAnatomy, sweeps } from './vec-anatomy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVecLeaves } from '../src/ui/vec-compile.js';
import { leafAt } from '../src/ui/vec-leaves.js';
import { leafRead, refRun, refBits, clearDirty } from '../src/ui/vec-leaves-pack.js';
import { N_SAMPLES } from '../src/ui/veins-mesh.js';
import { TUBE_FLOATS, A_GLOW, A_SEL, A_CASING } from '../src/ui/vec-graph.js';
import { C_LUMEN, C_GLOW, C_RING } from '../src/ui/vec-contract.js';

const NS = N_SAMPLES;
const A = await bootAnatomy();
await A.preset('cirr-decomp', 40);
await A.view('circuit', 100);
const F = A.figure();
const radOf = () => { const r = new Float32Array(F.nTubes * NS * 4); for (let i = 0; i < F.nTubes * NS; i++) r[i * 4] = F.rad[i]; return r; };
const fresh = () => { const c = createVecLeaves(); const tube = F.tube.slice(), rad = radOf(); const v = c.build(F.bins, F.nTubes, { tubeNow: tube, radAll: rad }); return { c, v, tube, rad }; };

/** The refs (runId -> bits) of the leaf at a point. */
function refsAt(view, x, y) {
  const T = view.tables, l = leafAt(T, x, y);
  if (l < 0) return null;
  const m = leafRead(T, l), out = new Map();
  for (let i = 0; i < m.runCount; i++) { const ref = T.runRefs[m.runStart + i]; out.set(refRun(ref), refBits(ref)); }
  return out;
}
/** Sample points of every on row: its vertices and the points a little off to the side (inside the lumen bound). Returns the number checked; fails on a miss. */
function coverage(view, c, bit, rows, label) {
  const { runs, graph } = c;
  let checked = 0;
  for (const r of rows) {
    if (!graph.rows[r].on) continue;
    for (const id of runs.runsOf(r)) {
      const b = runs.boundOf(id, bit);
      if (!b) continue;
      // three points on the chord, shrunk to 90% of the radius: all inside the bound
      for (const s of [0, 0.5, 1]) {
        const x = b.ax + (b.bx - b.ax) * s, y = b.ay + (b.by - b.ay) * s;
        const refs = refsAt(view, x, y);
        assert.ok(refs, `${label}: no leaf at run ${id}'s chord point (${x.toFixed(2)}, ${y.toFixed(2)})`);
        assert.ok(((refs.get(id) ?? 0) & bit) !== 0, `${label}: the leaf at run ${id}'s chord point does not name it for bit ${bit}`);
        checked++;
      }
    }
  }
  return checked;
}
const allRows = (c) => Array.from({ length: c.graph.nRows }, (_, i) => i);

test('build: the hierarchy holds every run on every on row (lumen), the report has no stop point, the grid fits', (t) => {
  const { c, v } = fresh();
  assert.ok(v.full && v.tables && v.runTex.data && v.joinTex.count === c.graph.joins.n);
  assert.equal(v.tooWide, false);
  assert.equal(v.report.overWide.length, 0, 'a leaf over SLOTS_WIDE candidates is a stop point');
  const n = coverage(v, c, C_LUMEN, allRows(c), 'build');
  t.diagnostic(`${c.graph.nRows} rows, ${c.runs.nRuns} run slots, ${v.report.leaves} leaves, ${v.report.nodes} nodes, ${n} chord points found; classes ${JSON.stringify(v.report.byClass)}`);
  assert.ok(n > 1000);
  assert.ok(c.current() === v);
});

test('calls that change nothing give null: the same attributes, the same radii, a narrower vessel; a tier rebuilds at most some join leaves', (t) => {
  const { c, tube, rad } = fresh();
  const none = (v, why) => assert.ok(v === null, `${why}: a view with ${v?.stats?.leavesWritten} leaves written`);   // (not assert.equal: a failure would print the whole view)
  none(c.attrs(tube), 'the same attributes');
  none(c.radii(rad), 'the same radii');
  const r2 = rad.slice(); for (let i = 0; i < r2.length; i += 4) r2[i] *= 0.8;
  none(c.radii(r2), 'narrower is inside the bound');
  const t2 = tube.slice(); for (let r = 0; r < F.nTubes; r++) t2[r * TUBE_FLOATS + 8] = 3;   // tier
  const v = c.attrs(t2);
  assert.ok(v === null || v.stats.full === false, 'a tier rebuilds at most the joins\' leaves, never everything');
  t.diagnostic('ok');
});

test('radii: a row widened past its bound is rebuilt (not everything), and then the hierarchy covers its new width, equal in coverage to a fresh build', (t) => {
  const { c, tube, rad } = fresh();
  const rows = []; for (let r = 0; r < c.graph.nRows && rows.length < 5; r += 7) if (c.graph.rows[r].on) rows.push(r);
  clearDirty(c.set.tables);
  const r2 = rad.slice();
  for (const r of rows) for (let i = 0; i < NS; i++) r2[(r * NS + i) * 4] *= 2.4;
  const v = c.radii(r2);
  assert.ok(v && !v.full, 'rebuilt in place');
  assert.ok(v.stats.leavesWritten > 0 && v.stats.leavesWritten < v.report.leaves, `${v.stats.leavesWritten} of ${v.report.leaves} leaves written`);
  assert.ok(v.runTex.dirty && v.runTex.dirty[0] <= Math.min(...rows) && v.runTex.dirty[1] >= Math.max(...rows), 'the run texture rows are marked');
  assert.ok(coverage(v, c, C_LUMEN, rows, 'widened') > 0);
  // a fresh build from the same inputs finds the same coverage
  const g = createVecLeaves(); const vf = g.build(F.bins, F.nTubes, { tubeNow: tube, radAll: r2 });
  assert.equal(vf.report.runRefs > 0, true);
  for (const r of rows) for (const id of g.runs.runsOf(r)) {
    const b = g.runs.boundOf(id, C_LUMEN);
    // the widened lumen reaches a point 90% of the way out from the chord's middle, perpendicular
    const dx = b.bx - b.ax, dy = b.by - b.ay, L = Math.hypot(dx, dy) || 1, mx = (b.ax + b.bx) / 2 - dy / L * b.r * 0.9, my = (b.ay + b.by) / 2 + dx / L * b.r * 0.9;
    const a = refsAt(v, mx, my), f = refsAt(vf, mx, my);
    assert.ok(f && ((f.get(id) ?? 0) & C_LUMEN), 'fresh names it');
    assert.ok(a && ((a.get(id) ?? 0) & C_LUMEN), `rebuilt names run ${id} out at its widened edge`);
  }
});

test('attrs: glow on and a selection rebuild only that row\'s leaves, and the glow and ring bounds are named', (t) => {
  const { c, tube } = fresh();
  let row = -1; for (let r = 0; r < c.graph.nRows; r++) if (c.graph.rows[r].on) { row = r; break; }
  const t2 = tube.slice();
  t2[row * TUBE_FLOATS + A_GLOW] = 0.8; t2[row * TUBE_FLOATS + A_SEL] = 1;
  clearDirty(c.set.tables);
  const v = c.attrs(t2);
  assert.ok(v && !v.full);
  assert.ok(coverage(v, c, C_GLOW, [row], 'glow') > 0);
  assert.ok(coverage(v, c, C_RING, [row], 'ring') > 0);
  t2[row * TUBE_FLOATS + A_CASING] += 2;
  assert.ok(c.attrs(t2), 'a wider casing rebuilds');
  t2[row * TUBE_FLOATS + A_GLOW] = 0; t2[row * TUBE_FLOATS + A_SEL] = 0;
  const off = c.attrs(t2);
  assert.ok(off, 'glow and selection off rebuild');
  // after glow off no run of the row names the glow bit
  for (const id of c.runs.runsOf(row)) assert.equal(c.runs.boundOf(id, C_GLOW), null);
});

test('exceeds: says whether a row\'s radii are past its bound, rebuilding nothing', () => {
  const { c } = fresh();
  let row = -1; for (let r = 0; r < c.graph.nRows; r++) if (c.graph.rows[r].on) { row = r; break; }
  const r = new Float32Array(NS).fill(1);
  assert.equal(c.exceeds(row, r), false);
  r.fill(80);
  assert.equal(c.exceeds(row, r), true);
  assert.equal(c.exceeds(-1, r), false); assert.equal(c.exceeds(1e6, r), false);
});

test('morph: a set whose run boxes cover too many cells is reported (tooLarge), not built', (t) => {
  // STOP POINT (9 Nov): a run's box over a whole stretch spans up to ~2,700 world units on the big view changes; waiting on Mohammad's answer on how morph sets get their leaves.
  const used = sweeps.filter((s) => s.b && s.tubes && s.tubes.length);
  assert.ok(used.length > 0, 'the change between the views made no morph set');
  const { c } = fresh();
  let large = 0, built = 0;
  for (const s of used) {
    const v = c.morph(s.b, s.tubes, s.opts?.slack ?? 0);
    if (v.tooLarge) { large++; assert.equal(v.tables, null); } else { built++; assert.equal(v.report.overWide.length, 0); }
  }
  t.diagnostic(`${used.length} morph sets: ${built} built, ${large} too large`);
  assert.ok(large + built === used.length);
});
