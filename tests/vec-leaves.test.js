// The adaptive leaves (workstream K; docs/recommendations/vector-renderer-plan-r1.md section 2.3): the shared GLSL lookup against its JS mirror,
// and the hierarchy's rules judged on the real anatomy. These are preconditions for the renderer, not acceptance: seamless GPU rendering and
// pacing can only be judged on the devices.
import { bootAnatomy, taps } from './vec-anatomy.js';   // (first: the hook that taps the stage's vessel renderer must be in place before the stage is)
import test from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL, uniformsOf } from './glsl-lint.js';
import { loadGLSL } from './vec-glsl-eval.js';
import { HIER_GLSL, HIER_DECLS, HIER_FUNCS, HIER_UNIFORMS } from '../src/ui/vec-hier-glsl.js';
import {
  createLeafTables, packBegin, setCell, setChild, setLeaf, setBox, reserveRunRefs, setRunRef, reserveJoinRefs, setJoinRef, leafRead,
  CELL_SIZE, CELL_LEAF, CELL_NODE, CHILD_LEAF, CHILD_NODE, CHILD_EMPTY, MAX_DEPTH, LEAF_ROW, GRID_W, NO_OWNER, CLASS_CROSSTIER, tableSize,
} from '../src/ui/vec-leaves-pack.js';
import {
  leafAt, boundHit, createLeafSet, buildLeaves, rebuildLeaves, defaultPolicy, summarize,
} from '../src/ui/vec-leaves.js';
import { createVecGraph } from '../src/ui/vec-graph.js';
import { createRuns } from '../src/ui/vec-runs.js';
import { PRESETS } from '../src/engine/scenario.js';
import { N_SAMPLES } from '../src/ui/veins-mesh.js';
import {
  C_LUMEN, C_SHADOW, C_GLOW, C_RING, C_JOIN, L_SINGLE, L_LAYERED, L_CROSS, L_JOIN, L_WIDE, L_MORPH, SLOTS, SLOTS_WIDE, RUNS_PER_ROW, refRun, refBits,
} from '../src/ui/vec-leaves-pack.js';
import { lobuleGeo } from '../src/ui/vec-lobule.js';

const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp usampler2D;\nprecision highp sampler2D;\n';

test('the lookup GLSL lints clean and declares the uniforms the host binds', () => {
  const src = `${HEAD}${HIER_GLSL}\nvoid main() {}\n`;
  assert.deepEqual(lintGLSL(src), []);
  assert.deepEqual(uniformsOf(HIER_DECLS).sort(), [...HIER_UNIFORMS].sort());
});

// A random quadtree under a small grid, written through the pack's writers; also gives the leaf records and run / join refs random numbers.
function randomTables(seed, nx = 5, ny = 4) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const p = createLeafTables();
  packBegin(p, { x0: -32, y0: 16, nx, ny });
  let leaves = 0, nodes = 0;
  const leaf = (x0, y0, size, depth) => {
    const l = leaves++;
    const nr = (rnd() * 5) | 0, nj = (rnd() * 3) | 0;
    const rs = reserveRunRefs(p, nr), js = reserveJoinRefs(p, nj);
    for (let i = 0; i < nr; i++) setRunRef(p, rs + i, (rnd() * 4000) | 0, 1 + ((rnd() * 31) | 0));
    for (let i = 0; i < nj; i++) setJoinRef(p, js + i, (rnd() * 300) | 0);
    const single = rnd() < 0.3;
    setLeaf(p, l, 1 + ((rnd() * 5) | 0) | (rnd() < 0.3 ? CLASS_CROSSTIER : 0), rs, nr, js, nj, (rnd() * 40) | 0, depth, single ? (rnd() * 2000) | 0 : NO_OWNER);
    setBox(p, l, x0, y0, size, 1);
    return l;
  };
  const build = (x0, y0, size, depth) => {   // returns [kind, index]
    const r = rnd();
    if (r < 0.15) return [CHILD_EMPTY, 0];
    if (depth === MAX_DEPTH || r < 0.45) return [CHILD_LEAF, leaf(x0, y0, size, depth)];
    const n = nodes++, h = size / 2;
    for (let q = 0; q < 4; q++) {
      const [k, i] = build(x0 + (q & 1 ? h : 0), y0 + (q >> 1 ? h : 0), h, depth + 1);
      setChild(p, n, q, k, i);
    }
    return [CHILD_NODE, n];
  };
  for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
    const x0 = p.grid.x0 + cx * CELL_SIZE, y0 = p.grid.y0 + cy * CELL_SIZE;
    const r = rnd();
    if (r < 0.15) continue;
    if (r < 0.35) setCell(p, cx, cy, CELL_LEAF, leaf(x0, y0, CELL_SIZE, 0));
    else { const [k, i] = build(x0, y0, CELL_SIZE, 1); if (k === CHILD_NODE) setCell(p, cx, cy, CELL_NODE, i); else if (k === CHILD_LEAF) setCell(p, cx, cy, CELL_LEAF, i); }
  }
  return p;
}

