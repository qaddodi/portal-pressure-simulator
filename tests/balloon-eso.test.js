import test from 'node:test';
import assert from 'node:assert/strict';
import { balloonShape, esoAt, BALLOON } from '../src/ui/balloon-eso.js';

test('deflated balloon is only as wide as the shaft', () => {
  const s = balloonShape(0, 1);
  for (const [x, y] of s.outline) assert.ok(Math.abs(x - esoAt(y).c) <= BALLOON.shaftR + 1e-6);
});
test('inflated balloon stays inside the walls and follows the centreline', () => {
  const s = balloonShape(1, 1);
  for (const [x, y] of s.outline) { const e = esoAt(y); assert.ok(Math.abs(x - e.c) <= e.h - 1); }
  const mid = s.half((BALLOON.top + BALLOON.bottom) / 2);
  assert.ok(mid > 6);
  assert.ok(s.half(BALLOON.top) < s.half(BALLOON.top + 20));   // tapered shoulder
});
test('shaft advances with adv', () => {
  assert.ok(balloonShape(0, 0.3).tipY < balloonShape(0, 1).tipY);
});
