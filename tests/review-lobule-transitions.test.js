// Fable review (16 Oct), graphics G18, G20, G21 and G22: one clock for organ and vessel transitions, the organ selection in its
// own tone, hepatocyte cords that read as cords, and the quieter (softened) neighbouring lobules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIN_NARROW, cordTone, dullSinusoid, NEIGHBOUR_FLAT, neighbourBlur, blurWrapped } from '../src/ui/lobule-look.js';
import { appCss, lobuleSource } from './split-src.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const lz = lobuleSource();
const lp = read('../src/ui/lobule-paint.js');   // (the tissue's painting: lobule-paint.js paintLobule)
const app = appCss();


test('G20: a selected organ is outlined in its own deep tone with a soft glow; the others dim to .6', () => {
  // Every selectable organ has a tone class that sets --o3.
  for (const t of ['liver', 'spleen', 'heart']) assert.match(app, new RegExp(`\\.tone-${t} \\{[^}]*--o3: var\\(--og-${t}-3\\)`));
});

test('G21: zone 3 cells are deeper and warmer; zone 1 keeps its tone', () => {
  const cell = [0.9, 0.8, 0.75];
  assert.deepEqual(cordTone(cell, 1), cell, 'zone 1 unchanged');
  const z3 = cordTone(cell, 0);
  assert.ok(z3.every((x, i) => x < cell[i]), 'darker');
  const drop = z3.map((x, i) => 1 - x / cell[i]);
  assert.ok(drop[2] > drop[1] && drop[1] > drop[0], 'warmer: blue drops most, red least');
  assert.ok(cordTone(cell, 0, true)[2] > z3[2], 'gentler in dark mode');
});

test('G21: the sinusoids are a quarter narrower and the cords fill the room', () => {
  assert.equal(SIN_NARROW, 0.75);
});

test('G21: capillarized sinusoids look duller, never brighter, and healthy ones are unchanged', () => {
  const shade = [0.376, 0.227, 0.36], c = [0.95, 0.35, 0.25];
  assert.deepEqual(dullSinusoid(c, shade, 0), c);
  const sat = (x) => Math.max(...x) - Math.min(...x), lum = (x) => 0.299 * x[0] + 0.587 * x[1] + 0.114 * x[2];
  let prev = c;
  for (const f of [0.25, 0.5, 1]) {
    const d = dullSinusoid(c, shade, f);
    assert.ok(sat(d) < sat(prev), `less saturated at fibSin ${f}`);
    assert.ok(lum(d) <= lum(c) + 1e-9, `never brighter at fibSin ${f}`);
    prev = d;
  }
});

test('G22: the neighbouring lobules are blurred once per tile, seamlessly, with 30 % less contrast', () => {
  assert.equal(NEIGHBOUR_FLAT, 0.3);
  assert.equal(neighbourBlur(12), 0);
  assert.ok(neighbourBlur(192) > 3 && neighbourBlur(192) < 5);
  // Built into the cached quiet copy (the lobule view's surround and the dive's quieting), never per frame: made once on the GPU
  // (tile-gl.js, a wrapped Gaussian, the same on every browser) since 1 Nov, with no blur in script and no canvas filter.
});

// A w × h RGBA tile from a function of (x, y) giving a grey level.
const tile = (w, h, f) => { const p = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, v = f(x, y); p[o] = p[o + 1] = p[o + 2] = v; p[o + 3] = 255; } return p; };
const grey = (p, w, x, y) => p[(y * w + x) * 4];

test('G22: the neighbours\' blur wraps round the tile, so the repeat has no seam', () => {
  for (const sigma of [2, 7.7]) {
    const w = 96, h = 54, p = blurWrapped(tile(w, h, (x) => (x < 4 ? 255 : 0)), w, h, sigma);
    // A bright band at the left edge spreads as much past the right edge (wrapped) as into the tile.
    for (const y of [0, 27, 53]) assert.ok(Math.abs(grey(p, w, w - 3, y) - grey(p, w, 6, y)) <= 3, `sigma ${sigma}: symmetric across the seam`);
    assert.ok(grey(p, w, w - 1, 0) > 40, `sigma ${sigma}: it reaches across the seam`);
    // Opaque stays opaque, and a flat tile stays flat.
    assert.ok(p.every((v, i) => i % 4 !== 3 || v === 255));
    assert.ok(blurWrapped(tile(w, h, () => 120), w, h, sigma).every((v, i) => i % 4 === 3 || Math.abs(v - 120) <= 1));
  }
});

