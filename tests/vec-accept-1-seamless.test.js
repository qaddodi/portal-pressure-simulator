// Acceptance 1 (vector-renderer-plan.md section 11): seamless joins and region edges at the deepest zoom.
// Node judges, on the real anatomy (cirr-decomp, in the Anatomy and in the Circuit, booted by tests/vec-anatomy.js) and A's compiler:
//   · under random cameras up to the deepest zoom, the cell a pixel centre falls in is the one the plan's formula gives (so a strip and a region
//     both reading it agree), a cell has one owner, and the quad of a region cell is exactly that cell's square;
//   · every point inside a vessel's lumen, anywhere along it and at a join or a region edge, lies in a cell some program draws it in: an
//     ordinary cell of that vessel whose run holds the nearest segment, or a region that lists that vessel with that segment;
//   · the same world point lands in the same cell under any camera (so the same owner draws it, and the same value results);
//   · the stretch shader and the region shader find the cell by the same text and shade a single-member pixel with the same function.
// On the devices: pinch to the deepest zoom over a join and a region edge.
import { bootAnatomy } from './vec-anatomy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/ui/vec-contract.js';
import { createVecGraph } from '../src/ui/vec-graph.js';
import { createReach, createCompiled, compileGrid, cellOfPixel, cellOfWorld, regionOf, NS } from '../src/ui/vec-compile.js';
import { N_QUADS } from '../src/ui/veins-mesh.js';
import { CELL } from '../src/ui/veins-bin.js';
import { DIVE_K_MAX } from '../src/ui/vec-organs.js';

// ── The figure, in the two views, compiled as the renderer compiles it ──
const A = await bootAnatomy();
await A.preset('cirr-decomp', 40);
function build(f) {
  const graph = createVecGraph();
  graph.fromBins(f.bins, f.nTubes); graph.attrs(f.tube);
  const radAll = new Float32Array(f.nTubes * NS * 4);
  for (let i = 0; i < f.nTubes * NS; i++) radAll[i * 4] = f.rad[i];
  graph.radii(radAll);
  const reach = createReach(), out = createCompiled();
  compileGrid(graph, reach, out);
  return { graph, reach, out };
}
const views = { anatomy: build(A.figure()) };
await A.view('circuit', 100);
views.circuit = build(A.figure());

// (after the boot, which installs the page these modules read)
const GL = await import('../src/ui/veins-gl.js');
const { VEC_SHADE_GLSL } = await import('../src/ui/vec-shade-glsl.js');
const { vecStretchFS } = await import('../src/ui/vec-stretch-glsl.js');
const { vecRegionFS, vecRegionVS } = await import('../src/ui/vec-region-glsl.js');

// ── A seeded camera: world → device is (s 0 0 s tx ty); the pixel → world matrix the shaders get is its inverse, in float32 ──
const rng = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const f32 = Math.fround;
const camera = (rnd, out, wx, wy) => {
  const s = 0.5 + rnd() * (DIVE_K_MAX * 1.5 - 0.5);                 // zooms to the deepest the organs are drawn at (the dive's ×16·e^0.35), and a bit past
  const px = rnd() * 1200, py = rnd() * 800;                          // where, in a 1200 × 800 picture, the point of interest lands
  const tx = px - s * wx, ty = py - s * wy;
  return { s, tx, ty, px, py, inv: [f32(1 / s), 0, 0, f32(1 / s), f32(-tx / s), f32(-ty / s)] };
};
void camera;

