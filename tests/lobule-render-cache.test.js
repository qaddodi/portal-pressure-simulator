import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radiiChanged } from '../src/ui/lobule-render-cache.js';

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
