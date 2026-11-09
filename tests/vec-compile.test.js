// The vector renderer's compiler (src/ui/vec-compile.js, workstream A) on the real anatomy: the stage booted in node (tests/vec-anatomy.js) with
// the preset cirr-decomp, in the Anatomy and in the Circuit, and the morph sets the change between them makes. Every judgement is a brute force
// written here from the vessels' points and radii (no call into the compiler's own geometry), so a wrong cell is found by something else.
// Tests 1 to 8 of docs/recommendations/vector-renderer-plan.md section 9.A. The first five and the eighth read what the module exports; none
// reads a file's text.
import { bootAnatomy, taps, sweeps } from './vec-anatomy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRID_W, CELL_EMPTY, CELL_SIMPLE, CELL_REGION, WIN_MAX, MAX_MEMBERS, K_MORPH,
} from '../src/ui/vec-contract.js';
import {
  createReach, createCompiled, compileGrid, recompileRows, compileMorphSet, rowsPast, cellOfWorld, regionOf, padReach, NS,
} from '../src/ui/vec-compile.js';
import { N_QUADS } from '../src/ui/veins-mesh.js';

import { build, segRectD2, TOL, kindAt, checkBuilt, check1, check2, check3, check4, check5, check6 } from './vec-oracle.js';

// ── The figure, in the two views ──
const A = await bootAnatomy();
await A.preset('cirr-decomp', 40);
const views = { anatomy: build(A.figure()) };
await A.view('circuit', 100);
views.circuit = build(A.figure());
const MORPH_SETS = A.figure().sets;

for (const name of ['anatomy', 'circuit']) {
  const v = views[name];
  test(`${name}: the figure is the real one and compiles (rows, joins, no grid overflow)`, (t) => checkBuilt(v, t, name));
  test(`${name} test 1: every point within two vessels' reach lies in a region cell (and one vessel's, in a cell that is not empty)`, (t) => check1(v, t, name));
  test(`${name} test 2: every ordinary cell's run covers each segment of its vessel within reach of the cell, is at most WIN_MAX, and no other vessel reaches it`, (t) => check2(v, t, name));
  test(`${name} test 3: every join's cells are K_JOIN regions listing all its members`, (t) => check3(v, t, name));
  test(`${name} test 4: members' tiers differing gives K_CROSSTIER (and only then)`, (t) => check4(v, t, name));
  test(`${name} test 5: no region over MAX_MEMBERS (the largest is reported)`, (t) => check5(v, t, name));
  test(`${name} test 6: the partition rule gives one owner per pixel under random cameras`, (t) => check6(v, t, name));
}


