import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Preallocated cell lists (recs.md item 7, 2 Nov 2026): the organs' changed box and the ascites pool are sent from one kept
// Float32Array into GPU buffers kept at their largest size, always (the ?prealloc=0 path, a new array and bufferData, went).
const src = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
test('the redrawn cells reuse one array and one GPU buffer each', () => {
  assert.doesNotMatch(src, /PREALLOC|new Float32Array\(cells\)/);
  assert.match(src, /nDirt = cellList\.send\(dirtBuf\);/);
  assert.match(src, /nPool = cellList\.send\(poolBuf\);/);
  assert.match(src, /if \(this\.n\) gl\.bufferSubData\(gl\.ARRAY_BUFFER, 0, this\.a, 0, this\.n\);/);
});
