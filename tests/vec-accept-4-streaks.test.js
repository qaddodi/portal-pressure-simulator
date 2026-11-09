// Acceptance 4 (vector-renderer-plan.md section 11): stable streaks in a slow pinch and pan.
// Node judges (D's vec-blood-math.js): the streaks' filtering has no step as the pixel's footprint grows past a tile texel (the fine octave
// fades smoothly, the coarse one beyond it), every number the zoom feeds the streaks moves continuously through a slow pinch, including
// where the lattice changes scale, and the vessel coordinates (s, y) of a world point do not change with the camera (that last one needs
// the compiler's geometry: A, on the real anatomy). On the devices: a slow pinch through the point where streaks pass a pixel.
import { bootAnatomy } from './vec-anatomy.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

// What each check waits for: a workstream's file that is not in the tree yet (or lacks the export named). While anything is missing the
// check is skipped, and the skip says what for, so a plain `npm test` shows what is left (plan 9.J, Phase 1).
const UI = new URL('../src/ui/', import.meta.url);
async function needs(list) {
  const lack = [], mods = {};
  for (const [who, file, names] of list) {
    if (!existsSync(new URL(file, UI))) { lack.push(`${who}: ${file}`); continue; }
    mods[file] = await import(new URL(file, UI).href);
    const no = names.filter((n) => !(n in mods[file]));
    if (no.length) lack.push(`${who}: ${file} to export ${no.join(', ')}`);
  }
  return { mods, skip: lack.length ? `waits for ${lack.join('; ')}` : false };
}

const d = await needs([['D', 'vec-blood-math.js', ['fineWeight', 'coarseWeight', 'attenuatedShares', 'attenuatedNoise', 'footprintTexels', 'zoomNumbers', 'SHARE_B', 'SHARE_F', 'FINE_LO', 'FINE_HI']]]);
const M = d.mods['vec-blood-math.js'];

/** Largest change of f between neighbours over xs. A step in f shows as a change that does not shrink when the sampling is made finer. */
const worstJump = (f, xs) => { let w = 0; for (let i = 1; i < xs.length; i++) w = Math.max(w, Math.abs(f(xs[i]) - f(xs[i - 1]))); return w; };
const grid = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
const geo = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a * (b / a) ** (i / n));
const lin = (a, b) => (n) => grid(a, b, n), log = (a, b) => (n) => geo(a, b, n);
/** f is continuous over make(n) when four times as many samples make the worst neighbour change at most 0.6 of what it was (a step stays as large). */
const continuous = (f, make, n, name) => {
  const coarse = worstJump(f, make(n)), finer = worstJump(f, make(n * 4));
  assert.ok(finer <= coarse * 0.6 + 1e-12, `${name} steps: worst neighbour change ${coarse.toExponential(2)} with ${n} samples and ${finer.toExponential(2)} with four times as many`);
};

test('the fine octave\'s weight is 1 up to half a texel and 0 from one and a half, falling smoothly between, and the coarse one\'s beyond it', { skip: d.skip }, () => {
  const fp = grid(0, 8, 1600);
  for (const x of fp) {
    const f = M.fineWeight(x), c = M.coarseWeight(x);
    assert.ok(f >= 0 && f <= 1 && c >= 0 && c <= 1, `weights in 0 to 1 at ${x}`);
    if (x <= M.FINE_LO) assert.equal(f, 1); if (x >= M.FINE_HI) assert.equal(f, 0);
  }
  for (let i = 1; i < fp.length; i++) assert.ok(M.fineWeight(fp[i]) <= M.fineWeight(fp[i - 1]) && M.coarseWeight(fp[i]) <= M.coarseWeight(fp[i - 1]), 'never rising as the footprint grows');
  continuous(M.fineWeight, lin(0, 3), 300, 'the fine octave\'s weight');
  continuous(M.coarseWeight, lin(0, 8), 400, 'the coarse octave\'s weight');
});

