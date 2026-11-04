// The lobule's wide copy on the GPU (wide-gl.js, 1 Nov 2026: "move everything to GPU"). A dive aimed at a station, or a rise out of a
// zoomed-in lobule, showed a box of 2D canvases, each tile the layers drawn onto it on the CPU and scaled by the compositor. Now each
// tile is a texture laid from the layers' GPU canvases, and each frame of the zoom is one small pass.
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

test('the copy is the GPU\'s, or none (no 2D tiles since 1 Nov: the dive then scales the layers themselves)', () => {
  assert.match(fn('function buildWide(W, H, box) {'), /return WIDE_GL \? buildWideGL\(W, H, box\) : null;/);
  const b = fn('function buildWideGL(W, H, box) {');
  assert.match(b, /if \(!g \|\| g\.lost\) return null;/, 'no vessels on the GPU: no copy');
  assert.match(b, /ok = onG && wg\.tile\(t, canvasPx\(w, dpr\), canvasPx\(hh, dpr\), dpr, \[\.\.\.\(tisIn \? \[\] : \[tissueG\]\), glCv, \.\.\.\(fxIn \|\| !fxOn \? \[\] : \[fxG\]\)\]\);/, 'the tissue, the vessels and the overlay, bottom first (the tissue under and the overlay over in the vessels\' canvas when they are hosted there)');
  assert.match(b, /if \(!ok\) \{ wg\.release\(\); return null; \}/);
  assert.doesNotMatch(b, /drawImage|getContext\('2d'\)/, 'nothing laid on the CPU');
});

test('each frame of the zoom draws the copy on the GPU, placed as the CSS transform placed the 2D copy', () => {
  const sd = fn('setDiveZoom(k, x, y, tx = x, ty = y) {');
  assert.match(sd, /if \(wide\?\.gl\) wide\.gl\.draw\(wide\.W, wide\.H, wide\.dpr, wide\.box, k, x, y, tx, ty\);/);
  assert.match(sd, /if \(wide\?\.gl\?\.lost\) dropWide\(\);/, 'a lost context drops the copy, never a blank lobule');
  assert.match(wg, /uniform4f\(uS\.rect, \(tx \+ k \* \(qx - x\)\) \* dpr, \(ty \+ k \* \(qy - y\)\) \* dpr, k/);
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

test('one context for the lobule: the copy is made and shown in the vessels\' own context, always', () => {
  const on = fn('function wideGLOn() {');
  assert.match(on, /if \(gl && !gl\.lost && gl\.top\?\.replace\) \{/);
  assert.doesNotMatch(on, /LZ_ONE/);
  assert.match(on, /wideGL = createWideGL\(null, \{ host: gl\.top \}\) \|\| null;/, 'no canvas of its own');
  assert.match(on, /gl\.top\.replace\(\{ on: \(\) => !!wide\?\.host && !!wideView && wideA >= 1, draw: \(\) => wideShow\(1\) \}\)/, 'through the zoom the copy stands in for the whole picture');
  assert.match(on, /gl\.top\.add\(\{ order: LZ_UNDER_GLASS \+ 1, draw: \(\) => \{ if \(wideView && wideA > 0 && wideA < 1\) wideShow\(wideA\); \} \}\)/, 'fading out, laid over the landed layers and the overlay, under every glass');
  assert.match(on, /return null; {3}\/\/ \(no copy while/, 'a lost host: no copy rather than a second context');
  const b = fn('function buildWideGL(W, H, box) {');
  assert.match(b, /if \(hosted\) ok = onG && tisIn && \(fxIn \|\| !fxOn\) && \(g\.present\(\), wg\.tile\(t, [^;]*'host'\)\);/, 'every layer laid in the vessels\' canvas, then the tile copied inside the context');
  assert.doesNotMatch(b, /drawImage|getContext\('2d'\)|texImage2D/, 'no canvas sent from one context to another');
  const sd = fn('setDiveZoom(k, x, y, tx = x, ty = y) {');
  assert.match(sd, /if \(wide\?\.host\) glCv\.style\.visibility = '';/);
  assert.match(sd, /if \(k >= 0\.9999 \|\| \(wide\?\.host && e === glCv\)\) \{ e\.style\.transform = ''; e\.style\.transformOrigin = ''; continue; \}/, 'the canvas that shows the copy is never scaled by CSS');
  assert.match(sd, /wideView = \{ W: wide\.W, H: wide\.H, dpr: wide\.dpr, box: wide\.box, k, x, y, tx, ty \};\n\s*if \(gl && !gl\.lost\) gl\.present\(\);/);
  const dw = fn('function dropWide(ease = false) {');
  assert.match(dw, /if \(w\.host\) \{ wideView = null; wideA = 1; idleDrawn = ''; if \(gl && !gl\.lost\) gl\.present\(\); wake\(\); \}/, 'gone: the landed layers laid again at once');
  assert.match(dw, /nextFrame\(step\)/, 'the fade on the frame scheduler');
  assert.doesNotMatch(dw, /requestAnimationFrame/);
});