for (const [name, v] of Object.entries(views)) {
  const { graph, reach, out } = v;

  test(`${name}: under random cameras up to the deepest zoom a pixel centre's cell is the plan's formula, and a cell has one owner`, () => {
    const rnd = rng(11);
    let nonEmpty = 0, edge = 0;
    for (let n = 0; n < 4000; n++) {
      const wx = out.x0 + rnd() * out.nx * out.cs, wy = out.y0 + rnd() * out.ny * out.cs;
      const cam = camera(rnd, out, wx, wy);
      const t = cellOfPixel(out, cam.inv, Math.floor(cam.px) + 0.5, Math.floor(cam.py) + 0.5);
      // the formula again, in double precision, from the same matrix
      const dx = cam.inv[0] * (Math.floor(cam.px) + 0.5) + cam.inv[2] * (Math.floor(cam.py) + 0.5) + cam.inv[4];
      const dy = cam.inv[1] * (Math.floor(cam.px) + 0.5) + cam.inv[3] * (Math.floor(cam.py) + 0.5) + cam.inv[5];
      const fx = (dx - out.x0) / out.cs, fy = (dy - out.y0) / out.cs;
      const near = Math.abs(fx - Math.round(fx)) < 1e-3 || Math.abs(fy - Math.round(fy)) < 1e-3;   // within a thousandth of a cell of an edge, float32 may round either way
      if (near) { edge++; continue; }
      const cx = Math.floor(fx), cy = Math.floor(fy), inside = cx >= 0 && cy >= 0 && cx < out.nx && cy < out.ny;
      assert.equal(t, inside ? cy * C.GRID_W + cx : -1, `camera ${n}: cell of pixel`);
      if (!inside) continue;
      const k = out.cells[t * 4];
      assert.ok(k === C.CELL_EMPTY || k === C.CELL_SIMPLE || k === C.CELL_REGION, 'a known kind');
      // one owner: the strips of rows draw only where the cell is theirs, the region quads only where it is theirs
      let owners = 0;
      if (k === C.CELL_SIMPLE) for (let r = 0; r < graph.nRows; r++) if (out.cells[t * 4 + 1] === r) owners++;
      if (k === C.CELL_REGION) owners++;
      assert.equal(owners, k === C.CELL_EMPTY ? 0 : 1, `camera ${n}: owners of a ${k} cell`);
      if (k !== C.CELL_EMPTY) nonEmpty++;
    }
    assert.ok(nonEmpty > 100, `enough of the samples fell on drawn cells (${nonEmpty}, ${edge} at an edge)`);
  });

  test(`${name}: the same world point is in the same cell under any camera, also at the deepest zoom`, () => {
    const rnd = rng(12);
    let compared = 0;
    for (let n = 0; n < 300; n++) {
      const wx = out.x0 + rnd() * out.nx * out.cs, wy = out.y0 + rnd() * out.ny * out.cs, want = cellOfWorld(out, wx, wy);
      const fx = (wx - out.x0) / out.cs, fy = (wy - out.y0) / out.cs;
      if (Math.abs(fx - Math.round(fx)) < 1e-3 || Math.abs(fy - Math.round(fy)) < 1e-3) continue;
      for (let k = 0; k < 6; k++) {
        const cam = camera(rnd, out, wx, wy);
        // the pixel the point is in under this camera, the cell that pixel's centre finds: the pixel's centre is within half a pixel of the point,
        // so only a point closer to an edge than that can be in another cell
        const halfPx = 0.75 / cam.s / out.cs;
        if (Math.abs(fx - Math.round(fx)) < halfPx || Math.abs(fy - Math.round(fy)) < halfPx) continue;
        const t = cellOfPixel(out, cam.inv, Math.floor(cam.px) + 0.5, Math.floor(cam.py) + 0.5);
        assert.equal(t, want, `point ${n} under camera ${k} (zoom ${cam.s.toFixed(2)})`);
        compared++;
      }
    }
    assert.ok(compared > 500, `${compared} camera comparisons were made`);
  });

  test(`${name}: every point inside a lumen, along it and at its joins, is in a cell that draws it`, () => {
    const rnd = rng(13);
    const regionsOf = new Map();
    let checked = 0, inRegion = 0;
    for (let r = 0; r < graph.nRows; r++) {
      if (!graph.rows[r].on) continue;
      for (let i = 0; i < N_QUADS; i++) {
        if (!graph.seg[r * N_QUADS + i]) continue;
        const o = (r * NS + i) * 2, ax = graph.pts[o], ay = graph.pts[o + 1], bx = graph.pts[o + 2], by = graph.pts[o + 3];
        const ra = graph.rad[r * NS + i], rb = graph.rad[r * NS + i + 1], len = Math.hypot(bx - ax, by - ay);
        if (!(len > 1e-6)) continue;
        for (let k = 0; k < 6; k++) {
          const t = rnd(), across = (rnd() * 2 - 1) * 0.9 * (ra + (rb - ra) * t);   // inside the lumen, 90% of the way to the wall at most
          const x = ax + (bx - ax) * t - ((by - ay) / len) * across, y = ay + (by - ay) * t + ((bx - ax) / len) * across;
          const tex = cellOfWorld(out, x, y);
          assert.ok(tex >= 0, `row ${r} segment ${i}: a lumen point is outside the grid`);
          const kind = out.cells[tex * 4], id = out.cells[tex * 4 + 1];
          assert.notEqual(kind, C.CELL_EMPTY, `row ${r} segment ${i}: a lumen point is in an empty cell`);
          if (kind === C.CELL_SIMPLE) {
            // an ordinary cell draws its one vessel: it must be this vessel (the lumen of another vessel would be a region), and its run must hold this segment unless
            // another segment of the same vessel is as near (a point can be nearer the neighbour)
            assert.equal(id, r, `row ${r} segment ${i}: an ordinary cell of another vessel (${id}) holds this lumen point`);
            assert.ok(i >= out.cells[tex * 4 + 2] - 1 && i <= out.cells[tex * 4 + 3] + 1, `row ${r} segment ${i}: outside the cell's run ${out.cells[tex * 4 + 2]}..${out.cells[tex * 4 + 3]}`);
          } else {
            if (!regionsOf.has(id)) regionsOf.set(id, regionOf(out, id));
            const m = regionsOf.get(id).members.find((q) => q.row === r);
            assert.ok(m, `row ${r} segment ${i}: a region cell does not list this vessel`);
            assert.ok(i >= m.i0 - 1 && i <= m.i1 + 1, `row ${r} segment ${i}: the region lists this vessel's segments ${m.i0}..${m.i1}`);
            inRegion++;
          }
          checked++;
        }
      }
    }
    assert.ok(checked > 1000 && inRegion > 10, `${checked} lumen points checked, ${inRegion} in regions`);
  });
}

