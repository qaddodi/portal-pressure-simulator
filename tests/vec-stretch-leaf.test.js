// The ordinary-stretch program on the adaptive leaves (docs/recommendations/vector-renderer-plan-r1.md section 2.4; workstream B, revision 1).
// Judged without a GPU: the lint on all three variants, the uniform lists, that the strip and the region programs read the hierarchy by K's one
// lookup text (no second cell formula), and, on the real anatomy (cirr-decomp in both views, booted by tests/vec-anatomy.js) with A's runs and
// K's bound test, that merging only the runs whose bounds the pixel survives gives the same nearest point as all of the vessel's runs would.
// This is a precondition, not the acceptance: the shader has not been compiled on a GPU here.
import { bootAnatomy } from './vec-anatomy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL, uniformsOf } from './glsl-lint.js';
import { N_SAMPLES, N_QUADS } from '../src/ui/veins-mesh.js';
import { F_SHADOW } from '../src/ui/veins-mesh-data.js';
import { NS } from '../src/ui/vec-compile.js';
import {
  V_FULL, V_BASE, V_BLOOD, C_LUMEN, C_SHADOW, C_GLOW, C_RING, REACH_SHADOW_BLUR, REACH_SHADOW_OFF, REACH_AA, REACH_RING, RUNS_PER_ROW, RUN_SEGS,
} from '../src/ui/vec-contract.js';
import { createVecGraph, A_GLOW, A_SEL, A_FLAGS, TUBE_FLOATS } from '../src/ui/vec-graph.js';
import { createRuns, glowReachOf } from '../src/ui/vec-runs.js';
import { boundHit } from '../src/ui/vec-leaves.js';
import { HIER_GLSL, HIER_UNIFORMS } from '../src/ui/vec-hier-glsl.js';

const A = await bootAnatomy();
await A.preset('cirr-decomp', 40);
const figures = { anatomy: A.figure() };
await A.view('circuit', 100);
figures.circuit = A.figure();

const GL = await import('../src/ui/veins-gl.js');
const { VEC_SHADE_UNIFORMS_LEAF } = await import('../src/ui/vec-shade-glsl.js');
const { vecStretchFS, vecLeafStretchFS, vecLeafStretchUniformNames, vecStretchVS } = await import('../src/ui/vec-stretch-glsl.js');

const K = {
  F_DIFFUSE: GL.F_DIFFUSE, F_EDGE: GL.F_EDGE, F_SHADOW: GL.F_SHADOW, F_SPEC: GL.F_SPEC, F_VEIL: GL.F_VEIL, F_WHOLE: GL.F_WHOLE,
  F_SEL: GL.F_SEL, F_DOTTED: GL.F_DOTTED, F_NOCASE: GL.F_NOCASE, VEIL_K: GL.VEIL_K,
};
const VARIANTS = [['V_FULL', V_FULL], ['V_BASE', V_BASE], ['V_BLOOD', V_BLOOD]];
const count = (s, sub) => s.split(sub).length - 1;

test('the leaf program lints clean in all three variants, and the lint can fail on it', () => {
  for (const [name, v] of VARIANTS) assert.deepEqual(lintGLSL(vecLeafStretchFS(v, K)), [], name);
  const src = vecLeafStretchFS(V_FULL, K);
  assert.ok(lintGLSL(src.replace('vecNearMore(nr,', 'vecNearMor(nr,')).some((m) => /vecNearMor/.test(m)));
  assert.ok(lintGLSL(src.replace('VecLeaf lf =', 'VecLeaf lg =')).some((m) => /"lf" is not declared/.test(m)));
});

test('the uniforms the leaf program declares are exactly the ones its list names (shOff is K\'s uVecShOff; the fixed cell test\'s are gone)', () => {
  for (const [name, v] of VARIANTS) {
    const want = vecLeafStretchUniformNames(v).fs;
    assert.deepEqual([...new Set(uniformsOf(vecLeafStretchFS(v, K)))].sort(), [...want].sort(), name);
    for (const gone of ['cellTex', 'gridO', 'gridN', 'shOff']) assert.ok(!want.includes(gone), `${name}: ${gone}`);
    for (const u of HIER_UNIFORMS) assert.ok(want.includes(u), `${name}: ${u}`);
  }
  assert.ok(!VEC_SHADE_UNIFORMS_LEAF.includes('shOff'));
});

