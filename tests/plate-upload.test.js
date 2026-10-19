import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateStrips, premultiply, PLATE_STRIP } from '../src/ui/plate-upload.js';

// The plate rasters reach the GPU as pixel strips (plate-upload.js): every row exactly once, each strip about 2 MB.
test('the strips cover every row once, in order, each within the strip size', () => {
  for (const [W, H] of [[1224, 1584], [2048, 2050], [1, 1], [5000, 3], [PLATE_STRIP + 7, 4]]) {
    const s = plateStrips(W, H);
    let y = 0;
    for (const [y0, rows] of s) { assert.equal(y0, y); assert.ok(rows >= 1); assert.ok(rows === 1 || W * rows <= PLATE_STRIP); y += rows; }
    assert.equal(y, H, `${W}x${H}`);
  }
  assert.equal(plateStrips(1224, 1584).length, 4, 'the whole plate in four frames');
});

test('premultiplying matches the canvas copy: opaque pixels untouched, colour scaled by alpha, clear pixels zero', () => {
  const d = new Uint8ClampedArray([200, 100, 50, 255, 200, 100, 50, 128, 255, 255, 255, 0, 10, 20, 30, 1]);
  premultiply(d);
  assert.deepEqual([...d], [200, 100, 50, 255, 100, 50, 25, 128, 0, 0, 0, 0, 0, 0, 0, 1]);
  // Within half a step of the exact product everywhere.
  const all = new Uint8ClampedArray(256 * 256 * 4);
  for (let a = 0; a < 256; a++) for (let c = 0; c < 256; c++) all.set([c, c, c, a], (a * 256 + c) * 4);
  premultiply(all);
  for (let a = 0; a < 256; a++) for (let c = 0; c < 256; c++) assert.ok(Math.abs(all[(a * 256 + c) * 4] - (c * a) / 255) <= 0.5);
});
