// SOS: the scar inside the central vein is an overlay pass over the vessels (fx-gl.js), not a change to the vessels. Code only: no GPU runs here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fxShaders } from '../src/ui/fx-gl.js';
import { lintGLSL } from './glsl-lint.js';

test('the scar inside the vein has its own overlay program, and it lints', () => {
  assert.deepEqual(lintGLSL(fxShaders.plugVS), []);
  assert.deepEqual(lintGLSL(fxShaders.plugFS), []);
});