// The shader's textures as the GL would give texels: a function (x, y) → four numbers, from the kept arrays.
function texturesOf(p) {
  return {
    uVecCells: (x, y) => { const o = (y * GRID_W + x) * 4; return [p.cells[o], p.cells[o + 1], p.cells[o + 2], p.cells[o + 3]]; },
    uVecNodes: (x, y) => { const o = (y * 1024 + x) * 4; return [p.nodes[o], p.nodes[o + 1], p.nodes[o + 2], p.nodes[o + 3]]; },
    uVecLeaves: (x, y) => { const l = (y * LEAF_ROW) + (x >> 1), o = (l * 2 + (x & 1)) * 4; return [p.leaves[o], p.leaves[o + 1], p.leaves[o + 2], p.leaves[o + 3]]; },
    uVecRunRefs: (x, y) => [p.runRefs[y * 4096 + x], 0, 0, 1],
    uVecJoinRefs: (x, y) => [p.joinRefs[y * 4096 + x], 0, 0, 1],
  };
}
const fl = (v) => ({ t: 'float', v: Math.fround(v) });
const uniformsOfTables = (p) => ({
  uVecGridO: { t: 'vec2', v: { x: fl(p.grid.x0), y: fl(p.grid.y0) } },
  uVecGridN: { t: 'ivec2', v: { x: { t: 'int', v: p.grid.nx }, y: { t: 'int', v: p.grid.ny } } },
});

test('the evaluator catches a changed comparison (the agreement test can fail)', () => {
  const bad = loadGLSL((HIER_DECLS + HIER_FUNCS).replace('world.x >= ox + h', 'world.x > ox + h'));
  let differs = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const p = randomTables(seed * 131);
    const env = { textures: texturesOf(p), uniforms: uniformsOfTables(p) };
    for (let i = 0; i < 4000; i++) {
      const x = p.grid.x0 + (i % 80) * 0.25, y = p.grid.y0 + ((i / 80) | 0) * 0.25 + 0.125;
      if (bad.call('vecLeafAt', [{ t: 'vec2', v: { x: fl(x), y: fl(y) } }], env).v !== leafAt(p, x, y)) differs++;
    }
  }
  assert.ok(differs > 0);
});

test('vecLeafAt run step by step equals the JS mirror leafAt on random trees, at random points and at every boundary', () => {
  const decl = loadGLSL(HIER_DECLS + HIER_FUNCS);
  let checked = 0, found = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const p = randomTables(seed * 7919);
    const env = { textures: texturesOf(p), uniforms: uniformsOfTables(p) };
    const pts = [];
    let s = seed * 31 + 5;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const W = p.grid.nx * CELL_SIZE, H = p.grid.ny * CELL_SIZE;
    for (let i = 0; i < 400; i++) pts.push([p.grid.x0 - 4 + rnd() * (W + 8), p.grid.y0 - 4 + rnd() * (H + 8)]);
    // every boundary of the finest leaves, and one float32 step either side of it
    const step = CELL_SIZE / 2 ** MAX_DEPTH;
    for (let i = 0; i < 300; i++) {
      const x = p.grid.x0 + Math.round(rnd() * (W / step)) * step, y = p.grid.y0 + Math.round(rnd() * (H / step)) * step;
      for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) pts.push([Math.fround(x) + dx * 2 ** -17, Math.fround(y) + dy * 2 ** -17]);
    }
    for (const [x, y] of pts) {
      const a = leafAt(p, x, y);
      const r = decl.call('vecLeafAt', [{ t: 'vec2', v: { x: fl(x), y: fl(y) } }], env);
      assert.equal(r.t, 'int');
      assert.equal(r.v, a, `seed ${seed} point (${x}, ${y}): shader ${r.v}, mirror ${a}`);
      checked++; if (a >= 0) found++;
    }
  }
  assert.ok(checked > 10000 && found > checked / 4, `compared ${checked} points, ${found} inside a leaf`);
});

