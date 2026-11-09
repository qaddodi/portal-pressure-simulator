// Acceptance 4 (vector-renderer-plan.md section 11): stable streaks in a slow pinch and pan.
// Node judges (D's vec-blood-math.js): the streaks' filtering has no step as the pixel's footprint grows past a tile texel (the fine octave
// fades smoothly, the coarse one beyond it), every number the zoom feeds the streaks moves continuously through a slow pinch, including
// where the lattice changes scale, and the vessel coordinates (s, y) of a world point do not change with the camera (that last one needs
// the compiler's geometry: A). On the devices: a slow pinch through the point where streaks pass a pixel.
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

const cam = await needs([['A', 'vec-graph.js', ['createVecGraph']], ['A', 'vec-compile.js', ['compileGrid']], ['D', 'vec-blood-math.js', ['patternPhases']]]);
test('the vessel coordinates (s, y) of a world point are the same under any pan and any pinch', { skip: cam.skip }, () => {
  assert.fail('Phase 3: random cameras, same world point on a compiled vessel, same (s, y) to the last bit');
});
