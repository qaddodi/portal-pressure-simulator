import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poseInto, dotInto, leaderEndInto, IDENTITY6 } from '../src/ui/label-pose.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('pose is CTM·anchor + offset', () => {
  const o = [0, 0];
  poseInto(o, [2, 0, 0, 2, 10, 20], [3, 4], null, 0, [5, -6], null);
  near(o[0], 2 * 3 + 10 + 5); near(o[1], 2 * 4 + 20 - 6);
});

test('t=0 and t=1 match each layout; the offset keeps its px under a zoom', () => {
  const o = [0, 0], A = [1, 1], B = [5, 3], oa = [10, 0], ob = [0, 10], m = [3, 0, 0, 3, 0, 0];
  poseInto(o, m, A, B, 0, oa, ob); near(o[0], 3 + 10); near(o[1], 3);
  poseInto(o, m, A, B, 1, oa, ob); near(o[0], 15); near(o[1], 9 + 10);
  const m2 = [6, 0, 0, 6, 0, 0], p = [0, 0]; poseInto(p, m2, A, null, 0, oa, null);
  near(p[0] - 6, 10);
});

test('the scene camera applies after the CTM and before the offset; fixed labels ignore both', () => {
  const o = [0, 0];
  poseInto(o, IDENTITY6, [2, 2], null, 0, [1, 1], null, [2, 0, 0, 2, 3, 3]);
  near(o[0], 2 * 2 + 3 + 1); near(o[1], 2 * 2 + 3 + 1);
  poseInto(o, [9, 0, 0, 9, 9, 9], [2, 2], null, 0, [7, 8], null, [2, 0, 0, 2, 3, 3], true);
  near(o[0], 7); near(o[1], 8);
});

test('dot is the anchor on screen; a leader ends on the box edge', () => {
  const d = [0, 0]; dotInto(d, [1, 0, 0, 1, 4, 5], [1, 1], null, 0); near(d[0], 5); near(d[1], 6);
  const e = [0, 0]; leaderEndInto(e, 0, 5, 10, 0, 20, 10);   // box 10..30 x 0..10, dot left of it
  near(e[0], 10); near(e[1], 5);
  leaderEndInto(e, 15, 5, 10, 0, 20, 10); near(e[0], 15);   // inside: the dot
});
