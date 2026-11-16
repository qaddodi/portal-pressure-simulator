// A card sent out on Next or Back is never cut off by the screen's edge (Mohammad, 16 Nov 2026: "shouldn't get cut off"): it goes only as far as it can while it can still
// be seen, and is gone from sight by 85% of its way (the rail's curve), 95% for a case card's faster fade. card-throw.js throwReach, used by every throw and the case card's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { throwReach, throwAt, RAIL_GAP } from '../src/ui/card-throw.js';

const box = (left, width) => ({ left, right: left + width, width });
const VW = 1440;

test('a card near the left edge sent to the left goes only as far as its room, over the share of its way it can be seen', () => {
  const b = box(37, 490), want = 490 + RAIL_GAP;
  const reach = throwReach(b, 'next', VW, want);
  assert.ok(reach < want && reach > 0);
  assert.ok(Math.abs(reach * 0.85 - 37) < 1e-9, 'at the 85% mark, where it is gone, its edge is at the screen\'s');
  // (Along the rail's own curve: while any of it shows, no part has crossed the edge.)
  for (let k = 0; k <= 1; k += 0.01) {
    const p = throwAt('out', k, { x: 0, o: 1 }, { x: -reach, o: 0 });
    if (p.o > 0.001) assert.ok(b.left + p.x >= -1e-6, `at ${k.toFixed(2)} of its way, ${p.o.toFixed(2)} seen, its left edge is at ${(b.left + p.x).toFixed(1)}`);
  }
});

test('a card sent the other way, or with room to spare, or with no box measured, is not held back; one at the edge does not move', () => {
  assert.equal(throwReach(box(37, 490), 'back', VW, 514), 514, 'to the right, the far side of the screen is room enough');
  assert.equal(throwReach(box(600, 300), 'next', VW, 324), 324, '600 px of room');
  assert.equal(throwReach({ left: 0, right: 0, width: 0 }, 'next', VW, 300), 300, 'no layout');
  assert.equal(throwReach(null, 'next', VW, 300), 300);
  assert.equal(throwReach(box(-10, 300), 'next', VW, 300), 0, 'already past the edge');
  assert.ok(Math.abs(throwReach(box(900, 500), 'back', VW, 524) - 40 / 0.85) < 1e-9, 'to the right edge with 40 px of room');
});

test('a wide centred card (the case card) fades inside the screen: its reach over its faster fade stays within its margin', () => {
  const b = box(24, 1392), reach = throwReach(b, 'next', VW, Math.min(VW, 1392 + RAIL_GAP), 0.95);
  assert.ok(Math.abs(reach * 0.95 - 24) < 1e-9);
});