// ── Test 7: width easings ──
test('test 7: every width easing of the cirr-decomp deck run stays inside the compiled reach, or recompileRows is called for exactly the rows past it', async (t) => {
  const stage = () => taps.find((x) => x.who === 'stage');
  await A.preset('healthy', 30);
  const v = build(A.figure());
  const { graph, radAll, out } = v;
  stage().radLog = [];
  await A.preset('cirr-decomp', 45);
  await A.preset('budd-chiari', 45);
  await A.preset('cirr-comp', 45);
  const log = stage().radLog; stage().radLog = null;
  assert.ok(log.length > 0, 'no width easing happened across the presets');
  const stride = Math.max(1, Math.floor(log.length / 60));
  const dump = (o) => {
    const lines = [];
    for (let cy = 0; cy < o.ny; cy++) for (let cx = 0; cx < o.nx; cx++) {
      const tx = cy * GRID_W + cx, kd = o.cells[tx * 4];
      if (kd === CELL_SIMPLE) lines.push(`${cx},${cy} s ${o.cells[tx * 4 + 1]} ${o.cells[tx * 4 + 2]} ${o.cells[tx * 4 + 3]}`);
      else if (kd === CELL_REGION) lines.push(`${cx},${cy} r ${JSON.stringify(regionOf(o, o.cells[tx * 4 + 1]))}`);
    }
    return lines;
  };
  const fresh = () => {   // a whole compile with the same bounds as the patched grid holds
    const o2 = createCompiled(), r2 = createReach(out.reach.look);
    r2.rb = out.reach.rb.slice(); r2.pad = out.reach.pad.slice(); r2.jb = out.reach.jb.slice(); r2.padNow = out.reach.padNow.slice();
    o2.cell = out.cs; o2.fixed = true; o2.x0 = out.x0; o2.y0 = out.y0; o2.nx = out.nx; o2.ny = out.ny;
    compileGrid(graph, r2, o2);
    return o2;
  };
  const list = new Int32Array(graph.nRows * 2);
  let checks = 0, past = 0, recompiled = 0, covered = 0;
  for (let k = 0; k < log.length; k++) {
    const { row, r } = log[k];
    for (let i = 0; i < NS; i++) radAll[(row * NS + i) * 4] = r[i];
    if (k % stride !== 0 && k !== log.length - 1) continue;
    graph.radii(radAll);
    const n = rowsPast(graph, out, list);
    const got = [...list.subarray(0, n)].sort((a, b) => a - b);
    const want = [];
    for (let rr = 0; rr < graph.nRows; rr++) {
      if (!graph.rows[rr].on) continue;
      let p = padReach(graph.rows[rr], out.reach.look) > out.reach.pad[rr];
      for (let i = 0; i < NS && !p; i++) if (graph.rad[rr * NS + i] > out.reach.rb[rr * NS + i]) p = true;
      if (p) want.push(rr);
    }
    assert.deepEqual(got, want, 'rowsPast is exactly the rows whose radius is past its compiled bound');
    checks++; past += n;
    if (n) {
      recompileRows(graph, list, out, n);
      recompiled++;
      assert.equal(rowsPast(graph, out, list), 0, 'after the recompile nothing is past');
      assert.deepEqual(dump(out), dump(fresh()), 'the patched grid equals a whole compile with the same bounds');
    }
    // inside the compiled reach: every cell a segment touches at its radius now lists the row with the segment inside the run
    if (checks % 6 === 0 || k === log.length - 1) {
      for (let rr = 0; rr < graph.nRows; rr++) {
        if (!graph.rows[rr].on) continue;
        for (let i = 0; i < N_QUADS; i++) {
          if (!graph.seg[rr * N_QUADS + i]) continue;
          const o = (rr * NS + i) * 2, ax = graph.pts[o], ay = graph.pts[o + 1], bx = graph.pts[o + 2], by = graph.pts[o + 3];
          const R = Math.max(graph.rad[rr * NS + i], graph.rad[rr * NS + i + 1]) + padReach(graph.rows[rr], out.reach.look) - TOL;
          const cx0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - out.x0) / out.cs)), cx1 = Math.min(out.nx - 1, Math.floor((Math.max(ax, bx) + R - out.x0) / out.cs));
          const cy0 = Math.max(0, Math.floor((Math.min(ay, by) - R - out.y0) / out.cs)), cy1 = Math.min(out.ny - 1, Math.floor((Math.max(ay, by) + R - out.y0) / out.cs));
          for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
            const wx = out.x0 + cx * out.cs, wy = out.y0 + cy * out.cs;
            if (segRectD2(ax, ay, bx, by, wx, wy, wx + out.cs, wy + out.cs) > R * R) continue;
            const tx = cy * GRID_W + cx, kd = kindAt(out, tx);
            let ok = false;
            if (kd === CELL_SIMPLE) ok = out.cells[tx * 4 + 1] === rr && out.cells[tx * 4 + 2] <= i && out.cells[tx * 4 + 3] >= i;
            else if (kd === CELL_REGION) ok = regionOf(out, out.cells[tx * 4 + 1]).members.some((mb) => mb.row === rr && mb.i0 <= i && mb.i1 >= i);
            assert.ok(ok, `row ${rr} segment ${i} reaches cell ${cx},${cy} at its radius now and the compiled cell does not list it`);
            covered++;
          }
        }
      }
    }
  }
  t.diagnostic(`${log.length} width writes, ${checks} checks, ${recompiled} needed recompileRows (${past} rows past in all), ${covered} segment-cell pairs checked inside the compiled reach`);

  // A synthetic widening (every row ×2.2, and a casing change) is past the headroom everywhere it matters and must come out equal to a whole compile.
  for (let rr = 0; rr < graph.nRows; rr++) if (graph.rows[rr].on && rr % 3 === 0) for (let i = 0; i < NS; i++) radAll[(rr * NS + i) * 4] *= 2.2;
  graph.radii(radAll);
  const n = rowsPast(graph, out, list);
  assert.ok(n > 10, `${n} rows past after widening a third of them`);
  recompileRows(graph, list, out, n);
  assert.equal(rowsPast(graph, out, list), 0);
  assert.deepEqual(dump(out), dump(fresh()));
});

