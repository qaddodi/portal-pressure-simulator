// Guard: the sinusoids keep their outlines, but the collagen edge line stops at the central vein's
// edge; running on inside it, it drew spokes the owner did not want. (15 Nov 2026: the edge is the vein's wall as drawn now, radiusAt(G.cv, 0),
// not a fixed 0.14 of the lobule's radius, which ran out short of the wall in a round cap, a black tick, beside every mouth.)
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { lobuleSource } from './split-src.js';

const src = lobuleSource();

test('sinusoid collagen line stops at the central vein', () => {
  // (The lining drawn by the GPU, the only painter since 1 Nov: fxGLLine's capsules, one either side of each sinusoid.)
  const f = src.slice(src.indexOf('function fxGLLine(lw) {'), src.indexOf('\n  }\n', src.indexOf('function fxGLLine(lw) {')));
  assert.match(f, /rim = radiusAt\(G\.cv, 0\)/);
  assert.match(f, /if \(t\.rho\[i\] \* G\.R < rim\) continue;/);
  assert.doesNotMatch(src, /CV_STOP/);
  assert.match(src, /lymph\.line = fxGLLine\(0\.9 \/ V\.k\);/);
});
