// The adaptive leaves (workstream K; docs/recommendations/vector-renderer-plan-r1.md section 2.3): the shared GLSL lookup against its JS mirror,
// and the hierarchy's rules judged on the real anatomy. These are preconditions for the renderer, not acceptance: seamless GPU rendering and
// pacing can only be judged on the devices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL, uniformsOf } from './glsl-lint.js';
import { loadGLSL } from './vec-glsl-eval.js';
import { HIER_GLSL, HIER_DECLS, HIER_FUNCS, HIER_UNIFORMS } from '../src/ui/vec-hier-glsl.js';
import {
  createLeafTables, packBegin, setCell, setChild, setLeaf, setBox, reserveRunRefs, setRunRef, reserveJoinRefs, setJoinRef, leafRead,
  CELL_SIZE, CELL_LEAF, CELL_NODE, CHILD_LEAF, CHILD_NODE, CHILD_EMPTY, MAX_DEPTH, LEAF_ROW, GRID_W, NO_OWNER, CLASS_CROSSTIER, tableSize,
} from '../src/ui/vec-leaves-pack.js';
import { leafAt } from '../src/ui/vec-leaves.js';

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
