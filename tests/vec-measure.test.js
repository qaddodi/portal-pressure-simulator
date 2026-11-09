// The vector renderer's workload tools (workstream L): the per-component GPU timers (src/ui/vec-measure.js), the named benchmarks' cameras
// (src/ui/vec-bench.js, read by node's scripts/vec-workload.mjs and by the app's ?vecbench), and the fragment replay (tests/vec-replay.js).
// No GPU: a GL that records its calls stands in, so what is asserted is what the module asks of the GL, never a time.
import test from 'node:test';
import assert from 'node:assert/strict';

// (The page's DOM, as the other vector tests have it: vec-bench.js reads the lobule's scenes, which load the lobule's modules.)
(await import('../scripts/warm/dom.mjs')).installPage();
const R = '../src/ui/';
const { createVecMeasure, COMP, COMP_NAMES, POOL, vecWorkText, setCurrentMeasure, setLastReport } = await import(`${R}vec-measure.js`);
const { gpuProbe } = await import(`${R}gpu-probe.js`);
const BENCH = await import(`${R}vec-bench.js`);
const REP = await import('./vec-replay.js');
const C = await import(`${R}vec-contract.js`);
const waits = async (file) => { try { return await import(`${R}${file}`); } catch (e) { if (e?.code === 'ERR_MODULE_NOT_FOUND') return null; throw e; } };

// ── A GL with the timer extension, recording every call; results are scripted ──
function timerGL({ available = true, disjoint = false, ns = 2e6, ext = true } = {}) {
  const calls = [];
  let n = 0;
  const E = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
  const gl = {
    QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
    state: { available, disjoint, ns },
    getExtension(name) { calls.push(['getExtension', name]); return ext && name === 'EXT_disjoint_timer_query_webgl2' ? E : null; },
    createQuery() { calls.push(['createQuery']); return { id: ++n }; },
    beginQuery(t, q) { calls.push(['beginQuery', q.id]); },
    endQuery() { calls.push(['endQuery']); },
    getQueryParameter(q, p) { calls.push(['getQueryParameter', q.id, p]); return p === 1 ? gl.state.available : gl.state.ns; },
    getParameter(p) { calls.push(['getParameter', p]); return gl.state.disjoint; },
  };
  return { gl, calls };
}

test('the hooks are no-ops without ?perf: no GL call at all', () => {
  const f = timerGL();
  const M = createVecMeasure(f.gl, { on: () => false });
  M.frame(); M.begin(COMP.strips); M.begin(COMP.join); M.end(COMP.join); M.end(COMP.strips); M.poll();
  assert.equal(f.calls.length, 0, `no GL call (got ${JSON.stringify(f.calls)})`);
  assert.equal(gpuProbe.on, false, 'gpuProbe is off in a test, the default for the measure');
  const D = createVecMeasure(f.gl);   // (default: gpuProbe.on)
  D.begin(COMP.strips); D.end(COMP.strips); D.poll();
  assert.equal(f.calls.length, 0, 'the default switch is the ?perf flag');
});

test('on: one pool of queries made once; a begin/end pair is one query; results are read when ready and summed by component', () => {
  const f = timerGL({ ns: 3e6 });
  const M = createVecMeasure(f.gl, { on: () => true });
  for (let fr = 0; fr < 5; fr++) {
    M.frame();
    M.begin(COMP.strips); M.end(COMP.strips);
    M.begin(COMP.join); M.end(COMP.join);
    M.poll();
  }
  assert.equal(f.calls.filter((c) => c[0] === 'createQuery').length, POOL, 'the pool is made once');
  assert.equal(f.calls.filter((c) => c[0] === 'getExtension').length, 1);
  assert.equal(f.calls.filter((c) => c[0] === 'beginQuery').length, 10);
  assert.equal(f.calls.filter((c) => c[0] === 'endQuery').length, 10);
  M.poll();
  assert.ok(Math.abs(M.meanMs(COMP.strips) - 3) < 1e-9, 'mean ms a frame it ran in (3 ms each)');
  assert.ok(Math.abs(M.totalMs(COMP.join) - 15) < 1e-9);
  assert.equal(M.meanMs(COMP.blood), 0, 'a component that never ran has no time');
  assert.match(M.text(), /strips 3\.00 ms/);
  assert.match(M.text(), /may split the render pass/, 'the panel says the queries can split the pass');
});

