import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gapToBox, leaderGaps } from './e2e/leader-gap.mjs';

test('a point inside or on a box has no gap; outside, the distance to its nearest edge or corner', () => {
  const b = { x: 10, y: 10, w: 20, h: 10 };
  assert.equal(gapToBox(b, 15, 15), 0);
  assert.equal(gapToBox(b, 30, 20), 0);
  assert.equal(gapToBox(b, 40, 15), 10);
  assert.equal(gapToBox(b, 33, 24), 5);
});

test('leaderGaps judges each leader against the caption the GPU drew, and skips an end whose caption is not shown', () => {
  const snap = { items: [{ key: 'lab:lymph', x: 0, y: 100, w: 200, h: 40, a: 1 }, { key: 'lab:triad', x: 0, y: 0, w: 100, h: 40, a: 1 }, { key: 'lab:cv', x: 0, y: 0, w: 10, h: 10, a: 0 }] };
  const { gaps, missing } = leaderGaps(snap, [{ key: 'lab:lymph', x: 230, y: 98 }, { key: 'lab:triad', x: 100, y: 40 }, { key: 'lab:cv', x: 5, y: 5 }, { key: 'lab:sin', x: 1, y: 1 }]);
  assert.equal(gaps.find((g) => g.key === 'lab:lymph').gap > 5, true, 'a leader that stops 30 px past its caption fails the 5 px bar');
  assert.equal(gaps.find((g) => g.key === 'lab:triad').gap, 0);
  assert.deepEqual(missing, ['lab:cv', 'lab:sin']);
});

test('a leader on the corner of the box a longer line makes is judged against its own line', () => {
  const snap = { items: [{ key: 'lab:lymph', x: 0, y: 0, w: 200, h: 60, a: 1, rows: [{ x: 120, y: 0, w: 60, h: 20 }, { x: 0, y: 30, w: 200, h: 20 }] }] };
  const { gaps } = leaderGaps(snap, [{ key: 'lab:lymph', x: 20, y: 0 }]);
  assert.ok(gaps[0].gap > 20, 'on the box, 30 px from the word it names');
  assert.equal(leaderGaps(snap, [{ key: 'lab:lymph', x: 120, y: 5 }]).gaps[0].gap, 0);
});
