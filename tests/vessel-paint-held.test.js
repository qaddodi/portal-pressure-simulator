// A vessel's gradient colours on the hidden SVG wait while the GPU draws, until the SVG shows again (2 Nov 2026, motion budget: a
// Varices slide change wrote 1,200 stop colours at its rests).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('vessel stop colours go through setPaint, written only when they change', () => {
  assert.match(st, /if \(x\.col\?\.\[0\] !== c1\) setPaint\(x\.st0, 'stop-color', c1\);/);
  assert.match(st, /if \(x\.col\?\.\[1\] !== c2\) setPaint\(x\.st1, 'stop-color', c2\);/);
  assert.doesNotMatch(st, /setG\([^)]*'stop-color'/);
});

test('held while the GPU draws, and written wherever the SVG shows again (GPU not wanted, context lost)', () => {
  assert.match(st, /function setPaint\(el, k, v\) \{\n\s+if \(geoHolding\(\)\) \{/);
  assert.match(st, /if \(geoHeld\.size\) flushGeo\(\); if \(paintHeld\.size\) flushPaint\(\);\n\s+if \(tubesStale\)/, 'context lost');
  assert.match(st, /if \(!on && paintHeld\.size\) flushPaint\(\);/, 'the GPU not wanted');
  assert.match(st, /const geoHolding = \(\) => wrap\.classList\.contains\('gl-on'\);/);
});