test('the shares left after attenuation always sum to 1, and the streaks\' noise has no step as the footprint grows, for any two reads', { skip: d.skip }, () => {
  for (const x of grid(0, 8, 400)) { const q = M.attenuatedShares(M.SHARE_B, M.SHARE_F, x); assert.ok(Math.abs(q.wb + q.wf - 1) < 1e-12, `shares at ${x}`); }
  assert.equal(M.attenuatedShares(M.SHARE_B, M.SHARE_F, M.FINE_HI).wf, 0, 'past 1.5 texels only the coarse octave remains');
  for (const a of [0, 0.3, 0.5, 0.8, 1]) for (const b of [0, 0.2, 0.5, 0.9, 1]) {
    continuous((x) => M.attenuatedNoise(a, b, M.SHARE_B, M.SHARE_F, x), lin(0, 8), 400, `noise(${a}, ${b})`);
    for (const x of grid(0, 8, 40)) { const n = M.attenuatedNoise(a, b, M.SHARE_B, M.SHARE_F, x); assert.ok(Number.isFinite(n) && n > -0.5 && n < 1.5, `finite and near 0 to 1 at ${x}`); }
  }
});

test('a slow pinch: the lattice scales\' weights, the fades and the lane spacing move continuously with the zoom, also where the lattice changes scale', { skip: d.skip }, () => {
  const z = M.zoomNumbers, from = log(0.03, 12), sweep = from(800);   // 800 steps over a 400 times zoom: 0.75% a step
  for (const k of ['Lg', 'fadeA', 'fadeB', 'sx']) continuous((px) => z(px)[k], from, 800, `zoomNumbers().${k}`);
  // The lattice in use is the pair of scales (sA, sB) with weights (1 − lf, lf); where it steps up, the old B becomes the new A and lf
  // starts again at 0. So lf and sA jump by design, and the weight each absolute scale carries has to be the continuous thing.
  const scales = new Set(sweep.map((px) => z(px).sA));
  assert.ok(scales.size >= 2, 'the sweep crosses a change of lattice scale');
  const share = (px, sc) => { const n = z(px); return n.sA === sc ? [1 - n.lf, n.cellA] : n.sB === sc ? [n.lf, n.cellB] : [0, 0]; };
  for (const sc of scales) {
    continuous((px) => share(px, sc)[0], from, 800, `the weight of the lattice scale ${sc}`);
    // ... and so is what that lattice puts into the picture: its weight times its fine octave's weight at the footprint one pixel spans on it.
    continuous((px) => { const [w, cell] = share(px, sc); return w ? w * M.fineWeight(M.footprintTexels(px, cell)) : 0; }, from, 800, `the fine streaks of the lattice scale ${sc}`);
  }
});

// ── (s, y) of a world point does not depend on the camera ──
// A vessel's streak coordinates are its own: the row, the position along it (segment and fraction) and the signed distance across it. They are
// worked out from the vessel's points, so the camera can only change which pixel a point falls in. Here: a world point is taken through random
// cameras up to the deepest zoom (to a device position, and back through the float32 pixel → world matrix the shaders get), and its coordinates
// from the point that comes back are those it started with, to far less than a pixel; and it lands in the same cell, so the same program draws it.
const { createVecGraph } = await import('../src/ui/vec-graph.js');
const VC = await import('../src/ui/vec-compile.js');
const { N_QUADS } = await import('../src/ui/veins-mesh.js');
const { DIVE_K_MAX } = await import('../src/ui/vec-organs.js');
const A = await bootAnatomy();
await A.preset('cirr-decomp', 40);
const fig = A.figure();
const graph = createVecGraph();
graph.fromBins(fig.bins, fig.nTubes); graph.attrs(fig.tube);
const radAll = new Float32Array(fig.nTubes * VC.NS * 4);
for (let i = 0; i < fig.nTubes * VC.NS; i++) radAll[i * 4] = fig.rad[i];
graph.radii(radAll);
const compiled = VC.createCompiled(); VC.compileGrid(graph, VC.createReach(), compiled);