test('a query that is not ready is left for the next poll (never waited for); its result is not read', () => {
  const f = timerGL({ available: false });
  const M = createVecMeasure(f.gl, { on: () => true });
  M.begin(COMP.organs); M.end(COMP.organs); M.poll();
  assert.equal(f.calls.filter((c) => c[0] === 'getQueryParameter' && c[2] === 2).length, 0, 'QUERY_RESULT is not read before it is available');
  assert.equal(M.totalMs(COMP.organs), 0);
  f.gl.state.available = true;
  M.poll();
  assert.ok(M.totalMs(COMP.organs) > 0, 'read at the next poll');
});

test('results read while GPU_DISJOINT_EXT is set are dropped, and counted', () => {
  const f = timerGL({ disjoint: true });
  const M = createVecMeasure(f.gl, { on: () => true });
  M.begin(COMP.blood); M.end(COMP.blood); M.begin(COMP.glass); M.end(COMP.glass); M.poll();
  assert.equal(M.totalMs(COMP.blood), 0); assert.equal(M.totalMs(COMP.glass), 0);
  assert.equal(M.stats.dropped, 2);
  assert.equal(f.calls.filter((c) => c[0] === 'getQueryParameter' && c[2] === 2).length, 0, 'a disjoint result is not even read');
  f.gl.state.disjoint = false;
  M.begin(COMP.blood); M.end(COMP.blood); M.poll();
  assert.ok(M.totalMs(COMP.blood) > 0, 'the next, clean result counts');
  assert.match(M.text(), /2 results dropped/);
});

test('a component inside another splits the outer query: each piece is added to its own component, none twice', () => {
  const f = timerGL({ ns: 1e6 });
  const M = createVecMeasure(f.gl, { on: () => true });
  M.begin(COMP.present); M.begin(COMP.glass); M.end(COMP.glass); M.end(COMP.present); M.poll();
  assert.equal(f.calls.filter((c) => c[0] === 'beginQuery').length, 3, 'present, glass, then present again');
  assert.equal(M.totalMs(COMP.glass), 1);
  assert.equal(M.totalMs(COMP.present), 2, 'the outer one is the sum of its two pieces');
  // (The GL never sees two queries live at once: TIME_ELAPSED queries do not nest.)
  let live = 0, worst = 0;
  for (const c of f.calls) { if (c[0] === 'beginQuery') worst = Math.max(worst, ++live); if (c[0] === 'endQuery') live--; }
  assert.equal(worst, 1);
});

test('no timer extension: nothing is made, nothing throws, and the panel says so', () => {
  const f = timerGL({ ext: false });
  const M = createVecMeasure(f.gl, { on: () => true });
  M.begin(COMP.strips); M.end(COMP.strips); M.poll();
  assert.equal(f.calls.filter((c) => c[0] !== 'getExtension').length, 0);
  assert.match(M.text(), /no GPU timer/);
});

test('the panel section: the timers, the leaves by class with the L_WIDE count, and the last benchmark report', () => {
  const f = timerGL();
  const M = createVecMeasure(f.gl, { on: () => true });
  M.begin(COMP.strips); M.end(COMP.strips); M.poll();
  M.noteLeaves([100, 20, 10, 5, 3, 0], 'anat-fit');
  setCurrentMeasure(M); setLastReport('vecbench anat-fit: 60 frames');
  const t = vecWorkText();
  assert.match(t, /Vector work/); assert.match(t, /L_SINGLE 100/); assert.match(t, /L_WIDE 3/); assert.match(t, /vecbench anat-fit: 60 frames/);
  assert.equal(COMP_NAMES.length, Object.keys(COMP).length);
});

