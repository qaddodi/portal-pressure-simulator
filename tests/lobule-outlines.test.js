// Guard: the sinusoids keep their outlines, but the collagen edge line stops at the central vein's
// edge; running on inside it, it drew spokes the owner did not want.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');

test('sinusoid collagen line stops at the central vein', () => {
  assert.match(src, /thin continuous collagen line/);
  assert.match(src, /if \(t\.rho\[i\] < CV_STOP\) return;/);
});