/** The streak coordinates of a world point: the nearest segment of any vessel (row, segment, fraction along it) and the signed distance across. */
function coordsOf(x, y) {
  let best = null;
  for (let r = 0; r < graph.nRows; r++) {
    if (!graph.rows[r].on) continue;
    for (let i = 0; i < N_QUADS; i++) {
      if (!graph.seg[r * N_QUADS + i]) continue;
      const o = (r * VC.NS + i) * 2, ax = graph.pts[o], ay = graph.pts[o + 1], bx = graph.pts[o + 2], by = graph.pts[o + 3];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
      const qx = ax + t * dx - x, qy = ay + t * dy - y, d = Math.hypot(qx, qy);
      if (!best || d < best.d) best = { r, i, t, d, across: (dx * (y - ay) - dy * (x - ax)) / Math.sqrt(L2 || 1), u: i + t };
    }
  }
  return best;
}
const sel = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

test('the streak coordinates (vessel, along, across) of a world point are the same under any pan and any pinch, to far less than a pixel, and the point is drawn by the same cell', () => {
  const rnd = sel(41), f32 = Math.fround;
  const rows = [...Array(graph.nRows).keys()].filter((r) => graph.rows[r].on);
  let compared = 0, worstAcross = 0, worstAlong = 0;
  for (let n = 0; n < 400; n++) {
    const r = rows[(rnd() * rows.length) | 0], i = (rnd() * N_QUADS) | 0;
    if (!graph.seg[r * N_QUADS + i]) continue;
    const o = (r * VC.NS + i) * 2, ax = graph.pts[o], ay = graph.pts[o + 1], bx = graph.pts[o + 2], by = graph.pts[o + 3], len = Math.hypot(bx - ax, by - ay);
    if (!(len > 1e-3)) continue;
    const t = rnd(), across = (rnd() * 2 - 1) * graph.rad[r * VC.NS + i], wx = ax + (bx - ax) * t - ((by - ay) / len) * across, wy = ay + (by - ay) * t + ((bx - ax) / len) * across;
    const home = coordsOf(wx, wy), cell0 = VC.cellOfWorld(compiled, wx, wy);
    for (let k = 0; k < 8; k++) {
      const s = 0.5 + rnd() * (DIVE_K_MAX * 1.5 - 0.5), px = rnd() * 1200, py = rnd() * 800, tx = px - s * wx, ty = py - s * wy;
      const inv = [f32(1 / s), 0, 0, f32(1 / s), f32(-tx / s), f32(-ty / s)];
      const rx = f32(f32(f32(inv[0] * px) + f32(inv[2] * py)) + inv[4]), ry = f32(f32(f32(inv[1] * px) + f32(inv[3] * py)) + inv[5]);
      const back = coordsOf(rx, ry), px1 = 1 / s;   // (one device pixel, in world units)
      if (Math.abs(home.d - back.d) > 1e-3 && back.r !== home.r) continue;   // (two vessels as near as one another: either may own it)
      if (back.r !== home.r) { assert.ok(Math.abs(home.d - back.d) < 1e-2, 'a different vessel only where two are equally near'); continue; }
      worstAcross = Math.max(worstAcross, Math.abs(back.across - home.across));
      worstAlong = Math.max(worstAlong, Math.abs(back.u - home.u) * len);
      assert.ok(Math.abs(back.across - home.across) < 0.05 * px1 + 1e-3, `point ${n} camera ${k} (zoom ${s.toFixed(1)}): across moved ${Math.abs(back.across - home.across)}`);
      assert.ok(Math.abs(back.u - home.u) * len < 0.05 * px1 + 1e-3 || back.i !== home.i, `point ${n} camera ${k}: along moved`);
      const cell1 = VC.cellOfPixel(compiled, inv, px, py), fx = (wx - compiled.x0) / compiled.cs, fy = (wy - compiled.y0) / compiled.cs;
      if (Math.abs(fx - Math.round(fx)) > 1e-3 && Math.abs(fy - Math.round(fy)) > 1e-3) assert.equal(cell1, cell0, `point ${n} camera ${k}: the cell`);
      compared++;
    }
  }
  assert.ok(compared > 800, `${compared} camera comparisons were made (worst across ${worstAcross.toExponential(1)}, along ${worstAlong.toExponential(1)} world units)`);
});