test('the strip finds its leaf by K\'s one lookup, with no second cell formula, and draws only an L_SINGLE leaf of its own row', () => {
  for (const [name, v] of VARIANTS) {
    const fs = vecLeafStretchFS(v, K);
    assert.equal(count(fs, HIER_GLSL), 1, `${name}: K's text once`);
    assert.equal(count(fs, 'int vecLeafAt('), 1, name);
    assert.equal(count(fs, 'vecLeafAt(p)'), 1, name);
    assert.ok(!/vecCellAt|CELL_SIMPLE|\bgridN\b|\bcellTex\b/.test(fs), `${name}: no fixed cell test`);
    assert.ok(!fs.includes('shOff;') && count(fs, 'uVecShOff') >= 2, `${name}: the shadow offset is K's`);
    assert.ok(/lf\.cls != VEC_L_SINGLE \|\| lf\.owner != vRow\) discard/.test(fs), name);
  }
  // the old program keeps building under its old names (until the renderer core switches over)
  for (const [name, v] of VARIANTS) {
    assert.deepEqual(lintGLSL(vecStretchFS(v, K)), [], `old ${name}`);
    assert.ok(count(vecStretchFS(v, K), 'vecCellAt(p)') === 1);
  }
  assert.deepEqual(lintGLSL(vecStretchVS(V_FULL, K)), []);
});

test('the leaf program tests each contribution a reference lists against that run\'s bound, skips a run no bound survives, and shades the survivors\' contributions', () => {
  const fs = vecLeafStretchFS(V_FULL, K);
  assert.equal(count(fs, 'vecBoundHit(run,'), 4, 'one test a contribution');
  assert.equal(count(fs, 'vecBoundHitBox(run,'), 4, 'and the morph set\'s box');
  for (const c of ['LUMEN', 'SHADOW', 'GLOW', 'RING']) assert.ok(fs.includes(`(rb & VEC_C_${c}) != 0 && vecBoundHit(run, VEC_C_${c}, p)) hit |= VEC_C_${c}`), c);
  assert.ok(fs.includes('if (hit == 0) continue;'));
  assert.equal(count(fs, 'vecNearMore(nr, run.row, run.i0, run.i1, p, ps)'), 1, 'one merged nearest point over the survivors');
  assert.ok(fs.includes('if (bits == 0) discard;'));
  assert.ok(fs.includes('vecShadeBits(vRow, nr, p, vecOccl(p), bits, lum, lumCol)'));
  // the contribution numbers K's text declares are the contract's, which the shade text uses
  assert.ok(HIER_GLSL.includes(`const int VEC_C_LUMEN = ${C_LUMEN};`) && HIER_GLSL.includes(`const int VEC_C_SHADOW = ${C_SHADOW};`));
  assert.ok(HIER_GLSL.includes(`const int VEC_C_GLOW = ${C_GLOW};`) && HIER_GLSL.includes(`const int VEC_C_RING = ${C_RING};`));
});

test('the region program, when it reads the hierarchy, reads K\'s same text (one lookup for strip and region)', async () => {
  const { vecRegionFS } = await import('../src/ui/vec-region-glsl.js');
  const fs = vecRegionFS(V_FULL, K);
  if (fs.includes('vecLeafAt(')) assert.equal(count(fs, HIER_GLSL), 1, 'region: K\'s text once');
  else assert.ok(count(fs, 'vecCellAt(') >= 1, 'region still on the fixed cell test (workstream C has not moved over yet)');
});

// ── The nearest point over the survivors, on the real anatomy ──
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rng = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const segD = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
};

function sceneOf(f) {
  const graph = createVecGraph();
  graph.fromBins(f.bins, f.nTubes);
  const tube = new Float32Array(f.tube);
  for (let r = 0; r < f.nTubes; r++) {   // put glow, a selection and the shadow on some rows so every contribution has bounds to test
    if (r % 3 === 0) tube[r * TUBE_FLOATS + A_GLOW] = 1;
    if (r % 7 === 0) tube[r * TUBE_FLOATS + A_SEL] = 1;
    if (r % 5 === 0) tube[r * TUBE_FLOATS + A_FLAGS] = (tube[r * TUBE_FLOATS + A_FLAGS] | F_SHADOW);
  }
  graph.attrs(tube);
  const radAll = new Float32Array(f.nTubes * NS * 4);
  for (let i = 0; i < f.nTubes * NS; i++) radAll[i * 4] = f.rad[i];
  graph.radii(radAll);
  const runs = createRuns(graph).build();
  const packed = {};
  runs.packRuns(packed);
  return { graph, runs, packed };
}

