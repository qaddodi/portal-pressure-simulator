// The compiler as the renderer core calls it (createVecCompiler in src/ui/vec-compile.js, workstream A -> E): a grid view from build, null from
// a call that changed nothing, the dirty rows and region slots from one that changed some. A small made scene; the real anatomy is judged in
// tests/vec-compile.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { binVeins } from '../src/ui/veins-bin.js';
import { N_SAMPLES } from '../src/ui/veins-mesh.js';
import { TUBE_FLOATS, A_TIER, A_CASING } from '../src/ui/vec-graph.js';
import { createVecCompiler, compileGrid, createCompiled, createReach, regionOf, cellOfWorld } from '../src/ui/vec-compile.js';
import { GRID_W, REGION_TEXELS, CELL_REGION, CELL_SIMPLE, K_JOIN } from '../src/ui/vec-contract.js';

const NS = N_SAMPLES;
const line = (x, y, dx, dy) => Array.from({ length: NS }, (_, i) => [x + i * dx, y + i * dy]);
const scene = () => ({
  tubes: [
    { id: 0, pts: line(10, 10, 4, 1.5), reach: 14 },
    { id: 1, pts: line(400, 20, -3, 2.5), reach: 11 },
    { id: 2, pts: line(40, 300, 30, 0.5), reach: 12 },
  ],
  joins: [{ x: 250, y: 100, reach: 20, k: 0.4, fillet: 0.5, members: [0, 1] }],
});
const radArr = (n, v) => { const a = new Float32Array(n * NS * 4); for (let r = 0; r < n; r++) for (let i = 0; i < NS; i++) a[(r * NS + i) * 4] = v; return a; };
const made = () => {
  const s = scene(), bins = binVeins(s.tubes, s.joins, new Map());
  const tube = new Float32Array(3 * TUBE_FLOATS), rad = radArr(3, 4);
  const c = createVecCompiler();
  const view = c.build(bins, 3, { tubeNow: tube, radAll: rad });
  return { c, view, bins, tube, rad };
};

test('build gives the grid view: cell and region textures sized for the contract, the join cells regions with K_JOIN', () => {
  const { view, c } = made();
  assert.ok(view.full && view.cells instanceof Uint16Array && view.regions instanceof Float32Array);
  assert.equal(view.cells.length >= GRID_W * view.rowsH * 4, true);
  assert.equal(view.regions.length >= view.nRegions * REGION_TEXELS * 4, true);
  assert.equal(view.gridN[0] > 0 && view.gridN[1] > 0, true);
  assert.deepEqual(view.dirtyRows, [0, view.gridN[1] - 1]);
  const out = c.compiled, t = cellOfWorld(out, 250, 100);
  assert.equal(view.cells[t * 4], CELL_REGION);
  assert.ok(regionOf(out, view.cells[t * 4 + 1]).kind & K_JOIN);
  assert.equal(view.cells[cellOfWorld(out, 40 + 30 * 10, 300 + 0.5 * 10) * 4], CELL_SIMPLE);
  assert.equal(c.current(), view);
});

test('radii: no change gives null; a narrowing inside the bound gives null; a widening past it gives the dirty rows and slots', () => {
  const { c, rad } = made();
  assert.equal(c.radii(rad), null);
  for (let i = 0; i < NS; i++) rad[(0 * NS + i) * 4] = 3;          // narrower: inside the bound
  assert.equal(c.radii(rad), null);
  for (let i = 0; i < NS; i++) rad[(0 * NS + i) * 4] = 5;          // 5 over 4 × 1.25: inside
  assert.equal(c.radii(rad), null);
  for (let i = 0; i < NS; i++) rad[(0 * NS + i) * 4] = 9;          // past
  const v = c.radii(rad);
  assert.ok(v && !v.full && v.nChanged > 0 && v.dirtyRows);
  assert.ok(v.dirtyRows[0] <= v.dirtyRows[1] && v.dirtyRows[1] < v.gridN[1]);
  assert.equal(c.radii(rad), null, 'the same radii again');
});

test('exceeds: records the radii and says whether a row is past its compiled reach, without compiling', () => {
  const { c } = made();
  const r = new Float32Array(NS).fill(4);
  assert.equal(c.exceeds(1, r), false);
  r.fill(9);
  assert.equal(c.exceeds(1, r), true);
  assert.equal(c.exceeds(-1, r), false); assert.equal(c.exceeds(99, r), false);
  const v = c.rows([1]);
  assert.ok(v && v.nChanged > 0);
  assert.equal(c.exceeds(1, r), false, 'after the row is compiled again 9 is inside its bound');
});

test('attrs: a tier change compiles the row again (null when nothing differs)', () => {
  const { c, tube } = made();
  assert.equal(c.attrs(tube), null);
  tube[2 * TUBE_FLOATS + A_TIER] = 3;
  assert.equal(c.attrs(tube), null, 'a tier alone changes no cell of a lone vessel');
  tube[0 * TUBE_FLOATS + A_CASING] = 6;
  const v = c.attrs(tube);
  assert.ok(v && v.nChanged > 0, 'a wider casing widens the vessel\'s cells');
});

test('patch: the same binning patched gives null', () => {
  const s = scene(), memo = new Map(), bins = binVeins(s.tubes, s.joins, memo);
  const c = createVecCompiler();
  c.build(bins, 3, { tubeNow: new Float32Array(3 * TUBE_FLOATS), radAll: radArr(3, 4) });
  assert.equal(c.patch(binVeins(scene().tubes, scene().joins, memo)), null);
});

test('a compile with a fixed grid and bounds equals one that found its own when nothing changed', () => {
  const { c } = made();
  const out = c.compiled, o2 = createCompiled(), r2 = createReach();
  r2.rb = out.reach.rb.slice(); r2.pad = out.reach.pad.slice(); r2.jb = out.reach.jb.slice(); r2.padNow = out.reach.padNow.slice();
  o2.cell = out.cs; o2.fixed = true; o2.x0 = out.x0; o2.y0 = out.y0; o2.nx = out.nx; o2.ny = out.ny;
  compileGrid(c.graph, r2, o2);
  assert.deepEqual(o2.cells.slice(0, GRID_W * out.ny * 4), out.cells.slice(0, GRID_W * out.ny * 4));
  assert.equal(o2.nRegions, out.nRegions);
});