// ── The benchmarks' cameras ──
test('every named benchmark has a camera, and the draw matrix inverts exactly (the fragment\'s world is the matrix\'s inverse)', () => {
  assert.deepEqual([...BENCH.BENCH_NAMES], ['cv-junction', 'lobule-tissue', 'anat-fit', 'anat-deep', 'pinch', 'blood-only']);
  for (const name of BENCH.BENCH_NAMES) for (const picName of BENCH.PICTURE_NAMES) {
    const pic = BENCH.PICTURES[picName], [W, H] = BENCH.deviceSize(pic);
    for (const t of BENCH.BENCHMARKS[name].samples ?? [0]) {
      const m = BENCH.benchMatrix(name, t, pic);
      assert.ok(m.every(Number.isFinite), `${name} ${picName}`);
      const w = [123.5, 456.25], dev = [m[0] * w[0] + m[2] * w[1] + m[4], m[1] * w[0] + m[3] * w[1] + m[5]];
      const back = BENCH.worldAt(m, H, dev[0], H - dev[1]);   // (the fragment's y is up: device y down is H − y)
      assert.ok(Math.abs(back[0] - w[0]) < 1e-9 && Math.abs(back[1] - w[1]) < 1e-9, `${name} ${picName} t=${t}: world → device → world`);
      assert.ok(BENCH.pxOf(m) > 0 && W > 0);
    }
  }
});

test('anat-deep is centred on the confluence and pinch ends there at the deepest zoom, both at k = ANAT_DEEP_K', () => {
  const pic = BENCH.PICTURES.mac, [W, H] = BENCH.deviceSize(pic);
  const deep = BENCH.benchMatrix('anat-deep', 0, pic), w = BENCH.worldAt(deep, H, W / 2, H / 2);
  assert.ok(Math.hypot(w[0] - BENCH.CONFLUENCE.x, w[1] - BENCH.CONFLUENCE.y) < 1e-6, 'the picture centre is the confluence');
  const a = BENCH.benchVT('pinch', 0), b = BENCH.benchVT('pinch', 1);
  assert.equal(a.k, 1); assert.ok(Math.abs(b.k - BENCH.ANAT_DEEP_K) < 1e-9);
  assert.ok(Math.abs(a.x + a.k * BENCH.CONFLUENCE.x - (b.x + b.k * BENCH.CONFLUENCE.x)) < 1e-9, 'the confluence stays under the fingers through the pinch');
  assert.equal(BENCH.benchVT('anat-fit').k, 1);
});

test('the app runs the same camera node replays: runVecBench steps the stage through benchVT and the lobule scenes through their own cam', async () => {
  let t = 0;
  const realNow = performance.now;
  performance.now = () => t;
  try {
    for (const name of ['pinch', 'anat-deep', 'cv-junction']) {
      const cams = [], focus = [], sets = [];
      const frame = (cb) => { t += 100; Promise.resolve().then(cb); };
      const pps = { loadPreset: async () => true, store: { get: () => ({ lobuleLayers: {} }), set: (v) => sets.push(v) }, stage: { setCamera: (vt) => cams.push({ ...vt }), lobuleFocus: (p, o) => focus.push([p, o]) } };
      const host = { frameFor: () => frame, measure: null, renderer: () => 'vector' };
      const report = await BENCH.runVecBench(name, pps, host);
      assert.match(report, new RegExp(`vecbench ${name}`));
      if (name === 'cv-junction') { assert.equal(focus[0][0], 'central'); assert.equal(sets.at(-1).lobule, true); continue; }
      assert.deepEqual(cams[0], BENCH.benchVT(name, 0), `${name}: the first camera`);
      if (name === 'pinch') {
        assert.ok(cams.length > 10, 'steps through the pinch');
        for (const c of cams.slice(1)) assert.ok(c.k >= 1 && c.k <= BENCH.ANAT_DEEP_K + 1e-9);
        assert.ok(Math.abs(cams.at(-1).k - BENCH.ANAT_DEEP_K) < 1e-9, 'ends at the deepest zoom');
      }
    }
    const refused = await BENCH.runVecBench('anat-fit', {}, { frameFor: () => (cb) => cb(), measure: null, renderer: () => 'mesh' });
    assert.match(refused, /Vector/, 'a benchmark refuses to run under another renderer (no hybrid, no comparison draw)');
  } finally { performance.now = realNow; }
});

