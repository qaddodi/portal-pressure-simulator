import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineIndex, indexHits, segsCross, segHitsBox } from '../src/ui/seg-hits.js';

// The labels' line index as data (plan rev 2 step 2): built from plain lines, the same answers as a brute-force check over every segment.
const toLocal = (x, y) => [x * 2 + 10, y * 2 + 5];
const lines = [
  { pts: [[0, 0], [100, 0], [100, 80]], R: null, flat: 2, wall: 1, id: 'a' },
  { pts: [[20, 60], [90, 10]], R: [1, 2, 3, 4], flat: 0, wall: 0, id: 'b' },
  { pts: [[300, 300]], R: null, flat: 2, id: 'one point' },
];

test('line index: segments in stage px with their half widths', () => {
  const idx = lineIndex(lines, toLocal, 2, 64);
  assert.equal(idx.segs.length, 3);
  assert.deepEqual([idx.segs[0].x0, idx.segs[0].y0, idx.segs[0].x1, idx.segs[0].y1], [10, 5, 210, 5]);
  assert.equal(idx.segs[0].hw, 6);   // ((2 + 1) * 2)
  assert.equal(idx.segs[2].hw, 8);   // (the radius at its end, 4, times 2)
  assert.ok(idx.segs.every((sg) => sg.id !== 'one point'));
});

test('line index: hits match a check over every segment, with skip and only', () => {
  const idx = lineIndex(lines, toLocal, 2, 64);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 400; n++) {
    const x = rnd() * 260 - 20, y = rnd() * 200 - 20, r = { x0: x, y0: y, x1: x + rnd() * 40, y1: y + rnd() * 20 }, m = rnd() * 8;
    const brute = (keep) => idx.segs.filter((sg) => keep(sg) && segHitsBox(sg, r, sg.hw + m)).length;
    assert.equal(indexHits(idx, r, m), brute(() => true));
    assert.equal(indexHits(idx, r, m, true), Math.min(1, brute(() => true)));
    assert.equal(indexHits(idx, r, m, 'a'), brute((sg) => sg.id !== 'a'));
    assert.equal(indexHits(idx, r, m, { only: 'b' }), brute((sg) => sg.id === 'b'));
  }
});

test('segsCross: arrays and boxes alike', () => {
  assert.equal(segsCross([0, 0, 10, 10], [0, 10, 10, 0]), true);
  assert.equal(segsCross({ x0: 0, y0: 0, x1: 10, y1: 10 }, [0, 10, 10, 0]), true);
  assert.equal(segsCross([0, 0, 10, 0], [0, 5, 10, 5]), false);
});
