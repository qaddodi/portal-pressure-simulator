import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radiiChanged, canvasPx, fxMoves } from '../src/ui/lobule-render-cache.js';

test('newly enabled vessels always initialize their GPU radii', () => {
  assert.equal(radiiChanged(undefined, [1.1, 1.2], 0.35), true);
  assert.equal(radiiChanged([], [1.1, 1.2], 0.35), true);
});

test('subpixel caliber changes accumulate against the last upload', () => {
  const uploaded = [2, 3];
  assert.equal(radiiChanged(uploaded, [2.1, 3.2], 0.35), false);
  assert.equal(radiiChanged(uploaded, [2.4, 3.2], 0.35), true);
  assert.equal(radiiChanged(uploaded, [2, 2.6], 0.35), true);
  assert.deepEqual(uploaded, [2, 3]);
});

test('zooming in makes a previously subpixel caliber change visible', () => {
  assert.equal(radiiChanged([2, 3], [2.2, 3], 0.35), false);
  assert.equal(radiiChanged([2, 3], [2.2, 3], 0.35 / 2), true);
});

test('lobule canvases are sized in whole pixels, so a fractional resolution step still matches next frame', () => {
  const dpr = 2 * (1 - 0.1 - 0.1);   // the governor's 0.8 step, with its floating-point error
  assert.ok(!Number.isInteger(1437 * dpr));
  assert.equal(canvasPx(1437, dpr), Math.round(1437 * dpr));
  assert.equal(canvasPx(0, 2), 1);
});

test('the effects layer is redrawn every frame only while something on it moves', () => {
  assert.equal(fxMoves({ lymph: false, flat: false, hide: false, flow: true }), false);   // WebGL vessels: only the still ductules
  assert.equal(fxMoves({ lymph: true, flat: false, hide: false }), true);
  assert.equal(fxMoves({ lymph: false, flat: true, hide: false, flow: undefined }), true);   // no WebGL: red cells move
  assert.equal(fxMoves({ lymph: false, flat: true, hide: false, flow: false }), false);
  assert.equal(fxMoves({ lymph: false, flat: true, hide: true }), false);
});
