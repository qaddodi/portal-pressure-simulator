// B26: a step larger than the range never yields zero segments (0/0 = NaN); every point is finite and both ends are kept.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curveXs } from '../src/ui/tool-curve.js';

test('an oversized step keeps both endpoints and only finite points', () => {
  assert.deepEqual(curveXs({ from: 0, to: 1, step: 3 }), [0, 1]);
  assert.deepEqual(curveXs({ from: 0, to: 1, step: 2 }), [0, 1]);
  assert.deepEqual(curveXs({ from: 1, to: 0, step: 5 }), [1, 0]);
  assert.deepEqual(curveXs({ from: 0, to: 1, step: 1e9 }), [0, 1]);
});
test('ordinary steps, zero step and degenerate inputs', () => {
  assert.deepEqual(curveXs({ from: 0, to: 10, step: 5 }), [0, 5, 10]);
  assert.equal(curveXs({ from: 0, to: 10, step: 0 }).length, 11);
  assert.deepEqual(curveXs({ from: 2, to: 2, step: 1 }), []);
  assert.deepEqual(curveXs({ from: 'x', to: 2, step: 1 }), []);
  assert.deepEqual(curveXs({ from: 0, to: Infinity, step: 1 }), []);
  for (const t of [{ from: 0, to: 1, step: 3 }, { from: 5, to: 0, step: 0.3 }, { from: 0, to: 1, step: -4 }]) assert.ok(curveXs(t).every(Number.isFinite));
});
