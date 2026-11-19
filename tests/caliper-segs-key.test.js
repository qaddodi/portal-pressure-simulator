import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segsSame, segsSave } from '../src/ui/callout-math.js';

// SF-3 (full app review, 15 Nov 2026): a caliper's tick path text is rebuilt only when one of its twelve numbers changed.
const mk = (n) => [[[n, 1], [2, 3]], [[4, 5], [6, 7]], [[8, 9], [10, 11]]];
test('a caliper whose numbers stand still is the same; one number moving, or none kept yet, is not', () => {
  assert.equal(segsSame(undefined, mk(0)), false, 'nothing kept yet');
  const k = segsSave(undefined, mk(0));
  assert.equal(k.length, 12);
  assert.equal(segsSame(k, mk(0)), true);
  assert.equal(segsSame(k, mk(0.5)), false, 'the first number moved');
  const moved = mk(0); moved[2][1][1] += 1e-9;
  assert.equal(segsSame(k, moved), false, 'the last number moved, however little');
  assert.equal(segsSave(k, mk(0.5)), k, 'kept in the same array: nothing allocated on a move');
  assert.equal(segsSame(k, mk(0.5)), true);
});
