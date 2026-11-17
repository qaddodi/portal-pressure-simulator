import './dom-shim.js';
// A cut-off's number stands at the foot of its line, level with the others. Where a point lies low in the plot just left of it, the name
// needs that corner (16 Nov 2026: Heart failure on the iPhone, its name sent 110 px out on a line, the corner held by the "5"), so the
// number takes the line's other end, the top row, sliding along that row past whatever stands there (the axis's name) until it is clear.
// A general rule for any plane: the numbers are asked for with the points' small boxes, never with this plane's name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planeOf, frame, scaler, plotNumbers } from '../src/ui/visual-plane.js';

const pl = planeOf('hvpg-ppg');
const setup = (W, H, fs, dots) => {
  const fr = frame(W, H), { X, Y } = scaler(pl, fr);
  const keep = dots.map(([h, p]) => [X(h) - 12, Y(p) - 12, X(h) + 12, Y(p) + 12]);
  const axes = plotNumbers(pl, fr, X, Y, fs, keep, 'names');
  return { fr, X, Y, nums: plotNumbers(pl, fr, X, Y, fs, [...keep, ...axes.map((n) => n.box)], 'ticks'), axes };
};

test('a low point near the corner: the cut-off numbers leave the foot row for the top row, clear of the axis name', () => {
  const { nums, axes, fr } = setup(345, 300, 16, [[0.3, 0.5], [2, 7]]);
  // (The 5 is the one the low point's name needs the corner from; on the 0 to 20 axis (17 Nov 2026, it was 0 to 24) the 10 clears the corner and the HVPG name, and stays at its foot.)
  for (const v of ['5', '10']) {
    const n = nums.find((q) => q.text === v);
    assert.ok(n, `the cut-off ${v} is numbered`);
    if (v === '5') assert.ok(n.box[1] < fr.T + 20, `${v} stands in the top row`);
    for (const a of axes) assert.ok(!(n.box[0] < a.box[2] && n.box[2] > a.box[0] && n.box[1] < a.box[3] && n.box[3] > a.box[1]), `${v} clear of the axis name`);
  }
});

test('no low point: the cut-off numbers stay at the foot of their lines, where they always were', () => {
  const { nums, fr } = setup(1290, 570, 18, [[2, 7], [8, 14]]);
  for (const v of ['5', '10']) assert.ok(nums.find((q) => q.text === v).box[1] > fr.T + 100, `${v} at the foot`);
});

test('the numbers are the same however often they are asked for', () => {
  const a = () => JSON.stringify(setup(345, 300, 16, [[0.3, 0.5]]).nums);
  assert.equal(a(), a());
});