// ── The replay ──
const { binVeins } = await import(`${R}veins-bin.js`);
const { N_SAMPLES, N_QUADS } = await import(`${R}veins-mesh.js`);
const NS = N_SAMPLES;
const line = (x, y, dx, dy) => Array.from({ length: NS }, (_, i) => [x + i * dx, y + i * dy]);

test('replayOld on a made scene: a lone vessel is a strip with a bounded window, a join is a region that counts its active join, far away is empty', async () => {
  const { createVecCompiler } = await import('../scripts/vec-old/vec-compile.mjs');
  const tubes = [{ id: 0, pts: line(10, 100, 6, 0), reach: 14 }, { id: 1, pts: line(10, 200, 6, -1.5), reach: 14 }, { id: 2, pts: line(300, 20, 0, 5), reach: 14 }];
  const joins = [{ x: 378, y: 104, reach: 30, k: 0.4, fillet: 0.5, members: [0, 1] }];
  const bins = binVeins([...tubes], joins);
  const radAll = new Float32Array(3 * NS * 4), tubeNow = new Float32Array(3 * 52);
  for (let i = 0; i < 3 * NS; i++) radAll[i * 4] = 4;
  for (let r = 0; r < 3; r++) { tubeNow[r * 52 + 3] = 1; tubeNow[r * 52 + 7] = 1; tubeNow[r * 52 + 8] = 1; }
  const comp = createVecCompiler(), view = comp.build(bins, 3, { tubeNow, radAll });
  const T = REP.oldTables(comp.graph, view), out = REP.newCounts();
  assert.equal(REP.replayOld(T, 5000, 5000, 1, out).cls, 0, 'far away: empty');
  REP.replayOld(T, 120, 100, 1, out);
  assert.equal(out.cls, REP.C_STRIP, 'on the lone vessel (row 0, 120, 100): a strip'); assert.equal(out.row, 0);
  assert.ok(out.seg >= 1 && out.seg <= 17, `the strip's window is at most 2 · STRETCH_WIN + 1 segments (got ${out.seg})`);
  assert.equal(out.bound, 0, 'the old structure has no bound tests'); assert.equal(out.cand, 1);
  let sawJoin = 0, sawRegion = 0;
  for (let y = 90; y <= 120; y += 3) for (let x = 350; x <= 395; x += 3) {
    REP.replayOld(T, x, y, 1, out);
    if (out.cls >= 2) { sawRegion++; assert.ok(out.seg >= out.members, 'a region runs vecNear for every member before it knows whether the member matters'); if (out.joins > 0) sawJoin++; }
  }
  assert.ok(sawRegion > 0 && sawJoin > 0, `the join's cells are regions (${sawRegion}) and the join acts somewhere (${sawJoin})`);
  void N_QUADS;
});

