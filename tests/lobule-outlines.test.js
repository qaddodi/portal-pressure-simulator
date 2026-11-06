// Guard: the sinusoids keep their outlines, but the collagen edge line stops at the central vein's
// edge; running on inside it, it drew spokes the owner did not want.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');

test('sinusoid collagen line stops at the central vein', () => {
  // (The lining drawn by the GPU, the only painter since 1 Nov: fxGLLine's capsules, one either side of each sinusoid.)
  const f = src.slice(src.indexOf('function fxGLLine(lw) {'), src.indexOf('\n  }\n', src.indexOf('function fxGLLine(lw) {')));
  assert.match(f, /if \(t\.rho\[i\] < CV_STOP\) continue;/);
  assert.match(src, /lymph\.line = fxGLLine\(0\.9 \/ V\.k\);/);
});