test('G22: the blurred edge is smooth (no steps), even for a wide blur on a large tile', () => {
  const w = 600, h = 40, sigma = 7.7, p = blurWrapped(tile(w, h, (x) => (x >= 300 && x < 450 ? 255 : 0)), w, h, sigma);
  let maxStep = 0;
  for (let x = 250; x < 350; x++) {
    const d = grey(p, w, x + 1, 20) - grey(p, w, x, 20);
    assert.ok(d >= -1, 'rises monotonically into the band');
    maxStep = Math.max(maxStep, d);
  }
  // A Gaussian of 7.7 px rises at most 255 / (7.7 × √(2π)) ≈ 13 per pixel; a coarse scale up showed jumps of 30 or more.
  assert.ok(maxStep <= 16, `largest step ${maxStep}`);
  assert.ok(grey(p, w, 375, 20) > 245 && grey(p, w, 200, 20) < 5, 'and still a blur, not a smear');
});


test('a patient changed while the lobule is closed dives into that patient\'s lobule: nothing eases from the last visit (Mohammad, 17 Oct)', () => {
  // Cirrhosis set in the anatomy, then a zoom in: the dive magnifies the lobule's first frame, so that frame must already be cirrhotic.
  const fn = lz.match(/function snapState\(\) \{\n([^}]*)\}/);
  assert.ok(fn, 'snapState exists');
  for (const part of ['easeP = createEaser();', 'rz = null;', 'xfT0 = 0;', 'surOld = null;', 'surT0 = 0;', 'snapNext = true;']) assert.ok(fn[1].includes(part), part);
  // Every way the lobule is drawn out of sight starts from the patient's state: the dive's staging, the idle preparation, a reopen.
  // Out of sight, the surround's tiles are drawn for the new state at once, not left on the last state's.
  // And the dive's field follows the latest frame, not the model left from the last visit.
});

test('the lobule\'s tissue is one shader pass a frame, so a slide\'s camera glide stays smooth (Mohammad, 17 Oct)', async () => {
  // (1 Nov, the off-GPU gate: the 2D passes (the page fill, the surround's clip, the fade) are gone; the tissue's shader lays the
  // surround, the picture over it and the fade into the page in one pass: tissue-gl.js.)
  const on = lz.slice(lz.indexOf('function tissueOnGPU('), lz.indexOf('\n  }\n', lz.indexOf('function tissueOnGPU(')));
  assert.equal(on.split("framePart('lz.tissueGL', tisDraw)").length - 1, 1, 'one draw');
  assert.match(on, /fIn = rd \* 1\.1;/); assert.match(on, /const fOut = fadeOuter\(fIn, reach\)/);
  // The lobule's bitmap is opaque inside its own outline (filled first, at 1.015 of the hexagon, full strength).
});


// (31 Oct, his iPhone readout on e52a280e: every frame of a pan in the lobule painted its tissue again, "state changed", 10.9 MB
// each. The state carried the portal venule's ink, which the tissue bitmap never draws: the vessels are the GPU's, or the flat
// strokes on the tissue canvas, keyed apart. A pressure gliding with the model moved it at each step.)
test("the lobule's tissue bitmap is keyed only on what it paints: no vessel ink", () => {
  const lz = lobuleSource();
  const ws = lz.match(/const worldStateOf = [^\n]+/)[0];
  assert.doesNotMatch(ws, /ink/i);
  const i = lp.indexOf('export function paintLobule('), body = lp.slice(i, lp.indexOf('\n}\n', i));
  assert.ok(i >= 0 && body.length > 1000, 'the painting itself');
  assert.doesNotMatch(lz.match(/function worldInput\([\s\S]*?\n {2}\}\n/)[0], /\binkOf\(|\bink\(|tubeInk\(|m\.mode/, 'nor does what it is given');
});