// The contract v2 tables, built by hand: one cell holding a two-level quadtree, runs from A's compiler on a made graph.
async function madeNew() {
  const { createVecGraph, TUBE_FLOATS } = await import(`${R}vec-graph.js`);
  const { createRuns } = await import(`${R}vec-runs.js`);
  const tubes = [{ id: 0, pts: line(10, 10, 4, 1.5), reach: 14 }, { id: 1, pts: line(0, 40, 5, 0), reach: 14 }];
  const bins = binVeins(tubes, []);
  const g = createVecGraph();
  g.fromBins(bins, 2);
  const tube = new Float32Array(2 * TUBE_FLOATS), ra = new Float32Array(2 * NS * 4);
  for (let i = 0; i < 2 * NS; i++) ra[i * 4] = 4;
  g.attrs(tube); g.radii(ra);
  const R1 = createRuns(g).build(), pack = {};
  R1.packRuns(pack);
  return { g, R1, pack };
}

test('the replay\'s bound test is A\'s boundOf: the same capsule, for every run and contribution, at random points', async () => {
  const { g, R1, pack } = await madeNew();
  let seed = 7;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let checked = 0, inside = 0;
  for (let r = 0; r < g.nRows; r++) for (const id of R1.runsOf(r)) for (const bit of [C.C_LUMEN, C.C_SHADOW, C.C_GLOW, C.C_RING]) {
    const b = R1.boundOf(id, bit);
    for (let q = 0; q < 40; q++) {
      const c = pack.data, o = (Math.floor(id / C.RUNS_PER_ROW) * C.RUNS_PER_ROW * C.RUN_TEXELS + (id % C.RUNS_PER_ROW) * C.RUN_TEXELS) * 4;   // (near the run's own chord, where the bounds matter)
      const px = (c[o] + c[o + 2]) / 2 + (rnd() - 0.5) * 60, py = (c[o + 1] + c[o + 3]) / 2 + (rnd() - 0.5) * 60;
      let want = false;
      if (b) {
        const dx = b.bx - b.ax, dy = b.by - b.ay, L = dx * dx + dy * dy, h = L > 0 ? Math.min(1, Math.max(0, ((px - b.ax) * dx + (py - b.ay) * dy) / L)) : 0;
        want = Math.hypot(b.ax + dx * h - px, b.ay + dy * h - py) <= b.r;
      }
      const got = REP.runBoundHit(pack.data, id, bit, px, py, R1.look.shOff);
      if (want !== got) assert.fail(`run ${id} bit ${bit} at ${px},${py}: boundOf says ${want}, the replay ${got}`);
      checked++; if (got) inside++;
    }
  }
  assert.ok(checked > 1000 && inside > 50, `${checked} checks, ${inside} inside`);
});

test('the replay\'s quadtree walk finds the leaf an independent halving finds; and K\'s leafAt when K\'s module is in', async () => {
  // One cell at (0, 0), CELL 16: root node 0 → children [leaf 10, node 1, leaf 12, empty]; node 1 → [leaf 20, leaf 21, leaf 22, leaf 23].
  const kind = (k, i) => ((k << 30) | i) >>> 0;
  const nodes = new Uint32Array(8);
  nodes.set([kind(1, 10), kind(2, 1), kind(1, 12), kind(0, 0)], 0);
  nodes.set([kind(1, 20), kind(1, 21), kind(1, 22), kind(1, 23)], 4);
  const cells = new Uint16Array(C.GRID_W * 4); cells[0] = C.CELL_NODE; cells[1] = 0; cells[2] = 0;   // (cell (0, 0) is node 0; G | B << 16)
  cells[4] = C.CELL_LEAF; cells[5] = 99; cells[6] = 0;                                              // (cell (1, 0) is leaf 99)
  const T = { gridO: [0, 0], gridN: [2, 1], cs: 16, consts: REP.K_NEW, cells, nodes };
  const expect = (x, y) => {
    if (x >= 16) return 99;
    const qx = x >= 8 ? 1 : 0, qy = y >= 8 ? 1 : 0, q = 2 * qy + qx;
    if (q === 0) return 10; if (q === 2) return 12; if (q === 3) return -1;
    return 20 + 2 * (y >= 4 ? 1 : 0) + (x >= 12 ? 1 : 0);
  };
  const o = REP.newCounts();
  for (let y = 0.25; y < 16; y += 0.5) for (let x = 0.25; x < 32; x += 0.5) assert.equal(REP.leafOf(T, x, y, o), expect(x, y), `at ${x}, ${y}`);
  assert.equal(REP.leafOf(T, -1, 3, o), -1); assert.equal(REP.leafOf(T, 40, 3, o), -1, 'outside the grid: none');
  REP.leafOf(T, 13, 5, o);
  assert.equal(o.walk, 2); assert.equal(o.depth, 2);
  const K = await waits('vec-leaves.js');
  if (!K?.leafAt) return;   // (waits for K: its mirror is compared on the same tables below)
  const tables = { grid: { x0: 0, y0: 0, nx: 2, ny: 1 }, cells, nodes };
  for (let y = 0.25; y < 16; y += 0.5) for (let x = 0.25; x < 32; x += 0.5) assert.equal(K.leafAt(tables, x, y), REP.leafOf(T, x, y, o), `K's leafAt at ${x}, ${y}`);
});

