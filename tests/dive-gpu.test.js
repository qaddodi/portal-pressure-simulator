// The lobule's dive and rise on the GPU (1 Nov 2026, Mohammad: "move everything to GPU"). Scaled down by the zoom, the tissue's picture
// would show its surround as a pale card, so the 2D canvas was painted again at the zoom's start and a rimmed copy made of it on the
// CPU (diveCopy): on an iPhone that stalled the rise's first frames. Now the tissue's shader draws the rim itself and the GPU canvas is
// scaled as it is. (1 Nov, the off-GPU gate: the 2D canvas and its copy are gone.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tissueFS } from '../src/ui/tissue-gl.js';
import { DIVE_RIM } from '../src/ui/lobule-render-cache.js';

const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const fn = (head) => { const i = lz.indexOf(head); assert.ok(i >= 0, head); return lz.slice(i, lz.indexOf('\n  }\n', i)); };

test('the shader draws the rim', () => {
  for (const live of [false, true]) {
    assert.match(tissueFS(live), /if \(uRim\.w > 0\.0\) \{ float f = clamp\(\(uRim\.w - length\(p - uRim\.xy\)\) \/ max\(uRim\.w - uRim\.z, 1e-6\), 0\.0, 1\.0\); o = o \* f \+ own \* \(1\.0 - f\); \}/);
  }
  assert.match(tissueFS(true), /own = mix\(own, ls, uLive\);/, 'the live share is part of the lobule\'s own layer');
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

test('the dive and the rise draw the rim on the GPU and make no 2D copy (none is left to make)', () => {
  const sd = fn('setDiveZoom(k, x, y, tx = x, ty = y) {');
  assert.match(sd, /if \(rim && !wide && !\(rimDrawn && tissueOnGL && rimSame\(\)\)\) rimOnGPU\(\);/);
  assert.match(sd, /if \(!diveRim && rimDrawn\) \{ rimDrawn = false; tissueKey = ''; idleDrawn = ''; if \(fade > 0 && !wide\) rimOnGPU\(\); \}/, 'landed: drawn again without the rim before the scale goes');
  assert.doesNotMatch(lz, /paint2D|diveCopy|diveCv|rimCv|keep2D|wideChecked/, 'no 2D canvas or copy for the dive or the rise');
  assert.match(fn('function tissueOnGPU('), /A\.rim = rimArg\(tw, th\);/);
  assert.match(fn('function stage() {'), /if \(!wd && !reduce\.matches && geo\) diveRim = rimOf\(sX\(geo\.cx\), sY\(geo\.cy\), geo\.R \* V\.k\);/, 'staged on the GPU, rim and all');
  assert.match(fn('function buildWide(W, H, box) {'), /return WIDE_GL \? buildWideGL\(W, H, box\) : null;/, "the wide copy only on the GPU");
  assert.match(fn('function paintTissue('), /if \(same\) return gpu && keyGPU;/, 'a key the GPU did not draw is never reported as on the GPU');
});

test('under the GPU the dive scales no page layer: only the canvas zooms, the layers it draws are hidden', () => {
  const sd = readFileSync(new URL('../src/ui/stage-dive.js', import.meta.url), 'utf8');
  assert.match(sd, /const diveGpu = \(\) => .*gl-on.*gl-plate/, 'the GPU path needs the context and the whole plate');
  assert.match(sd, /if \(gpu && el !== vCanvas && \(el\.id !== 'stageOver' \|\| overOnGPU\(el\)\)\) continue;/, 'the zoomed list is the canvas (and an overlay the GPU does not draw)');
  assert.match(sd, /if \(!landed && diveGpu\(\)\) setDomHidden\(t > 0 && t < 1\);/);
  assert.match(sd, /if \(!keep\) \{ setDomHidden\(false\);/, 'given back when the dive ends');
  assert.match(sd, /const diveUnhide = \(\) => \{ if \(live\.diveT >= 1 && live\.lobuleOn\) \{ setDomHidden\(false\);/);
});
