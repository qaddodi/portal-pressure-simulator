// The adaptive leaves (workstream K; docs/recommendations/vector-renderer-plan-r1.md section 2.3): the shared GLSL lookup against its JS mirror,
// and the hierarchy's rules judged on the real anatomy. These are preconditions for the renderer, not acceptance: seamless GPU rendering and
// pacing can only be judged on the devices.
import { bootAnatomy, taps } from './vec-anatomy.js';   // (first: the hook that taps the stage's vessel renderer must be in place before the stage is)
import test from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL, uniformsOf } from './glsl-lint.js';
import { loadGLSL } from './vec-glsl-eval.js';
import { HIER_GLSL, HIER_DECLS, HIER_FUNCS, HIER_UNIFORMS, HIER_LOOKUP_GLSL, HIER_JOIN_GLSL, HIER_LOOKUP_UNIFORMS, HIER_JOIN_UNIFORMS, HIER_LOOKUP_DECLS } from '../src/ui/vec-hier-glsl.js';
import {
  createLeafTables, packBegin, setCell, setChild, setLeaf, setBox, reserveRunRefs, setRunRef, reserveJoinRefs, setJoinRef, leafRead,
  combineRunJoin, joinTexel, JOIN_PER_ROW, RUN_TABLE_W, RUN_TEXELS, JOIN_TEXELS,
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
  C_LUMEN, C_SHADOW, C_GLOW, C_RING, L_SINGLE, L_LAYERED, L_CROSS, L_JOIN, L_WIDE, L_MORPH, SLOTS, SLOTS_WIDE, RUNS_PER_ROW, refRun, refBits,
} from '../src/ui/vec-leaves-pack.js';
import { lobuleGeo } from '../src/ui/vec-lobule.js';
import * as CONTRACT from '../src/ui/vec-contract.js';
import { segRect2 } from '../src/ui/vec-leaves.js';

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
  };
}
const fl = (v) => ({ t: 'float', v: Math.fround(v) });
const uniformsOfTables = (p) => ({
  uVecGridO: { t: 'vec2', v: { x: fl(p.grid.x0), y: fl(p.grid.y0) } },
  uVecGridN: { t: 'ivec2', v: { x: { t: 'int', v: p.grid.nx }, y: { t: 'int', v: p.grid.ny } } },
});

test('the lookup is two parts: the lookup alone has no join and no join sampler, the join part adds only a uniform, and HIER_GLSL is both', () => {
  assert.equal(HIER_GLSL, HIER_LOOKUP_GLSL + HIER_JOIN_GLSL);
  assert.deepEqual(lintGLSL(`${HEAD}${HIER_LOOKUP_GLSL}\nvoid main() {}\n`), []);
  assert.deepEqual(lintGLSL(`${HEAD}${HIER_LOOKUP_GLSL}${HIER_JOIN_GLSL}\nvoid main() {}\n`), []);
  assert.doesNotMatch(HIER_LOOKUP_GLSL, /uVecJoin|VecJoin|vecJoin/, 'the lookup part declares and calls no join');
  assert.deepEqual(uniformsOf(HIER_LOOKUP_DECLS).sort(), [...HIER_LOOKUP_UNIFORMS].sort());
  assert.deepEqual([...HIER_JOIN_UNIFORMS], ['uVecJoinRow0']);
  const samplers = (src) => src.split('\n').filter((l) => /^uniform .*sampler2D /.test(l)).map((l) => l.replace(/^.* (\w+);.*$/, '$1'));
  assert.deepEqual(samplers(HIER_GLSL).sort(), ['uVecCells', 'uVecLeaves', 'uVecNodes', 'uVecRunRefs', 'uVecRuns'], 'five samplers in all: one ref list and one float table');
  assert.deepEqual(samplers(HIER_JOIN_GLSL), [], 'the join part declares no sampler');
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
  for (let i = 0; i < p.n.runRefs; i++) assert.equal(decl.call('vecJoinRef', [I(i)], env).v, p.runRefs[i]);   // one list: a join ref reads the same array
});