test('replayPixel: bound tests before segment tests, segments only for the runs that survive, a join counts only when two members are candidates', async () => {
  const { g, R1, pack } = await madeNew();
  // One leaf (cell (0, 0) leaf 0) listing every run of both rows with the lumen bit; one join of rows 0 and 1 at (30, 20).
  const ids = [...R1.runsOf(0), ...R1.runsOf(1)];
  const runRef = new Uint32Array(ids.map((id) => (id | (C.C_LUMEN << 24)) >>> 0));
  const leaves = new Uint32Array(8); leaves.set([C.L_JOIN, 0, ids.length, 0, 1, 0, 0, 0xffffffff]);
  const cells = new Uint16Array(C.GRID_W * 4); cells[0] = C.CELL_LEAF; cells[1] = 0;
  const joins = new Float32Array(12); joins.set([30, 20, 0.4, 20, 0, 1, -1, -1, 0, 0, 0.5, 0]);
  const T = { gridO: [0, 0], gridN: [8, 8], cs: 16, consts: REP.K_NEW, cells, nodes: new Uint32Array(4), leaves, runRef, joinRef: new Uint32Array([0]), joins, runs: pack.data, graph: g, look: REP.REPLAY_LOOK, headroom: R1.headroom };
  const o = REP.newCounts();
  REP.replayPixel(T, 12, 12, 1, o);
  assert.equal(o.cls, C.L_JOIN);
  assert.equal(o.bound, ids.length, 'one bound test a run for the one contribution its reference lists');
  assert.ok(o.cand >= 1, 'row 0 passes through (12, 12)');
  assert.ok(o.seg <= o.cand * 4 * 16 && o.seg >= 1, `segment tests only for survivors (${o.seg}), at most the survivors' runs' segments`);
  const all = ids.length * C.RUN_SEGS;
  assert.ok(o.seg < all, `fewer segment tests (${o.seg}) than testing every run's segments (${all}): the bounds cull`);
  assert.equal(o.joinTests, 1);
  const w = REP.newCounts();
  REP.replayPixel(T, 5, 15, 1, w);
  assert.equal(w.joins, 0, 'no join acts with fewer than two member candidates');
  assert.equal(REP.workOf(o), o.bound + o.seg + o.joinTests + o.joinIters, 'the plan\'s cost model with equal weights');
});

test('the tallies: mean, p95 and max of a count over pixels, and the projected scale', () => {
  const t = REP.newTally();
  for (let i = 1; i <= 100; i++) REP.addCounts(t, { ...REP.newCounts(), seg: i, work: i });
  const r = REP.tallyRow(t, 16);
  assert.equal(r.px, 1600); assert.equal(r.seg_max, 100); assert.equal(r.seg_p95, 95); assert.equal(r.seg_mean, 50.5);
});
