// The lobule's wide copy on the GPU (wide-gl.js, 1 Nov 2026: "move everything to GPU"). A dive aimed at a station, or a rise out of a
// zoomed-in lobule, showed a box of 2D canvases, each tile the layers drawn onto it on the CPU and scaled by the compositor. Now each
// tile is a texture laid from the layers' GPU canvases, and each frame of the zoom is one small pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL } from './glsl-lint.js';
import { WIDE_GL, wideShaders } from '../src/ui/wide-gl.js';
import { lobuleSource } from './split-src.js';

const lz = lobuleSource();
const fn = (head) => { const i = lz.indexOf(head); assert.ok(i >= 0, head); return lz.slice(i, lz.indexOf('\n  }\n', i)); };

test('on by default, and its shaders pass the lint', () => {
  assert.equal(WIDE_GL, true);
  for (const [name, src] of Object.entries(wideShaders)) assert.deepEqual(lintGLSL(src), [], name);
});

test('the copy is the GPU\'s, or none (no 2D tiles since 1 Nov: the dive then scales the layers themselves)', () => {
  const b = fn('function buildWideGL(W, H, box) {');
  assert.doesNotMatch(b, /drawImage|getContext\('2d'\)/, 'nothing laid on the CPU');
});

test('each frame of the zoom draws the copy on the GPU, placed as the CSS transform placed the 2D copy', () => {
  // translate(tx − x, ty − y) scale(k) about (x, y): a point q goes to x + (tx − x) + k (q − x) = tx + k (q − x).
  const css = (q, x, tx, k) => x + (tx - x) + k * (q - x), gpu = (q, x, tx, k) => tx + k * (q - x);
  for (const [q, x, tx, k] of [[0, 100, 140, 0.3], [-50, 220, 80, 0.05], [900, 300, 300, 1]]) assert.ok(Math.abs(css(q, x, tx, k) - gpu(q, x, tx, k)) < 1e-9);
});


test('one context for the lobule: the copy is made and shown in the vessels\' own context, always', () => {
  const b = fn('function buildWideGL(W, H, box) {');
  assert.doesNotMatch(b, /drawImage|getContext\('2d'\)|texImage2D/, 'no canvas sent from one context to another');
});