test('the joins live below the runs in the one float table: vecJoinRead and vecJoinTexelX/Y agree with joinTexel, and combineRunJoin writes them there', () => {
  const decl = loadGLSL(HIER_GLSL);
  const nRows = 7, nJoins = 50;
  const runsOut = { data: new Float32Array(nRows * RUN_TABLE_W * 4).map((_, i) => i % 97), width: RUN_TABLE_W, height: nRows, dirty: null };
  const joinsOut = { data: new Float32Array(nJoins * JOIN_TEXELS * 4), count: nJoins };
  for (let j = 0; j < nJoins; j++) {
    const o = j * 12;
    Object.assign(joinsOut.data.subarray(o, o + 12), [j + 0.5, -j, 1 + j * 0.01, 2 + j * 0.02, j, j + 1, -1, -1, j + 1, j % 2, 0.25, 0]);
  }
  const tab = combineRunJoin({}, runsOut, joinsOut);
  assert.equal(tab.width, RUN_TABLE_W); assert.equal(tab.joinRow0, nRows); assert.equal(tab.height, nRows + Math.ceil(nJoins / JOIN_PER_ROW));
  assert.equal(tab.dirty, null, 'the first fill is whole');
  assert.deepEqual(Array.from(tab.data.subarray(0, nRows * RUN_TABLE_W * 4)), Array.from(runsOut.data), 'the runs are where A put them');
  const env = {
    textures: { uVecRuns: Object.assign((x, y) => { const o = (y * tab.width + x) * 4; return [tab.data[o], tab.data[o + 1], tab.data[o + 2], tab.data[o + 3]]; }, { float: true }) },
    uniforms: { uVecJoinRow0: { t: 'int', v: tab.joinRow0 } },
  };
  const I = (v) => ({ t: 'int', v });
  for (let j = 0; j < nJoins; j++) {
    const tx = joinTexel(j, 0);
    assert.equal(decl.call('vecJoinTexelX', [I(j)], env).v, tx.x); assert.equal(decl.call('vecJoinTexelY', [I(j)], env).v, tx.y - 0 + tab.joinRow0);
    const r = decl.call('vecJoinRead', [I(j)], env).v;
    assert.deepEqual([r.c.v.x.v, r.c.v.y.v, r.k.v, r.reach.v], Array.from(joinsOut.data.subarray(j * 12, j * 12 + 4)).map(Math.fround));
    assert.deepEqual([r.rows.v.x.v, r.rows.v.y.v, r.rows.v.z.v, r.rows.v.w.v], [j, j + 1, -1, -1]);
    assert.equal(r.trunk.v, j + 1); assert.equal(r.trunkIdx.v, 1); assert.equal(r.fork.v, j % 2 === 1); assert.equal(r.fillet.v, 0.25);
  }
  // a later fill with the same shape copies only the runs' dirty rows (and the joins), and says which rows to upload
  runsOut.data[3 * RUN_TABLE_W * 4 + 5] = -9; runsOut.dirty = [3, 3];
  joinsOut.data[0] = 123;
  combineRunJoin(tab, runsOut, joinsOut);
  assert.deepEqual(tab.dirty, [3, tab.height - 1]);
  assert.equal(tab.data[3 * RUN_TABLE_W * 4 + 5], -9); assert.equal(tab.data[nRows * RUN_TABLE_W * 4], 123);
  assert.equal(RUN_TEXELS, 4);
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
  for (let i = 0; i < m.joinCount; i++) joins.push(T.runRefs[m.joinStart + i]);
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


// Plan-r1 2.2.1, replayed here without the builder's code: a join's grown bound for a member run at distance d from the join's centre.
const G_JOIN = CONTRACT.G_JOIN ?? 2.2, G_JOIN_SH = CONTRACT.G_JOIN_SH ?? 1.25;
const smoothstep01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the member rows (indices into mem) with a run whose grown bound reaches the box [x0, x1] x [y0, y1]; d: the box's nearest distance to the centre
function growMembers(runs, graph, j, x0, y0, x1, y1, d, tol) {
  const J = graph.joins, jk = J.k[j] * (1 - smoothstep01(0.55 * J.reach[j], J.reach[j], d)), sh = runs.look.shOff, rows = new Set();
  for (const id of runs.joinRunsOf(j)) {
    const row = Math.floor(id / RUNS_PER_ROW);
    if (![0, 1, 2, 3].some((m) => J.mem[j * 4 + m] === row)) continue;
    const o = id * 4, ax = runs.chord[o], ay = runs.chord[o + 1], bx = runs.chord[o + 2], by = runs.chord[o + 3];
    const rl = runs.rad[o] + G_JOIN * jk + tol, rs = runs.rad[o + 1] > 0 ? runs.rad[o + 1] + G_JOIN_SH * jk + tol : 0;
    if (segRect2(ax, ay, bx, by, x0, y0, x1, y1) <= rl * rl || (rs > 0 && segRect2(ax + sh[0], ay + sh[1], bx + sh[0], by + sh[1], x0, y0, x1, y1) <= rs * rs)) rows.add(row);
  }
  return rows;
}

function checkScene(t, name, fig, opts = {}) {
  const { graph, runs } = graphOf(fig);
  const set = createLeafSet();
  const t0 = process.hrtime.bigint();
  buildLeaves(runs, graph.joins, null, defaultPolicy(), set);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
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
  let inLeaf = 0, bits = 0, lumenPts = 0, lumenJoin = 0;
  for (const [px, py] of pts) {
    const leaf = leafAt(T, px, py);
    const refs = new Map(), jl = new Set(), m = leaf >= 0 ? leafRead(T, leaf) : null;
    if (m) {
      for (let i = 0; i < m.runCount; i++) refs.set(refRun(T.runRefs[m.runStart + i]), refBits(T.runRefs[m.runStart + i]));
      for (let i = 0; i < m.joinCount; i++) jl.add(T.runRefs[m.joinStart + i]);
      inLeaf++;
      assert.ok(px >= T.boxes[leaf * 4] && px <= T.boxes[leaf * 4] + T.boxes[leaf * 4 + 2] + 1e-6 && py >= T.boxes[leaf * 4 + 1] && py <= T.boxes[leaf * 4 + 1] + T.boxes[leaf * 4 + 2] + 1e-6, `${name}: leafAt gave a leaf whose square misses the point`);
    }
    const rowsHit = new Set();
    let inLumen = false;
    for (const id of ids) {
      for (const c of [C_LUMEN, C_SHADOW, C_GLOW, C_RING]) {
        if (!boundHit(data, id, c, px, py, sh)) continue;
        rowsHit.add(Math.floor(id / RUNS_PER_ROW)); bits++; if (c === C_LUMEN) inLumen = true;
        assert.ok(m && ((refs.get(id) ?? 0) & c), `${name}: run ${id} bound ${c} covers (${px.toFixed(3)}, ${py.toFixed(3)}) but leaf ${leaf} lacks it`);
      }
    }
    if (inLumen && m) { lumenPts++; if (m.cls === L_JOIN) lumenJoin++; }
    if (rowsHit.size) assert.ok(m && m.candMax >= rowsHit.size, `${name}: candMax ${m?.candMax} under the true count ${rowsHit.size}`);
  }
  // joins (plan-r1 2.2.1): never listed in a leaf where fewer than two members' grown bounds reach it (cross-tier joins also inside 0.85 R), and always listed where two do
  {
    const J = graph.joins, TOL = 1e-3;
    let listed = 0, checkedPts = 0;
    for (const l of leaves) {
      const m = leafRead(T, l.id);
      for (let i = 0; i < m.joinCount; i++) {
        const j = T.runRefs[m.joinStart + i], c = runs.joinDisc(j, {});
        const dx = Math.max(l.x0 - c.x, 0, c.x - (l.x0 + l.size)), dy = Math.max(l.y0 - c.y, 0, c.y - (l.y0 + l.size)), d = Math.hypot(dx, dy);
        const two = growMembers(runs, graph, j, l.x0, l.y0, l.x0 + l.size, l.y0 + l.size, d, TOL).size >= 2 && d <= c.r + TOL;
        const tiers = [0, 1, 2, 3].map((q) => J.mem[j * 4 + q]).filter((r) => r >= 0).map((r) => graph.rows[r].tier);
        const cross = Math.min(...tiers) !== Math.max(...tiers) && d <= 0.85 * J.reach[j] * 1.1 + TOL;
        assert.ok(two || cross, `${name}: join ${j} is listed in leaf ${l.id} where fewer than two members' grown bounds reach it`);
        listed++;
      }
    }
    for (const [px, py] of pts) {
      const leaf = leafAt(T, px, py);
      for (let j = 0; j < joinsN; j++) {
        const d = Math.hypot(px - discs[j].x, py - discs[j].y);
        if (d > discs[j].r - TOL) continue;
        if (growMembers(runs, graph, j, px, py, px, py, d, -TOL).size < 2) continue;
        checkedPts++;
        const m = leaf >= 0 ? leafRead(T, leaf) : null;
        let has = false;
        for (let i = 0; m && i < m.joinCount; i++) if (T.runRefs[m.joinStart + i] === j) has = true;
        assert.ok(has, `${name}: join ${j} has two members' grown bounds at (${px.toFixed(3)}, ${py.toFixed(3)}) but is not listed in its leaf`);
      }
    }
    t.diagnostic(`${name}: ${listed} join refs checked against the grown-bound rule, ${checkedPts} points where two members reach all list their join`);
  }
  assert.ok(inLeaf > 100, `${name}: sampled ${inLeaf} points in leaves`);
  t.diagnostic(`${name}: ${rep.leaves} leaves in ${rep.cells} cells, ${rep.nodes} nodes, ${rep.runRefs} run refs, built in ${ms.toFixed(0)} ms; classes ${Object.entries(rep.byClass).map(([k, v]) => `${CLASSES[k]} ${v}`).join(', ')}; depth ${rep.depth.join('/')}; wide ${rep.wide.length} [hard candidates: ≤8 ${rep.wideHard.le8}, ≤32 ${rep.wideHard.le32}, more ${rep.wideHard.more}, max ${rep.wideHard.maxHard}] (over ${SLOTS_WIDE}: ${rep.overWide.length}, soft piles: ${rep.falseProximity.length}); L_JOIN is ${(100 * rep.area[L_JOIN] / Math.max(1, Object.values(rep.area).reduce((x, y) => x + y, 0))).toFixed(1)}% of the leaf area, ${(100 * lumenJoin / Math.max(1, lumenPts)).toFixed(1)}% of the sampled lumen-bound points (${lumenPts}); ${bits} bound hits checked`);
  assert.equal(rep.overWide.length, 0, `${name}: stop point: a leaf with more than ${SLOTS_WIDE} candidates: ${JSON.stringify(rep.overWide.slice(0, 3))}`);
  return { graph, runs, set, rep };
}

let first = true;
async function figure() { let f = A.figure(); if (!f) { await A.preset('cirr-decomp', 40); first = false; f = A.figure(); } return f; }
function presetTests(view) {
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
presetTests('anatomy');

// A changed material rebuilds only the squares its runs reach, and what it leaves is what a fresh build gives.
function boxesAt(set, pts) { return pts.map(([x, y]) => { const l = leafAt(set.tables, x, y); return l < 0 ? null : [set.tables.boxes[l * 4], set.tables.boxes[l * 4 + 1], set.tables.boxes[l * 4 + 2]]; }); }
const meets = (b, x0, y0, x1, y1) => b && b[0] <= x1 && b[0] + b[2] >= x0 && b[1] <= y1 && b[1] + b[2] >= y0;
function sigsAt(set, pts) { return pts.map(([x, y]) => sig(set, leafAt(set.tables, x, y))); }
test('a material change (glow, selection) rebuilds only the leaves its runs reach, and equals a fresh build; undoing it restores the original', { timeout: 280000 }, async (t) => {
  const fig = await figure(), { graph, runs } = graphOf(fig);
  const set = createLeafSet();
  buildLeaves(runs, graph.joins, null, defaultPolicy(), set);
  const pts = samplePoints(set, null, 4000, 5);
  const original = sigsAt(set, pts), total = set.report.leaves;
  const on = []; for (let r = 0; r < graph.nRows; r++) if (graph.rows[r].on) on.push(r);
  const pick = [on[3], on[Math.floor(on.length / 3)], on[Math.floor(on.length / 2)], on[on.length - 2]];
  for (const mode of ['glow', 'sel']) {
    for (const row of pick) {
      const rec = graph.rows[row], before = sigsAt(set, pts), boxBefore = boxesAt(set, pts), extWas = set.ext.slice();
      if (mode === 'glow') { rec.glow = 1; rec.glowW = 1; } else rec.sel = 1;
      const n = runs.rebuildRows([row], 1);
      assert.ok(n > 0, `${mode} on row ${row} changed some runs`);
      const changed = Array.from(runs.changed.subarray(0, n)), cj = Array.from(runs.changedJoins.subarray(0, runs.nChangedJoins));
      rebuildLeaves(changed, set, n, cj, cj.length);
      const written = set.stats.leavesWritten + set.stats.nodesWritten;
      const fresh = createLeafSet();
      buildLeaves(runs, graph.joins, null, defaultPolicy(), fresh);
      assert.equal(set.report.leaves, fresh.report.leaves, `${mode} row ${row}: the same number of leaves as a fresh build`);
      assert.deepEqual(set.report.byClass, fresh.report.byClass);
      const after = sigsAt(set, pts), want = sigsAt(fresh, pts), boxAfter = boxesAt(set, pts);
      let moved = 0;
      for (let i = 0; i < pts.length; i++) {
        assert.equal(after[i], want[i], `${mode} row ${row}: leaf at (${pts[i][0].toFixed(2)}, ${pts[i][1].toFixed(2)}) differs from a fresh build`);
        if (after[i] !== before[i]) {   // a leaf that changed: its square (now or before) meets a box the changed runs reach (old or new bounds) or a changed join's disc
          moved++;
          const bx = [boxBefore[i], boxAfter[i]];
          const inside = bx.some((q) => q && (changed.some((id) => meets(q, extWas[id * 4], extWas[id * 4 + 1], extWas[id * 4 + 2], extWas[id * 4 + 3]) || meets(q, set.ext[id * 4], set.ext[id * 4 + 1], set.ext[id * 4 + 2], set.ext[id * 4 + 3]))
            || cj.some((j) => meets(q, set.jext[j * 7 + 3], set.jext[j * 7 + 4], set.jext[j * 7 + 5], set.jext[j * 7 + 6]))));
          assert.ok(inside, `${mode} row ${row}: a leaf changed at (${pts[i][0].toFixed(2)}, ${pts[i][1].toFixed(2)}) where no changed run reaches`);
        }
      }
      assert.ok(moved > 0 || mode === 'sel', `${mode} row ${row} moved some sampled leaves`);
      assert.ok(set.stats.leavesWritten <= Math.max(8, total * 0.25), `${mode} row ${row}: ${set.stats.leavesWritten} of ${total} leaves written`);
      t.diagnostic(`${mode} row ${row}: ${changed.length} runs changed, ${set.stats.leavesWritten} leaves and ${set.stats.nodesWritten} nodes written of ${total}, ${set.stats.cellsTouched} cells, ${moved} of ${pts.length} samples moved, full=${!!set.stats.full}`);
      void written;
      if (mode === 'glow') { rec.glow = 0; rec.glowW = 0; } else rec.sel = 0;
      const n2 = runs.rebuildRows([row], 1), ch2 = Array.from(runs.changed.subarray(0, n2)), cj2 = Array.from(runs.changedJoins.subarray(0, runs.nChangedJoins));
      rebuildLeaves(ch2, set, n2, cj2, cj2.length);
      const back = sigsAt(set, pts);
      for (let i = 0; i < pts.length; i++) assert.equal(back[i], original[i], `${mode} row ${row} undone: leaf at point ${i} is not the original`);
    }
  }
});

test('the hierarchy does not depend on the camera: building twice gives the same tables, and the lookups under any camera leave them untouched', async () => {
  const fig = await figure(), { graph, runs } = graphOf(fig);
  const a = createLeafSet(), b = createLeafSet();
  buildLeaves(runs, graph.joins, null, defaultPolicy(), a);
  buildLeaves(runs, graph.joins, null, defaultPolicy(), b);
  for (const k of ['cells', 'nodes', 'leaves', 'boxes', 'runRefs']) {
    const len = k === 'cells' ? a.tables.cells.length : k === 'nodes' ? a.tables.n.nodes * 4 : k === 'leaves' ? a.tables.n.leaves * 8 : k === 'boxes' ? a.tables.n.leaves * 4 : a.tables.n[k];
    assert.deepEqual(Array.from(a.tables[k].subarray(0, len)), Array.from(b.tables[k].subarray(0, len)), `table ${k}`);
  }
  const before = Array.from(a.tables.nodes.subarray(0, a.tables.n.nodes * 4)).join();
  for (const p of samplePoints(a, null, 800, 3)) leafAt(a.tables, p[0], p[1]);
  assert.equal(Array.from(a.tables.nodes.subarray(0, a.tables.n.nodes * 4)).join(), before);
});

test('a morph set (bounds are the morph boxes): classes are single, morph or wide, and every box that covers a point is listed in its leaf', { timeout: 280000 }, async (t) => {
  const fig = await figure(), { graph, runs } = graphOf(fig);
  const set = createLeafSet(), pol = defaultPolicy();
  pol.mode = 'box';
  buildLeaves(runs, graph.joins, null, pol, set);
  const rep = set.report, T = set.tables;
  assert.equal(rep.byClass[L_LAYERED] + rep.byClass[L_CROSS] + rep.byClass[L_JOIN], 0, 'a morph set has only single, morph and wide leaves');
  assert.ok(rep.byClass[L_MORPH] > 0);
  const r = rnd(9);
  let n = 0;
  for (let i = 0; i < 3000; i++) {
    const id = (r() * set.nIds) | 0;
    if (!(runs.flags[id] & 1)) continue;
    const o = id * 4, x = runs.box[o] + r() * (runs.box[o + 2] - runs.box[o]), y = runs.box[o + 1] + r() * (runs.box[o + 3] - runs.box[o + 1]);
    const leaf = leafAt(T, x, y);
    assert.ok(leaf >= 0, 'a point inside a run\'s box is in a leaf');
    const m = leafRead(T, leaf);
    let bits = 0;
    for (let k = 0; k < m.runCount; k++) if (refRun(T.runRefs[m.runStart + k]) === id) bits = refBits(T.runRefs[m.runStart + k]);
    for (let c = 0; c < 4; c++) if (runs.rad[o + c] > 0) assert.ok(bits & (1 << c), `box of run ${id} covers a point but contribution ${1 << c} is not listed`);
    n++;
  }
  assert.ok(n > 500);
  t.diagnostic(`morph-mode build: ${rep.leaves} leaves, classes ${Object.entries(rep.byClass).map(([k, v]) => `${CLASSES[k]} ${v}`).join(', ')}`);
});

presetTests('circuit');

test('the lobule: the hierarchy, its wide leaves, and the central vein named', { timeout: 280000 }, async (t) => {
  await A.view('lobule', 220);
  const tap = taps.find((x) => x.who === 'lobule' && x.bins);
  assert.ok(tap, 'the lobule\'s renderer was given a binning');
  const fig = { nTubes: tap.nTubes, bins: { ent: tap.bins.ent.slice(), cells: tap.bins.cells.slice(0, tap.bins.nCells * 6), nCells: tap.bins.nCells, nEnt: tap.bins.nEnt, rows: tap.bins.rows }, tube: tap.tube.slice(), rad: tap.rad.slice() };
  const out = checkScene(t, 'lobule', fig, { samples: 6000 });
  // the central vein: where the most vessels meet (the leaf with the largest candMax, the one nearest the lobule's centre among equals)
  const geo = lobuleGeo(1200, 800);
  let best = null;
  for (const l of walkLeaves(out.set)) {
    const m = leafRead(out.set.tables, l.id), d = Math.hypot(l.x0 + l.size / 2 - geo.cx, l.y0 + l.size / 2 - geo.cy);
    if (!best || m.candMax > best.cand || (m.candMax === best.cand && d < best.d)) best = { l, cand: m.candMax, d };
  }
  const cx = best.l.x0 + best.l.size / 2, cy = best.l.y0 + best.l.size / 2;
  const rows = new Set();
  { const m = leafRead(out.set.tables, best.l.id); for (let i = 0; i < m.runCount; i++) rows.add(Math.floor(refRun(out.set.tables.runRefs[m.runStart + i]) / RUNS_PER_ROW)); }
  const near = out.rep.wide.filter((w) => Math.hypot(w.x + w.size / 2 - cx, w.y + w.size / 2 - cy) < 6);
  t.diagnostic(`central vein (the leaf with the most vessels, candMax ${best.cand}, ${best.d.toFixed(1)} units from the lobule's centre (${geo.cx}, ${geo.cy})) at (${cx.toFixed(2)}, ${cy.toFixed(2)}): rows ${[...rows].join(',')}; ${near.length} wide leaves within 6 units of it (${out.rep.wide.length} wide in all)`);
  const lf = leafAt(out.set.tables, cx, cy);
  assert.ok(lf >= 0, 'the central vein\'s centre is inside a leaf');
  const m = leafRead(out.set.tables, lf);
  const listed = new Set();
  for (let i = 0; i < m.runCount; i++) listed.add(Math.floor(refRun(out.set.tables.runRefs[m.runStart + i]) / RUNS_PER_ROW));
  for (const r of rows) assert.ok(listed.has(r), `the central vein's vessel ${r} is listed at its centre (nothing dropped)`);
  assert.ok(best.cand <= SLOTS_WIDE);
  void lobuleGeo; void rebuildLeaves; void summarize;
});
