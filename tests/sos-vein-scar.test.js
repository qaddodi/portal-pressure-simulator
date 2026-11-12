// SOS: the scar inside the central vein is an overlay pass over the vessels (fx-gl.js), not a change to the vessels. Code only: no GPU runs here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fxShaders } from '../src/ui/fx-gl.js';
import { lintGLSL } from './glsl-lint.js';

test('the scar inside the vein has its own overlay program, and it lints', () => {
  assert.deepEqual(lintGLSL(fxShaders.plugVS), []);
  assert.deepEqual(lintGLSL(fxShaders.plugFS), []);
});

test('the lobule\'s kept picture lays the scar over the blood it repaints, by the same function as the overlay: no flicker on blood-only frames', async () => {
  const { keepFS } = await import('../src/ui/lobule-keep.js');
  const { PLUG_GLSL } = await import('../src/ui/fx-gl.js');
  const fs = keepFS();
  assert.ok(fs.includes(PLUG_GLSL), 'the same plugAt');
  assert.match(fs, /plugAt\(/);
  assert.ok(fxShaders.plugFS.includes(PLUG_GLSL));
  assert.deepEqual(lintGLSL(fs), []);
});
