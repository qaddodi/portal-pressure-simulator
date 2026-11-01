// The vitals monitor on the GPU (vitals-gl.js; ?vitalsgl=0 the 2D canvas): the panel, grid, strip, words and numbers all go to WebGL, and the
// GPU path never asks the screen canvas for a 2D context. The glyph atlas is drawn only when the layout, density or fonts change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom-shim.js';
import { colorOf } from '../src/ui/vitals-gl.js';

const mon = readFileSync(new URL('../src/ui/vitals-monitor.js', import.meta.url), 'utf8');
const gl = readFileSync(new URL('../src/ui/vitals-gl.js', import.meta.url), 'utf8');

test('colours become premultiplied rgba in 0 to 1', () => {
  assert.deepEqual(colorOf('#ff0000'), [1, 0, 0, 1]);
  assert.deepEqual(colorOf('#0f0'), [0, 1, 0, 1]);
  assert.deepEqual(colorOf('rgba(255, 255, 255, 0.5)'), [0.5, 0.5, 0.5, 0.5]);
});

test('the GPU path is on by default, off with ?vitalsgl=0, and draws nothing with a 2D context', () => {
  assert.match(mon, /const VITALS_GL = typeof location === 'undefined' \|\| !\/\[\?&\]vitalsgl=0\\b\/\.test\(location\.search\);/);
  assert.match(mon, /if \(glr\) return drawGL\(now\);/, 'the 2D drawing is never reached while the GPU draws');
  const body = mon.slice(mon.indexOf('function drawGL'), mon.indexOf("cv.addEventListener('webglcontextrestored'"));
  assert.ok(!/fitCanvas|getContext|fillText|stroke\(|stillTop|stillCells/.test(body), 'no 2D context, no cached 2D pictures');
  assert.match(body, /glr\.draw\(/);
});

test('the atlas is the only canvas text, drawn when its key changes; the strip and the readings are instance data', () => {
  assert.match(gl, /if \(key === atlasKey\) return;/);
  assert.match(gl, /drawArraysInstanced\(gl\.TRIANGLES, 0, 6, L\.n - 1\)/, 'one capsule per strip segment');
  assert.ok(/startProgram/.test(gl) && /compileDone/.test(gl), 'programs compiled in parallel at creation, published when done');
  assert.ok(!/getError|readPixels|getParameter\(/.test(gl), 'no synchronous queries');
});
