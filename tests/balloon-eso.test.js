import test from 'node:test';
import assert from 'node:assert/strict';
import { balloonShape, esoAt, smoothPath, BALLOON } from '../src/ui/balloon-eso.js';

test('deflated balloon lies close on the tube, a sheath a little wider than it', () => {
  const s = balloonShape(0);
  for (const [x, y] of s.outline) assert.ok(Math.abs(x - esoAt(y).c) <= BALLOON.sleeve + 1e-6);
  assert.ok(BALLOON.sleeve > BALLOON.shaftR, 'wide enough to be seen as a second balloon on the tube');
  assert.ok(s.half((BALLOON.top + BALLOON.bottom) / 2) > BALLOON.shaftR + 0.5);
});
test('inflated balloon stays inside the walls and follows the centreline', () => {
  const s = balloonShape(1);
  for (const [x, y] of s.outline) { const e = esoAt(y); assert.ok(Math.abs(x - e.c) <= e.h - 1); }
  const mid = s.half((BALLOON.top + BALLOON.bottom) / 2);
  assert.ok(mid > 6);
  assert.ok(s.half(BALLOON.top) < s.half(BALLOON.top + 20));   // rounded end
});
test('inflated it is a pillow: full width most of its length, rounded ends, narrowing toward each end', () => {
  const s = balloonShape(1), span = BALLOON.bottom - BALLOON.top, mid = (BALLOON.top + BALLOON.bottom) / 2;
  const at = (f) => s.half(BALLOON.top + span * f), full = (f) => esoAt(BALLOON.top + span * f).h - BALLOON.wall;
  assert.ok(at(0.25) > full(0.25) * 0.9 && at(0.75) > full(0.75) * 0.9);
  for (let y = BALLOON.top; y < mid; y += 1) assert.ok(s.half(y + 1) >= s.half(y) - 0.3);
  assert.ok(at(0.01) < at(0.1));
});
test('smoothPath draws curves through every point', () => {
  const d = smoothPath([[0, 0], [10, 0], [10, 10]], true);
  assert.match(d, /^M0\.00 0\.00 C/);
  assert.equal((d.match(/C/g) || []).length, 3);
  assert.ok(d.endsWith('Z'));
});