test('vecLeafRead, vecRunRef, vecRefRun, vecRefBits and vecJoinRef read the tables as the pack wrote them', () => {
  const decl = loadGLSL(HIER_DECLS + HIER_FUNCS);
  const p = randomTables(4242);
  const env = { textures: texturesOf(p), uniforms: uniformsOfTables(p) };
  const I = (v) => ({ t: 'int', v });
  for (let l = 0; l < p.n.leaves; l++) {
    const r = decl.call('vecLeafRead', [I(l)], env).v, m = leafRead(p, l);
    assert.deepEqual({ cls: r.cls.v, crossTier: r.crossTier.v, runStart: r.runStart.v, runCount: r.runCount.v, joinStart: r.joinStart.v, joinCount: r.joinCount.v, candMax: r.candMax.v, depth: r.depth.v, owner: r.owner.v }, m, `leaf ${l}`);
  }
  for (let i = 0; i < p.n.runRefs; i++) {
    const ref = decl.call('vecRunRef', [I(i)], env);
    assert.equal(ref.t, 'uint');
    assert.equal(decl.call('vecRefRun', [ref], env).v, p.runRefs[i] & 0xffffff);
    assert.equal(decl.call('vecRefBits', [ref], env).v, p.runRefs[i] >>> 24);
  }
  for (let i = 0; i < p.n.joinRefs; i++) assert.equal(decl.call('vecJoinRef', [I(i)], env).v, p.joinRefs[i]);
});

