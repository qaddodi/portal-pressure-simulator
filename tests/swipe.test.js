import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeDir } from '../src/ui/swipe.js';

test('swipe left goes next, right goes back', () => {
  assert.equal(swipeDir(-80, 5, 200), 1);
  assert.equal(swipeDir(80, -10, 200), -1);
});
test('taps, short moves, vertical scrolls, diagonals and slow drags are not swipes', () => {
  assert.equal(swipeDir(3, 2, 80), 0);
  assert.equal(swipeDir(-49, 0, 100), 0);
  assert.equal(swipeDir(-20, 200, 200), 0);
  assert.equal(swipeDir(-90, 70, 200), 0);
  assert.equal(swipeDir(-90, 0, 1200), 0);
  assert.equal(swipeDir(NaN, 0, 100), 0);
});
test('50 px exactly counts', () => assert.equal(swipeDir(-50, 0, 100), 1));