// ── Test 8: the morph sets ──
test('test 8: every cell of a morph set is classified, every sweep crossing is in a K_MORPH region', (t) => {
  assert.ok(MORPH_SETS.length > 0, 'the change between the views made no morph set');
  const graph = views.circuit.graph;
  let cellsSeen = 0, regions = 0, simples = 0, crossings = 0, over = 0, largest = 0;
  for (const set of MORPH_SETS) {
    const out = createCompiled();
    compileMorphSet(set, out, graph);
    assert.ok(!out.tooWide, 'a morph set\'s grid is wider than GRID_W');
    let nonEmpty = 0, overCells = 0;
    for (let c = 0; c < set.nCells; c++) {
      const x = set.cells[c * 6], y = set.cells[c * 6 + 1], s0 = set.cells[c * 6 + 2], sn = set.cells[c * 6 + 3], jn = set.cells[c * 6 + 5];
      const rows = new Map();
      for (let e = s0; e < s0 + sn; e++) {
        const r = set.ent[e * 8 + 4], i = set.ent[e * 8 + 5];
        if (!(r >= 0)) continue;
        let m = rows.get(r); if (!m) rows.set(r, m = [1e9, -1, 0]);
        if (i >= 0) { m[0] = Math.min(m[0], i); m[1] = Math.max(m[1], i); m[2]++; }
      }
      if (rows.size > MAX_MEMBERS) overCells++;
      const tx = cellOfWorld(out, x + 1, y + 1);
      assert.ok(tx >= 0, `a listed cell (${x}, ${y}) is outside the grid`);
      cellsSeen++;
      if (rows.size === 0 && jn === 0) { assert.equal(kindAt(out, tx), CELL_EMPTY); continue; }
      nonEmpty++;
      assert.notEqual(kindAt(out, tx), CELL_EMPTY, `cell (${x}, ${y}) lists ${rows.size} vessels and ${jn} joins and is empty`);
      const [r0, m0] = [...rows][0] ?? [-1, null];
      const single = rows.size === 1 && jn === 0 && m0[1] >= 0 && m0[2] === m0[1] - m0[0] + 1 && m0[2] <= WIN_MAX;
      if (single) {
        simples++;
        assert.equal(kindAt(out, tx), CELL_SIMPLE); assert.equal(out.cells[tx * 4 + 1], r0); assert.equal(out.cells[tx * 4 + 2], m0[0]); assert.equal(out.cells[tx * 4 + 3], m0[1]);
      } else {
        regions++;
        assert.equal(kindAt(out, tx), CELL_REGION, `cell (${x}, ${y}) lists ${rows.size} vessels, ${jn} joins`);
        const reg = regionOf(out, out.cells[tx * 4 + 1]);
        assert.ok(reg.kind & K_MORPH);
        if (reg.members.length < MAX_MEMBERS) for (const r of rows.keys()) assert.ok(reg.members.some((mb) => mb.row === r), `cell (${x}, ${y}): row ${r} is listed by the set and not by the region`);
      }
    }
    // every texel the lists do not name is empty
    let occupied = 0;
    for (let cy = 0; cy < out.ny; cy++) for (let cx = 0; cx < out.nx; cx++) if (kindAt(out, cy * GRID_W + cx) !== CELL_EMPTY) occupied++;
    assert.equal(occupied, nonEmpty, 'cells classified that the set does not list');
    assert.ok(out.stats.overMembers >= overCells, 'stats.overMembers counts at least the cells whose lists name more vessels than a region can hold (joins add members)');
    over += overCells; largest = Math.max(largest, out.stats.maxMembers);

    // The sweep's own crossings: at the moments of the stretch and between them, any cell two vessels' reach touches is a region.
    const sw = sweeps.find((x) => x.b && x.b.ent === set.ent);
    if (!sw) continue;
    const M = sw.tubes[0].path.length, mid = M >> 1;
    const states = [[0, 1, 0], [0, 1, 0.5], [mid - 1, mid, 0.5], [mid, mid + 1 < M ? mid + 1 : mid, 0], [M - 2, M - 1, 0.5], [M - 2, M - 1, 1]];   // (moments P_a + f · (P_b − P_a))
    const cs = out.cs;
    for (const [a, b, f] of states) {
      const cellRows = new Map();
      for (const tb of sw.tubes) {
        const P = tb.path[a], Q = tb.path[b], R = tb.reach - TOL;
        const px = (i) => P[i][0] + (Q[i][0] - P[i][0]) * f, py = (i) => P[i][1] + (Q[i][1] - P[i][1]) * f;
        for (let i = 0; i + 1 < P.length; i++) {
          const ax = px(i), ay = py(i), bx = px(i + 1), by = py(i + 1);
          const cx0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - out.x0) / cs)), cx1 = Math.min(out.nx - 1, Math.floor((Math.max(ax, bx) + R - out.x0) / cs));
          const cy0 = Math.max(0, Math.floor((Math.min(ay, by) - R - out.y0) / cs)), cy1 = Math.min(out.ny - 1, Math.floor((Math.max(ay, by) + R - out.y0) / cs));
          for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
            const wx = out.x0 + cx * cs, wy = out.y0 + cy * cs;
            if (segRectD2(ax, ay, bx, by, wx, wy, wx + cs, wy + cs) > R * R) continue;
            const tx = cy * GRID_W + cx; let s = cellRows.get(tx); if (!s) cellRows.set(tx, s = new Set()); s.add(tb.id);
          }
        }
      }
      for (const [tx, s] of cellRows) {
        if (s.size < 2) continue;
        crossings++;
        const reg = kindAt(out, tx) === CELL_REGION ? regionOf(out, out.cells[tx * 4 + 1]) : null;
        assert.ok(reg && (reg.kind & K_MORPH), `rows ${[...s].join(',')} reach cell texel ${tx} together at the stretch's state ${a}-${b}@${f} and it is not a K_MORPH region`);
      }
    }
  }
  t.diagnostic(`${MORPH_SETS.length} morph sets, ${cellsSeen} listed cells (${simples} ordinary, ${regions} regions), ${crossings} two-vessel cells at the stretches' states, all regions; largest ${largest} vessels in a cell (MAX_MEMBERS ${MAX_MEMBERS}), ${over} cells over`);
});

// The stop point (plan section 10): a region over MAX_MEMBERS. The Anatomy and the Circuit hold at most 13; the morph sets' cells list every vessel that
// can draw there anywhere along a stretch, 44 at the most in cirr-decomp (Mohammad, 9 Nov: MAX_MEMBERS 48).
test('stop point: no morph region over MAX_MEMBERS', () => {
  let largest = 0;
  for (const set of MORPH_SETS) { const out = createCompiled(); compileMorphSet(set, out, views.circuit.graph); largest = Math.max(largest, out.stats.maxMembers); assert.equal(out.stats.overMembers, 0, `largest ${largest}`); }
});
