// The lobule's wide copy on the GPU (wide-gl.js, 1 Nov 2026: "move everything to GPU"). A dive aimed at a station, or a rise out of a
// zoomed-in lobule, showed a box of 2D canvases, each tile the layers drawn onto it on the CPU and scaled by the compositor. Now each
// tile is a texture laid from the layers' GPU canvases, and each frame of the zoom is one small pass; ?widegl=0 keeps the 2D tiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lintGLSL } from './glsl-lint.js';
import { WIDE_GL, wideShaders } from '../src/ui/wide-gl.js';

const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const wg = readFileSync(new URL('../src/ui/wide-gl.js', import.meta.url), 'utf8');
const fn = (head) => { const i = lz.indexOf(head); assert.ok(i >= 0, head); return lz.slice(i, lz.indexOf('\n  }\n', i)); };

test('on by default, and its shaders pass the lint', () => {
  assert.equal(WIDE_GL, true);
  for (const [name, src] of Object.entries(wideShaders)) assert.deepEqual(lintGLSL(src), [], name);
});

test('the copy is tried on the GPU first; the 2D tiles only where it cannot', () => {
  assert.match(fn('function buildWide(W, H, box) {'), /if \(WIDE_GL\) \{ const wg = buildWideGL\(W, H, box\); if \(wg\) return wg; \}/);
  const b = fn('function buildWideGL(W, H, box) {');
  assert.match(b, /if \(!g \|\| g\.lost\) return null;/, 'the vessels drawn flat: the 2D tiles');
  assert.match(b, /ok = wg\.tile\(t, canvasPx\(w, dpr\), canvasPx\(hh, dpr\), dpr, fxIn \? \[onG \? tissueG : diveCv, glCv\] : \[onG \? tissueG : diveCv, glCv, fxOn \? fxG : fx\]\);/, 'the tissue, the vessels and the overlay, bottom first (the overlay in the vessels\' canvas when it is hosted there: LZ_ONE)');
  assert.match(b, /if \(!ok\) \{ wg\.release\(\); return null; \}/);
  assert.doesNotMatch(b, /drawImage|getContext\('2d'\)/, 'nothing laid on the CPU');
});

test('each frame of the zoom draws the copy on the GPU, placed as the CSS transform placed the 2D copy', () => {
  const sd = fn('setDiveZoom(k, x, y, tx = x, ty = y) {');
  assert.match(sd, /if \(wide\?\.gl\) wide\.gl\.draw\(wide\.W, wide\.H, wide\.dpr, wide\.box, k, x, y, tx, ty\);/);
  assert.match(sd, /if \(wide\?\.gl\?\.lost\) dropWide\(\);/, 'a lost context drops the copy, never a blank lobule');
  assert.match(wg, /const sx = \(q\) => \(tx \+ k \* \(q - x\)\) \* dpr, sy = \(q\) => \(ty \+ k \* \(q - y\)\) \* dpr;/);
  // translate(tx − x, ty − y) scale(k) about (x, y): a point q goes to x + (tx − x) + k (q − x) = tx + k (q − x).
  const css = (q, x, tx, k) => x + (tx - x) + k * (q - x), gpu = (q, x, tx, k) => tx + k * (q - x);
  for (const [q, x, tx, k] of [[0, 100, 140, 0.3], [-50, 220, 80, 0.05], [900, 300, 300, 1]]) assert.ok(Math.abs(css(q, x, tx, k) - gpu(q, x, tx, k)) < 1e-9);
  assert.match(fn('function dropWide(ease = false) {'), /if \(w\.gl\) w\.gl\.draw\(w\.W, w\.H, w\.dpr, w\.box, 1, 0, 0, 0, 0\);/, 'a soft copy fades from full size');
});

test('tiles are mipmapped, premultiplied, within the GPU\'s texture size, and nothing is kept between tiles', () => {
  assert.match(wg, /if \(this\.lost \|\| pw > MAX \|\| ph > MAX \|\| pw < 1 \|\| ph < 1\) return false;/);
  assert.match(wg, /gl\.pixelStorei\(gl\.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true\);/);
  assert.match(wg, /gl\.blendFunc\(gl\.ONE, gl\.ONE_MINUS_SRC_ALPHA\);/);
  assert.match(wg, /gl\.generateMipmap\(gl\.TEXTURE_2D\);/);
  assert.match(wg, /gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA8, 1, 1, 0, gl\.RGBA, gl\.UNSIGNED_BYTE, null\);/, 'the layer texture given back');
});