test('the quad of a region cell is exactly the cell\'s square', () => {
  assert.ok(vecRegionVS.includes('gridO + (aCell + aC) * 16.0'), 'the corner is the cell\'s, one CELL across');
  assert.equal(CELL, 16, 'and the cell is veins-bin\'s 16 units');
});

// ── The shader text: the stretch and the region programs share one cell test and one single-vessel function ──
const K = {
  F_DIFFUSE: GL.F_DIFFUSE, F_EDGE: GL.F_EDGE, F_SHADOW: GL.F_SHADOW, F_SPEC: GL.F_SPEC, F_VEIL: GL.F_VEIL, F_WHOLE: GL.F_WHOLE,
  F_SEL: GL.F_SEL, F_DOTTED: GL.F_DOTTED, F_NOCASE: GL.F_NOCASE, VEIL_K: GL.VEIL_K,
};
const countOf = (s, t) => s.split(t).length - 1;
const funcOf = (src, head) => {   // the text of a GLSL function from its head to its closing brace
  const a = src.indexOf(head);
  assert.ok(a >= 0, `${head} is in the text`);
  let depth = 0, i = src.indexOf('{', a);
  for (const start = i; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) return src.slice(a, i + 1); void start; }
  return assert.fail(`${head} does not close`);
};
for (const [name, v] of [['FULL', C.V_FULL], ['BASE', C.V_BASE], ['BLOOD', C.V_BLOOD]]) {
  test(`${name}: the stretch and region fragment shaders find the cell by the same text, and shade a single-member pixel with the same function`, () => {
    const st = vecStretchFS(v, K), rg = vecRegionFS(v, K), shared = VEC_SHADE_GLSL(K);
    const world = funcOf(shared, 'vec2 vecWorld()'), cell = funcOf(shared, 'uvec4 vecCellAt(vec2 p)');
    for (const [who, src] of [['stretch', st], ['region', rg]]) {
      assert.equal(countOf(src, world), 1, `${who}: vecWorld, written once, as B has it`);
      assert.equal(countOf(src, cell), 1, `${who}: vecCellAt, written once, as B has it`);
      assert.equal(countOf(src, 'floor((p - gridO) / CELL)'), 1, `${who}: the cell formula appears once`);
      assert.equal(countOf(src, 'gl_FragCoord.xy, 1.0)'), 1, `${who}: the pixel position enters the cell test once`);
      assert.ok(src.includes('vecShadeOne('), `${who}: calls vecShadeOne`);
    }
    // vecShadeOne is one function, defined once in each program with the same text
    const shade = funcOf(st, 'vec4 vecShadeOne(');
    assert.equal(countOf(rg, shade), 1, 'the region shader\'s vecShadeOne is the stretch shader\'s, character for character');
    // each draws only inside its own cell: the stretch in an ordinary cell of its row, the region in the cell of its own region
    assert.ok(st.includes('cell.x != CELL_SIMPLE || int(cell.y) != vRow'));
    assert.ok(new RegExp(`int\\(ct\\.r\\) != ${C.CELL_REGION} \\|\\| int\\(own\\.r\\) != ${C.CELL_REGION} \\|\\| ct\\.g != own\\.g`).test(rg));
  });
}
