// The lobule's dive and rise on the GPU (1 Nov 2026, Mohammad: "move everything to GPU"). Scaled down by the zoom, the tissue's picture
// would show its surround as a pale card, so the 2D canvas was painted again at the zoom's start and a rimmed copy made of it on the
// CPU (diveCopy): on an iPhone that stalled the rise's first frames. Now the tissue's shader draws the rim itself and the GPU canvas is
// scaled as it is; ?divegpu=0 keeps the 2D canvas and its copy, with the shader exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tissueFS, DIVE_GPU } from '../src/ui/tissue-gl.js';
import { DIVE_RIM } from '../src/ui/lobule-render-cache.js';

const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const fn = (head) => { const i = lz.indexOf(head); assert.ok(i >= 0, head); return lz.slice(i, lz.indexOf('\n  }\n', i)); };

test('on by default; off, the shader has nothing of the rim in it', () => {
  assert.equal(DIVE_GPU, true);
  for (const live of [false, true]) for (const over of [false, true]) {
    assert.doesNotMatch(tissueFS(live, over, false), /uRim|vec4 own/);
    assert.match(tissueFS(live, over, true), /if \(uRim\.w > 0\.0\) \{ float f = clamp\(\(uRim\.w - length\(p - uRim\.xy\)\) \/ max\(uRim\.w - uRim\.z, 1e-6\), 0\.0, 1\.0\); o = o \* f \+ own \* \(1\.0 - f\); \}/);
  }
  assert.match(tissueFS(true, true, true), /own = mix\(own, ls, uLive\);/, 'the live share is part of the lobule\'s own layer');
});

test("the shader's rim is the 2D copy's: the tissue × the fade, plus the lobule's own layer × the rest", () => {
  // The 2D copy: the tissue (opaque) kept by a radial gradient from opaque at solid × r to clear at clear × r ('destination-in'), then
  // the lobule's own layer (premultiplied) × (1 − that gradient) added ('lighter').
  const grad = (d, r) => Math.min(1, Math.max(0, 1 - (d - r * DIVE_RIM.solid) / (r * (DIVE_RIM.clear - DIVE_RIM.solid))));
  const shader = (d, r) => { const r0 = r * DIVE_RIM.solid, r1 = r * DIVE_RIM.clear; return Math.min(1, Math.max(0, (r1 - d) / Math.max(r1 - r0, 1e-6))); };
  const tissue = [0.8, 0.6, 0.5], own = [0.3, 0.2, 0.1, 0.5];
  for (const d of [0, 50, 101, 102, 110, 115, 120, 121, 300]) {
    const f = grad(d, 100), g = shader(d, 100);
    assert.ok(Math.abs(f - g) < 1e-12, `d ${d}`);
    const copy = [...tissue.map((c, i) => c * f + own[i] * (1 - f)), f + own[3] * (1 - f)];
    const gpu = [...tissue, 1].map((c, i) => c * g + own[i] * (1 - g));
    copy.forEach((c, i) => assert.ok(Math.abs(c - gpu[i]) < 1e-12));
  }
});

test('the dive and the rise draw the rim on the GPU and make no 2D copy; the 2D copy only where the GPU cannot', () => {
  const sd = fn('setDiveZoom(k, x, y, tx = x, ty = y) {');
  assert.match(sd, /const rimGL = DIVE_GPU && rim && !wide && \(\(rimDrawn && tissueOnGL && rimKeyGL === rimKey\(\)\) \|\| rimOnGPU\(\)\);/);
  assert.match(sd, /else if \(rim && !wide\) \{ paint2D\(\); diveCopy\(\); \}/, 'the 2D canvas and its copy only when the GPU drew nothing');
  assert.match(sd, /if \(DIVE_GPU && !diveRim && rimDrawn\) \{ rimDrawn = false; tissueKey = ''; idleDrawn = ''; if \(fade > 0 && !wide\) rimOnGPU\(\); \}/, 'landed: drawn again without the rim before the scale goes');
  assert.match(sd, /const show = wide \? null : rim && !rimGL && diveCopyKey \? diveCv : tissue;/);
  assert.match(fn('function tissueOnGPU('), /rim: rimArg\(tw, th\),/);
  assert.match(fn('function stage() {'), /keep2D = !DIVE_GPU;/, 'staged on the GPU, rim and all');
  assert.match(fn('function stageRise() {'), /keep2D = !DIVE_GPU;/);
  assert.match(fn('function buildWide(W, H, box) {'), /onG = paintTissue\(w, hh, dpr, dark, cs, flat, tg\);/, "the wide copy's tissue drawn by the shader");
  assert.match(fn('function wideChecked(wd) {'), /DIVE_GPU && tissueOnGL \? true : probe\(tissue\)/);
  assert.match(fn('function paintTissue('), /if \(key === tissueKey\) return DIVE_GPU \? gpu && keyGPU : gpu;/, 'a key drawn on the 2D canvas is never reported as on the GPU');
});