test('the texture sizes follow the counts and the dirty rows are the rows written', () => {
  const p = randomTables(99);
  assert.deepEqual(tableSize(p, 'cells'), { w: GRID_W, h: p.grid.ny });
  assert.ok(tableSize(p, 'leaves').w === LEAF_ROW * 2);
  assert.ok(p.dirty.leaves.lo === 0 && p.dirty.leaves.hi === Math.floor((p.n.leaves - 1) / LEAF_ROW));
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// The hierarchy on the real anatomy (every preset in both views, and the lobule). The stage is booted in node as in tests/vec-compile-presets.test.js.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const A = await bootAnatomy();
const CLASSES = { [L_SINGLE]: 'single', [L_LAYERED]: 'layered', [L_CROSS]: 'cross', [L_JOIN]: 'join', [L_WIDE]: 'wide', [L_MORPH]: 'morph' };
const NS = N_SAMPLES;

function graphOf(f) {
  const graph = createVecGraph();
  graph.fromBins(f.bins, f.nTubes); graph.attrs(f.tube);
  const radAll = new Float32Array(f.nTubes * NS * 4);
  for (let i = 0; i < f.nTubes * NS; i++) radAll[i * 4] = f.rad[i];
  graph.radii(radAll);
  const runs = createRuns(graph).build();
  return { graph, runs };
}
function rnd(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// Every leaf of the tree under the cells: { id, x0, y0, size, depth }.
function walkLeaves(set) {
  const T = set.tables, out = [];
  const visit = (kind, idx, x0, y0, size, depth) => {
    if (kind === 1) { out.push({ id: idx, x0, y0, size, depth }); return; }
    if (kind !== 2) return;
    const h = size / 2;
    for (let q = 0; q < 4; q++) { const w = T.nodes[idx * 4 + q]; visit(w >>> 30, w & 0x3fffffff, x0 + (q & 1 ? h : 0), y0 + (q >> 1 ? h : 0), h, depth + 1); }
  };
  for (let cy = 0; cy < T.grid.ny; cy++) for (let cx = 0; cx < T.grid.nx; cx++) {
    const o = (cy * 256 + cx) * 4, k = T.cells[o];
    if (k) visit(k === 3 ? 1 : 2, T.cells[o + 1] | (T.cells[o + 2] << 16), T.grid.x0 + cx * 16, T.grid.y0 + cy * 16, 16, 0);
  }
  return out;
}
const sig = (set, leaf) => {   // everything a leaf says, as a string
  if (leaf < 0) return 'none';
  const T = set.tables, m = leafRead(T, leaf), refs = [], joins = [];
  for (let i = 0; i < m.runCount; i++) refs.push(T.runRefs[m.runStart + i]);
  for (let i = 0; i < m.joinCount; i++) joins.push(T.joinRefs[m.joinStart + i]);
  return `${m.cls}/${m.crossTier}/${m.candMax}/${m.owner}/${m.depth}|${refs.join(',')}|${joins.join(',')}`;
};

// Sample points: a lattice over the grid, points inside each kind of bound of random runs, and the pixel centres of random cameras down to the deepest zoom.
function samplePoints(set, packed, n, seed) {
  const r = rnd(seed), pts = [], g = set.tables.grid, runs = set.runs, sh = runs.look.shOff;
  const W = g.nx * 16, H = g.ny * 16;
  for (let i = 0; i < n / 4; i++) pts.push([g.x0 + r() * W, g.y0 + r() * H]);
  const ids = [];
  for (let id = 0; id < set.nIds; id++) if (runs.flags[id] & 1) ids.push(id);
  for (let i = 0; i < n / 2 && ids.length; i++) {
    const id = ids[(r() * ids.length) | 0], o = id * 4, c = (r() * 4) | 0, rad = runs.rad[o + c];
    if (!(rad > 0)) continue;
    const t = r(), a = r() * 6.2832, d = Math.sqrt(r()) * rad * 0.999;
    const cx = runs.chord[o] + (runs.chord[o + 2] - runs.chord[o]) * t + (c === 1 ? sh[0] : 0), cy = runs.chord[o + 1] + (runs.chord[o + 3] - runs.chord[o + 1]) * t + (c === 1 ? sh[1] : 0);
    pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
  }
  void packed;
  for (let cam = 0; cam < 6; cam++) {   // a random camera: zoom 1 … 64 × the fit, pan anywhere, the pixel centres of a 1440 × 900 view on a 36 × 24 lattice
    const k = 1.5 * 2 ** (r() * 6), cx = g.x0 + r() * W, cy = g.y0 + r() * H;
    for (let py = 0; py < 24; py++) for (let px = 0; px < 36; px++) pts.push([cx + (px / 36 - 0.5) * 1440 / k, cy + (py / 24 - 0.5) * 900 / k]);
  }
  return pts;
}

function checkScene(t, name, fig, opts = {}) {
  const { graph, runs } = graphOf(fig);
  const set = createLeafSet();
  const t0 = performance.now();
  buildLeaves(runs, graph.joins, null, defaultPolicy(), set);
  const ms = performance.now() - t0;
  const T = set.tables, rep = set.report;
  assert.ok(rep.leaves > 0, `${name}: leaves were made`);
  assert.ok(!(T.grid.nx > 256), `${name}: the grid fits the cell texture (${T.grid.nx} wide)`);
  // leaves never overlap and sit in their cell; the lookup gives a leaf whose square holds the point
  const leaves = walkLeaves(set);
  assert.equal(leaves.length, rep.leaves);
  const seen = new Set();
  for (const l of leaves) {
    assert.ok(!seen.has(l.id), `${name}: leaf ${l.id} reached twice`); seen.add(l.id);
    assert.equal(l.size, 16 / 2 ** l.depth);
    assert.deepEqual([T.boxes[l.id * 4], T.boxes[l.id * 4 + 1], T.boxes[l.id * 4 + 2]], [l.x0, l.y0, l.size], `${name}: leaf ${l.id} box`);
  }
  const byCell = new Map();
  for (const l of leaves) { const k = `${Math.floor((l.x0 - T.grid.x0) / 16)},${Math.floor((l.y0 - T.grid.y0) / 16)}`; (byCell.get(k) ?? byCell.set(k, []).get(k)).push(l); }
  for (const [k, ls] of byCell) {
    let area = 0;
    for (const l of ls) area += l.size * l.size;
    assert.ok(area <= 256 + 1e-9, `${name}: cell ${k} leaves cover ${area} of 256`);
    if (ls.length <= 40) for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i], b = ls[j];
      assert.ok(a.x0 >= b.x0 + b.size || b.x0 >= a.x0 + a.size || a.y0 >= b.y0 + b.size || b.y0 >= a.y0 + a.size, `${name}: leaves ${a.id} and ${b.id} overlap`);
    }
  }
  // no leaf over SLOTS unless it is L_WIDE at MAX_DEPTH
  for (const l of leaves) {
    const m = leafRead(T, l.id);
    if (m.candMax > SLOTS) assert.ok(m.cls === L_WIDE && l.depth === MAX_DEPTH, `${name}: leaf ${l.id} holds ${m.candMax} candidates at depth ${l.depth} as class ${m.cls}`);
    if (m.cls === L_WIDE) assert.ok(m.candMax > SLOTS, `${name}: leaf ${l.id} is wide with ${m.candMax}`);
    if (m.cls === L_SINGLE) assert.ok(m.owner >= 0 && m.joinCount === 0, `${name}: a single leaf has its owner and no join`);
  }
  // nothing lost: every bound that covers a point is listed in that point's leaf, with that bit; candMax is at least the true count there
  const packedRuns = runs.packRuns({}), data = packedRuns.data, sh = runs.look.shOff;
  const pts = samplePoints(set, null, opts.samples ?? 6000, 77);
  const ids = [];
  for (let id = 0; id < set.nIds; id++) if (runs.flags[id] & 1) ids.push(id);
  const joinsN = graph.joins.n, discs = [];
  for (let j = 0; j < joinsN; j++) discs.push(runs.joinDisc(j, {}));
  let inLeaf = 0, bits = 0;
  for (const [px, py] of pts) {
    const leaf = leafAt(T, px, py);
    const refs = new Map(), jl = new Set(), m = leaf >= 0 ? leafRead(T, leaf) : null;
    if (m) {
      for (let i = 0; i < m.runCount; i++) refs.set(refRun(T.runRefs[m.runStart + i]), refBits(T.runRefs[m.runStart + i]));
      for (let i = 0; i < m.joinCount; i++) jl.add(T.joinRefs[m.joinStart + i]);
      inLeaf++;
      assert.ok(px >= T.boxes[leaf * 4] && px <= T.boxes[leaf * 4] + T.boxes[leaf * 4 + 2] + 1e-6 && py >= T.boxes[leaf * 4 + 1] && py <= T.boxes[leaf * 4 + 1] + T.boxes[leaf * 4 + 2] + 1e-6, `${name}: leafAt gave a leaf whose square misses the point`);
    }
    const rowsHit = new Set();
    for (const id of ids) {
      for (const c of [C_LUMEN, C_SHADOW, C_GLOW, C_RING]) {
        if (!boundHit(data, id, c, px, py, sh)) continue;
        rowsHit.add(Math.floor(id / RUNS_PER_ROW)); bits++;
        assert.ok(m && ((refs.get(id) ?? 0) & c), `${name}: run ${id} bound ${c} covers (${px.toFixed(3)}, ${py.toFixed(3)}) but leaf ${leaf} lacks it`);
      }
    }
    for (let j = 0; j < joinsN; j++) {
      const d = discs[j];
      if ((px - d.x) ** 2 + (py - d.y) ** 2 > d.r * d.r) continue;
      assert.ok(m && jl.has(j), `${name}: join ${j} covers (${px.toFixed(3)}, ${py.toFixed(3)}) but leaf ${leaf} lacks it`);
      for (const id of runs.joinRunsOf(j)) { assert.ok(refs.get(id) & C_JOIN, `${name}: join ${j}'s required run ${id} is not listed with its bit`); rowsHit.add(Math.floor(id / RUNS_PER_ROW)); }
    }
    if (rowsHit.size) assert.ok(m && m.candMax >= rowsHit.size, `${name}: candMax ${m?.candMax} under the true count ${rowsHit.size}`);
  }
  assert.ok(inLeaf > 100, `${name}: sampled ${inLeaf} points in leaves`);
  t.diagnostic(`${name}: ${rep.leaves} leaves in ${rep.cells} cells, ${rep.nodes} nodes, ${rep.runRefs} run refs, built in ${ms.toFixed(0)} ms; classes ${Object.entries(rep.byClass).map(([k, v]) => `${CLASSES[k]} ${v}`).join(', ')}; depth ${rep.depth.join('/')}; wide ${rep.wide.length} (over ${SLOTS_WIDE}: ${rep.overWide.length}, soft piles: ${rep.falseProximity.length}); ${bits} bound hits checked`);
  assert.equal(rep.overWide.length, 0, `${name}: stop point: a leaf with more than ${SLOTS_WIDE} candidates: ${JSON.stringify(rep.overWide.slice(0, 3))}`);
  return { graph, runs, set, rep };
}

let first = true;
for (const view of ['anatomy', 'circuit']) {
  for (const p of PRESETS) {
    test(`${view}, preset ${p.id}: the hierarchy (lookup, nothing lost, candMax, slots, overlap)`, { timeout: 280000 }, async (t) => {
      if (first) { await A.preset(p.id, 40); first = false; } else await A.preset(p.id, 12);
      if (view === 'circuit' && p === PRESETS[0]) await A.view('circuit', 100);
      const fig = A.figure();
      assert.ok(fig && fig.bins, 'the stage gave the vessel renderer a binning');
      checkScene(t, `${view}/${p.id}`, fig, { samples: p.id === 'cirr-decomp' ? 6000 : 1500 });
    });
  }
}
