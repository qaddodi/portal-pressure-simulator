import test from 'node:test';
import assert from 'node:assert/strict';
import { balloonShape, esoAt, smoothPath, BALLOON } from '../src/ui/balloon-eso.js';

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
test('shoulders taper smoothly: no step bigger than a fraction of the full width between samples', () => {
  const s = balloonShape(1, 1), full = s.half((BALLOON.top + BALLOON.bottom) / 2);
  for (let y = BALLOON.top; y < BALLOON.bottom; y += 1) assert.ok(Math.abs(s.half(y + 1) - s.half(y)) < full * 0.15);
});
test('the highlight sits inside the balloon on one side', () => {
  const s = balloonShape(1, 1);
  for (const [x, y] of s.sheen) { const c = esoAt(y).c; assert.ok(x <= c && c - x <= s.half(y) + 1e-6); }
});
test('smoothPath draws curves through every point', () => {
  const d = smoothPath([[0, 0], [10, 0], [10, 10]], true);
  assert.match(d, /^M0\.00 0\.00 C/);
  assert.equal((d.match(/C/g) || []).length, 3);
  assert.ok(d.endsWith('Z'));
});