for (const [view, f] of Object.entries(figures)) {
  test(`${view}: the runs a pixel survives hold the nearest point the vessel's whole course would give, within every contribution's reach`, () => {
    const { graph, runs, packed } = sceneOf(f);
    const shOff = [REACH_SHADOW_OFF, 0];
    const rnd = rng(7);
    const P = graph.pts, RAD = graph.rad;
    const CONTR = [C_LUMEN, C_SHADOW, C_GLOW, C_RING];
    let checked = 0, nSurv = 0, nAll = 0;
    const per = { [C_LUMEN]: 0, [C_SHADOW]: 0, [C_GLOW]: 0, [C_RING]: 0 };
    for (let r = 0; r < graph.nRows; r++) {
      const rec = graph.rows[r];
      const ids = [...runs.runsOf(r)];
      if (!rec.on || !ids.length) continue;
      const segs = [];
      for (const id of ids) for (let i = runs.seg[id * 2]; i <= runs.seg[id * 2 + 1]; i++) segs.push([id, i]);
      const reach = (i, c) => {
        const rr = Math.max(RAD[r * NS + i], RAD[r * NS + i + 1]) + rec.casing + REACH_AA * 0.5;
        return c === C_LUMEN ? rr : c === C_SHADOW ? rr + REACH_SHADOW_BLUR : c === C_GLOW ? rr + glowReachOf(rec) : rr + REACH_RING;
      };
      for (let n = 0; n < 60; n++) {
        const [, si] = segs[(rnd() * segs.length) | 0];
        const t = rnd();
        const ax = P[(r * NS + si) * 2], ay = P[(r * NS + si) * 2 + 1], bx = P[(r * NS + si + 1) * 2], by = P[(r * NS + si + 1) * 2 + 1];
        const L = Math.hypot(bx - ax, by - ay) || 1;
        const off = (rnd() * 2 - 1) * (reach(si, C_GLOW) + 6);
        const px = ax + (bx - ax) * t - (by - ay) / L * off, py = ay + (by - ay) * t + (bx - ax) / L * off;
        for (const c of CONTR) {
          const qx = c === C_SHADOW ? px - shOff[0] : px, qy = c === C_SHADOW ? py - shOff[1] : py;
          // the exact nearest over every segment of every run of the row, and the run that holds it
          let dBest = Infinity, iBest = -1, idBest = -1;
          for (const [id, i] of segs) {
            const d = segD(qx, qy, P[(r * NS + i) * 2], P[(r * NS + i) * 2 + 1], P[(r * NS + i + 1) * 2], P[(r * NS + i + 1) * 2 + 1]);
            if (d < dBest) { dBest = d; iBest = i; idBest = id; }
          }
          if (c === C_RING && !(rec.sel > 0)) continue;
          if (c === C_GLOW && !(glowReachOf(rec) > 0)) continue;
          if (c === C_SHADOW && !(rec.flags & F_SHADOW)) continue;
          if (!(dBest <= reach(iBest, c))) continue;   // the pixel is not within this contribution's reach of the nearest part: nothing is owed
          // the survivors for this contribution (K's bound test on A's packed run table)
          const surv = ids.filter((id) => boundHit(packed.data, id, c, px, py, shOff));
          assert.ok(surv.includes(idBest), `${view} row ${r} contribution ${c}: the run holding the nearest segment ${iBest} survived`);
          let dSurv = Infinity;
          for (const [id, i] of segs) {
            if (!surv.includes(id)) continue;
            dSurv = Math.min(dSurv, segD(qx, qy, P[(r * NS + i) * 2], P[(r * NS + i) * 2 + 1], P[(r * NS + i + 1) * 2], P[(r * NS + i + 1) * 2 + 1]));
          }
          assert.equal(dSurv, dBest, `${view} row ${r} contribution ${c}: the survivors' nearest is the vessel's nearest`);
          checked++; per[c]++; nSurv += surv.length; nAll += ids.length;
        }
      }
    }
    for (const c of CONTR) assert.ok(per[c] > 50, `contribution ${c} checked ${per[c]} times`);
    assert.ok(checked > 1000, `${checked} checks`);
    // the bounds do their work: a pixel's survivors are a small share of the vessel's runs
    assert.ok(nSurv / nAll < 0.35, `survivors per vessel run ${(nSurv / nAll).toFixed(3)}`);
  });
}

test('RUN_SEGS and RUNS_PER_ROW cover a row\'s segments (the loop in the shader reads at most a run\'s segments a reference)', () => {
  assert.ok(RUN_SEGS * RUNS_PER_ROW >= N_QUADS && RUN_SEGS <= 8 && N_SAMPLES - 1 === N_QUADS);
});
