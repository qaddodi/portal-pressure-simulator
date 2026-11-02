import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Preallocated cell lists (recs.md item 7, 2 Nov 2026): the organs' changed box and the ascites pool are sent from one kept
// Float32Array into GPU buffers kept at their largest size; ?prealloc=0 keeps the old new-array-and-bufferData path.
const src = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
test('the redrawn cells reuse one array and one GPU buffer each', () => {
  assert.match(src, /const PREALLOC = !\(typeof location !== 'undefined' && \/\[\?&\]prealloc=0\\b\/\.test\(location\.search \|\| ''\)\);/);
  assert.match(src, /nDirt = cellList\.send\(dirtBuf\);/);
  assert.match(src, /nPool = cellList\.send\(poolBuf\);/);
  assert.match(src, /if \(this\.n\) gl\.bufferSubData\(gl\.ARRAY_BUFFER, 0, this\.a, 0, this\.n\);/);
});
